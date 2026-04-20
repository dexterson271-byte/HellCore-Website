"""
╔══════════════════════════════════════════════════════════════╗
║      HELLCORE STORE — Flask Backend (store.hellcore.net)    ║
║  pip install flask mysql-connector-python gunicorn   ║
║  python app.py  →  http://localhost:5001                    ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import sys
import sqlite3
import json
import uuid
import hashlib
import traceback
import secrets
import datetime as dt
from datetime import datetime, timedelta
from functools import wraps

# Load environment variables
try:
    from dotenv import load_dotenv
    # Load from parent .env if running from store/
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

from flask import Flask, request, jsonify, render_template, send_from_directory, Response, redirect

app = Flask(__name__)

# ═══════════════════════════════════════════════════════
# UPI CONFIGURATION
# ═══════════════════════════════════════════════════════
UPI_ID = "lakshitdhirani@fam"
USD_TO_INR = 83.0
STORE_DOMAIN   = os.environ.get("STORE_DOMAIN", "http://localhost:5001")

# ═══════════════════════════════════════════════════════
# DATABASE CONFIGURATION (shared with main site)
# ═══════════════════════════════════════════════════════
USE_MYSQL_AIVEN = os.environ.get("USE_MYSQL_AIVEN", "True").lower() == "true"
AIVEN_HOST     = os.environ.get("AIVEN_HOST", "")
AIVEN_PORT     = int(os.environ.get("AIVEN_PORT", 19513))
AIVEN_USER     = os.environ.get("AIVEN_USER", "")
AIVEN_PASSWORD = os.environ.get("AIVEN_PASSWORD", "")
AIVEN_DATABASE = os.environ.get("AIVEN_DATABASE", "")

SQLITE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'hellcore.db')
_DB_MODE = "sqlite"

def try_connect():
    global _DB_MODE
    # Force MySQL in production (Railway usually has PORT or RAILWAY_ENVIRONMENT_ID)
    is_prod = os.environ.get("RAILWAY_ENVIRONMENT_ID") or os.environ.get("PORT")
    
    if USE_MYSQL_AIVEN and AIVEN_HOST:
        try:
            import mysql.connector
            print(f"[STORE] Attempting Aiven MySQL connection: {AIVEN_HOST}...")
            c = mysql.connector.connect(
                host=AIVEN_HOST, port=AIVEN_PORT,
                user=AIVEN_USER, password=AIVEN_PASSWORD,
                database=AIVEN_DATABASE, ssl_disabled=False,
                connection_timeout=10
            )
            c.close()
            _DB_MODE = "mysql_aiven"
            print(f"[STORE] SUCCESS: Aiven MySQL connected.")
            return
        except Exception as e:
            print(f"[STORE] ERROR: Aiven MySQL connection failed: {e}")
            if is_prod:
                print("[STORE] WARNING: Running in production but MySQL failed. Fallback to SQLite may result in missing data.")
    
    # Check if local SQLite exists before fallback
    if os.path.exists(SQLITE_FILE):
        _DB_MODE = "sqlite"
        print(f"[STORE] Using local SQLite fallback ({SQLITE_FILE})")
    else:
        if is_prod:
            print(f"[STORE] CRITICAL: No MySQL and no SQLite file found at {SQLITE_FILE}")
        _DB_MODE = "sqlite"
        print(f"[STORE] Using fresh SQLite (Warning: Table missing errors likely)")

try_connect()

def get_db():
    if _DB_MODE == "mysql_aiven":
        import mysql.connector
        return mysql.connector.connect(
            host=AIVEN_HOST, port=AIVEN_PORT,
            user=AIVEN_USER, password=AIVEN_PASSWORD,
            database=AIVEN_DATABASE, ssl_disabled=False,
            autocommit=True
        )
    else:
        conn = sqlite3.connect(SQLITE_FILE)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

def db_cursor(conn):
    if _DB_MODE == "mysql_aiven":
        return conn.cursor(dictionary=True)
    return conn.cursor()

def to_dict(row):
    if row is None: return None
    if isinstance(row, dict): return row
    return dict(row)

def to_list(rows):
    return [to_dict(r) for r in rows]

def ph():
    return "%s" if _DB_MODE != "sqlite" else "?"

def phs(n):
    return ",".join([ph()] * n)

def ts(v): return str(v) if v else ""

# ═══════════════════════════════════════════════════════
# INIT STORE TABLES
# ═══════════════════════════════════════════════════════
def init_store_db():
    db = get_db(); c = db_cursor(db)
    mysql = _DB_MODE != "sqlite"
    AI  = "AUTO_INCREMENT" if mysql else "AUTOINCREMENT"
    DT  = "DATETIME DEFAULT CURRENT_TIMESTAMP" if mysql else "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"

    tables = [
f"""CREATE TABLE IF NOT EXISTS hc_store_products(
  id INTEGER PRIMARY KEY {AI},
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL,
  subcategory VARCHAR(30) DEFAULT '',
  price REAL NOT NULL,
  original_price REAL DEFAULT 0,
  description TEXT,
  perks TEXT,
  icon VARCHAR(50) DEFAULT 'ic-star',
  color VARCHAR(20) DEFAULT '#FF512F',
  download_url VARCHAR(500) DEFAULT '',
  is_free INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_store_events(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER,
  event_type VARCHAR(30) NOT NULL,
  product_id INTEGER,
  product_name VARCHAR(100) DEFAULT '',
  metadata TEXT,
  ip_address VARCHAR(50) DEFAULT '',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_store_orders(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  ticket_id INTEGER DEFAULT 0,
  items TEXT,
  total REAL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  mc_username VARCHAR(50) DEFAULT '',
  created_at {DT})""",
    ]

    for sql in tables:
        try: c.execute(sql)
        except Exception as e: print(f"  Store table warn: {e}")

    # MIGRATION: Add ticket_id to orders
    try: c.execute("ALTER TABLE hc_store_orders ADD COLUMN ticket_id INTEGER DEFAULT 0")
    except: pass

    db.commit()

    # Seed products if empty
    c.execute("SELECT COUNT(*) as cnt FROM hc_store_products")
    row = c.fetchone()
    count = row['cnt'] if isinstance(row, dict) else row[0]
    if count == 0:
        seed_products(c, db)

    c.close(); db.close()
    print("[STORE] Tables ready")

def seed_products(c, db):
    """Seed the store with initial products."""
    products = [
        # ── RANKS ──
        ("VIP", "vip", "rank", "global", 2.00, 4.99,
         "Start your journey with VIP status. Green tag, exclusive kit, and lobby perks.",
         '["[VIP] Green Tag","VIP Kit","5% Store Discount","Global Chat Access","Lobby Furniture"]',
         "ic-star", "#4ade80", 1, 1),
        ("VIP+", "vip-plus", "rank", "global", 4.00, 9.99,
         "Enhanced VIP with cyan flair. Everything in VIP plus fly and more.",
         '["[VIP+] Cyan Tag","VIP+ Kit","10% Store Discount","All VIP Perks","Fly in Lobby","Join Full Servers"]',
         "ic-layers", "#06b6d4", 1, 2),
        ("MVP", "mvp", "rank", "global", 8.00, 19.99,
         "The gold standard. Color nicknames, premium kits, and priority access.",
         '["[MVP] Gold Tag","MVP Kit","15% Store Discount","All VIP+ Perks","Color Nickname","Priority Queue"]',
         "ic-shield", "#f59e0b", 1, 3),
        ("MVP+", "mvp-plus", "rank", "global", 12.00, 39.99,
         "Red-tier elite. Private games, best kits, and maximum perks.",
         '["[MVP+] Red Tag","MVP+ Kit","20% Store Discount","All MVP Perks","Private Games","Nick Command"]',
         "ic-heart", "#f43f5e", 1, 4),
        ("MVP++", "mvp-plus-plus", "rank", "global", 15.00, 45.00,
         "The ultimate rank. Pink prestige, host private games, and exclusive everything.",
         '["[MVP++] Pink Tag","MVP++ Kit","25% Store Discount","All MVP+ Perks","Host Private Games","Exclusive Cosmetics","Monthly Crate"]',
         "ic-bolt", "#d946ef", 1, 5),
    ]

    for p in products:
        c.execute(f"""INSERT INTO hc_store_products
            (name, slug, category, subcategory, price, original_price, description, perks, icon, color, is_featured, sort_order)
            VALUES({phs(12)})""", p)

    db.commit()
    print(f"[STORE] Seeded {len(products)} products")

# ═══════════════════════════════════════════════════════
# AUTH (shared with main site via hc_users table)
# ═══════════════════════════════════════════════════════
STAFF_ROLES = ("helper","mod","dev","admin","owner","founder","youtube","famous")
ADMIN_ROLES = ("helper","mod","dev","admin","owner","founder")

def get_user_by_token(token):
    if not token: return None
    try:
        db = get_db(); c = db_cursor(db)
        c.execute(f"SELECT * FROM hc_users WHERE session_token={ph()}", (token,))
        row = c.fetchone(); c.close(); db.close()
        return to_dict(row)
    except: return None

def auth_required(f):
    @wraps(f)
    def w(*a, **k):
        token = request.headers.get("X-Auth-Token", "") or request.cookies.get("hc_token", "")
        u = get_user_by_token(token)
        if not u: return jsonify({"error":"Authentication required"}), 401
        request.cu = u; return f(*a, **k)
    return w

def admin_required(f):
    @wraps(f)
    def w(*a, **k):
        token = request.headers.get("X-Auth-Token", "") or request.cookies.get("hc_token", "")
        u = get_user_by_token(token)
        if not u: return jsonify({"error":"Admin access required"}), 401
        if u["role"] not in ADMIN_ROLES: return jsonify({"error":"Admin required"}), 403
        request.cu = u; return f(*a, **k)
    return w

def track_event(event_type, product_id=None, product_name="", user_id=None, metadata=""):
    """Track a store analytics event."""
    try:
        db = get_db(); c = db_cursor(db)
        ip = request.remote_addr or ""
        c.execute(f"""INSERT INTO hc_store_events
            (user_id, event_type, product_id, product_name, metadata, ip_address)
            VALUES({phs(6)})""",
            (user_id, event_type, product_id, product_name, metadata, ip))
        db.commit(); c.close(); db.close()
    except Exception as e:
        print(f"[STORE] Event tracking error: {e}")

# ═══════════════════════════════════════════════════════
# CORS & HEADERS
# ═══════════════════════════════════════════════════════
@app.after_request
def cors(r):
    r.headers["Access-Control-Allow-Origin"]  = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type,X-Auth-Token"
    r.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    return r

@app.route("/api/<path:p>", methods=["OPTIONS"])
def opts(p): return jsonify({}), 200

# ═══════════════════════════════════════════════════════
# FRONTEND
# ═══════════════════════════════════════════════════════
@app.route("/")
def index():
    return render_template("store.html")

@app.route("/static/<path:f>")
def static_f(f):
    return send_from_directory("static", f)

# Also serve main site static files (logo, images)
@app.route("/main-static/<path:f>")
def main_static(f):
    main_static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static')
    return send_from_directory(main_static_dir, f)

# ═══════════════════════════════════════════════════════
# PRODUCTS API
# ═══════════════════════════════════════════════════════
@app.route("/api/products")
def products_list():
    category = request.args.get("category", "")
    db = get_db(); c = db_cursor(db)
    if category:
        c.execute(f"SELECT * FROM hc_store_products WHERE status='active' AND category={ph()} ORDER BY sort_order", (category,))
    else:
        c.execute("SELECT * FROM hc_store_products WHERE status='active' ORDER BY sort_order")
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows:
        r["created_at"] = ts(r.get("created_at",""))
        # Parse perks JSON
        try: r["perks"] = json.loads(r.get("perks","[]"))
        except: r["perks"] = []
    return jsonify(rows)

@app.route("/api/products/<slug>")
def product_detail(slug):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_store_products WHERE slug={ph()} AND status='active'", (slug,))
    row = to_dict(c.fetchone()); c.close(); db.close()
    if not row: return jsonify({"error":"Product not found"}), 404
    try: row["perks"] = json.loads(row.get("perks","[]"))
    except: row["perks"] = []
    # Track view
    track_event("view", row["id"], row["name"])
    return jsonify(row)

# ═══════════════════════════════════════════════════════
# CART API
# ═══════════════════════════════════════════════════════
@app.route("/api/cart")
@auth_required
def cart_get():
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
    rows = to_list(c.fetchall()); c.close(); db.close()
    return jsonify(rows)

@app.route("/api/cart", methods=["POST"])
@auth_required
def cart_add():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_cart(user_id,item_id,item_name,item_price,gamemode) VALUES({phs(5)})",
              (request.cu["id"], d["item_id"], d["item_name"], float(d["item_price"]), d.get("gamemode","")))
    db.commit(); c.close(); db.close()
    # Track
    track_event("add_to_cart", d.get("item_id"), d["item_name"], request.cu["id"])
    return jsonify({"ok":True})

@app.route("/api/cart/<int:cid>", methods=["DELETE"])
@auth_required
def cart_rem(cid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_cart WHERE id={ph()} AND user_id={ph()}", (cid, request.cu["id"]))
    db.commit(); c.close(); db.close()
    track_event("remove_from_cart", cid, "", request.cu["id"])
    return jsonify({"ok":True})

@app.route("/api/cart/clear", methods=["DELETE"])
@auth_required
def cart_clear():
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# MANUAL UPI CHECKOUT (TICKET SYSTEM)
# ═══════════════════════════════════════════════════════
@app.route("/api/checkout", methods=["POST"])
@auth_required
def create_checkout():
    """Create a manual UPI ticket for the checkout."""
    db = get_db(); c = db_cursor(db)
    
    # Get cart items
    c.execute(f"SELECT * FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
    cart_items = to_list(c.fetchall())
    
    if not cart_items:
        c.close(); db.close()
        return jsonify({"error": "Cart is empty"}), 400

    try:
        total_usd = sum(float(i["item_price"]) for i in cart_items)
        total_inr = round(total_usd * USD_TO_INR, 2)
        items_desc = ", ".join([i["item_name"] for i in cart_items])
        
        # 1. Create a ticket on the main site (shared DB)
        ticket_title = f"Rank Purchase - {request.cu['username']}"
        ticket_desc = f"Purchase request for: {items_desc}. Total: ${total_usd:.2f}"
        
        c.execute(f"INSERT INTO hc_tickets(title,description,author_id,category) VALUES({phs(4)})",
                  (ticket_title, ticket_desc, request.cu["id"], "purchase"))
        ticket_id = c.lastrowid
        
        # 2. Create an auto-reply systematically (from System ID: 1)
        # Assuming ID 1 is a system/admin account
        instructions = (
            f"Hello {request.cu['username']}!\n\n"
            f"To complete your purchase of **{items_desc}**, please follow these steps:\n\n"
            f"1. **Pay via UPI**: Send **₹{total_inr}** to UPI ID: `{UPI_ID}`\n"
            f"2. **Attach Screenshot**: Once paid, reply to this ticket with a screenshot of the transaction.\n\n"
            f"An administrator will verify your payment and grant your rank manually. Thank you!"
        )
        c.execute(f"INSERT INTO hc_ticket_msgs(ticket_id,author_id,content) VALUES({phs(3)})",
                  (ticket_id, 1, instructions))
        
        # 3. Create store order record
        items_json = json.dumps([{"name": i["item_name"], "price": float(i["item_price"]), "gamemode": i.get("gamemode","")} for i in cart_items])
        c.execute(f"""INSERT INTO hc_store_orders
            (user_id, ticket_id, items, total, status, mc_username)
            VALUES({phs(6)})""",
            (request.cu["id"], ticket_id, items_json, total_usd, "ticket_open", request.cu.get("mc_username", "")))
        
        # 4. Clear cart
        c.execute(f"DELETE FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
        
        db.commit(); c.close(); db.close()
        return jsonify({"ok": True, "ticket_id": ticket_id})

    except Exception as e:
        traceback.print_exc()
        db.close()
        return jsonify({"error": f"Checkout failed: {str(e)}"}), 500







# ═══════════════════════════════════════════════════════
# AUTH ROUTES (for store login/verification)
# ═══════════════════════════════════════════════════════
@app.route("/api/auth/me")
def auth_me():
    token = request.headers.get("X-Auth-Token", "") or request.cookies.get("hc_token", "")
    u = get_user_by_token(token)
    if not u: return jsonify({"error":"Not logged in"}), 401
    return jsonify({"id":u["id"],"username":u["username"],"email":u["email"],
                    "mc_username":u.get("mc_username","") or "","role":u["role"]})

@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        d = request.get_json(force=True) or {}
        idf = str(d.get("identifier","")).strip()
        pw  = str(d.get("password",""))
        db = get_db(); c = db_cursor(db)
        pw_hash = hashlib.sha256(pw.encode()).hexdigest()
        c.execute(
            f"SELECT * FROM hc_users WHERE (email={ph()} OR username={ph()}) AND password_hash={ph()}",
            (idf, idf, pw_hash)
        )
        row = to_dict(c.fetchone())
        if not row:
            db.close(); return jsonify({"error":"Wrong credentials"}), 401
        tok = secrets.token_hex(32)
        c.execute(f"UPDATE hc_users SET session_token={ph()} WHERE id={ph()}", (tok, row["id"]))
        db.commit(); c.close(); db.close()
        return jsonify({"token":tok,"id":row["id"],"username":row["username"],
                        "email":row["email"],"mc_username":row.get("mc_username","") or "","role":row["role"]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error":f"Server error: {e}"}), 500

# ═══════════════════════════════════════════════════════
# ADMIN ANALYTICS
# ═══════════════════════════════════════════════════════
@app.route("/api/admin/analytics")
@admin_required
def admin_analytics():
    db = get_db(); c = db_cursor(db)

    # Today's date
    today = datetime.now().strftime("%Y-%m-%d")

    # Total events by type
    c.execute("SELECT event_type, COUNT(*) as cnt FROM hc_store_events GROUP BY event_type")
    event_counts = {r["event_type"]: r["cnt"] for r in to_list(c.fetchall())}

    # Today's events
    if _DB_MODE == "sqlite":
        c.execute(f"SELECT event_type, COUNT(*) as cnt FROM hc_store_events WHERE DATE(created_at)={ph()} GROUP BY event_type", (today,))
    else:
        c.execute(f"SELECT event_type, COUNT(*) as cnt FROM hc_store_events WHERE DATE(created_at)={ph()} GROUP BY event_type", (today,))
    today_counts = {r["event_type"]: r["cnt"] for r in to_list(c.fetchall())}

    # Top products (by add_to_cart)
    c.execute("""SELECT product_name, COUNT(*) as cnt
        FROM hc_store_events WHERE event_type='add_to_cart' AND product_name != ''
        GROUP BY product_name ORDER BY cnt DESC LIMIT 10""")
    top_products = to_list(c.fetchall())

    # Recent events
    c.execute("""SELECT e.*, u.username FROM hc_store_events e
        LEFT JOIN hc_users u ON e.user_id = u.id
        ORDER BY e.created_at DESC LIMIT 50""")
    recent = to_list(c.fetchall())
    for r in recent: r["created_at"] = ts(r.get("created_at",""))

    # Orders
    c.execute("SELECT COUNT(*) as cnt, SUM(total) as revenue FROM hc_store_orders WHERE status='completed'")
    order_stats = to_dict(c.fetchone()) or {"cnt": 0, "revenue": 0}

    c.execute("SELECT COUNT(*) as cnt FROM hc_store_orders WHERE status='pending'")
    pending = to_dict(c.fetchone()) or {"cnt": 0}

    # Daily trend (last 14 days)
    if _DB_MODE == "sqlite":
        c.execute("""SELECT DATE(created_at) as day, event_type, COUNT(*) as cnt
            FROM hc_store_events WHERE created_at >= DATE('now', '-14 days')
            GROUP BY day, event_type ORDER BY day""")
    else:
        c.execute("""SELECT DATE(created_at) as day, event_type, COUNT(*) as cnt
            FROM hc_store_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
            GROUP BY day, event_type ORDER BY day""")
    daily_raw = to_list(c.fetchall())
    daily = {}
    for r in daily_raw:
        d = str(r["day"])
        if d not in daily: daily[d] = {}
        daily[d][r["event_type"]] = r["cnt"]

    c.close(); db.close()

    cart_adds = event_counts.get("add_to_cart", 0)
    checkouts = event_counts.get("checkout", 0)

    return jsonify({
        "overview": {
            "total_views": event_counts.get("view", 0),
            "total_cart_adds": cart_adds,
            "total_checkouts": checkouts,
            "conversion_rate": round((checkouts / cart_adds * 100), 1) if cart_adds > 0 else 0,
            "completed_orders": order_stats.get("cnt", 0) or 0,
            "total_revenue": round(float(order_stats.get("revenue", 0) or 0), 2),
            "pending_orders": pending.get("cnt", 0) or 0,
        },
        "today": {
            "views": today_counts.get("view", 0),
            "cart_adds": today_counts.get("add_to_cart", 0),
            "checkouts": today_counts.get("checkout", 0),
        },
        "top_products": top_products,
        "recent_events": recent[:30],
        "daily_trend": daily,
    })

# ═══════════════════════════════════════════════════════
# ADMIN PRODUCT MANAGEMENT
# ═══════════════════════════════════════════════════════
@app.route("/api/admin/products")
@admin_required
def admin_products():
    db = get_db(); c = db_cursor(db)
    c.execute("SELECT * FROM hc_store_products ORDER BY sort_order")
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows:
        r["created_at"] = ts(r.get("created_at",""))
        try: r["perks"] = json.loads(r.get("perks","[]"))
        except: r["perks"] = []
    return jsonify(rows)

@app.route("/api/admin/products", methods=["POST"])
@admin_required
def admin_product_save():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)

    perks = json.dumps(d.get("perks", []))
    pid = d.get("id")

    if pid:
        # Update
        c.execute(f"""UPDATE hc_store_products SET
            name={ph()}, slug={ph()}, category={ph()}, subcategory={ph()},
            price={ph()}, original_price={ph()}, description={ph()}, perks={ph()},
            icon={ph()}, color={ph()}, is_free={ph()}, is_featured={ph()},
            sort_order={ph()}, status={ph()}, download_url={ph()}
            WHERE id={ph()}""",
            (d["name"], d.get("slug",""), d["category"], d.get("subcategory",""),
             float(d["price"]), float(d.get("original_price",0)),
             d.get("description",""), perks,
             d.get("icon","ic-star"), d.get("color","#FF512F"),
             int(d.get("is_free",0)), int(d.get("is_featured",0)),
             int(d.get("sort_order",0)), d.get("status","active"),
             d.get("download_url",""), pid))
    else:
        # Insert
        c.execute(f"""INSERT INTO hc_store_products
            (name, slug, category, subcategory, price, original_price, description, perks, icon, color, is_free, is_featured, sort_order, status, download_url)
            VALUES({phs(15)})""",
            (d["name"], d.get("slug",""), d["category"], d.get("subcategory",""),
             float(d["price"]), float(d.get("original_price",0)),
             d.get("description",""), perks,
             d.get("icon","ic-star"), d.get("color","#FF512F"),
             int(d.get("is_free",0)), int(d.get("is_featured",0)),
             int(d.get("sort_order",0)), d.get("status","active"),
             d.get("download_url","")))

    db.commit(); c.close(); db.close()
    return jsonify({"ok": True})

@app.route("/api/admin/products/<int:pid>", methods=["DELETE"])
@admin_required
def admin_product_delete(pid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_store_products WHERE id={ph()}", (pid,))
    db.commit(); c.close(); db.close()
    return jsonify({"ok": True})

@app.route("/api/admin/orders")
@admin_required
def admin_orders():
    db = get_db(); c = db_cursor(db)
    c.execute("""SELECT o.*, u.username, u.mc_username as mc_name FROM hc_store_orders o
        LEFT JOIN hc_users u ON o.user_id = u.id
        ORDER BY o.created_at DESC LIMIT 100""")
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows:
        r["created_at"] = ts(r.get("created_at",""))
        try: r["items"] = json.loads(r.get("items","[]"))
        except: r["items"] = []
    return jsonify(rows)

# ═══════════════════════════════════════════════════════
# INIT & RUN
# ═══════════════════════════════════════════════════════
init_store_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"[STORE] Starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=True)
