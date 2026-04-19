"""
╔══════════════════════════════════════════════════════════════╗
║          HELLCORE NETWORK — Flask Backend v7                ║
║  pip install flask mysql-connector-python gunicorn requests║
║  python app.py  →  http://localhost:5000                    ║
╠══════════════════════════════════════════════════════════════╣
║  DATABASE SETUP:                                            ║
║  Option A — Local MySQL:                                    ║
║    1. Run setup_mysql.sql in MySQL                          ║
║    2. Set USE_MYSQL_LOCAL = True below                      ║
║    3. Set LOCAL_MYSQL_* vars below                          ║
║                                                             ║
║  Option B — Aiven MySQL (cloud):                            ║
║    1. Set USE_MYSQL_LOCAL = False                           ║
║    2. Set AIVEN_* vars below                                ║
║                                                             ║
║  Option C — SQLite (zero setup, auto fallback):             ║
║    Just run python app.py — works instantly                 ║
╠══════════════════════════════════════════════════════════════╣
║  MAKE YOURSELF FOUNDER AFTER REGISTERING:                   ║
║  SQLite: sqlite3 hellcore.db                                ║
║    UPDATE hc_users SET role='founder'                       ║
║    WHERE username='YourName';                               ║
║                                                             ║
║  MySQL: UPDATE hc_users SET role='founder'                  ║
║    WHERE username='YourName';                               ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import sqlite3
import json
import uuid
import hashlib
import re
import traceback
import secrets
import io
import threading
import random
import datetime as dt
from datetime import datetime, timedelta
from functools import wraps
import urllib.request
import urllib.error

# Load environment variables for local testing
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from flask import Flask, request, jsonify, render_template, send_from_directory, Response

app = Flask(__name__)

@app.after_request
def add_header(r):
    """Disable caching for all API responses"""
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    return r

# ═══════════════════════════════════════════════════════
# DATABASE CONFIGURATION — edit these to match your setup
# ═══════════════════════════════════════════════════════

# ── LOCAL MYSQL (running on your PC / localhost) ──────
USE_MYSQL_LOCAL = False          # Set True to use local MySQL
LOCAL_MYSQL_HOST     = "localhost"
LOCAL_MYSQL_PORT     = 3306
LOCAL_MYSQL_USER     = "root"
LOCAL_MYSQL_PASSWORD = "yourpassword"   # <── change this
LOCAL_MYSQL_DATABASE = "hellcore"

# ── AIVEN MYSQL (cloud) ───────────────────────────────
USE_MYSQL_AIVEN = os.environ.get("USE_MYSQL_AIVEN", "True").lower() == "true"
AIVEN_HOST     = os.environ.get("AIVEN_HOST", "")
AIVEN_PORT     = int(os.environ.get("AIVEN_PORT", 19513))
AIVEN_USER     = os.environ.get("AIVEN_USER", "")
AIVEN_PASSWORD = os.environ.get("AIVEN_PASSWORD", "")
AIVEN_DATABASE = os.environ.get("AIVEN_DATABASE", "")

# ── SQLITE (zero-config fallback) ─────────────────────
SQLITE_FILE = "hellcore.db"

# Internal: which DB mode is actually active
_DB_MODE = "sqlite"  # will be set by try_connect()

# ═══════════════════════════════════════════════════════
# PUSHER CONFIGURATION (Real-time Chat)
# ═══════════════════════════════════════════════════════
try:
    import pusher
    _p_id = os.environ.get("PUSHER_APP_ID", "")
    if _p_id:
        pusher_client = pusher.Pusher(
          app_id=_p_id,
          key=os.environ.get("PUSHER_KEY", ""),
          secret=os.environ.get("PUSHER_SECRET", ""),
          cluster=os.environ.get("PUSHER_CLUSTER", ""),
          ssl=True
        )
    else:
        pusher_client = None
        print("⚠ PUSHER_APP_ID not set in environment. Real-time chat disabled locally.")
except Exception as e:
    pusher_client = None
    print(f"⚠ Pusher initialization failed: {e}. Real-time chat disabled.")

# -------------------------------------------------------
# DB CONNECTION
# -------------------------------------------------------
def try_connect():
    global _DB_MODE
    if USE_MYSQL_LOCAL:
        try:
            import mysql.connector
            c = mysql.connector.connect(
                host=LOCAL_MYSQL_HOST, port=LOCAL_MYSQL_PORT,
                user=LOCAL_MYSQL_USER, password=LOCAL_MYSQL_PASSWORD,
                database=LOCAL_MYSQL_DATABASE, connection_timeout=6
            )
            c.close()
            _DB_MODE = "mysql_local"
            print(f"[OK] Local MySQL connected ({LOCAL_MYSQL_HOST}:{LOCAL_MYSQL_PORT}/{LOCAL_MYSQL_DATABASE})")
            return
        except Exception as e:
            print(f"[ERROR] Local MySQL failed: {e}")

    if USE_MYSQL_AIVEN:
        try:
            import mysql.connector
            c = mysql.connector.connect(
                host=AIVEN_HOST, port=AIVEN_PORT,
                user=AIVEN_USER, password=AIVEN_PASSWORD,
                database=AIVEN_DATABASE, ssl_disabled=False,
                connection_timeout=8
            )
            c.close()
            _DB_MODE = "mysql_aiven"
            print(f"[OK] Aiven MySQL connected ({AIVEN_HOST})")
            return
        except Exception as e:
            print(f"[ERROR] Aiven MySQL failed: {e}")

    _DB_MODE = "sqlite"
    print("[OK] Using SQLite (hellcore.db) — zero config mode")

# Automatically connect to DB when the app starts
try_connect()

def get_db():

    if _DB_MODE in ("mysql_local", "mysql_aiven"):
        import mysql.connector
        if _DB_MODE == "mysql_local":
            return mysql.connector.connect(
                host=LOCAL_MYSQL_HOST, port=LOCAL_MYSQL_PORT,
                user=LOCAL_MYSQL_USER, password=LOCAL_MYSQL_PASSWORD,
                database=LOCAL_MYSQL_DATABASE
            )
        else:
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
    if _DB_MODE in ("mysql_local", "mysql_aiven"):
        return conn.cursor(dictionary=True)
    return conn.cursor()

def to_dict(row):
    if row is None: return None
    if isinstance(row, dict): return row
    return dict(row)

def to_list(rows):
    return [to_dict(r) for r in rows]

def ph():
    """Placeholder: %s for MySQL, ? for SQLite"""
    return "%s" if _DB_MODE != "sqlite" else "?"

def phs(n):
    """n placeholders"""
    return ",".join([ph()] * n)

def upsert(c, table, cols_vals, conflict_cols):
    """INSERT OR REPLACE (SQLite) / INSERT ... ON DUPLICATE KEY UPDATE (MySQL)"""
    cols   = list(cols_vals.keys())
    vals   = list(cols_vals.values())
    if _DB_MODE == "sqlite":
        c.execute(
            f"INSERT OR REPLACE INTO {table}({','.join(cols)}) VALUES({phs(len(cols))})",
            vals
        )
    else:
        upd = ",".join(f"{col}=VALUES({col})" for col in cols if col not in conflict_cols)
        c.execute(
            f"INSERT INTO {table}({','.join(cols)}) VALUES({phs(len(cols))}) ON DUPLICATE KEY UPDATE {upd}",
            vals
        )

def ts(v): return str(v) if v else ""
def hp(pw): return hashlib.sha256(pw.encode()).hexdigest()

# -------------------------------------------------------
# INIT TABLES
# -------------------------------------------------------
def init_db():
    db = get_db(); c = db_cursor(db)
    mysql = _DB_MODE != "sqlite"
    AI  = "AUTO_INCREMENT" if mysql else "AUTOINCREMENT"
    DT  = "DATETIME DEFAULT CURRENT_TIMESTAMP" if mysql else "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    UNQ = "UNIQUE KEY uq" if mysql else "UNIQUE"

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

f"""CREATE TABLE IF NOT EXISTS hc_ranks(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  gamemode VARCHAR(30) NOT NULL,
  rank_name VARCHAR(30) DEFAULT 'default',
  {UNQ}(user_id,gamemode))""",

f"""CREATE TABLE IF NOT EXISTS hc_economy(
  user_id INTEGER PRIMARY KEY,
  server_gold INTEGER DEFAULT 0,
  server_iron INTEGER DEFAULT 0)""",

f"""CREATE TABLE IF NOT EXISTS hc_stats(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  gamemode VARCHAR(30) NOT NULL,
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 0,
  {UNQ}(user_id,gamemode))""",

f"""CREATE TABLE IF NOT EXISTS hc_inventory(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  item_type VARCHAR(30) DEFAULT 'rank',
  item_name VARCHAR(80) NOT NULL,
  gamemode VARCHAR(30) DEFAULT '',
  gifted_by INTEGER,
  status VARCHAR(20) DEFAULT 'active',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_gifts(
  id INTEGER PRIMARY KEY {AI},
  from_user_id INTEGER NOT NULL,
  to_username VARCHAR(50) NOT NULL,
  item_type VARCHAR(30) DEFAULT 'rank',
  item_name VARCHAR(80) NOT NULL,
  gamemode VARCHAR(30) DEFAULT '',
  status VARCHAR(20) DEFAULT 'pending',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_cart(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  item_id VARCHAR(60) NOT NULL,
  item_name VARCHAR(80) NOT NULL,
  item_price REAL NOT NULL,
  gamemode VARCHAR(30) DEFAULT '')""",

f"""CREATE TABLE IF NOT EXISTS hc_forums(
  id INTEGER PRIMARY KEY {AI},
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  category VARCHAR(40) DEFAULT 'general',
  views INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_replies(
  id INTEGER PRIMARY KEY {AI},
  forum_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_tickets(
  id INTEGER PRIMARY KEY {AI},
  title VARCHAR(200) NOT NULL,
  category VARCHAR(40) DEFAULT 'general',
  description TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_ticket_msgs(
  id INTEGER PRIMARY KEY {AI},
  ticket_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_ads(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  ad_streak INTEGER DEFAULT 0,
  ads_today INTEGER DEFAULT 0,
  last_ad_date DATE,
  last_ad_time DATETIME,
  vip_active INTEGER DEFAULT 0,
  vip_expires DATETIME,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_command_queue(
  id INTEGER PRIMARY KEY {AI},
  command VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_server_metrics(
  server_name VARCHAR(50) PRIMARY KEY,
  online_players INTEGER DEFAULT 0,
  max_players INTEGER DEFAULT 0,
  server_ip VARCHAR(255) DEFAULT '',
  last_updated {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_player_history(
  id INTEGER PRIMARY KEY {AI},
  timestamp {DT},
  total_players INTEGER DEFAULT 0)""",

f"""CREATE TABLE IF NOT EXISTS hc_events(
  id INTEGER PRIMARY KEY {AI},
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(255) DEFAULT '',
  link_url VARCHAR(255) DEFAULT '',
  expires_at DATETIME,
  created_at {DT})""",
f"""CREATE TABLE IF NOT EXISTS hc_audit_logs(
  id INTEGER PRIMARY KEY {AI},
  admin_id INTEGER NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_id INTEGER,
  details TEXT,
  created_at {DT})""",
f"""CREATE TABLE IF NOT EXISTS hc_staff_channels(
  id INTEGER PRIMARY KEY {AI},
  name VARCHAR(100) NOT NULL,
  created_by INTEGER NOT NULL,
  created_at {DT})""",
f"""CREATE TABLE IF NOT EXISTS hc_staff_messages(
  id INTEGER PRIMARY KEY {AI},
  channel_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at {DT})""",
    ]

    for sql in tables:
        try: c.execute(sql)
        except Exception as e: print(f"  Table warn: {e}")

    # MIGRATION: Add is_pinned and is_locked if missing
    for col in ["is_pinned", "is_locked"]:
        try: c.execute(f"ALTER TABLE hc_forums ADD COLUMN {col} INTEGER DEFAULT 0")
        except: pass

    db.commit()

    # --- BOOTSTRAP EVENTS ---
    def bootstrap_events(curr):
        # One-time purge to fix missing link_url in existing records
        curr.execute("DELETE FROM hc_events")
        
        evs = [
            ("Earn a Free Rank", "Claim your free starter rank today and unlock exclusive lobby furniture!", "/static/logo.png", "/store/free"),
            ("Join our Discord", "Join 5,000+ members! Get live updates and participate in giveaways.", "/static/logo.png", "https://discord.gg/hellcore"),
            ("Double XP Weekend", "2x Experience is currently ACTIVE! Level up your battle pass twice as fast.", "/static/logo.png", "/players"),
            ("Vote for Rewards", "Help Hellcore Network grow on server lists and earn 2x Mystery Boxes!", "/static/logo.png", "/forums"),
            ("Spring Sale: 20% OFF", "Spring is here! Use coupon code 'SPRING20' for a massive discount.", "/static/logo.png", "/store"),
            ("Guild Tournament", "The weekly Guild Wars have begun! Top guilds win sharing chests of Gold.", "/static/logo.png", "/players"),
            ("Mystery Nexus Boost", "Nexus rates are BOOSTED! Watch ads for a higher chance of Legendary loot.", "/static/logo.png", "/store/free")
        ]
        for title, desc, img, link in evs:
            curr.execute(f"INSERT INTO hc_events (title, description, image_url, link_url, created_at) VALUES ({phs(5)})", 
                        (title, desc, img, link, datetime.now()))
        print("[OK] Purged and Re-boostrapped 7 events.")

    bootstrap_events(c)
    db.commit(); c.close(); db.close()
    print(f"[OK] Tables ready ({_DB_MODE})")

# ═══════════════════════════════════════════════════════
# AUTH HELPERS
# ═══════════════════════════════════════════════════════
STAFF_ROLES = ("helper","mod","dev","admin","owner","founder","youtube","famous")
ADMIN_ROLES = ("helper","mod","dev","admin","owner","founder")
SUPER_ADMIN_ROLES = ("admin","owner","founder","dev")

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
        u = get_user_by_token(request.headers.get("X-Auth-Token",""))
        if not u: return jsonify({"error":"Authentication failed. Please login again."}), 401
        request.cu = u; return f(*a, **k)
    return w

def staff_required(f):
    @wraps(f)
    def w(*a, **k):
        u = get_user_by_token(request.headers.get("X-Auth-Token",""))
        if not u: return jsonify({"error":"Staff access required"}), 401
        if u["role"] not in STAFF_ROLES: return jsonify({"error":"Staff required"}), 403
        request.cu = u; return f(*a, **k)
    return w

def admin_required(f):
    @wraps(f)
    def w(*a, **k):
        u = get_user_by_token(request.headers.get("X-Auth-Token",""))
        if not u: return jsonify({"error":"Admin access required"}), 401
        if u["role"] not in ADMIN_ROLES: return jsonify({"error":"Admin required"}), 403
        request.cu = u; return f(*a, **k)
    return w

def log_audit(admin_id, action, target_id=None, details=""):
    try:
        db = get_db(); c = db_cursor(db)
        c.execute(f"INSERT INTO hc_audit_logs(admin_id, action, target_id, details) VALUES({phs(4)})",
                  (admin_id, action, target_id, details))
        db.commit(); c.close(); db.close()
    except: traceback.print_exc()

# ═══════════════════════════════════════════════════════
# CORS
# ═══════════════════════════════════════════════════════
@app.after_request
def cors(r):
    r.headers["Access-Control-Allow-Origin"]  = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type,X-Auth-Token"
    r.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    return r

@app.route("/api/<path:p>", methods=["OPTIONS"])
def opts(p): return jsonify({}), 200

# ═══════════════════════════════════════════════════════
# FRONTEND
# ═══════════════════════════════════════════════════════
# Serves index.html for the root path
@app.route("/")
def index(): return render_template("index.html")

@app.route("/static/<path:f>")
def static_f(f): return send_from_directory("static", f)

# ═══════════════════════════════════════════════════════
# PROXY HELPERS — ALL external API calls go here
# Browser never touches Mojang/mc-heads directly → no CORS
# ═══════════════════════════════════════════════════════
def fetch_url(url, binary=False, timeout=8):
    req = urllib.request.Request(url, headers={
        "User-Agent": "HellcoreWebsite/7.0 (+mc.hellcore.in)"
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read() if binary else json.loads(r.read())

# ── Mojang UUID (for 3D skin viewer)
@app.route("/api/mc/uuid/<username>")
def mc_uuid(username):
    try:
        return jsonify(fetch_url(f"https://api.mojang.com/users/profiles/minecraft/{username}"))
    except urllib.error.HTTPError as e:
        return jsonify({"error":"Player not found" if e.code==404 else "Mojang error"}), e.code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Skin texture (for skinview3d) — tries mc-heads.net first, then Mojang session
@app.route("/api/skin/texture/<identifier>")
def skin_texture(identifier):
    """Returns raw PNG skin texture. identifier = UUID or username."""
    # Try mc-heads.net skin
    for url in [
        f"https://mc-heads.net/skin/{identifier}",
        f"https://minotar.net/skin/{identifier}",
    ]:
        try:
            data = fetch_url(url, binary=True)
            return Response(data, mimetype="image/png",
                headers={"Cache-Control": "public, max-age=300"})
        except: pass
    # Fallback: Steve skin (built into mc-heads)
    try:
        data = fetch_url("https://mc-heads.net/skin/Steve", binary=True)
        return Response(data, mimetype="image/png")
    except:
        return Response(b"", status=404)

# ── Cape texture — tries mc-heads, fallback 404
@app.route("/api/skin/cape/<identifier>")
def skin_cape(identifier):
    for url in [
        f"https://mc-heads.net/cape/{identifier}",
    ]:
        try:
            data = fetch_url(url, binary=True)
            return Response(data, mimetype="image/png",
                headers={"Cache-Control": "public, max-age=300"})
        except: pass
    return Response(b"", status=404)

# ── Head avatar image proxy (replaces crafatar heads)
@app.route("/api/skin/head/<identifier>")
@app.route("/api/skin/head/<identifier>/<int:size>")
def skin_head(identifier, size=64):
    for url in [
        f"https://mc-heads.net/avatar/{identifier}/{size}",
        f"https://minotar.net/avatar/{identifier}/{size}",
    ]:
        try:
            data = fetch_url(url, binary=True)
            return Response(data, mimetype="image/png",
                headers={"Cache-Control": "public, max-age=300"})
        except: pass
    return Response(b"", status=404)


@app.route("/api/serverstatus/history")
def srv_history():
    try:
        db = get_db(); c = db_cursor(db)
        # Fetch last 24 hours of player counts (limited to ~96 points if 15m intervals)
        c.execute("SELECT timestamp, total_players FROM hc_player_history ORDER BY timestamp DESC LIMIT 96")
        rows = to_list(c.fetchall())
        c.close(); db.close()
        rows.reverse()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)})

# ═══════════════════════════════════════════════════════
# AUTH ROUTES
# ═══════════════════════════════════════════════════════
@app.route("/api/auth/register", methods=["POST"])
def register():
    try:
        d   = request.get_json(force=True) or {}
        em  = str(d.get("email","")).strip().lower()
        us  = str(d.get("username","")).strip()
        mc  = str(d.get("mc_username","")).strip()
        pw  = str(d.get("password",""))
        pw2 = str(d.get("confirm_password",""))

        if not em or not us or not pw:
            return jsonify({"error":"Email, username and password required"}), 400
        if "@" not in em or "." not in em:
            return jsonify({"error":"Enter a valid email address"}), 400
        if len(us) < 3 or len(us) > 20:
            return jsonify({"error":"Username must be 3–20 characters"}), 400
        if len(pw) < 6:
            return jsonify({"error":"Password must be at least 6 characters"}), 400
        if pw != pw2:
            return jsonify({"error":"Passwords do not match"}), 400

        db = get_db(); c = db_cursor(db)
        c.execute(f"SELECT id FROM hc_users WHERE email={ph()} OR username={ph()}", (em, us))
        if c.fetchone():
            db.close(); return jsonify({"error":"Email or username already taken"}), 409

        tok = secrets.token_hex(32)
        c.execute(
            f"INSERT INTO hc_users(email,username,mc_username,password_hash,session_token) VALUES({phs(5)})",
            (em, us, mc, hp(pw), tok)
        )
        uid = c.lastrowid

        # Create economy row
        if _DB_MODE == "sqlite":
            c.execute("INSERT OR IGNORE INTO hc_economy(user_id) VALUES(?)", (uid,))
        else:
            c.execute("INSERT INTO hc_economy(user_id) VALUES(%s) ON DUPLICATE KEY UPDATE user_id=user_id", (uid,))

        db.commit(); c.close(); db.close()
        return jsonify({"token":tok,"id":uid,"username":us,"email":em,"mc_username":mc,"role":"player"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error":f"Server error: {e}"}), 500

@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        d   = request.get_json(force=True) or {}
        idf = str(d.get("identifier","")).strip()
        pw  = str(d.get("password",""))

        db = get_db(); c = db_cursor(db)
        c.execute(
            f"SELECT * FROM hc_users WHERE (email={ph()} OR username={ph()}) AND password_hash={ph()}",
            (idf, idf, hp(pw))
        )
        row = to_dict(c.fetchone())
        if not row:
            db.close(); return jsonify({"error":"Wrong email/username or password"}), 401

        tok = secrets.token_hex(32)
        c.execute(f"UPDATE hc_users SET session_token={ph()} WHERE id={ph()}", (tok, row["id"]))
        db.commit(); c.close(); db.close()
        return jsonify({"token":tok,"id":row["id"],"username":row["username"],
                        "email":row["email"],"mc_username":row["mc_username"] or "","role":row["role"]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error":f"Server error: {e}"}), 500

@app.route("/api/auth/logout", methods=["POST"])
@auth_required
def logout():
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_users SET session_token=NULL WHERE id={ph()}", (request.cu["id"],))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/auth/me")
@auth_required
def auth_me():
    u = request.cu
    return jsonify({"id":u["id"],"username":u["username"],"email":u["email"],
                    "mc_username":u["mc_username"] or "","role":u["role"]})

# ═══════════════════════════════════════════════════════
# FORUMS
# ═══════════════════════════════════════════════════════

@app.route("/api/forums/meta")
def forums_meta():
    db = get_db(); c = db_cursor(db)
    # Get thread and reply counts per category
    c.execute("SELECT category, COUNT(*) as thread_count FROM hc_forums GROUP BY category")
    t_counts = {r["category"]: r["thread_count"] for r in to_list(c.fetchall())}
    
    c.execute("SELECT f.category, COUNT(r.id) as reply_count FROM hc_forums f "
              "LEFT JOIN hc_replies r ON r.forum_id = f.id GROUP BY f.category")
    r_counts = {r["category"]: r["reply_count"] for r in to_list(c.fetchall())}

    # Get latest post per category
    c.execute("SELECT f.id, f.title, f.category, f.created_at, u.username as author_name "
              "FROM hc_forums f JOIN hc_users u ON f.author_id = u.id "
              "WHERE (f.category, f.created_at) IN (SELECT category, MAX(created_at) FROM hc_forums GROUP BY category)")
    latest = {r["category"]: r for r in to_list(c.fetchall())}
    for k in latest: latest[k]["created_at"] = ts(latest[k]["created_at"])

    db.close()
    return jsonify({"counts": t_counts, "replies": r_counts, "latest": latest})

@app.route("/api/forums/widgets")
def forums_widgets():
    db = get_db(); c = db_cursor(db)
    # Latest 5
    c.execute("SELECT f.*, u.username author_name FROM hc_forums f JOIN hc_users u ON f.author_id=u.id ORDER BY f.created_at DESC LIMIT 5")
    latest = to_list(c.fetchall())
    for r in latest: r["created_at"] = ts(r["created_at"])
    
    # Trending 5 (by replies)
    c.execute("SELECT f.*, u.username author_name, (SELECT COUNT(*) FROM hc_replies r WHERE r.forum_id=f.id) rc "
              "FROM hc_forums f JOIN hc_users u ON f.author_id=u.id ORDER BY rc DESC LIMIT 5")
    trending = to_list(c.fetchall())
    for r in trending: r["created_at"] = ts(r["created_at"])
    
    db.close()
    return jsonify({"latest": latest, "trending": trending})

@app.route("/api/admin/thread_control", methods=["POST"])
@admin_required
def admin_thread_control():
    d = request.get_json(force=True) or {}
    fid = d.get("fid")
    action = d.get("action") # 'pin', 'unpin', 'lock', 'unlock'
    if not fid or not action: return jsonify({"error":"Missing params"}), 400
    
    db = get_db(); c = db_cursor(db)
    if action == 'pin': c.execute(f"UPDATE hc_forums SET is_pinned=1 WHERE id={ph()}", (fid,))
    elif action == 'unpin': c.execute(f"UPDATE hc_forums SET is_pinned=0 WHERE id={ph()}", (fid,))
    elif action == 'lock': c.execute(f"UPDATE hc_forums SET is_locked=1 WHERE id={ph()}", (fid,))
    elif action == 'unlock': c.execute(f"UPDATE hc_forums SET is_locked=0 WHERE id={ph()}", (fid,))
    
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/upload", methods=["POST"])
@admin_required
def admin_upload():
    if 'file' not in request.files: return jsonify({"error":"No file"}), 400
    f = request.files['file']
    if f.filename == '': return jsonify({"error":"No selected file"}), 400
    
    # Ensure uploads dir exists
    up_dir = os.path.join(app.root_path, 'static', 'uploads')
    if not os.path.exists(up_dir): os.makedirs(up_dir)
    
    fname = f"{uuid.uuid4().hex}_{f.filename}"
    f.save(os.path.join(up_dir, fname))
    return jsonify({"url": f"/static/uploads/{fname}"})

@app.route("/api/forums")
def forums_list():
    cat = request.args.get("cat","")
    db = get_db(); c = db_cursor(db)
    base = ("SELECT f.*, u.username author_name, u.role author_role, "
            f"(SELECT COUNT(*) FROM hc_replies r WHERE r.forum_id=f.id) reply_count "
            "FROM hc_forums f JOIN hc_users u ON f.author_id=u.id")
    order = "ORDER BY f.is_pinned DESC, f.created_at DESC"
    if cat:
        c.execute(base + f" WHERE f.category={ph()} " + order, (cat,))
    else:
        c.execute(base + " " + order)
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows: r["created_at"] = ts(r["created_at"])
    return jsonify(rows)

@app.route("/api/forums/<int:fid>")
def forum_get(fid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_forums SET views=views+1 WHERE id={ph()}", (fid,))
    c.execute(f"SELECT f.*, u.username author_name, u.role author_role "
              f"FROM hc_forums f JOIN hc_users u ON f.author_id=u.id WHERE f.id={ph()}", (fid,))
    forum = to_dict(c.fetchone())
    if not forum: db.close(); return jsonify({"error":"Not found"}), 404
    forum["created_at"] = ts(forum["created_at"])
    c.execute(f"SELECT r.*, u.username author_name, u.role author_role "
              f"FROM hc_replies r JOIN hc_users u ON r.author_id=u.id "
              f"WHERE r.forum_id={ph()} ORDER BY r.created_at ASC", (fid,))
    replies = to_list(c.fetchall())
    for r in replies: r["created_at"] = ts(r["created_at"])
    db.commit(); c.close(); db.close()
    return jsonify({"forum":forum,"replies":replies})

@app.route("/api/forums", methods=["POST"])
@auth_required
def forum_create():
    d = request.get_json(force=True) or {}
    if not d.get("title") or not d.get("content"):
        return jsonify({"error":"Title and content required"}), 400
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_forums(title,content,author_id,category) VALUES({phs(4)})",
              (d["title"], d["content"], request.cu["id"], d.get("category","general")))
    db.commit(); fid = c.lastrowid; c.close(); db.close()
    return jsonify({"id":fid,"ok":True})

@app.route("/api/forums/<int:fid>", methods=["DELETE"])
@auth_required
def forum_del(fid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_forums WHERE id={ph()}", (fid,))
    f = to_dict(c.fetchone())
    if not f: db.close(); return jsonify({"error":"Not found"}), 404
    u = request.cu
    if f["author_id"] != u["id"] and u["role"] not in ADMIN_ROLES:
        db.close(); return jsonify({"error":"Forbidden"}), 403
    c.execute(f"DELETE FROM hc_replies WHERE forum_id={ph()}", (fid,))
    c.execute(f"DELETE FROM hc_forums  WHERE id={ph()}", (fid,))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/forums/<int:fid>/replies", methods=["POST"])
@auth_required
def reply_add(fid):
    d = request.get_json(force=True) or {}
    if not d.get("content"): return jsonify({"error":"Content required"}), 400
    db = get_db(); c = db_cursor(db)
    
    # Check if locked
    c.execute(f"SELECT is_locked FROM hc_forums WHERE id={ph()}", (fid,))
    f = c.fetchone()
    if f and f[0] and request.cu["role"] not in STAFF_ROLES:
        db.close(); return jsonify({"error":"This thread is locked (Private)."}), 403
    c.execute(f"INSERT INTO hc_replies(forum_id,author_id,content) VALUES({phs(3)})",
              (fid, request.cu["id"], d["content"]))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/forums/replies/<int:rid>", methods=["DELETE"])
@auth_required
def reply_del(rid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_replies WHERE id={ph()}", (rid,))
    r = to_dict(c.fetchone())
    if not r: db.close(); return jsonify({"error":"Not found"}), 404
    u = request.cu
    if r["author_id"] != u["id"] and u["role"] not in ADMIN_ROLES:
        db.close(); return jsonify({"error":"Forbidden"}), 403
    c.execute(f"DELETE FROM hc_replies WHERE id={ph()}", (rid,))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# TICKETS
# ═══════════════════════════════════════════════════════
@app.route("/api/tickets")
@auth_required
def tickets_list():
    u = request.cu; db = get_db(); c = db_cursor(db)
    if u["role"] in STAFF_ROLES:
        c.execute("SELECT t.*, u.username author_name FROM hc_tickets t "
                  "JOIN hc_users u ON t.author_id=u.id ORDER BY t.created_at DESC")
    else:
        c.execute(f"SELECT t.*, u.username author_name FROM hc_tickets t "
                  f"JOIN hc_users u ON t.author_id=u.id WHERE t.author_id={ph()} ORDER BY t.created_at DESC",
                  (u["id"],))
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows: r["created_at"] = ts(r["created_at"])
    return jsonify(rows)

@app.route("/api/tickets", methods=["POST"])
@auth_required
def ticket_create():
    d = request.get_json(force=True) or {}
    if not d.get("title") or not d.get("description"):
        return jsonify({"error":"All fields required"}), 400
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_tickets(title,description,author_id,category) VALUES({phs(4)})",
              (d["title"], d["description"], request.cu["id"], d.get("category","general")))
    db.commit(); tid = c.lastrowid; c.close(); db.close()
    return jsonify({"id":tid,"ok":True})

@app.route("/api/tickets/<int:tid>")
@auth_required
def ticket_get(tid):
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT t.*, u.username author_name FROM hc_tickets t "
              f"JOIN hc_users u ON t.author_id=u.id WHERE t.id={ph()}", (tid,))
    t = to_dict(c.fetchone())
    if not t: db.close(); return jsonify({"error":"Not found"}), 404
    if t["author_id"] != u["id"] and u["role"] not in STAFF_ROLES:
        db.close(); return jsonify({"error":"Forbidden"}), 403
    t["created_at"] = ts(t["created_at"])
    c.execute(f"SELECT m.*, u.username author_name, u.role author_role FROM hc_ticket_msgs m "
              f"JOIN hc_users u ON m.author_id=u.id WHERE m.ticket_id={ph()} ORDER BY m.created_at ASC", (tid,))
    msgs = to_list(c.fetchall())
    for m in msgs: m["created_at"] = ts(m["created_at"])
    c.close(); db.close()
    return jsonify({"ticket":t,"messages":msgs})

@app.route("/api/tickets/<int:tid>/msg", methods=["POST"])
@auth_required
def ticket_msg(tid):
    d = request.get_json(force=True) or {}
    if not d.get("content"): return jsonify({"error":"Content required"}), 400
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,)); t = to_dict(c.fetchone())
    if not t: db.close(); return jsonify({"error":"Not found"}), 404
    if t["author_id"] != u["id"] and u["role"] not in STAFF_ROLES:
        db.close(); return jsonify({"error":"Forbidden"}), 403
    c.execute(f"INSERT INTO hc_ticket_msgs(ticket_id,author_id,content) VALUES({phs(3)})",
              (tid, u["id"], d["content"]))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/tickets/<int:tid>/close", methods=["POST"])
@auth_required
def ticket_close(tid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_tickets SET status='closed' WHERE id={ph()}", (tid,))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/tickets/<int:tid>", methods=["DELETE"])
@auth_required
def ticket_del(tid):
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,)); t = to_dict(c.fetchone())
    if not t: db.close(); return jsonify({"error":"Not found"}), 404
    if t["author_id"] != u["id"] and u["role"] not in ADMIN_ROLES:
        db.close(); return jsonify({"error":"Forbidden"}), 403
    c.execute(f"DELETE FROM hc_ticket_msgs WHERE ticket_id={ph()}", (tid,))
    c.execute(f"DELETE FROM hc_tickets WHERE id={ph()}", (tid,))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# CART
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
    return jsonify({"ok":True})

@app.route("/api/cart/<int:cid>", methods=["DELETE"])
@auth_required
def cart_rem(cid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_cart WHERE id={ph()} AND user_id={ph()}", (cid, request.cu["id"]))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/cart/clear", methods=["DELETE"])
@auth_required
def cart_clear():
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# INVENTORY & GIFTS
# ═══════════════════════════════════════════════════════
@app.route("/api/inventory")
@auth_required
def inventory():
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_inventory WHERE user_id={ph()} ORDER BY created_at DESC", (request.cu["id"],))
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows: r["created_at"] = ts(r["created_at"])
    return jsonify(rows)

@app.route("/api/gifts/send", methods=["POST"])
@auth_required
def gift_send():
    d = request.get_json(force=True) or {}
    to_nm = str(d.get("to_username","")).strip()
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_users WHERE username={ph()}", (to_nm,))
    if not c.fetchone(): db.close(); return jsonify({"error":"Player not found"}), 404
    c.execute(f"INSERT INTO hc_gifts(from_user_id,to_username,item_type,item_name,gamemode) VALUES({phs(5)})",
              (request.cu["id"], to_nm, d.get("item_type","rank"), d["item_name"], d.get("gamemode","")))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/gifts/pending")
@auth_required
def gifts_pending():
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT g.*, u.username from_name FROM hc_gifts g "
              f"JOIN hc_users u ON g.from_user_id=u.id "
              f"WHERE g.to_username={ph()} AND g.status='pending'", (request.cu["username"],))
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows: r["created_at"] = ts(r.get("created_at",""))
    return jsonify(rows)

@app.route("/api/gifts/<int:gid>/claim", methods=["POST"])
@auth_required
def gift_claim(gid):
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_gifts WHERE id={ph()} AND to_username={ph()} AND status='pending'",
              (gid, u["username"]))
    g = to_dict(c.fetchone())
    if not g: db.close(); return jsonify({"error":"Gift not found"}), 404
    c.execute(f"INSERT INTO hc_inventory(user_id,item_type,item_name,gamemode,gifted_by) VALUES({phs(5)})",
              (u["id"], g["item_type"], g["item_name"], g["gamemode"], g["from_user_id"]))
    c.execute(f"UPDATE hc_gifts SET status='claimed' WHERE id={ph()}", (gid,))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# PLAYER STATS & LEADERBOARD
# ═══════════════════════════════════════════════════════
@app.route("/api/player/<username>")
def player_get(username):
    db = get_db(); c = db_cursor(db)
    # Find user by username or MC username
    c.execute(f"SELECT * FROM hc_users WHERE username={ph()} OR mc_username={ph()}", (username, username))
    u = to_dict(c.fetchone())
    if not u: db.close(); return jsonify({"error":"Player not found"}), 404

    # Fetch all stats, ranks, economy
    c.execute(f"SELECT * FROM hc_stats    WHERE user_id={ph()}", (u["id"],)); stats = to_list(c.fetchall())
    c.execute(f"SELECT * FROM hc_ranks    WHERE user_id={ph()}", (u["id"],)); ranks = to_list(c.fetchall())
    c.execute(f"SELECT * FROM hc_economy  WHERE user_id={ph()}", (u["id"],)); eco = to_dict(c.fetchone())
    c.close(); db.close()
    return jsonify({
        "user":    {"username":u["username"],"role":u["role"],"mc_username":u["mc_username"] or ""},
        "stats":   {s["gamemode"]:s for s in stats},
        "ranks":   {r["gamemode"]:r["rank_name"] for r in ranks},
        "economy": eco or {"server_gold":0,"server_iron":0}
    })

@app.route("/api/serverstatus")
def server_status():
    db = get_db(); c = db_cursor(db)
    # Composite status query using DB-relative timestamps
    sql = """
        SELECT *, (TIMESTAMPDIFF(SECOND, last_updated, NOW())) as diff 
        FROM hc_server_metrics
    """
    if _DB_MODE == "sqlite":
        sql = "SELECT *, (strftime('%s','now') - strftime('%s', last_updated)) as diff FROM hc_server_metrics"
        
    c.execute(sql)
    rows = to_list(c.fetchall())
    db.close()

    net = next((r for r in rows if r["server_name"] == 'NETWORK'), None)
    bw = next((r for r in rows if r["server_name"] == 'BEDWARS'), None)
    sw = next((r for r in rows if r["server_name"] == 'SKYWARS'), None)

    # Online if heartbeat within 45 seconds
    is_online = net and net.get("diff", 999) < 45

    return jsonify({
        "online": is_online,
        "players": { "online": net["online_players"] if net else 0, "max": net["max_players"] if net else 200 },
        "ip": net.get("server_ip", "hellcore.in") if net else "hellcore.in",
        "modes": {
            "bedwars": {
                "players": bw["online_players"] if bw else 0,
                "online": bw and bw.get("diff", 999) < 60
            },
            "skywars": {
                "players": sw["online_players"] if sw else 0,
                "online": sw and sw.get("diff", 999) < 60
            }
        }
    })

@app.route("/api/stats")
def stats_leaderboard():
    mode = request.args.get("mode", "global")
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT u.username, u.mc_username, s.wins, s.kills, s.coins "
              f"FROM hc_stats s JOIN hc_users u ON s.user_id=u.id "
              f"WHERE s.gamemode={ph()} ORDER BY s.wins DESC LIMIT 10", (mode,))
    rows = to_list(c.fetchall()); c.close(); db.close()
    return jsonify(rows)

# ═══════════════════════════════════════════════════════
# STATS & LEADERBOARD
# ═══════════════════════════════════════════════════════

# ── External BedWars API Proxy (Tracklify-style stats)
BW_API_BASE = os.environ.get("BW_API_BASE", "")
BW_API_KEY  = os.environ.get("BW_API_KEY", "")

@app.route("/api/bwstats/<username>")
def bw_stats_proxy(username):
    """Proxy to the external BedWars stats API."""
    try:
        url = f"{BW_API_BASE}/player/{username}?apikey={BW_API_KEY}"
        data = fetch_url(url)
        return jsonify(data)
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except:
            body = {"error": f"API error {e.code}"}
        return jsonify(body), e.code
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/stats/<username>")
def stats_get(username):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_users WHERE username={ph()}", (username,))
    u = to_dict(c.fetchone())
    if not u: db.close(); return jsonify({"error":"Player not found"}), 404
    c.execute(f"SELECT * FROM hc_stats    WHERE user_id={ph()}", (u["id"],)); stats = to_list(c.fetchall())
    c.execute(f"SELECT * FROM hc_ranks    WHERE user_id={ph()}", (u["id"],)); ranks = to_list(c.fetchall())
    c.execute(f"SELECT * FROM hc_economy  WHERE user_id={ph()}", (u["id"],)); eco = to_dict(c.fetchone())
    c.close(); db.close()
    return jsonify({
        "user":    {"username":u["username"],"role":u["role"],"mc_username":u["mc_username"] or ""},
        "stats":   {s["gamemode"]:s for s in stats},
        "ranks":   {r["gamemode"]:r["rank_name"] for r in ranks},
        "economy": eco or {"server_gold":0,"server_iron":0}
    })

@app.route("/api/lb/<gamemode>")
def lb_get(gamemode):
    stat = request.args.get("stat","wins")
    db = get_db(); c = db_cursor(db)
    
    if gamemode == "bedwars":
        # BedWars1058 Database Integration
        if stat not in ("kills","deaths","final_kills","final_deaths","wins","losses","beds_destroyed"): stat = "wins"
        try:
            c.execute(
                f"SELECT s.name as username, s.name as mc_username, r.rank_name, "
                f"s.kills, s.deaths, s.wins, s.losses, 0 as coins, "
                f"s.final_kills, s.beds_destroyed "
                f"FROM bw1058_stats s "
                f"LEFT JOIN hc_users u ON s.uuid = u.uuid OR s.name = u.mc_username "
                f"LEFT JOIN hc_ranks r ON r.user_id=u.id AND r.gamemode='bedwars' "
                f"ORDER BY s.{stat} DESC LIMIT 50"
            )
            rows = to_list(c.fetchall())
            # Inject flag so frontend knows to render bedwars specific table
            for row in rows:
                row["is_bw1058"] = True
            c.close(); db.close()
            return jsonify(rows)
        except Exception as e:
            # Table doesn't exist yet, fallback to default hc_stats
            pass

    # Default fallback for other gamemodes (or if bw1058 missing)
    if stat not in ("kills","deaths","wins","losses","coins"): stat = "wins"
    c.execute(
        f"SELECT u.username, u.mc_username, r.rank_name, "
        f"s.kills, s.deaths, s.wins, s.losses, s.coins "
        f"FROM hc_stats s JOIN hc_users u ON s.user_id=u.id "
        f"LEFT JOIN hc_ranks r ON r.user_id=u.id AND r.gamemode={ph()} "
        f"WHERE s.gamemode={ph()} ORDER BY s.{stat} DESC LIMIT 50",
        (gamemode, gamemode)
    )
    rows = to_list(c.fetchall()); c.close(); db.close()
    return jsonify(rows)

@app.route("/api/staff")
def staff_list():
    db = get_db(); c = db_cursor(db)
    c.execute("SELECT username, mc_username, role FROM hc_users "
              "WHERE role IN ('helper','mod','dev','admin','owner','founder','youtube','famous')")
    rows = to_list(c.fetchall()); c.close(); db.close()
    return jsonify(rows)

# ═══════════════════════════════════════════════════════
# ADMIN
# ═══════════════════════════════════════════════════════
@app.route("/api/admin/users")
@admin_required
def admin_users():
    db = get_db(); c = db_cursor(db)
    c.execute("SELECT id,email,username,mc_username,role,created_at FROM hc_users ORDER BY created_at DESC")
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows: r["created_at"] = ts(r["created_at"])
    return jsonify(rows)

@app.route("/api/admin/users/<int:uid>/role", methods=["POST"])
@admin_required
def admin_role(uid):
    if request.cu["role"] not in SUPER_ADMIN_ROLES:
        return jsonify({"error":"Super Admin access required for role changes"}), 403
    d = request.get_json(force=True) or {}
    role = d.get("role","player")
    if role not in ("player","helper","mod","dev","admin","owner","founder","youtube","famous"):
        return jsonify({"error":"Invalid role"}), 400
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_users SET role={ph()} WHERE id={ph()}", (role, uid))
    log_audit(request.cu["id"], "UPDATE_ROLE", uid, f"Role set to {role}")
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/admin/setstats", methods=["POST"])
@admin_required
def admin_setstats():
    if request.cu["role"] not in SUPER_ADMIN_ROLES:
        return jsonify({"error":"Super Admin access required for stat editing"}), 403
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_users WHERE username={ph()}", (d["username"],))
    u = to_dict(c.fetchone())
    if not u: db.close(); return jsonify({"error":"User not found"}), 404
    upsert(c, "hc_stats",
        {"user_id":u["id"],"gamemode":d["gamemode"],"kills":d.get("kills",0),
         "deaths":d.get("deaths",0),"wins":d.get("wins",0),"losses":d.get("losses",0),"coins":d.get("coins",0)},
        {"user_id","gamemode"})
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/admin/setrank", methods=["POST"])
@admin_required
def admin_setrank():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_users WHERE username={ph()}", (d["username"],))
    u = to_dict(c.fetchone())
    if not u: db.close(); return jsonify({"error":"User not found"}), 404
    upsert(c, "hc_ranks", {"user_id":u["id"],"gamemode":d["gamemode"],"rank_name":d["rank"]}, {"user_id","gamemode"})
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/admin/seteco", methods=["POST"])
@admin_required
def admin_seteco():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_users WHERE username={ph()}", (d["username"],))
    u = to_dict(c.fetchone())
    if not u: db.close(); return jsonify({"error":"User not found"}), 404
    upsert(c, "hc_economy", {"user_id":u["id"],"server_gold":d.get("gold",0),"server_iron":d.get("iron",0)}, {"user_id"})
    db.commit(); c.close(); db.close()
@app.route("/api/admin/users/<int:uid>", methods=["DELETE"])
@admin_required
def admin_delete_user(uid):
    if request.cu["role"] not in SUPER_ADMIN_ROLES:
        return jsonify({"error":"Super Admin access required for account deletion"}), 403
    db = get_db(); c = db_cursor(db)
    # Cascading deletion across all tables referencing user_id
    tables = ["hc_stats", "hc_economy", "hc_inventory", "hc_cart", "hc_ads", "hc_ranks", "hc_gifts"]
    for t in tables:
        c.execute(f"DELETE FROM {t} WHERE user_id={ph()}", (uid,))
    # Delete forums/replies
    c.execute(f"DELETE FROM hc_replies WHERE author_id={ph()}", (uid,))
    c.execute(f"DELETE FROM hc_forums WHERE author_id={ph()}", (uid,))
    # Finally delete user
    c.execute(f"DELETE FROM hc_users WHERE id={ph()}", (uid,))
    log_audit(request.cu["id"], "DELETE_USER", uid, "Obliterated user account")
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/events")
def events_list():
    db = get_db(); c = db_cursor(db)
    # Fetch latest 3 events that haven't expired
    c.execute("SELECT * FROM hc_events WHERE expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL ORDER BY created_at DESC LIMIT 3")
    rows = to_list(c.fetchall()); c.close(); db.close()
    return jsonify(rows)

@app.route("/api/admin/events", methods=["POST"])
@admin_required
def admin_event_create():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_events(title,description,image_url,expires_at) VALUES({phs(4)})",
              (d["title"], d["description"], d.get("image_url",""), d.get("expires_at")))
    db.commit(); eid = c.lastrowid; c.close(); db.close()
    return jsonify({"id":eid,"ok":True})

@app.route("/api/admin/events/<int:eid>", methods=["DELETE"])
@admin_required
def admin_event_delete(eid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_events WHERE id={ph()}", (eid,))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/admin/overview")
@admin_required
def admin_overview():
    db = get_db(); c = db_cursor(db)
    # Get total users
    c.execute("SELECT COUNT(*) as cnt FROM hc_users")
    total_users = c.fetchone()["cnt"]
    # Get pending commands
    c.execute("SELECT COUNT(*) as cnt FROM hc_command_queue WHERE status='pending'")
    pending = c.fetchone()["cnt"]
    # Get staff count
    c.execute(f"SELECT COUNT(*) as cnt FROM hc_users WHERE role IN {str(STAFF_ROLES)}")
    staff_count = c.fetchone()["cnt"]
    # Get recent logs (Audit Logs)
    c.execute("SELECT l.*, u.username admin_name FROM hc_audit_logs l JOIN hc_users u ON l.admin_id = u.id ORDER BY l.created_at DESC LIMIT 15")
    logs = to_list(c.fetchall())
    for l in logs:
        l["created_at"] = ts(l["created_at"])
    c.close(); db.close()
    return jsonify({
        "status":"ONLINE",
        "pending":pending,
        "total_users":total_users,
        "staff_count":staff_count,
        "logs":logs
    })

@app.route("/api/admin/staff")
@admin_required
def admin_staff():
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id,username,email,mc_username,role,created_at FROM hc_users WHERE role IN {str(STAFF_ROLES)} ORDER BY role DESC")
    rows = to_list(c.fetchall()); c.close(); db.close()
    for r in rows: r["created_at"] = ts(r["created_at"])
    return jsonify(rows)

@app.route("/api/admin/announcement", methods=["GET", "POST"])
@admin_required
def admin_announcement():
    db = get_db(); c = db_cursor(db)
    if request.method == "POST":
        d = request.get_json(force=True) or {}
        msg = d.get("message", "")
        # Store in server_metrics as a global key
        upsert(c, "hc_server_metrics", {"server_name":"GLOBAL_BANNER", "online_players":0, "max_players":0, "server_ip":msg}, {"server_name"})
        log_audit(request.cu["id"], "SET_BANNER", None, msg)
        db.commit(); c.close(); db.close()
        return jsonify({"ok":True})
    else:
        c.execute("SELECT server_ip FROM hc_server_metrics WHERE server_name='GLOBAL_BANNER'")
        row = to_dict(c.fetchone())
        msg = row.get("server_ip", "") if row else ""
        c.close(); db.close()
        return jsonify({"message":msg})

@app.route("/api/admin/commands/queue", methods=["POST"])
@admin_required
def admin_command_queue():
    d = request.get_json(force=True) or {}
    cmd = d.get("command")
    if not cmd: return jsonify({"error":"No command"}), 400
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_command_queue(command) VALUES({ph()})", (cmd,))
    db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

@app.route("/api/tebex/webhook", methods=["POST"])
def tebex():
    d = request.get_json(force=True) or {}
    if d.get("type") == "payment.completed":
        uname = d.get("player",{}).get("username","")
        if uname:
            db = get_db(); c = db_cursor(db)
            c.execute(f"SELECT * FROM hc_users WHERE mc_username={ph()} OR username={ph()}", (uname,uname))
            u = to_dict(c.fetchone())
            if u:
                for pkg in d.get("packages",[]):
                    c.execute(f"INSERT INTO hc_inventory(user_id,item_type,item_name,gamemode) VALUES({phs(4)})",
                              (u["id"],"rank",pkg.get("name",""),pkg.get("category","global")))
            db.commit(); c.close(); db.close()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# ADS & REWARDS
# ═══════════════════════════════════════════════════════
import datetime as dt

@app.route("/api/ads/status")
@auth_required
def ads_status():
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_ads WHERE user_id={ph()}", (u["id"],))
    ad = to_dict(c.fetchone())
    if not ad:
        if _DB_MODE == "sqlite":
            c.execute("INSERT INTO hc_ads(user_id) VALUES(?)", (u["id"],))
        else:
            c.execute("INSERT INTO hc_ads(user_id) VALUES(%s)", (u["id"],))
        db.commit()
        c.execute(f"SELECT * FROM hc_ads WHERE user_id={ph()}", (u["id"],))
        ad = to_dict(c.fetchone())
    c.close(); db.close()
    today = dt.date.today()
    last = ad["last_ad_date"]
    if last:
        if isinstance(last, str):
            last = dt.datetime.strptime(last, "%Y-%m-%d").date()
        if last != today:
            ad["ads_today"] = 0
    vip_active = bool(ad.get("vip_active", 0))
    vip_expires = ad.get("vip_expires", "")
    if vip_active and vip_expires:
        try:
            if isinstance(vip_expires, str):
                ve = dt.datetime.strptime(vip_expires, "%Y-%m-%d %H:%M:%S")
            else:
                ve = vip_expires
            if ve < dt.datetime.now():
                vip_active = False
        except:
            pass
    return jsonify({
        "ad_streak": ad.get("ad_streak", 0),
        "ads_today": ad.get("ads_today", 0),
        "vip_active": vip_active,
        "vip_expires": vip_expires if isinstance(vip_expires, str) else ""
    })

@app.route("/api/ads/watch", methods=["POST"])
@auth_required
def ads_watch():
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_ads WHERE user_id={ph()}", (u["id"],))
    ad = to_dict(c.fetchone())
    if not ad:
        if _DB_MODE == "sqlite":
            c.execute("INSERT INTO hc_ads(user_id) VALUES(?)", (u["id"],))
        else:
            c.execute("INSERT INTO hc_ads(user_id) VALUES(%s)", (u["id"],))
        db.commit()
        c.execute(f"SELECT * FROM hc_ads WHERE user_id={ph()}", (u["id"],))
        ad = to_dict(c.fetchone())
    # ═══════════════════════════════════════════════════════
    # 5-MINUTE COOLDOWN CHECK
    # ═══════════════════════════════════════════════════════
    now = dt.datetime.now()
    last_time = ad.get("last_ad_time")
    if last_time:
        if isinstance(last_time, str):
            try: last_time = dt.datetime.strptime(last_time, "%Y-%m-%d %H:%M:%S")
            except: last_time = None
        if last_time and (now - last_time).total_seconds() < 300: # 5 minutes
            remain = 300 - (now - last_time).total_seconds()
            return jsonify({"error": f"Cooldown! Next crate in {int(remain)} seconds."}), 429

    today = dt.date.today()
    last_date = ad.get("last_ad_date")
    ads_today = ad.get("ads_today", 0)
    ad_streak = ad.get("ad_streak", 0)

    if last_date:
        if isinstance(last_date, str):
            try: last_date = dt.datetime.strptime(last_date, "%Y-%m-%d").date()
            except: last_date = None
        if last_date and last_date != today:
            ads_today = 0
            if (today - last_date).days > 1: ad_streak = 0

    ads_today += 1
    if ads_today == 5: ad_streak += 1 # Streak point on 5th ad

    # ═══════════════════════════════════════════════════════
    # WEIGHTED REWARD ENGINE
    # ═══════════════════════════════════════════════════════
    # Common (65%), Rare (25%), Epic (8%), Legendary (2%)
    roll = random.random() * 100
    rarity = "common"
    if roll < 2: rarity = "legendary"
    elif roll < 10: rarity = "epic"
    elif roll < 35: rarity = "rare"

    reward = {"xp": 0, "coins": 0, "vip_hours": 0}
    label = ""
    icon = ""

    if rarity == "common":
        amt = random.randint(100, 300)
        if random.random() > 0.5:
            reward["coins"] = amt; label = f"{amt} Global Coins"; icon = "ic-cart"
        else:
            reward["xp"] = amt; label = f"{amt} Global XP"; icon = "ic-bolt"
    elif rarity == "rare":
        if random.random() > 0.7:
            reward["vip_hours"] = 1; label = "1H VIP Rank"; icon = "ic-shield"
        else:
            amt = random.randint(500, 1000)
            reward["coins"] = amt; label = f"{amt} Global Coins"; icon = "ic-cart"
    elif rarity == "epic":
        if random.random() > 0.5:
            reward["vip_hours"] = 6; label = "6H VIP Rank"; icon = "ic-shield"
        else:
            reward["coins"] = 2500; label = "2,500 Global Coins"; icon = "ic-cart"
    elif rarity == "legendary":
        if random.random() > 0.5:
            reward["vip_hours"] = 24; label = "24H MVP+ Rank"; icon = "ic-crown"
        else:
            reward["coins"] = 10000; label = "10,000 Global Coins"; icon = "ic-cart"

    last_str = today.strftime("%Y-%m-%d")
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    c.execute(f"UPDATE hc_ads SET ads_today={ph()}, last_ad_date={ph()}, last_ad_time={ph()}, ad_streak={ph()} WHERE user_id={ph()}",
             (ads_today, last_str, now_str, ad_streak, u["id"]))

    c.execute(f"INSERT INTO hc_inventory(user_id,item_type,item_name,gamemode,status) VALUES({phs(5)})",
             (u["id"], "reward", f"Daily Ad Reward #{ads_today}", "global", "claimed"))
    
    # Actually grant stats and rewards
    c.execute(f"UPDATE hc_stats SET coins = coins + {ph()} WHERE user_id={ph()} AND gamemode='global'", (reward["coins"], u["id"]))
    if c.rowcount == 0 and reward["coins"] > 0:
         c.execute(f"INSERT IGNORE INTO hc_stats(user_id, gamemode, coins) VALUES({phs(3)})", (u["id"], "global", reward["coins"]))

    if reward["vip_hours"] > 0 and u["mc_username"]:
        cmd = f"lp user {u['mc_username']} parent addtemp vip {reward['vip_hours']}h"
        c.execute(f"INSERT INTO hc_command_queue(command) VALUES({ph()})", (cmd,))

    db.commit()
    return jsonify({"ok": True, "ads_today": ads_today, "ad_streak": ad_streak, "reward": reward})

@app.route("/api/ads/recent")
def ads_recent():
    try:
        db = get_db(); c = db_cursor(db)
        c.execute("SELECT u.username, i.item_name, i.created_at FROM hc_inventory i "
                  "JOIN hc_users u ON i.user_id = u.id "
                  "WHERE i.item_type='reward' ORDER BY i.created_at DESC LIMIT 5")
        rows = to_list(c.fetchall())
        c.close(); db.close()
        for r in rows: r["created_at"] = ts(r["created_at"])
        return jsonify(rows)
    except Exception as e:
        return jsonify([])

@app.route("/api/ads/streak-rewards")
@auth_required
def ads_streak_rewards():
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT ad_streak FROM hc_ads WHERE user_id={ph()}", (u["id"],))
    row = c.fetchone()
    streak = row["ad_streak"] if row else 0
    c.close(); db.close()
    rewards = []
    if streak >= 7:
        rewards.append({"days": 1, "vip": True, "coins": 0})
    if streak >= 14:
        rewards.append({"days": 2, "vip": True, "coins": 250})
    if streak >= 21:
        rewards.append({"days": 3, "vip": True, "coins": 500})
    if streak >= 30:
        rewards.append({"days": 2, "mvp": True, "coins": 0})
    return jsonify({"streak": streak, "rewards": rewards})

@app.route("/api/health")
def health():
    db_status = "unknown"
    db_err = None
    mysql_diagnostic = None
    
    # Check SQLite status
    try:
        db = get_db(); c = db_cursor(db)
        c.execute("SELECT 1")
        row = c.fetchone()
        db_status = "connected (MySQL)" if _DB_MODE != "sqlite" else "connected (SQLite)"
        db.close()
    except Exception as e:
        db_status = "failed"
        db_err = str(e)
        
    # Attempt Aiven diagnostic connection to pinpoint the issue
    if USE_MYSQL_AIVEN:
        try:
            import mysql.connector
            conn = mysql.connector.connect(
                host=AIVEN_HOST, port=AIVEN_PORT,
                user=AIVEN_USER, password=AIVEN_PASSWORD,
                database=AIVEN_DATABASE, ssl_disabled=False,
                connection_timeout=3
            )
            conn.close()
            mysql_diagnostic = "Success - Aiven is reachable!"
        except Exception as e:
            mysql_diagnostic = f"Aiven Connection Error: {e}"

    return jsonify({
        "status": "ok",
        "backend_version": "7.3",
        "db_mode": _DB_MODE,
        "db_connection": db_status,
        "db_error": db_err,
        "mysql_diagnostic": mysql_diagnostic,
        "pusher": "active" if pusher_client else "inactive"
    })

# ═══════════════════════════════════════════════════════
# STAFF CHAT API
# ═══════════════════════════════════════════════════════
STAFF_WEBHOOK = "https://discord.com/api/webhooks/1495099642671792261/LA6pwnEjA74swShTjPwX5qT5iBh_xHUBh6elQS8RK_OZF7anxO5hsXoIlBUsPSRvPavj"

@app.route("/api/staff/channels", methods=["GET"])
@staff_required
def staff_channels_list():
    db = get_db(); c = db_cursor(db)
    if _DB_MODE == "mysql":
        c.execute("SELECT * FROM hc_staff_channels ORDER BY name ASC")
    else:
        c.execute("SELECT * FROM hc_staff_channels ORDER BY name ASC")
    rows = c.fetchall(); db.close()
    return jsonify([to_dict(r) for r in rows])

@app.route("/api/staff/channels", methods=["POST"])
@staff_required
def staff_channels_create():
    if request.cu["role"] != 'founder': return jsonify({"error":"Only Founder can create channels"}), 403
    data = request.get_json(); name = data.get("name","").strip()
    if not name: return jsonify({"error":"Name required"}), 400
    if not name.startswith("#"): name = "#" + name
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_staff_channels (name, created_by, created_at) VALUES ({ph()},{ph()},{ph()})", (name, request.cu["id"], datetime.now()))
    db.commit(); db.close()
    log_audit(request.cu["id"], "create_staff_channel", details=name)
    return jsonify({"success":True})

@app.route("/api/staff/channels/<int:cid>", methods=["DELETE"])
@staff_required
def staff_channels_delete(cid):
    if request.cu["role"] != 'founder': return jsonify({"error":"Only Founder can delete channels"}), 403
    db = get_db(); c = db_cursor(db)
    # Don't delete staff-hub
    c.execute(f"SELECT name FROM hc_staff_channels WHERE id={ph()}", (cid,))
    row = c.fetchone()
    if not row or row["name"] == "#staff-hub": return jsonify({"error":"Cannot delete protected channel"}), 400
    
    c.execute(f"DELETE FROM hc_staff_channels WHERE id={ph()}", (cid,))
    c.execute(f"DELETE FROM hc_staff_messages WHERE channel_id={ph()}", (cid,))
    db.commit(); db.close()
    log_audit(request.cu["id"], "delete_staff_channel", cid)
    return jsonify({"success":True})

@app.route("/api/staff/channels/<int:cid>/messages", methods=["GET"])
@staff_required
def staff_messages_list(cid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT m.*, u.username, u.role FROM hc_staff_messages m "
              f"JOIN hc_users u ON m.author_id=u.id WHERE m.channel_id={ph()} "
              f"ORDER BY m.created_at DESC LIMIT 50", (cid,))
    rows = c.fetchall(); db.close()
    return jsonify([to_dict(r) for r in reversed(rows)])

@app.route("/api/staff/channels/<int:cid>/messages", methods=["POST"])
@staff_required
def staff_messages_post(cid):
    data = request.get_json(); content = data.get("content","").strip()
    if not content: return jsonify({"error":"Content required"}), 400
    
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_staff_messages (channel_id, author_id, content, created_at) "
              f"VALUES ({ph()},{ph()},{ph()},{ph()})", (cid, request.cu["id"], content, datetime.now()))
    
    # Get channel name for discord
    c.execute(f"SELECT name FROM hc_staff_channels WHERE id={ph()}", (cid,))
    ch = c.fetchone()
    db.commit(); db.close()

    # Pusher Broadcast (Instant)
    if pusher_client:
        try:
            pusher_client.trigger('staff-chat', 'new-message', {
                "channel_id": cid,
                "author_id": request.cu["id"],
                "username": request.cu["username"],
                "role": request.cu["role"],
                "content": content,
                "created_at": datetime.now().isoformat()
            })
        except: pass

    # Discord Bridge (Background)
    def send_to_discord(webhook, payload):
        try:
            import requests
            requests.post(webhook, json=payload, timeout=5)
        except: pass

    threading.Thread(target=send_to_discord, args=(STAFF_WEBHOOK, {
        "embeds": [{
            "author": {"name": f"{request.cu['username']} [{request.cu['role'].upper()}]"},
            "description": content,
            "footer": {"text": f"Sent in {ch['name'] if ch else '#unknown'}"},
            "color": 0xFF512F
        }]
    })).start()

    return jsonify({"success":True})

# -------------------------------------------------------
# STATIC FILES (ads.txt, robots.txt)
# -------------------------------------------------------
@app.route("/ads.txt")
def ads_txt():
    # Verification for publisher ID provided by user
    content = "google.com, pub-8470357358025733, DIRECT, f08c47fec0942fa0"
    return Response(content, mimetype="text/plain")

@app.route("/robots.txt")
def robots_txt():
    content = "User-agent: *\nAllow: /\nSitemap: https://hellcore.net/sitemap.xml"
    return Response(content, mimetype="text/plain")

# -------------------------------------------------------
# CATCH-ALL ROUTE (Serves frontend for all valid paths)
# -------------------------------------------------------
@app.route("/<path:p>")
def catch_all(p):
    # Only serve index.html for non-file paths or specific SPA routes
    if "." in p: return "Not Found", 404
    return render_template("index.html")

# -------------------------------------------------------
# RUN
# -------------------------------------------------------
try:
    init_db()
except Exception as e:
    print(f"[ERROR] DB init error: {e}")

if __name__ == "__main__":
    print("=" * 56)
    print("  HELLCORE NETWORK — Backend v7")
    print("=" * 56)
    print("=" * 56)
    print("  Running on http://localhost:5000")
    print("=" * 56)
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
