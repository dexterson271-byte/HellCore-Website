"""
╔══════════════════════════════════════════════════════════════╗
║      HELLCORE STORE — Flask Backend (store.hellcore.net)    ║
║  pip install flask mysql-connector-python gunicorn   ║
║  python app.py  →  http://localhost:5001                    ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import sys

# Ensure current directory is in path for shared_store import
curr_dir = os.path.dirname(os.path.abspath(__file__))
if curr_dir not in sys.path:
    sys.path.append(curr_dir)

import sqlite3
import json
import uuid
import hashlib
import traceback
import secrets
import re
import datetime as dt
from datetime import datetime, timedelta
from functools import wraps
from shared_store import build_purchase_metadata, rank_payload, notify_discord_ticket
import stripe

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
XP_PER_INR = 2.5
STORE_DOMAIN   = os.environ.get("STORE_DOMAIN", "http://localhost:5001")
MAIN_DOMAIN    = os.environ.get("MAIN_DOMAIN", "http://localhost:5000")
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# ═══════════════════════════════════════════════════════
# DATABASE CONFIGURATION (shared with main site)
# ═══════════════════════════════════════════════════════
USE_MYSQL_AIVEN = os.environ.get("USE_MYSQL_AIVEN", "True").lower() == "true"
AIVEN_HOST     = os.environ.get("AIVEN_HOST", "")
AIVEN_PORT     = int(os.environ.get("AIVEN_PORT", 19513))
AIVEN_USER     = os.environ.get("AIVEN_USER", "")
AIVEN_PASSWORD = os.environ.get("AIVEN_PASSWORD", "")
AIVEN_DATABASE = os.environ.get("AIVEN_DATABASE", "")

# ── RAILWAY MYSQL (cloud) ─────────────────────────────
USE_MYSQL_RAILWAY = os.environ.get("USE_MYSQL_RAILWAY", "True").lower() == "true"
RAILWAY_HOST     = os.environ.get("MYSQL_HOST") or os.environ.get("MYSQLHOST") or ""
RAILWAY_PORT     = int(os.environ.get("MYSQL_PORT") or os.environ.get("MYSQLPORT") or 3306)
RAILWAY_USER     = os.environ.get("MYSQL_USER") or os.environ.get("MYSQLUSER") or "root"
RAILWAY_PASSWORD = os.environ.get("MYSQL_PASSWORD") or os.environ.get("MYSQLPASSWORD") or ""
RAILWAY_DATABASE = os.environ.get("MYSQL_DATABASE") or os.environ.get("MYSQLDATABASE") or "railway"

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
                print("[STORE] WARNING: Running in production but Aiven MySQL failed. Fallback to SQLite may result in missing data.")
    
    if USE_MYSQL_RAILWAY and RAILWAY_HOST:
        try:
            import mysql.connector
            print(f"[STORE] Attempting Railway MySQL connection: {RAILWAY_HOST}...")
            c = mysql.connector.connect(
                host=RAILWAY_HOST, port=RAILWAY_PORT,
                user=RAILWAY_USER, password=RAILWAY_PASSWORD,
                database=RAILWAY_DATABASE,
                connection_timeout=10
            )
            c.close()
            _DB_MODE = "mysql_railway"
            print(f"[STORE] SUCCESS: Railway MySQL connected.")
            return
        except Exception as e:
            print(f"[STORE] ERROR: Railway MySQL connection failed: {e}")
            if is_prod:
                print("[STORE] WARNING: Running in production but Railway MySQL failed. Fallback to SQLite may result in missing data.")
    
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
    elif _DB_MODE == "mysql_railway":
        import mysql.connector
        return mysql.connector.connect(
            host=RAILWAY_HOST, port=RAILWAY_PORT,
            user=RAILWAY_USER, password=RAILWAY_PASSWORD,
            database=RAILWAY_DATABASE,
            autocommit=True
        )
    else:
        conn = sqlite3.connect(SQLITE_FILE)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

def db_cursor(conn):
    if _DB_MODE in ("mysql_aiven", "mysql_railway"):
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


def stripe_is_configured():
    return bool((stripe.api_key or "").strip())


STORE_SPA_ROUTES = {"", "admin", "cart", "home", "ranks", "ticket-view", "tickets"}

# ═══════════════════════════════════════════════════════
# INIT STORE TABLES
# ═══════════════════════════════════════════════════════
def init_store_db():
    db = get_db(); c = db_cursor(db)
    mysql = _DB_MODE != "sqlite"
    AI  = "AUTO_INCREMENT" if mysql else "AUTOINCREMENT"
    DT  = "DATETIME DEFAULT CURRENT_TIMESTAMP" if mysql else "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"

    tables = [
f"""CREATE TABLE IF NOT EXISTS hc_users(
  id INTEGER PRIMARY KEY {AI},
  email VARCHAR(200) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  mc_username VARCHAR(50) DEFAULT '',
  password_hash VARCHAR(100) NOT NULL,
  session_token VARCHAR(120),
  role VARCHAR(30) DEFAULT 'player',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_cart(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  item_id VARCHAR(60) NOT NULL,
  item_name VARCHAR(80) NOT NULL,
  item_price REAL NOT NULL,
  gamemode VARCHAR(30) DEFAULT '')""",

f"""CREATE TABLE IF NOT EXISTS hc_tickets(
  id INTEGER PRIMARY KEY {AI},
  title VARCHAR(200) NOT NULL,
  category VARCHAR(40) DEFAULT 'general',
  description TEXT NOT NULL,
  author_id INTEGER,
  email VARCHAR(200),
  source VARCHAR(50) DEFAULT 'web',
  priority VARCHAR(20) DEFAULT 'normal',
  assigned_to INTEGER,
  status VARCHAR(20) DEFAULT 'open',
  last_message_at {DT},
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_ticket_msgs(
  id INTEGER PRIMARY KEY {AI},
  ticket_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_internal INTEGER DEFAULT 0,
  message_type VARCHAR(20) DEFAULT 'user',
  meta_json TEXT,
  image_url VARCHAR(255) DEFAULT '',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_ticket_activity(
  id INTEGER PRIMARY KEY {AI},
  ticket_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  created_at {DT})""",

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
  order_code VARCHAR(32) DEFAULT '',
  items TEXT,
  total REAL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  payment_method VARCHAR(32) DEFAULT 'upi',
  payment_status VARCHAR(20) DEFAULT 'pending',
  source_app VARCHAR(32) DEFAULT 'store',
  details_json TEXT,
  rank_snapshot TEXT,
  mc_username VARCHAR(50) DEFAULT '',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_command_queue(
  id INTEGER PRIMARY KEY {AI},
  command VARCHAR(255) NOT NULL,
  target VARCHAR(20) DEFAULT 'proxy',
  status VARCHAR(20) DEFAULT 'pending',
  created_at {DT})""",
    ]

    for sql in tables:
        try: 
            c.execute(sql)
        except Exception as e: 
            print(f"  [STORE] Table warn: {e}")
    
    db.commit() # <── Commit core tables
    print(f"  [STORE] Core tables committed.")

    for sql in [
        "ALTER TABLE hc_store_orders ADD COLUMN ticket_id INTEGER DEFAULT 0",
        "ALTER TABLE hc_store_orders ADD COLUMN order_code VARCHAR(32) DEFAULT ''",
        "ALTER TABLE hc_store_orders ADD COLUMN payment_method VARCHAR(32) DEFAULT 'upi'",
        "ALTER TABLE hc_store_orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending'",
        "ALTER TABLE hc_store_orders ADD COLUMN source_app VARCHAR(32) DEFAULT 'store'",
        "ALTER TABLE hc_store_orders ADD COLUMN details_json TEXT",
        "ALTER TABLE hc_store_orders ADD COLUMN rank_snapshot TEXT",
        "ALTER TABLE hc_tickets ADD COLUMN email VARCHAR(200)",
        "ALTER TABLE hc_tickets ADD COLUMN source VARCHAR(50) DEFAULT 'web'",
        "ALTER TABLE hc_tickets ADD COLUMN priority VARCHAR(20) DEFAULT 'normal'",
        "ALTER TABLE hc_tickets ADD COLUMN assigned_to INTEGER",
        "ALTER TABLE hc_tickets ADD COLUMN last_message_at TIMESTAMP",
        "ALTER TABLE hc_ticket_msgs ADD COLUMN is_internal INTEGER DEFAULT 0",
        "ALTER TABLE hc_ticket_msgs ADD COLUMN message_type VARCHAR(20) DEFAULT 'user'",
        "ALTER TABLE hc_ticket_msgs ADD COLUMN meta_json TEXT",
        "ALTER TABLE hc_ticket_msgs ADD COLUMN image_url VARCHAR(255) DEFAULT ''",
        "ALTER TABLE hc_store_products ADD COLUMN xp_price INTEGER DEFAULT 0",
        "ALTER TABLE hc_users ADD COLUMN current_xp INTEGER DEFAULT 0",
        "ALTER TABLE hc_command_queue ADD COLUMN target VARCHAR(20) DEFAULT 'proxy'",
    ]:
        try: c.execute(sql)
        except: pass

    db.commit()

    # Always re-seed to apply latest updates
    c.execute("DELETE FROM hc_store_products")
    db.commit()
    seed_products(c, db)
    c.close(); db.close()
    print("[STORE] Tables ready")

def seed_products(c, db):
    """Seed the store with initial products."""
    products = [
        # ── RANKS ──
        ("VIP", "vip", "rank", "global", 299, 399,
         "Start your journey with VIP status. Green tag, exclusive kit, and lobby perks.",
         '["[VIP] Green Tag","VIP Kit","5% Store Discount","Global Chat Access","Lobby Furniture"]',
         "ic-star", "#4ade80", 1, 1),
        ("VIP+", "vip-plus", "rank", "global", 699, 799,
         "Enhanced VIP with cyan flair. Everything in VIP plus fly and more.",
         '["[VIP+] Cyan Tag","VIP+ Kit","10% Store Discount","All VIP Perks","Fly in Lobby","Join Full Servers"]',
         "ic-layers", "#06b6d4", 1, 2),
        ("MVP", "mvp", "rank", "global", 1299, 1699,
         "The gold standard. Color nicknames, premium kits, and priority access.",
         '["[MVP] Gold Tag","MVP Kit","15% Store Discount","All VIP+ Perks","Color Nickname","Priority Queue"]',
         "ic-shield", "#f59e0b", 1, 3),
        ("MVP+", "mvp-plus", "rank", "global", 2799, 3399,
         "Red-tier elite. Private games, best kits, and maximum perks.",
         '["[MVP+] Red Tag","MVP+ Kit","20% Store Discount","All MVP Perks","Private Games","Nick Command"]',
         "ic-heart", "#f43f5e", 1, 4),
        ("Booster", "booster", "rank", "global", 3499, 3999,
         "The ultimate rank replacement for MVP++. Pink prestige, host private games, and exclusive everything.",
         '["[Booster] Pink Tag","Booster Kit","25% Store Discount","All MVP+ Perks","Host Private Games","Exclusive Cosmetics","Monthly Crate"]',
         "ic-bolt", "#d946ef", 1, 5),

        # ── BOOSTERS (CONSUMABLES) ──
        ("1 Hour Global Coin Booster", "1h-coin-booster", "booster", "global", 299, 399,
         "Multiply all coins earned globally by 2x for 1 hour.",
         '["2x Global Coins","1 Hour Duration","Works in all modes","Stacks with events"]',
         "ic-zap", "#facc15", 0, 6),
        ("3 Hour Global Coin Booster", "3h-coin-booster", "booster", "global", 699, 899,
         "Multiply all coins earned globally by 2x for 3 hours.",
         '["2x Global Coins","3 Hour Duration","Works in all modes","Stacks with events"]',
         "ic-zap", "#eab308", 1, 7),

        # ── MYSTERY BOXES ──
        ("5x Mystery Box Bundle", "5x-mystery-box", "mystery_box", "global", 399, 499,
         "Open 5 Mystery Boxes to unlock epic cosmetics, gadgets, and pets.",
         '["5x Mystery Boxes","Chance for Legendary Items","Cosmetics & Gadgets"]',
         "ic-package", "#a855f7", 0, 8),
        ("10x Mystery Box Bundle", "10x-mystery-box", "mystery_box", "global", 699, 899,
         "Open 10 Mystery Boxes to unlock epic cosmetics, gadgets, and pets.",
         '["10x Mystery Boxes","Chance for Legendary Items","Cosmetics & Gadgets"]',
         "ic-package", "#c084fc", 1, 9),

        # ── COINS ──
        ("10,000 Bedwars Coins", "10k-bw-coins", "coins", "bedwars", 199, 299,
         "Instantly receive 10,000 Bedwars coins to spend on in-game cosmetics.",
         '["10,000 Coins","Instant Delivery","Use in Bedwars Shop"]',
         "ic-coins", "#fbbf24", 0, 10),
        ("50,000 Bedwars Coins", "50k-bw-coins", "coins", "bedwars", 799, 999,
         "Instantly receive 50,000 Bedwars coins to spend on in-game cosmetics.",
         '["50,000 Coins","Instant Delivery","Use in Bedwars Shop"]',
         "ic-coins", "#f59e0b", 1, 11),

        # ── MYSTERY DUST ──
        ("1,000 Mystery Dust", "1k-mystery-dust", "mystery_dust", "global", 299, 399,
         "Craft specific cosmetics directly using Mystery Dust.",
         '["1,000 Mystery Dust","Craft Cosmetics","Bypass RNG"]',
         "ic-sparkles", "#2dd4bf", 0, 12),
        ("5,000 Mystery Dust", "5k-mystery-dust", "mystery_dust", "global", 999, 1299,
         "Craft specific cosmetics directly using Mystery Dust.",
         '["5,000 Mystery Dust","Craft Cosmetics","Bypass RNG"]',
         "ic-sparkles", "#14b8a6", 1, 13),
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


def get_rank_payload_for_user(user_id, cursor=None):
    if not user_id:
        return rank_payload({})
    owns_cursor = cursor is None
    db = None
    c = cursor
    try:
        if owns_cursor:
            db = get_db()
            c = db_cursor(db)
        c.execute(f"SELECT gamemode, rank_name FROM hc_ranks WHERE user_id={ph()}", (user_id,))
        details = {
            row["gamemode"]: row["rank_name"]
            for row in to_list(c.fetchall())
            if row.get("gamemode") and row.get("rank_name")
        }
        return rank_payload(details)
    except Exception:
        traceback.print_exc()
        return rank_payload({})
    finally:
        if owns_cursor and c is not None:
            c.close()
        if owns_cursor and db is not None:
            db.close()


def enrich_user_with_rank(data, user_id=None, cursor=None):
    payload = get_rank_payload_for_user(user_id or data.get("id"), cursor)
    data["primary_rank"] = payload["primary_rank"]
    data["rank_details"] = payload["rank_details"]
    return data


def is_known_store_spa_path(path):
    clean = (path or "/").strip("/")
    return clean in STORE_SPA_ROUTES


def build_store_spa_response():
    return render_template("store.html"), 200


def create_purchase_order_record(c, user, cart_items, source_app="store", payment_method="upi", payment_status="awaiting_proof"):
    if not user:
        raise ValueError("Authenticated user required")
    if not cart_items:
        raise ValueError("Cart is empty")

    rank_info = get_rank_payload_for_user(user["id"], c)
    total_usd = sum(float(item.get("item_price") or item.get("price") or 0) for item in cart_items)
    total_inr = round(total_usd * USD_TO_INR, 2)
    meta = build_purchase_metadata(
        user=user,
        items=cart_items,
        rank_info=rank_info,
        payment_method=payment_method,
        payment_status=payment_status,
        payment_details={
            "upi_id": UPI_ID,
            "amount_usd": f"{total_usd:.2f}",
            "amount_inr": f"{total_inr:.2f}",
        },
        source_app=source_app,
    )
    now = meta["created_at"]
    c.execute(
        f"INSERT INTO hc_tickets(title,description,author_id,email,source,category,priority,status,last_message_at) "
        f"VALUES({phs(9)})",
        (meta["ticket_title"], meta["ticket_desc"], user["id"], user.get("email", ""), "store", "purchase", "high", "open", now),
    )
    ticket_id = c.lastrowid
    c.execute(
        f"INSERT INTO hc_ticket_msgs(ticket_id,author_id,content,message_type,meta_json) VALUES({phs(5)})",
        (ticket_id, 1, meta["system_message"], "system", meta["details_json"]),
    )
    c.execute(
        f"INSERT INTO hc_ticket_activity(ticket_id,actor_id,action,details) VALUES({phs(4)})",
        (ticket_id, user["id"], "order_created", f"{meta['order_code']} from {source_app}"),
    )

    # Discord Notification
    notify_discord_ticket(ticket_id, meta["ticket_title"], meta["ticket_desc"], user["username"], "purchase", meta["order_code"])
    c.execute(
        f"""INSERT INTO hc_store_orders
            (user_id, ticket_id, order_code, items, total, status, payment_method, payment_status, source_app, details_json, rank_snapshot, mc_username)
            VALUES({phs(12)})""",
        (
            user["id"],
            ticket_id,
            meta["order_code"],
            meta["items_json"],
            meta["total_usd"],
            "pending",
            payment_method,
            payment_status,
            source_app,
            meta["details_json"],
            meta["rank_snapshot"],
            user.get("mc_username", "") or "",
        ),
    )
    order_id = c.lastrowid
    return {
        "ticket_id": ticket_id,
        "order_id": order_id,
        "order_code": meta["order_code"],
        "redirect_url": f"/tickets?id={ticket_id}",
        "details": json.loads(meta["details_json"]),
    }

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


def resolve_purchase_username(user):
    username = str(user.get("mc_username") or user.get("username") or "").strip()
    if not re.match(r"^[a-zA-Z0-9_]{3,16}$", username):
        raise ValueError("Set a valid Minecraft username on your account before buying ranks with XP.")
    return username


def get_products_for_cart(c, cart_items):
    product_ids = []
    for item in cart_items:
        item_id = str(item.get("item_id") or "").strip()
        if item_id.isdigit():
            product_ids.append(int(item_id))
    rows = []
    if product_ids:
        c.execute(
            f"SELECT id, name, slug, category, subcategory FROM hc_store_products WHERE id IN ({phs(len(product_ids))})",
            tuple(product_ids),
        )
        rows = to_list(c.fetchall())

    products = {int(row["id"]): to_dict(row) for row in rows}
    by_name = {str(row.get("name") or "").strip().lower(): to_dict(row) for row in rows}

    if len(products) < len(cart_items):
        c.execute("SELECT id, name, slug, category, subcategory FROM hc_store_products WHERE status='active'")
        all_rows = to_list(c.fetchall())
        if not by_name:
            by_name = {str(row.get("name") or "").strip().lower(): to_dict(row) for row in all_rows}
        else:
            for row in all_rows:
                by_name.setdefault(str(row.get("name") or "").strip().lower(), to_dict(row))

    return products, by_name


def parse_numeric_prefix(value):
    m = re.match(r"^\s*(\d+)", str(value or ""))
    return int(m.group(1)) if m else 0


def parse_compact_amount(value):
    text = str(value or "").strip().lower().replace(",", "")
    m = re.match(r"^(\d+)([kmb])?$", text)
    if not m:
        return 0
    amount = int(m.group(1))
    suffix = m.group(2) or ""
    if suffix == "k":
        amount *= 1000
    elif suffix == "m":
        amount *= 1000000
    elif suffix == "b":
        amount *= 1000000000
    return amount


def infer_product_grant(product, item):
    slug = str(product.get("slug") or "").strip().lower()
    name = str(product.get("name") or item.get("item_name") or "").strip()
    category = str(product.get("category") or "").strip().lower()

    if category == "mystery_box":
        amount = parse_numeric_prefix(slug) or parse_numeric_prefix(name)
        return max(1, amount), "COMMON"
    if category == "mystery_dust":
        amount = parse_compact_amount(slug.split("-")[0]) or parse_compact_amount(name.split(" ")[0])
        return max(1, amount), None
    if category == "coins":
        amount = parse_compact_amount(slug.split("-")[0]) or parse_compact_amount(name.split(" ")[0])
        return max(1, amount), None
    return 0, None


def queue_store_fulfillment(c, user, cart_items, ticket_id=None):
    username = resolve_purchase_username(user)
    products, products_by_name = get_products_for_cart(c, cart_items)
    queued_commands = []

    for item in cart_items:
        item_id = str(item.get("item_id") or "").strip()
        product = products.get(int(item_id)) if item_id.isdigit() else None
        if not product:
            item_name = str(item.get("item_name") or item.get("name") or "").strip().lower()
            product = products_by_name.get(item_name)
        if not product:
            continue
        category = str(product.get("category") or "").strip().lower()

        if category == "rank":
            rank_name = str(product.get("slug") or item.get("item_name") or "").strip().lower()
            gamemode = str(product.get("subcategory") or item.get("gamemode") or "global").strip().lower() or "global"
            if not re.match(r"^[a-zA-Z0-9_+\-]{2,32}$", rank_name):
                raise ValueError(f"Unsupported rank command value for {product.get('name') or 'item'}.")

            c.execute(f"DELETE FROM hc_ranks WHERE user_id={ph()} AND gamemode={ph()}", (user["id"], gamemode))
            c.execute(
                f"INSERT INTO hc_ranks(user_id, gamemode, rank_name) VALUES({phs(3)})",
                (user["id"], gamemode, rank_name),
            )

            cmd = f"lpv user {username} parent set {rank_name}"
            event_action = "rank_fulfillment_queued"
            event_label = "Rank fulfillment queued"
        elif category == "mystery_box":
            amount, _ = infer_product_grant(product, item)
            cmd = f"gmysterybox give {username} {amount}"
            event_action = "mystery_box_fulfillment_queued"
            event_label = "Mystery box fulfillment queued"
        elif category == "mystery_dust":
            amount, _ = infer_product_grant(product, item)
            cmd = f"mysterydust add {username} {amount}"
            event_action = "mystery_dust_fulfillment_queued"
            event_label = "Mystery dust fulfillment queued"
        elif category == "coins":
            amount, _ = infer_product_grant(product, item)
            cmd = f"eco give {username} {amount}"
            event_action = "mystery_coin_fulfillment_queued"
            event_label = "Coin fulfillment queued"
        else:
            continue

        target = "proxy" if category == "rank" else "bukkit"
        c.execute(f"INSERT INTO hc_command_queue(command,target) VALUES({phs(2)})", (cmd, target))
        queued_commands.append(cmd)

        if ticket_id:
            c.execute(
                f"INSERT INTO hc_ticket_msgs(ticket_id,author_id,content,message_type) VALUES({phs(4)})",
                (ticket_id, 1, f"{event_label}: `{cmd}`", "system"),
            )
            c.execute(
                f"INSERT INTO hc_ticket_activity(ticket_id,actor_id,action,details) VALUES({phs(4)})",
                (ticket_id, user["id"], event_action, cmd),
            )

    return queued_commands

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
    return build_store_spa_response()

@app.route("/static/<path:f>")
def static_f(f):
    return send_from_directory("static", f)

# Also serve main site static files (logo, images)
@app.route("/main-static/<path:f>")
def main_static(f):
    main_static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static')
    return send_from_directory(main_static_dir, f)


@app.route("/business-info")
def business_info_page():
    business_info = {
        "business_name": os.environ.get("STORE_BUSINESS_NAME", "Hellcore Network"),
        "operator_name": os.environ.get("STORE_OPERATOR_NAME", "井高 康弘"),
        "representative_name": os.environ.get("STORE_REPRESENTATIVE_NAME", "井高 康弘"),
        "business_address": os.environ.get("STORE_BUSINESS_ADDRESS", "2 Chome-1-2 Takabana, 印西市, 千葉県 270-1354, Japan"),
        "business_phone": os.environ.get("STORE_BUSINESS_PHONE", "0476-47-3381"),
        "business_email": os.environ.get("STORE_BUSINESS_EMAIL", "support@hellcore.net"),
        "price_note": os.environ.get("STORE_PRICE_NOTE", "Prices are shown on each product page in the store."),
        "payment_methods": os.environ.get("STORE_PAYMENT_METHODS", "Stripe, card payments, and other payment methods shown at checkout."),
        "payment_timing": os.environ.get("STORE_PAYMENT_TIMING", "Payment is charged at the time an order is placed and accepted."),
        "delivery_time": os.environ.get("STORE_DELIVERY_TIME", "Digital items are usually delivered shortly after successful payment."),
        "returns_policy": os.environ.get("STORE_RETURNS_POLICY", "Because the store sells digital goods, returns and cancellations may not be available after delivery unless required by law."),
        "additional_fees": os.environ.get("STORE_ADDITIONAL_FEES", "Customers are responsible for any internet connection or bank-related fees."),
        "service_description": os.environ.get("STORE_SERVICE_DESCRIPTION", "Minecraft server ranks, perks, and other digital goods for Hellcore Network."),
    }
    return render_template("business_info.html", info=business_info), 200


@app.route("/business_info")
def business_info_legacy_redirect():
    return redirect("/business-info", code=301)


@app.route("/<path:p>")
def catch_all(p):
    if is_known_store_spa_path("/" + p):
        return build_store_spa_response()
    return "Not Found", 404

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
        
        # Calculate XP price if not set manually
        if not r.get("xp_price"):
            r["xp_price"] = int(float(r["price"]) * XP_PER_INR)
            
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
    """Create a checkout session (Stripe, XP, or UPI ticket)."""
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    try:
        # Get cart items
        c.execute(f"SELECT * FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
        cart_items = to_list(c.fetchall())
        if not cart_items:
            c.close(); db.close()
            return jsonify({"error": "Cart is empty"}), 400
        
        # Get user's current XP
        c.execute(f"SELECT current_xp FROM hc_users WHERE id={ph()}", (request.cu["id"],))
        u_row = c.fetchone()
        current_xp = int(u_row["current_xp"] or 0) if u_row else 0

        pay_method = d.get("payment_method", "upi")
        
        total_usd = sum(float(i["item_price"]) for i in cart_items)
        total_xp = int(total_usd * XP_PER_INR)

        if pay_method == "xp":
            if current_xp < total_xp:
                c.close(); db.close()
                return jsonify({"error": f"Insufficient XP. You need {total_xp} XP but only have {current_xp}."}), 400
            
            # Deduct XP
            new_xp = current_xp - total_xp
            c.execute(f"UPDATE hc_users SET current_xp={ph()} WHERE id={ph()}", (new_xp, request.cu["id"]))
            
            # Create order with 'completed' status since XP is instant
            result = create_purchase_order_record(c, request.cu, cart_items, source_app="store", payment_method="xp", payment_status="completed")
            queued_commands = queue_store_fulfillment(c, request.cu, cart_items, result["ticket_id"])
            c.execute(
                f"UPDATE hc_store_orders SET status='completed', payment_status='completed' WHERE id={ph()}",
                (result["order_id"],),
            )
            c.execute(f"DELETE FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
            db.commit(); c.close(); db.close()
            track_event("checkout", None, "", request.cu["id"], json.dumps({"order_code": result["order_code"], "method": pay_method}))
            result["queued_commands"] = queued_commands
            return jsonify(result)

        elif pay_method == "stripe":
            if not stripe_is_configured():
                c.close(); db.close()
                return jsonify({
                    "error": "Card checkout is not configured right now. Please set STRIPE_SECRET_KEY on the store server or use another payment method."
                }), 503

            # Create Stripe Checkout Session
            line_items = []
            for item in cart_items:
                line_items.append({
                    'price_data': {
                        'currency': 'inr',
                        'product_data': {
                            'name': item['item_name'],
                            'description': f"Fulfillment for Minecraft User: {request.cu['username']}",
                        },
                        'unit_amount': int(float(item['item_price']) * 100), # Stripe uses paisa
                    },
                    'quantity': 1,
                })

            # Create a pending order record first
            result = create_purchase_order_record(c, request.cu, cart_items, source_app="store", payment_method="stripe", payment_status="pending")
            
            checkout_session = stripe.checkout.Session.create(
                payment_method_types=['card'], # 'upi' can be added if enabled in dashboard
                line_items=line_items,
                mode='payment',
                success_url=STORE_DOMAIN + '/history?success=true&session_id={CHECKOUT_SESSION_ID}',
                cancel_url=STORE_DOMAIN + '/cart?canceled=true',
                client_reference_id=str(result["order_id"]),
                customer_email=request.cu["email"],
                metadata={
                    "order_id": str(result["order_id"]),
                    "order_code": result["order_code"],
                    "user_id": str(request.cu["id"]),
                    "username": request.cu["username"]
                }
            )
            
            # Update order with stripe session ID
            c.execute(f"UPDATE hc_store_orders SET details_json={ph()} WHERE id={ph()}", 
                      (json.dumps({"stripe_session_id": checkout_session.id}), result["order_id"]))
            
            db.commit(); c.close(); db.close()
            return jsonify({"stripe_url": checkout_session.url})

        else:
            # Default to UPI (Ticket System)
            result = create_purchase_order_record(c, request.cu, cart_items, source_app="store")
            c.execute(f"DELETE FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
            db.commit(); c.close(); db.close()
            track_event("checkout", None, "", request.cu["id"], json.dumps({"order_code": result["order_code"], "method": pay_method}))
            return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        if 'db' in locals(): 
            try: db.close()
            except: pass
        return jsonify({"error": f"Checkout failed: {str(e)}"}), 500


@app.route("/api/store/orders/history")
@auth_required
def store_order_history():
    db = get_db(); c = db_cursor(db)
    c.execute(
        f"""SELECT id, order_code, items, total, status, payment_method, payment_status, created_at
            FROM hc_store_orders
            WHERE user_id={ph()}
            ORDER BY created_at DESC, id DESC""",
        (request.cu["id"],)
    )
    rows = to_list(c.fetchall()); c.close(); db.close()
    for row in rows:
        row["created_at"] = ts(row.get("created_at", ""))
        try:
            parsed_items = json.loads(row.get("items", "[]"))
        except Exception:
            parsed_items = []
        normalized_items = []
        for item in parsed_items:
            if isinstance(item, dict):
                normalized_items.append({
                    "name": item.get("item_name") or item.get("name") or "Store item",
                    "price": item.get("item_price") or item.get("price") or 0,
                    "gamemode": item.get("gamemode") or "",
                })
        row["items"] = normalized_items
    return jsonify(rows)


@app.route("/api/stripe/webhook", methods=["POST"])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')

    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        else:
            # Fallback if secret not configured (caution!)
            event = json.loads(payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        order_id = session.get('client_reference_id')
        
        if order_id:
            db = get_db(); c = db_cursor(db)
            try:
                c.execute(f"UPDATE hc_store_orders SET payment_status='completed', status='completed' WHERE id={ph()}", (order_id,))
                c.execute(f"SELECT * FROM hc_store_orders WHERE id={ph()}", (order_id,))
                order = to_dict(c.fetchone())
                if order:
                    notify_discord_ticket(
                        title=f"💰 Stripe Payment Received — #{order['order_code']}",
                        message=f"**User:** {order['mc_username']}\n**Total:** ₹{order['total']}\n**Items:** {order['items']}\n\nPayment verified via Stripe.",
                        color=0x22c55e
                    )
                db.commit()
            except Exception as e:
                print(f"[STRIPE WEBHOOK ERROR] {e}")
            finally:
                c.close(); db.close()

    return jsonify({"success": True})







# ═══════════════════════════════════════════════════════
# AUTH ROUTES (for store login/verification)
# ═══════════════════════════════════════════════════════
@app.route("/api/auth/me")
def auth_me():
    token = request.headers.get("X-Auth-Token", "") or request.cookies.get("hc_token", "")
    u = get_user_by_token(token)
    if not u: return jsonify({"error":"Not logged in"}), 401
    
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT current_xp FROM hc_users WHERE id={ph()}", (u["id"],))
    xp_row = to_dict(c.fetchone()) or {}
    payload = enrich_user_with_rank({
        "id":u["id"],
        "username":u["username"],
        "email":u["email"],
        "mc_username":u.get("mc_username","") or "",
        "role":u["role"],
        "current_xp": int(xp_row.get("current_xp") or u.get("current_xp") or 0),
    }, u["id"], c)
    payload["ranks"] = payload["rank_details"]
    c.close(); db.close()

    return jsonify(payload)

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
        c.execute(f"SELECT current_xp FROM hc_users WHERE id={ph()}", (row["id"],))
        xp_row = to_dict(c.fetchone()) or {}
        payload = enrich_user_with_rank({
            "token": tok,
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "mc_username": row.get("mc_username","") or "",
            "role": row["role"],
            "current_xp": int(xp_row.get("current_xp") or row.get("current_xp") or 0),
        }, row["id"], c)
        db.commit(); c.close(); db.close()
        resp = jsonify(payload)
        resp.set_cookie(
            "hc_token",
            tok,
            max_age=60*60*24*30,
            path="/",
            domain=".hellcore.net" if "hellcore.net" in request.host else None,
            samesite="None",
            secure=True
        )
        return resp
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
        try: r["details_json"] = json.loads(r.get("details_json","{}"))
        except: r["details_json"] = {}
        try: r["rank_snapshot"] = json.loads(r.get("rank_snapshot","{}"))
        except: r["rank_snapshot"] = {}
    return jsonify(rows)

# ═══════════════════════════════════════════════════════
# INIT & RUN
# ═══════════════════════════════════════════════════════
init_store_db()

@app.errorhandler(404)
def not_found(e):
    if is_known_store_spa_path(request.path):
        return build_store_spa_response()
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return "Not Found", 404

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"[STORE] Starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=True)
