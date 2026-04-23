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
import time
import json
import uuid
import hashlib
import re
import traceback
import secrets
import io
import base64
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

from flask import Flask, request, jsonify, render_template, send_from_directory, Response, redirect, g

app = Flask(__name__)

@app.after_request
def add_header(r):
    """Disable caching for all API responses"""
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    return r

@app.route("/discord")
def discord_redirect():
    html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Join Hellcore Network Discord</title>
    <meta name="description" content="Click to join the official Hellcore Network Discord server. Get live updates, chat with the community, and participate in giveaways!">
    <meta property="og:title" content="Hellcore Network Discord">
    <meta property="og:description" content="Click here to join the official Hellcore Network Discord server!">
    <meta property="og:image" content="https://hellcore.net/static/logo.png">
    <meta property="og:url" content="https://hellcore.net/discord">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="theme-color" content="#FF512F">
    <meta http-equiv="refresh" content="0; url=https://discord.gg/z4Yc7EMr4e">
    <script>window.location.href = "https://discord.gg/z4Yc7EMr4e";</script>
</head>
<body style="background:#09090b; color:#fff; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh;">
    <p>Redirecting to Discord... <a href="https://discord.gg/z4Yc7EMr4e" style="color:#FF512F;">Click here</a> if not redirected.</p>
</body>
</html>"""
    return Response(html, mimetype="text/html")

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

# ── RAILWAY MYSQL (cloud) ─────────────────────────────
USE_MYSQL_RAILWAY = os.environ.get("USE_MYSQL_RAILWAY", "True").lower() == "true"
RAILWAY_HOST     = os.environ.get("MYSQL_HOST", "")
RAILWAY_PORT     = int(os.environ.get("MYSQL_PORT", 3306))
RAILWAY_USER     = os.environ.get("MYSQL_USER", "root")
RAILWAY_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
RAILWAY_DATABASE = os.environ.get("MYSQL_DATABASE", "railway")

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

    if USE_MYSQL_AIVEN and AIVEN_HOST:
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

    if USE_MYSQL_RAILWAY and RAILWAY_HOST:
        try:
            import mysql.connector
            c = mysql.connector.connect(
                host=RAILWAY_HOST, port=RAILWAY_PORT,
                user=RAILWAY_USER, password=RAILWAY_PASSWORD,
                database=RAILWAY_DATABASE,
                connection_timeout=8
            )
            c.close()
            _DB_MODE = "mysql_railway"
            print(f"[OK] Railway MySQL connected ({RAILWAY_HOST})")
            return
        except Exception as e:
            print(f"[ERROR] Railway MySQL failed: {e}")

    _DB_MODE = "sqlite"
    print(f"[OK] Falling back to SQLite (hellcore.db) because no MySQL connection was successful.")
    print("     Hint: If you are on Railway, check your MYSQL_HOST/PORT/USER/PASSWORD/DATABASE env vars.")
    print("     Hint: If you are local, ensure mysql-connector-python is installed and MySQL is running.")

# Automatically connect to DB when the app starts
try_connect()

def get_db():
    if 'db' not in g:
        if _DB_MODE in ("mysql_local", "mysql_aiven", "mysql_railway"):
            import mysql.connector
            from mysql.connector import pooling

            # Use a connection pool to prevent connection exhaustion
            if not hasattr(get_db, '_pool'):
                if _DB_MODE == "mysql_local":
                    get_db._pool = pooling.MySQLConnectionPool(
                        pool_name="hc_pool", pool_size=10, pool_reset_session=True,
                        host=LOCAL_MYSQL_HOST, port=LOCAL_MYSQL_PORT,
                        user=LOCAL_MYSQL_USER, password=LOCAL_MYSQL_PASSWORD,
                        database=LOCAL_MYSQL_DATABASE
                    )
                elif _DB_MODE == "mysql_railway":
                    get_db._pool = pooling.MySQLConnectionPool(
                        pool_name="hc_pool", pool_size=10, pool_reset_session=True,
                        host=RAILWAY_HOST, port=RAILWAY_PORT,
                        user=RAILWAY_USER, password=RAILWAY_PASSWORD,
                        database=RAILWAY_DATABASE, autocommit=True
                    )
                else:
                    get_db._pool = pooling.MySQLConnectionPool(
                        pool_name="hc_pool", pool_size=10, pool_reset_session=True,
                        host=AIVEN_HOST, port=AIVEN_PORT,
                        user=AIVEN_USER, password=AIVEN_PASSWORD,
                        database=AIVEN_DATABASE, ssl_disabled=False, autocommit=True
                    )
            g.db = get_db._pool.get_connection()
        else:
            conn = sqlite3.connect(SQLITE_FILE)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            g.db = conn
    return g.db

@app.teardown_appcontext
def teardown_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def db_cursor(conn):
    if _DB_MODE in ("mysql_local", "mysql_aiven", "mysql_railway"):
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
def get_admin_db():
    """Returns a direct, non-pooled connection for administrative tasks."""
    if _DB_MODE == "mysql_railway":
        return mysql.connector.connect(host=RAILWAY_HOST, port=RAILWAY_PORT, user=RAILWAY_USER, password=RAILWAY_PASSWORD, database=RAILWAY_DATABASE, autocommit=True)
    elif _DB_MODE == "mysql_local":
        return mysql.connector.connect(host=LOCAL_MYSQL_HOST, port=LOCAL_MYSQL_PORT, user=LOCAL_MYSQL_USER, password=LOCAL_MYSQL_PASSWORD, database=LOCAL_MYSQL_DATABASE)
    elif _DB_MODE == "mysql_aiven":
        return mysql.connector.connect(host=AIVEN_HOST, port=AIVEN_PORT, user=AIVEN_USER, password=AIVEN_PASSWORD, database=AIVEN_DATABASE, autocommit=True)
    else:
        conn = sqlite3.connect(SQLITE_FILE)
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    db = get_admin_db()
    c = db.cursor(dictionary=True) if _DB_MODE != "sqlite" else db.cursor()
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
f"""CREATE TABLE IF NOT EXISTS hc_push_subs(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at {DT})""",
    ]

    for sql in tables:
        try: 
            c.execute(sql)
        except Exception as e: 
            print(f"  [DB WARN] Failed to create table: {e}")
    
    db.commit() # <── CRITICAL: Commit core tables immediately after creation
    print(f"  [DB INFO] Core tables committed.")

    # MIGRATION: Add is_pinned and is_locked if missing
    for col in ["is_pinned", "is_locked"]:
        try: c.execute(f"ALTER TABLE hc_forums ADD COLUMN {col} INTEGER DEFAULT 0")
        except: pass

    # MIGRATION: Add image_url to ticket messages
    try: c.execute("ALTER TABLE hc_ticket_msgs ADD COLUMN image_url VARCHAR(255) DEFAULT ''")
    except: pass
    # MIGRATION: Ticket system enhancements
    for sql in [
        "ALTER TABLE hc_tickets ADD COLUMN priority VARCHAR(20) DEFAULT 'normal'",
        "ALTER TABLE hc_tickets ADD COLUMN assigned_to INTEGER",
        "ALTER TABLE hc_tickets ADD COLUMN last_message_at TIMESTAMP",
        "ALTER TABLE hc_ticket_msgs ADD COLUMN is_internal INTEGER DEFAULT 0",
        "ALTER TABLE hc_ticket_msgs ADD COLUMN message_type VARCHAR(20) DEFAULT 'user'",
        "ALTER TABLE hc_ticket_msgs ADD COLUMN meta_json TEXT"
    ]:
        try: c.execute(sql)
        except: pass

    # MIGRATION: User last_seen
    try: 
        c.execute("ALTER TABLE hc_users ADD COLUMN last_seen DATETIME")
    except: 
        pass

    db.commit() # <── Commit migrations
    print(f"  [DB INFO] Migrations committed.")

    # --- BOOTSTRAP EVENTS ---
    def bootstrap_events(curr):
        try:
            # One-time purge to fix missing link_url in existing records
            curr.execute("DELETE FROM hc_events")
            
            evs = [
                ("Earn a Free Rank", "Claim your free starter rank today and unlock exclusive lobby furniture!", "/static/logo.png", "/store/free"),
                ("Join our Discord", "Join 5,000+ members! Get live updates and participate in giveaways.", "/static/logo.png", "/discord"),
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
        except Exception as e:
            print(f"  [DB WARN] Bootstrap failed (ignoring): {e}")

    bootstrap_events(c)
    db.commit() # Final commit for bootstrap
    c.close()
    db.close()
    print(f"[OK] Database fully initialized ({_DB_MODE})")

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
        # Check if we can find ANY token first
        c.execute("SELECT COUNT(*) as cnt FROM hc_users WHERE session_token IS NOT NULL")
        count = c.fetchone()["cnt"]
        
        c.execute(f"SELECT * FROM hc_users WHERE session_token={ph()}", (token,))
        row = c.fetchone()
        
        if not row:
            print(f"[AUTH DEBUG] No user found for token (len {len(token)}). Total users with tokens: {count}")
            
        return to_dict(row)
    except Exception as e:
        print(f"[DB ERROR] Token lookup failed: {e}")
        traceback.print_exc()
        return None

def auth_required(f):
    @wraps(f)
    def w(*a, **k):
        token = request.headers.get("X-Auth-Token", "") or request.cookies.get("hc_token", "")
        u = get_user_by_token(token)
        if not u:
            print(f"[AUTH DEBUG] Auth failed for token: {token[:10]}... (Source: {'Header' if request.headers.get('X-Auth-Token') else 'Cookie'})")
            return jsonify({"error":"Authentication failed. Please login again."}), 401
        request.cu = u; return f(*a, **k)
    return w

def staff_required(f):
    @wraps(f)
    def w(*a, **k):
        token = request.headers.get("X-Auth-Token", "") or request.cookies.get("hc_token", "")
        u = get_user_by_token(token)
        if not u: return jsonify({"error":"Staff access required"}), 401
        if u["role"] not in STAFF_ROLES: return jsonify({"error":"Staff required"}), 403
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

def log_audit(admin_id, action, target_id=None, details="", status="success", execution_time=0.0):
    try:
        db = get_db(); c = db_cursor(db)
        # Check if columns exist (for status and execution_time)
        try:
            c.execute(f"INSERT INTO hc_audit_logs(admin_id, action, target_id, details, status, execution_time) VALUES({phs(6)})",
                      (admin_id, action, target_id, details, status, execution_time))
        except:
            # Fallback to old schema if table wasn't fully migrated yet
            c.execute(f"INSERT INTO hc_audit_logs(admin_id, action, target_id, details) VALUES({phs(4)})",
                      (admin_id, action, target_id, details))
        db.commit()
    except: traceback.print_exc()

def normalize_ticket_priority(v):
    p = str(v or "normal").strip().lower()
    return p if p in ("low", "normal", "high", "urgent") else "normal"

def can_view_ticket(ticket, user):
    return bool(user and (ticket["author_id"] == user["id"] or user["role"] in STAFF_ROLES))

def can_manage_ticket(ticket, user):
    return bool(user and (ticket["author_id"] == user["id"] or user["role"] in STAFF_ROLES))

def add_ticket_activity(c, ticket_id, actor_id, action, details=""):
    c.execute(
        f"INSERT INTO hc_ticket_activity(ticket_id,actor_id,action,details) VALUES({phs(4)})",
        (ticket_id, actor_id, action, details)
    )

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
        # Fetch last 60 points
        c.execute("SELECT timestamp, total_players FROM hc_player_history ORDER BY timestamp DESC LIMIT 60")
        rows = to_list(c.fetchall())
        
        rows.reverse()
        
        labels = []
        counts = []
        for r in rows:
            ts = r["timestamp"]
            # Handle both string (SQLite) and datetime (MySQL) objects
            try:
                if isinstance(ts, str):
                    p_ts = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
                else:
                    p_ts = ts
                labels.append(p_ts.strftime("%H:%M"))
            except:
                labels.append("??:??")
            counts.append(r["total_players"])
            
        return jsonify({"labels": labels, "counts": counts})
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
            return jsonify({"error":"Email or username already taken"}), 409

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

        db.commit()
        return jsonify({"token":tok,"id":uid,"username":us,"email":em,"mc_username":mc,"role":"player"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error":f"Server error: {e}"}), 500

@app.route("/api/auth/heartbeat", methods=["POST"])
@auth_required
def heartbeat():
    u = request.cu
    try:
        db = get_db(); c = db_cursor(db)
        # Use datetime.now() compatible with both sqlite and mysql
        now = datetime.now()
        c.execute(f"UPDATE hc_users SET last_seen={ph()} WHERE id={ph()}", (now, u["id"]))
        db.commit()
        return jsonify({"success": True})
    except:
        traceback.print_exc()
        return jsonify({"error": "Failed to update status"}), 500

@app.route("/api/staff/online")
@staff_required
def get_online_staff():
    try:
        # Threshold: 5 minutes
        threshold = datetime.now() - timedelta(minutes=5)
        db = get_db(); c = db_cursor(db)
        # Query for staff active in the last 5 minutes
        placeholders = ",".join([ph() for _ in STAFF_ROLES])
        sql = f"SELECT id, username, role, last_seen FROM hc_users WHERE role IN ({placeholders}) AND last_seen > {ph()} ORDER BY last_seen DESC"
        params = list(STAFF_ROLES) + [threshold]
        c.execute(sql, tuple(params))
        rows = c.fetchall()
        return jsonify(to_list(rows))
    except:
        traceback.print_exc()
        return jsonify([])

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
            return jsonify({"error":"Wrong email/username or password"}), 401

        tok = secrets.token_hex(32)
        print(f"[LOGIN DEBUG] Saving token for user {row['id']}: {tok[:10]}...")
        c.execute(f"UPDATE hc_users SET session_token={ph()} WHERE id={ph()}", (tok, row["id"]))
        db.commit()
        resp = jsonify({"token":tok,"id":row["id"],"username":row["username"],
                        "email":row["email"],"mc_username":row["mc_username"] or "","role":row["role"],
                        "is_verified":bool(row.get("is_verified",0))})
        resp.set_cookie(
            "hc_token", 
            tok, 
            max_age=60*60*24*30, 
            path="/", 
            domain=".hellcore.net" if "hellcore.net" in request.host else None,
            samesite="Lax",
            secure=True if "hellcore.net" in request.host else False
        )
        return resp
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error":f"Server error: {e}"}), 500

@app.route("/api/auth/logout", methods=["POST"])
@auth_required
def logout():
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_users SET session_token=NULL WHERE id={ph()}", (request.cu["id"],))
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/auth/me")
@auth_required
def auth_me():
    u = request.cu
    return jsonify({"id":u["id"],"username":u["username"],"email":u["email"],
                    "mc_username":u.get("mc_username") or "","role":u["role"], "is_verified": bool(u.get("is_verified", 0))})

# -------------------------------------------------------
# MINECRAFT VERIFICATION
# -------------------------------------------------------
@app.route("/api/verify/start", methods=["POST"])
@auth_required
def verify_start():
    import random
    # Generate unique 6-digit code
    code = f"HC-{random.randint(100000, 999999)}"
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_users SET verification_code={ph()} WHERE id={ph()}", (code, request.cu["id"]))
    db.commit()
    return jsonify({"code": code})

@app.route("/api/verify/status")
@auth_required
def verify_status():
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT is_verified, mc_username, mc_uuid FROM hc_users WHERE id={ph()}", (request.cu["id"],))
    u = to_dict(c.fetchone())
    
    return jsonify(u)

@app.route("/api/verify/confirm")
def verify_confirm():
    """Endpoint for Minecraft server to call when user types /verify <code>"""
    code = request.args.get("code")
    uuid = request.args.get("uuid")
    username = request.args.get("username")
    if not code or not uuid: return "Missing params", 400
    
    db = get_db(); c = db_cursor(db)
    # MySQL dictionary cursor needs to be handled if used
    c.execute(f"SELECT id FROM hc_users WHERE verification_code={ph()}", (code,))
    res = c.fetchone()
    u = to_dict(res)
    if not u: 
        
        return "Invalid or expired code", 404
    
    # Link UUID and mark as verified
    c.execute(f"UPDATE hc_users SET mc_uuid={ph()}, mc_username={ph()}, is_verified=1, verification_code=NULL WHERE id={ph()}", 
              (uuid, username, u["id"]))
    db.commit()
    return f"Successfully verified {username} on website!", 200

@app.route("/api/metrics/update")
def metrics_update():
    """Receives heartbeats from the Minecraft plugin to show live status."""
    online = request.args.get("online", 0, type=int)
    max_p = request.args.get("max", 0, type=int)
    server = request.args.get("server", "Unknown")
    arenas = request.args.get("arenas", 0, type=int)
    ingame = request.args.get("ingame", 0, type=int)
    
    db = get_db(); c = db_cursor(db)
    upsert(c, "hc_server_metrics", 
           {"server_name": server, "online_players": online, "max_players": max_p, 
            "arenas": arenas, "ingame_players": ingame, "last_updated": datetime.now()},
           {"server_name"})
    db.commit()
    return "OK", 200

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
    
    db.commit()
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
    rows = to_list(c.fetchall())
    for r in rows: r["created_at"] = ts(r["created_at"])
    return jsonify(rows)

@app.route("/api/forums/<int:fid>")
def forum_get(fid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_forums SET views=views+1 WHERE id={ph()}", (fid,))
    c.execute(f"SELECT f.*, u.username author_name, u.role author_role "
              f"FROM hc_forums f JOIN hc_users u ON f.author_id=u.id WHERE f.id={ph()}", (fid,))
    forum = to_dict(c.fetchone())
    if not forum: return jsonify({"error":"Not found"}), 404
    forum["created_at"] = ts(forum["created_at"])
    c.execute(f"SELECT r.*, u.username author_name, u.role author_role "
              f"FROM hc_replies r JOIN hc_users u ON r.author_id=u.id "
              f"WHERE r.forum_id={ph()} ORDER BY r.created_at ASC", (fid,))
    replies = to_list(c.fetchall())
    for r in replies: r["created_at"] = ts(r["created_at"])
    db.commit()
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
    db.commit(); fid = c.lastrowid
    return jsonify({"id":fid,"ok":True})

@app.route("/api/forums/<int:fid>", methods=["DELETE"])
@auth_required
def forum_del(fid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_forums WHERE id={ph()}", (fid,))
    f = to_dict(c.fetchone())
    if not f: return jsonify({"error":"Not found"}), 404
    u = request.cu
    if f["author_id"] != u["id"] and u["role"] not in ADMIN_ROLES:
        return jsonify({"error":"Forbidden"}), 403
    c.execute(f"DELETE FROM hc_replies WHERE forum_id={ph()}", (fid,))
    c.execute(f"DELETE FROM hc_forums  WHERE id={ph()}", (fid,))
    db.commit()
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
        return jsonify({"error":"This thread is locked (Private)."}), 403
    c.execute(f"INSERT INTO hc_replies(forum_id,author_id,content) VALUES({phs(3)})",
              (fid, request.cu["id"], d["content"]))
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/forums/replies/<int:rid>", methods=["DELETE"])
@auth_required
def reply_del(rid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_replies WHERE id={ph()}", (rid,))
    r = to_dict(c.fetchone())
    if not r: return jsonify({"error":"Not found"}), 404
    u = request.cu
    if r["author_id"] != u["id"] and u["role"] not in ADMIN_ROLES:
        return jsonify({"error":"Forbidden"}), 403
    c.execute(f"DELETE FROM hc_replies WHERE id={ph()}", (rid,))
    db.commit()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# TICKETS
# ═══════════════════════════════════════════════════════
@app.route("/api/tickets")
@auth_required
def tickets_list():
    u = request.cu; db = get_db(); c = db_cursor(db)
    if u["role"] in STAFF_ROLES:
        c.execute("SELECT t.*, u.username author_name, a.username assigned_name FROM hc_tickets t "
                  "JOIN hc_users u ON t.author_id=u.id "
                  "LEFT JOIN hc_users a ON t.assigned_to=a.id "
                  "ORDER BY COALESCE(t.last_message_at, t.created_at) DESC")
    else:
        c.execute(f"SELECT t.*, u.username author_name, a.username assigned_name FROM hc_tickets t "
                  f"JOIN hc_users u ON t.author_id=u.id "
                  f"LEFT JOIN hc_users a ON t.assigned_to=a.id "
                  f"WHERE t.author_id={ph()} ORDER BY COALESCE(t.last_message_at, t.created_at) DESC",
                  (u["id"],))
    rows = to_list(c.fetchall())
    for r in rows:
        r["created_at"] = ts(r["created_at"])
        r["last_message_at"] = ts(r.get("last_message_at") or r["created_at"])
        c.execute(f"SELECT COUNT(*) cnt FROM hc_ticket_msgs WHERE ticket_id={ph()}", (r["id"],))
        mc = to_dict(c.fetchone())
        c.execute(f"SELECT id FROM hc_ticket_msgs WHERE ticket_id={ph()} ORDER BY id DESC LIMIT 1", (r["id"],))
        lm = to_dict(c.fetchone())
        r["message_count"] = int(mc["cnt"]) if mc else 0
        r["last_message_id"] = int(lm["id"]) if lm else 0
        r["priority"] = normalize_ticket_priority(r.get("priority"))
    
    return jsonify(rows)

@app.route("/api/tickets", methods=["POST"])
@auth_required
def ticket_create():
    d = request.get_json(force=True) or {}
    if not d.get("title") or not d.get("description"):
        return jsonify({"error":"All fields required"}), 400
    db = get_db(); c = db_cursor(db)
    pr = normalize_ticket_priority(d.get("priority"))
    now = datetime.now()
    category = d.get("category","general")
    c.execute(f"INSERT INTO hc_tickets(title,description,author_id,category,priority,last_message_at) VALUES({phs(6)})",
              (d["title"], d["description"], request.cu["id"], category, pr, now))
    db.commit(); tid = c.lastrowid

    if category == "purchase":
        try:
            import requests
            wh = globals().get("STAFF_WEBHOOK", "https://discord.com/api/webhooks/1495099642671792261/LA6pwnEjA74swShTjPwX5qT5iBh_xHUBh6elQS8RK_OZF7anxO5hsXoIlBUsPSRvPavj")
            requests.post(wh, json={
                "content": f"🚨 **New Payment Ticket** created by **{request.cu['username']}** (Ticket #{tid})",
                "embeds": [{
                    "title": d["title"],
                    "description": d["description"][:500] + ("..." if len(d["description"]) > 500 else ""),
                    "color": 0xFF512F
                }]
            }, timeout=3)
        except Exception as e:
            print("Webhook failed:", e)

        # Web Push to staff
        try:
            import json, os
            from pywebpush import webpush, WebPushException
            
            db2 = get_db(); c2 = db_cursor(db2)
            c2.execute("SELECT s.endpoint, s.p256dh, s.auth FROM hc_push_subs s JOIN hc_users u ON s.user_id = u.id WHERE u.role IN ('helper','mod','dev','admin','owner','founder')")
            subs = to_list(c2.fetchall())
            c2.close()

            vapid_priv = os.environ.get("VAPID_PRIVATE_KEY")
            if not vapid_priv and os.path.exists(".env"):
                 with open(".env", "r") as f:
                     for x in f:
                         if "VAPID_PRIVATE_KEY" in x: vapid_priv = x.split("=")[1].strip()

            if vapid_priv and os.path.exists(vapid_priv):
                with open(vapid_priv, "r") as f:
                    vapid_priv = f.read().strip()

            if vapid_priv and subs:
                payload = json.dumps({"title": "New Payment Ticket", "body": f"Created by {request.cu['username']}"})
                for s in subs:
                    sub_info = {
                        "endpoint": s["endpoint"],
                        "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}
                    }
                    try:
                        webpush(
                            subscription_info=sub_info,
                            data=payload,
                            vapid_private_key=vapid_priv,
                            vapid_claims={"sub": "mailto:admin@hellcore.net"}
                        )
                    except WebPushException as ex:
                        if ex.response and ex.response.status_code in [404, 410]:
                            db3 = get_db(); c3 = db_cursor(db3)
                            c3.execute(f"DELETE FROM hc_push_subs WHERE endpoint={ph()}", (s["endpoint"],))
                            db3.commit(); c3.close()
        except Exception as e:
            print("Web push failed:", e)

    return jsonify({"id":tid,"ok":True})

@app.route("/api/push/subscribe", methods=["POST"])
@auth_required
def push_subscribe():
    d = request.get_json(force=True) or {}
    sub = d.get("subscription")
    if not sub: return jsonify({"error": "Missing subscription"}), 400
    
    endpoint = sub.get("endpoint")
    keys = sub.get("keys", {})
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    
    if not endpoint or not p256dh or not auth:
        return jsonify({"error": "Invalid subscription object"}), 400
        
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_push_subs WHERE endpoint={ph()}", (endpoint,))
    if c.fetchone():
        c.execute(f"UPDATE hc_push_subs SET user_id={ph()} WHERE endpoint={ph()}", (request.cu["id"], endpoint))
    else:
        c.execute(f"INSERT INTO hc_push_subs(user_id, endpoint, p256dh, auth) VALUES({phs(4)})",
                  (request.cu["id"], endpoint, p256dh, auth))
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/tickets/<int:tid>")
@auth_required
def ticket_get(tid):
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT t.*, u.username author_name, a.username assigned_name FROM hc_tickets t "
              f"JOIN hc_users u ON t.author_id=u.id LEFT JOIN hc_users a ON t.assigned_to=a.id WHERE t.id={ph()}", (tid,))
    t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if not can_view_ticket(t, u):
        return jsonify({"error":"Forbidden"}), 403
    t["created_at"] = ts(t["created_at"])
    t["last_message_at"] = ts(t.get("last_message_at") or t["created_at"])
    t["priority"] = normalize_ticket_priority(t.get("priority"))
    perms = {
        "can_manage": can_manage_ticket(t, u),
        "can_delete": bool(t["author_id"] == u["id"] or u["role"] in ADMIN_ROLES),
        "can_assign": bool(u["role"] in STAFF_ROLES),
        "can_internal_note": bool(u["role"] in STAFF_ROLES),
        "can_rank_grant": bool(u["role"] in ADMIN_ROLES),
    }
    c.execute(f"SELECT m.*, u.username author_name, u.role author_role FROM hc_ticket_msgs m "
              f"JOIN hc_users u ON m.author_id=u.id WHERE m.ticket_id={ph()} ORDER BY m.created_at ASC", (tid,))
    msgs = to_list(c.fetchall())
    for m in msgs:
        m["created_at"] = ts(m["created_at"])
        m["is_internal"] = int(m.get("is_internal") or 0)
        if m["is_internal"] and u["role"] not in STAFF_ROLES:
            m["content"] = "[Internal note]"
    if u["role"] not in STAFF_ROLES:
        msgs = [m for m in msgs if int(m.get("is_internal") or 0) == 0]
    c.execute(f"SELECT a.*, u.username actor_name FROM hc_ticket_activity a "
              f"JOIN hc_users u ON a.actor_id=u.id WHERE a.ticket_id={ph()} ORDER BY a.created_at DESC LIMIT 40", (tid,))
    acts = to_list(c.fetchall())
    for a in acts: a["created_at"] = ts(a["created_at"])
    staff = []
    if u["role"] in STAFF_ROLES:
        c.execute("SELECT id, username, role FROM hc_users WHERE role IN ('helper','mod','dev','admin','owner','founder') ORDER BY username ASC")
        staff = to_list(c.fetchall())
    
    return jsonify({"ticket":t,"messages":msgs,"activity":acts,"staff":staff,"permissions":perms})

@app.route("/api/tickets/<int:tid>/msg", methods=["POST"])
@auth_required
def ticket_msg(tid):
    d = request.get_json(force=True) or {}
    content = d.get("content", "").strip()
    img_data = d.get("image") # base64 string
    is_internal = 1 if bool(d.get("is_internal")) else 0
    
    if not content and not img_data:
        return jsonify({"error":"Content or image required"}), 400
        
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,)); t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if not can_view_ticket(t, u):
        return jsonify({"error":"Forbidden"}), 403
    if is_internal and u["role"] not in STAFF_ROLES:
        return jsonify({"error":"Staff only note"}), 403
        
    img_url = ""
    if img_data:
        try:
            # Handle base64 image
            if "," in img_data: img_data = img_data.split(",")[1]
            ext = "png" # default
            if "image/jpeg" in img_data: ext = "jpg"
            elif "image/gif" in img_data: ext = "gif"
            
            fname = f"tix_{tid}_{u['id']}_{int(time.time())}.{ext}"
            up_dir = os.path.join(app.static_folder, 'uploads', 'tickets')
            os.makedirs(up_dir, exist_ok=True)
            fpath = os.path.join(up_dir, fname)
            
            with open(fpath, "wb") as fh:
                fh.write(base64.b64decode(img_data))
            img_url = f"/static/uploads/tickets/{fname}"
        except Exception as e:
            print(f"[TICKETS] Image Save Error: {e}")
            # Continue without image if it fails
            
    mtype = "internal" if is_internal else "user"
    c.execute(f"INSERT INTO hc_ticket_msgs(ticket_id,author_id,content,image_url,is_internal,message_type) VALUES({phs(6)})",
              (tid, u["id"], content, img_url, is_internal, mtype))
    mid = c.lastrowid
    c.execute(f"UPDATE hc_tickets SET last_message_at={ph()} WHERE id={ph()}", (datetime.now(), tid))
    if is_internal:
        add_ticket_activity(c, tid, u["id"], "internal_note", content[:120])
    db.commit()
    c.execute(f"SELECT m.*, u.username author_name, u.role author_role FROM hc_ticket_msgs m "
              f"JOIN hc_users u ON m.author_id=u.id WHERE m.id={ph()}", (mid,))
    msg = to_dict(c.fetchone())
    msg["created_at"] = ts(msg["created_at"])
    
    return jsonify({"ok":True,"message":msg})

@app.route("/api/tickets/<int:tid>/updates")
@auth_required
def ticket_updates(tid):
    after_id = int(request.args.get("after_id", "0") or 0)
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,))
    t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if not can_view_ticket(t, u):
        return jsonify({"error":"Forbidden"}), 403
    c.execute(f"SELECT m.*, u.username author_name, u.role author_role FROM hc_ticket_msgs m "
              f"JOIN hc_users u ON m.author_id=u.id WHERE m.ticket_id={ph()} AND m.id>{ph()} ORDER BY m.id ASC", (tid, after_id))
    msgs = to_list(c.fetchall())
    for m in msgs: m["created_at"] = ts(m["created_at"])
    if u["role"] not in STAFF_ROLES:
        msgs = [m for m in msgs if int(m.get("is_internal") or 0) == 0]
    c.execute(f"SELECT status,priority,assigned_to,last_message_at FROM hc_tickets WHERE id={ph()}", (tid,))
    meta = to_dict(c.fetchone()) or {}
    meta["last_message_at"] = ts(meta.get("last_message_at"))
    
    return jsonify({"messages":msgs, "ticket_meta":meta})

@app.route("/api/tickets/<int:tid>/action", methods=["POST"])
@auth_required
def ticket_action(tid):
    d = request.get_json(force=True) or {}
    action = str(d.get("action", "")).strip().lower()
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,))
    t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if not can_manage_ticket(t, u):
        return jsonify({"error":"Forbidden"}), 403

    if action == "close":
        c.execute(f"UPDATE hc_tickets SET status='closed' WHERE id={ph()}", (tid,))
        add_ticket_activity(c, tid, u["id"], "status", "closed")
    elif action == "reopen":
        c.execute(f"UPDATE hc_tickets SET status='open' WHERE id={ph()}", (tid,))
        add_ticket_activity(c, tid, u["id"], "status", "open")
    elif action == "assign":
        if u["role"] not in STAFF_ROLES:
            return jsonify({"error":"Staff only"}), 403
        assigned_to = d.get("assigned_to")
        if assigned_to in (None, "", 0):
            c.execute(f"UPDATE hc_tickets SET assigned_to=NULL WHERE id={ph()}", (tid,))
            add_ticket_activity(c, tid, u["id"], "assignment", "unassigned")
        else:
            c.execute(f"SELECT id, username FROM hc_users WHERE id={ph()}", (int(assigned_to),))
            au = to_dict(c.fetchone())
            if not au:
                return jsonify({"error":"Assignee not found"}), 404
            c.execute(f"UPDATE hc_tickets SET assigned_to={ph()} WHERE id={ph()}", (au["id"], tid))
            add_ticket_activity(c, tid, u["id"], "assignment", f"assigned_to:{au['username']}")
    elif action == "priority":
        if u["role"] not in STAFF_ROLES:
            return jsonify({"error":"Staff only"}), 403
        p = normalize_ticket_priority(d.get("priority"))
        c.execute(f"UPDATE hc_tickets SET priority={ph()} WHERE id={ph()}", (p, tid))
        add_ticket_activity(c, tid, u["id"], "priority", p)
    elif action in ("payment_received", "payment_pending", "need_details"):
        if u["role"] not in STAFF_ROLES:
            return jsonify({"error":"Staff only"}), 403
        add_ticket_activity(c, tid, u["id"], "payment", action)
    else:
        return jsonify({"error":"Unknown action"}), 400

    c.execute(f"UPDATE hc_tickets SET last_message_at={ph()} WHERE id={ph()}", (datetime.now(), tid))
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/tickets/<int:tid>/close", methods=["POST"])
@auth_required
def ticket_close(tid):
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,))
    t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if not can_manage_ticket(t, u):
        return jsonify({"error":"Forbidden"}), 403
    c.execute(f"UPDATE hc_tickets SET status='closed', last_message_at={ph()} WHERE id={ph()}", (datetime.now(), tid))
    add_ticket_activity(c, tid, u["id"], "status", "closed")
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/tickets/<int:tid>/rank", methods=["POST"])
@auth_required
def ticket_rank_grant(tid):
    u = request.cu
    if u["role"] not in ADMIN_ROLES:
        return jsonify({"error":"Admin required"}), 403
    d = request.get_json(force=True) or {}
    username = str(d.get("username", "")).strip()
    rank = str(d.get("rank", "")).strip().lower()
    mode = str(d.get("mode", "perm_set")).strip().lower()
    duration = str(d.get("duration", "7d")).strip().lower()
    if not username or not rank:
        return jsonify({"error":"username and rank required"}), 400
    if not re.match(r"^[a-zA-Z0-9_]{3,16}$", username):
        return jsonify({"error":"Invalid username"}), 400
    if not re.match(r"^[a-zA-Z0-9_+\-]{2,24}$", rank):
        return jsonify({"error":"Invalid rank"}), 400
    if mode == "temp_add":
        if not re.match(r"^[0-9]{1,3}[smhdw]$", duration):
            return jsonify({"error":"Invalid duration, example: 30d"}), 400
        cmd = f"lpv user {username} parent addtemp {rank} {duration}"
    else:
        mode = "perm_set"
        cmd = f"lpv user {username} parent set {rank}"
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,))
    t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Ticket not found"}), 404
    c.execute(f"INSERT INTO hc_command_queue(command) VALUES({ph()})", (cmd,))
    add_ticket_activity(c, tid, u["id"], "rank_grant", f"{mode}:{username}:{rank}:{duration}")
    c.execute(f"INSERT INTO hc_ticket_msgs(ticket_id,author_id,content,is_internal,message_type) VALUES({phs(5)})",
              (tid, u["id"], f"Rank grant queued for {username} -> {rank} ({mode}{' '+duration if mode=='temp_add' else ''})", 1, "system"))
    c.execute(f"UPDATE hc_tickets SET last_message_at={ph()} WHERE id={ph()}", (datetime.now(), tid))
    db.commit()
    return jsonify({"ok":True, "queued_command":cmd})

@app.route("/api/tickets/canned")
@auth_required
def ticket_canned():
    u = request.cu
    if u["role"] not in STAFF_ROLES:
        return jsonify([])
    rows = [
        {"id":"pay_received","label":"Payment received","text":"Payment confirmed. Your order is now being processed."},
        {"id":"need_proof","label":"Need payment proof","text":"Please send a screenshot of the completed UPI transaction with transaction ID."},
        {"id":"need_ign","label":"Need in-game username","text":"Please confirm your exact Minecraft username so we can grant the rank."},
        {"id":"eta","label":"Processing ETA","text":"Thanks for your patience. Processing is in progress and usually completes in 5-10 minutes."}
    ]
    return jsonify(rows)

@app.route("/api/tickets/<int:tid>", methods=["DELETE"])
@auth_required
def ticket_del(tid):
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,)); t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if t["author_id"] != u["id"] and u["role"] not in ADMIN_ROLES:
        return jsonify({"error":"Forbidden"}), 403
    c.execute(f"DELETE FROM hc_ticket_msgs WHERE ticket_id={ph()}", (tid,))
    c.execute(f"DELETE FROM hc_ticket_activity WHERE ticket_id={ph()}", (tid,))
    c.execute(f"DELETE FROM hc_tickets WHERE id={ph()}", (tid,))
    db.commit()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# CART
# ═══════════════════════════════════════════════════════
@app.route("/api/cart")
@auth_required
def cart_get():
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
    rows = to_list(c.fetchall())
    return jsonify(rows)

@app.route("/api/cart", methods=["POST"])
@auth_required
def cart_add():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_cart(user_id,item_id,item_name,item_price,gamemode) VALUES({phs(5)})",
              (request.cu["id"], d["item_id"], d["item_name"], float(d["item_price"]), d.get("gamemode","")))
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/cart/<int:cid>", methods=["DELETE"])
@auth_required
def cart_rem(cid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_cart WHERE id={ph()} AND user_id={ph()}", (cid, request.cu["id"]))
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/cart/clear", methods=["DELETE"])
@auth_required
def cart_clear():
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_cart WHERE user_id={ph()}", (request.cu["id"],))
    db.commit()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════
# INVENTORY & GIFTS
# ═══════════════════════════════════════════════════════
@app.route("/api/inventory")
@auth_required
def inventory():
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_inventory WHERE user_id={ph()} ORDER BY created_at DESC", (request.cu["id"],))
    rows = to_list(c.fetchall())
    for r in rows: r["created_at"] = ts(r["created_at"])
    return jsonify(rows)

@app.route("/api/gifts/send", methods=["POST"])
@auth_required
def gift_send():
    d = request.get_json(force=True) or {}
    to_nm = str(d.get("to_username","")).strip()
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_users WHERE username={ph()}", (to_nm,))
    if not c.fetchone(): return jsonify({"error":"Player not found"}), 404
    c.execute(f"INSERT INTO hc_gifts(from_user_id,to_username,item_type,item_name,gamemode) VALUES({phs(5)})",
              (request.cu["id"], to_nm, d.get("item_type","rank"), d["item_name"], d.get("gamemode","")))
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/gifts/pending")
@auth_required
def gifts_pending():
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT g.*, u.username from_name FROM hc_gifts g "
              f"JOIN hc_users u ON g.from_user_id=u.id "
              f"WHERE g.to_username={ph()} AND g.status='pending'", (request.cu["username"],))
    rows = to_list(c.fetchall())
    for r in rows: r["created_at"] = ts(r.get("created_at",""))
    return jsonify(rows)

@app.route("/api/gifts/<int:gid>/claim", methods=["POST"])
@auth_required
def gift_claim(gid):
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_gifts WHERE id={ph()} AND to_username={ph()} AND status='pending'",
              (gid, u["username"]))
    g = to_dict(c.fetchone())
    if not g: return jsonify({"error":"Gift not found"}), 404
    c.execute(f"INSERT INTO hc_inventory(user_id,item_type,item_name,gamemode,gifted_by) VALUES({phs(5)})",
              (u["id"], g["item_type"], g["item_name"], g["gamemode"], g["from_user_id"]))
    c.execute(f"UPDATE hc_gifts SET status='claimed' WHERE id={ph()}", (gid,))
    db.commit()
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
    if not u: return jsonify({"error":"Player not found"}), 404

    # Fetch all stats, ranks, economy
    c.execute(f"SELECT * FROM hc_stats    WHERE user_id={ph()}", (u["id"],)); stats = to_list(c.fetchall())
    c.execute(f"SELECT * FROM hc_ranks    WHERE user_id={ph()}", (u["id"],)); ranks = to_list(c.fetchall())
    c.execute(f"SELECT * FROM hc_economy  WHERE user_id={ph()}", (u["id"],)); eco = to_dict(c.fetchone())
    
    return jsonify({
        "user":    {"username":u["username"],"role":u["role"],"mc_username":u["mc_username"] or ""},
        "stats":   {s["gamemode"]:s for s in stats},
        "ranks":   {r["gamemode"]:r["rank_name"] for r in ranks},
        "economy": eco or {"server_gold":0,"server_iron":0}
    })

@app.route("/api/serverstatus/overview")
def serverstatus_overview():
    try:
        db = get_db(); c = db_cursor(db)
        # We assume the Bedwars server is the primary one for these stats, 
        # or we aggregate them if multiple servers report it.
        c.execute("SELECT SUM(online_players) as players, SUM(arenas) as arenas, SUM(ingame_players) as ingame FROM hc_server_metrics")
        res = to_dict(c.fetchone())
        
        return jsonify({
            "players": res.get("players") or 0,
            "arenas": res.get("arenas") or 0,
            "ingame": res.get("ingame") or 0
        })
    except:
        return jsonify({"players":0, "arenas":0, "ingame":0})

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
    rows = to_list(c.fetchall())
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
    if not u: return jsonify({"error":"Player not found"}), 404
    c.execute(f"SELECT * FROM hc_stats    WHERE user_id={ph()}", (u["id"],)); stats = to_list(c.fetchall())
    c.execute(f"SELECT * FROM hc_ranks    WHERE user_id={ph()}", (u["id"],)); ranks = to_list(c.fetchall())
    c.execute(f"SELECT * FROM hc_economy  WHERE user_id={ph()}", (u["id"],)); eco = to_dict(c.fetchone())
    
    return jsonify({
        "user":    {"username":u["username"],"role":u["role"],"mc_username":u["mc_username"] or ""},
        "stats":   {s["gamemode"]:s for s in stats},
        "ranks":   {r["gamemode"]:r["rank_name"] for r in ranks},
        "economy": eco or {"server_gold":0,"server_iron":0}
    })

@app.route("/api/lb-test")
def lb_test():
    import urllib.request, json
    bw_api_key = os.environ.get("BW_API_KEY", "bw_91e25e30cd3ce741b9098925c8513ceadf5d3ab1")
    bw_api_base = os.environ.get("BW_API_BASE", "http://srv125.godlike.club:26364/api/v1")
    stat = request.args.get("stat", "wins")
    url = f"{bw_api_base}/leaderboard/{stat}?apikey={bw_api_key}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req, timeout=8)
        raw = res.read().decode()
        data = json.loads(raw)
        return jsonify({
            "url": url,
            "bw_api_base_env": bw_api_base,
            "success": data.get("success"),
            "entries_count": len(data.get("entries", [])),
            "first_entry": data.get("entries", [{}])[0] if data.get("entries") else None,
            "full_response": data
        })
    except Exception as e:
        return jsonify({"url": url, "error": str(e)}), 500

@app.route("/api/lb/<gamemode>")
def lb_get(gamemode):
    stat = request.args.get("stat", "wins")
    gamemode = gamemode.strip().lower()

    if gamemode == "bedwars":
        import urllib.request, json

        # Map frontend stat names → API stat names (camelCase as API expects)
        bw_stat_map = {
            "wins": "wins", "losses": "losses", "kills": "kills", "deaths": "deaths",
            "final_kills": "finalKills", "final_deaths": "finalDeaths", 
            "beds_destroyed": "bedsBroken", "games_played": "gamesPlayed",
            "level": "level", "xp": "xp", "fkdr": "fkdr", "wlr": "wlr", "kdr": "kdr"
        }
        api_stat = bw_stat_map.get(stat, stat) # Fallback to literal if not in map
        
        bw_api_key = os.environ.get("BW_API_KEY", "bw_91e25e30cd3ce741b9098925c8513ceadf5d3ab1")
        bw_api_base = os.environ.get("BW_API_BASE", "http://srv125.godlike.club:26364/api/v1")

        limit = request.args.get("limit", "10")
        try:
            url = f"{bw_api_base}/leaderboard/{api_stat}?apikey={bw_api_key}&limit={limit}"
            print(f"[LB] Bedwars Fetching: {url}")

            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            res = urllib.request.urlopen(req, timeout=8)
            data = json.loads(res.read())
            print(f"[LB] Response keys: {list(data.keys())}")

            if not data.get("success"):
                print(f"[LB] API returned failure: {data}")
                return jsonify([])

            entries = data.get("entries", [])

            rows = []
            for e in entries:
                uname = e.get("username", "Unknown")
                rows.append({
                    "username": uname,
                    "mc_username": uname,
                    "value": e.get("value", 0),
                    "stat": api_stat,
                    "rank": e.get("rank", 0),
                    "is_bw1058": True,
                    "rank_name": None
                })
            return jsonify(rows)

        except Exception as e:
            print(f"[LB] Bedwars API Error: {e}")
            return jsonify({"error": str(e)}), 500

    if gamemode == "skywars":
        return jsonify({"coming_soon": True, "gamemode": "SkyWars"})

    # Default fallback for other gamemodes (SkyWars etc from local DB)
    try:
        if stat not in ("kills","deaths","wins","losses","coins"): stat = "wins"
        db = get_db(); c = db_cursor(db)
        c.execute(
            f"SELECT u.username, u.mc_username, r.rank_name, "
            f"s.kills, s.deaths, s.wins, s.losses, s.coins "
            f"FROM hc_stats s JOIN hc_users u ON s.user_id=u.id "
            f"LEFT JOIN hc_ranks r ON r.user_id=u.id AND r.gamemode={ph()} "
            f"WHERE s.gamemode={ph()} ORDER BY s.{stat} DESC LIMIT 50",
            (gamemode, gamemode)
        )
        rows = to_list(c.fetchall())
        return jsonify(rows)
    except Exception as e:
        print(f"[LB] Fallback Error for {gamemode}: {e}")
        return jsonify([])


@app.route("/api/staff")
def staff_list():
    db = get_db(); c = db_cursor(db)
    c.execute("SELECT username, mc_username, role FROM hc_users "
              "WHERE role IN ('helper','mod','dev','admin','owner','founder','youtube','famous')")
    rows = to_list(c.fetchall())
    return jsonify(rows)

# ═══════════════════════════════════════════════════════
# ADMIN
# ═══════════════════════════════════════════════════════
@app.route("/api/admin/users")
@admin_required
def admin_users():
    q = request.args.get("q", "").strip()
    db = get_db(); c = db_cursor(db)
    if q:
        c.execute(f"SELECT id,email,username,mc_username,role,created_at FROM hc_users WHERE username LIKE {ph()} OR email LIKE {ph()}", (f"%{q}%", f"%{q}%"))
    else:
        c.execute("SELECT id,email,username,mc_username,role,created_at FROM hc_users ORDER BY created_at DESC LIMIT 50")
    
    rows = to_list(c.fetchall())
    
    scored = []
    for r in rows:
        r["created_at"] = ts(r["created_at"])
        if q:
            uname = r["username"].lower()
            ql = q.lower()
            if uname == ql: score = 100
            elif uname.startswith(ql): score = 50
            elif ql in uname: score = 10
            else: score = 0
            r["search_score"] = score
        else:
            r["search_score"] = 0
        scored.append(r)
    
    if q:
        scored.sort(key=lambda x: x["search_score"], reverse=True)
    
    return jsonify(scored)

@app.route("/api/admin/audit")
@admin_required
def admin_audit():
    db = get_db(); c = db_cursor(db)
    # Join with users to get admin name
    c.execute("SELECT a.*, u.username as admin_name FROM hc_audit_logs a LEFT JOIN hc_users u ON a.admin_id = u.id ORDER BY a.created_at DESC LIMIT 200")
    rows = to_list(c.fetchall())
    for r in rows: r["created_at"] = ts(r["created_at"])
    return jsonify(rows)

@app.route("/api/admin/commands/suggestions")
@admin_required
def admin_cmd_suggestions():
    return jsonify([
        {"command": "lpv user {user} parent set {rank}", "description": "Update player rank across the network", "category": "Permissions"},
        {"command": "alert {message}", "description": "Global announcement to all online players", "category": "Admin"},
        {"command": "broadcast {message}", "description": "Send a formatted broadcast to the chat", "category": "Admin"},
        {"command": "kick {user} {reason}", "description": "Kick a player from the network", "category": "Moderation"},
        {"command": "ban {user} {reason}", "description": "Ban a player from the network", "category": "Moderation"},
        {"command": "mute {user} {time} {reason}", "description": "Mute a player's chat", "category": "Moderation"},
        {"command": "maintenance on|off", "description": "Toggle network maintenance mode", "category": "System"},
        {"command": "sync", "description": "Force sync all user permissions", "category": "System"}
    ])

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
    db.commit()
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
    if not u: return jsonify({"error":"User not found"}), 404
    upsert(c, "hc_stats",
        {"user_id":u["id"],"gamemode":d["gamemode"],"kills":d.get("kills",0),
         "deaths":d.get("deaths",0),"wins":d.get("wins",0),"losses":d.get("losses",0),"coins":d.get("coins",0)},
        {"user_id","gamemode"})
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/admin/setrank", methods=["POST"])
@admin_required
def admin_setrank():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_users WHERE username={ph()}", (d["username"],))
    u = to_dict(c.fetchone())
    if not u: return jsonify({"error":"User not found"}), 404
    upsert(c, "hc_ranks", {"user_id":u["id"],"gamemode":d["gamemode"],"rank_name":d["rank"]}, {"user_id","gamemode"})
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/admin/seteco", methods=["POST"])
@admin_required
def admin_seteco():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_users WHERE username={ph()}", (d["username"],))
    u = to_dict(c.fetchone())
    if not u: return jsonify({"error":"User not found"}), 404
    upsert(c, "hc_economy", {"user_id":u["id"],"server_gold":d.get("gold",0),"server_iron":d.get("iron",0)}, {"user_id"})
    db.commit()
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
    db.commit()
    return jsonify({"ok":True})

@app.route("/api/events")
def events_list():
    db = get_db(); c = db_cursor(db)
    # Fetch latest 3 events that haven't expired
    c.execute("SELECT * FROM hc_events WHERE expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL ORDER BY created_at DESC LIMIT 3")
    rows = to_list(c.fetchall())
    return jsonify(rows)

@app.route("/api/admin/events", methods=["POST"])
@admin_required
def admin_event_create():
    d = request.get_json(force=True) or {}
    db = get_db(); c = db_cursor(db)
    c.execute(f"INSERT INTO hc_events(title,description,image_url,expires_at) VALUES({phs(4)})",
              (d["title"], d["description"], d.get("image_url",""), d.get("expires_at")))
    db.commit(); eid = c.lastrowid
    return jsonify({"id":eid,"ok":True})

@app.route("/api/admin/events/<int:eid>", methods=["DELETE"])
@admin_required
def admin_event_delete(eid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_events WHERE id={ph()}", (eid,))
    db.commit()
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
    rows = to_list(c.fetchall())
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
        db.commit()
        return jsonify({"ok":True})
    else:
        c.execute("SELECT server_ip FROM hc_server_metrics WHERE server_name='GLOBAL_BANNER'")
        row = to_dict(c.fetchone())
        msg = row.get("server_ip", "") if row else ""
        
        return jsonify({"message":msg})

@app.route("/api/admin/commands/queue", methods=["POST"])
@admin_required
def admin_command_queue():
    d = request.get_json(force=True) or {}
    cmd = d.get("command")
    if not cmd: return jsonify({"error":"No command"}), 400
    
    start_time = time.time()
    db = get_db(); c = db_cursor(db)
    try:
        c.execute(f"INSERT INTO hc_command_queue(command) VALUES({ph()})", (cmd,))
        db.commit()
        duration = round((time.time() - start_time) * 1000, 2)
        log_audit(request.cu["id"], "command_exec", None, f"Queued: {cmd}", "success", duration)
        return jsonify({"ok":True})
    except Exception as e:
        log_audit(request.cu["id"], "command_exec", None, f"Failed: {cmd} ({str(e)})", "fail")
        return jsonify({"error":str(e)}), 500
        pass
        

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
            db.commit()
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
        cmd = f"lpv user {u['mc_username']} parent addtemp vip {reward['vip_hours']}h"
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

ONLINE_STAFF = {}  # { user_id: {"username": ..., "role": ..., "last_seen": datetime} }

@app.route("/api/staff/ping", methods=["POST"])
@staff_required
def staff_ping():
    now = datetime.now()
    cutoff = now - timedelta(seconds=30)
    
    # Prune old users
    stale_keys = [uid for uid, data in ONLINE_STAFF.items() if data["last_seen"] < cutoff]
    for k in stale_keys:
        del ONLINE_STAFF[k]
        
    # Update current user
    cu = request.cu
    ONLINE_STAFF[cu["id"]] = {
        "username": cu["username"],
        "role": cu["role"],
        "last_seen": now
    }
    
    # Return active users
    active = [{"username": d["username"], "role": d["role"]} for d in ONLINE_STAFF.values()]
    return jsonify(active)

STAFF_WEBHOOK = "https://discord.com/api/webhooks/1495099642671792261/LA6pwnEjA74swShTjPwX5qT5iBh_xHUBh6elQS8RK_OZF7anxO5hsXoIlBUsPSRvPavj"

@app.route("/api/staff/channels", methods=["GET"])
@staff_required
def staff_channels_list():
    db = get_db(); c = db_cursor(db)
    if _DB_MODE == "mysql":
        c.execute("SELECT * FROM hc_staff_channels ORDER BY name ASC")
    else:
        c.execute("SELECT * FROM hc_staff_channels ORDER BY name ASC")
    rows = c.fetchall()
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
    db.commit()
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
    db.commit()
    log_audit(request.cu["id"], "delete_staff_channel", cid)
    return jsonify({"success":True})

@app.route("/api/staff/channels/<int:cid>/messages", methods=["GET"])
@staff_required
def staff_messages_list(cid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT m.*, u.username, u.role FROM hc_staff_messages m "
              f"JOIN hc_users u ON m.author_id=u.id WHERE m.channel_id={ph()} "
              f"ORDER BY m.created_at DESC LIMIT 50", (cid,))
    rows = c.fetchall()
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
    db.commit()

    # Background Tasks (Pusher + Discord)
    def background_broadcast(ch_name):
        # Pusher Broadcast
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

        # Discord Bridge
        try:
            import requests
            requests.post(STAFF_WEBHOOK, json={
                "embeds": [{
                    "author": {"name": f"{request.cu['username']} [{request.cu['role'].upper()}]"},
                    "description": content,
                    "footer": {"text": f"Sent in {ch_name}"},
                    "color": 0xFF512F
                }]
            }, timeout=5)
        except: pass

    threading.Thread(target=background_broadcast, args=(ch["name"] if ch else "#unknown",)).start()

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
# BACKGROUND STATUS WORKER
# -------------------------------------------------------
def status_worker():
    """Polls the Minecraft server every 60s and saves to hc_player_history."""
    print("[STATUS WORKER] Starting background polling...")
    server_ip = "mc.hellcore.net"
    api_url = f"https://api.mcsrvstat.us/3/{server_ip}"
    
    while True:
        try:
            # Poll mcsrvstat.us
            req = urllib.request.Request(api_url, headers={"User-Agent": "HellcoreStatus/1.0"})
            with urllib.request.urlopen(req, timeout=10) as res:
                data = json.loads(res.read().decode())
                
            online = 1 if data.get("online") else 0
            players = data.get("players", {}).get("online", 0)
            
            # Save to DB
            db = get_db(); c = db_cursor(db)
            c.execute("INSERT INTO hc_player_history (timestamp, total_players) VALUES (?, ?)",
                      (datetime.now(), players))
            
            # Keep only last 1000 points (~16 hours of tracking)
            c.execute("DELETE FROM hc_player_history WHERE id NOT IN (SELECT id FROM hc_player_history ORDER BY timestamp DESC LIMIT 1000)")
            
            db.commit()
            # print(f"[STATUS WORKER] Recorded {players} players online.")
            
        except Exception as e:
            print(f"[STATUS WORKER] Error: {e}")
            
        time.sleep(60)

# -------------------------------------------------------
# RUN
# -------------------------------------------------------
if __name__ == "__main__":
    with app.app_context():
        try:
            init_db()
        except Exception as e:
            print(f"[ERROR] DB init error: {e}")
    app.run(host="0.0.0.0", port=8080)
else:
    # Gunicorn path
    with app.app_context():
        try:
            init_db()
        except Exception as e:
            print(f"[ERROR] DB init error: {e}")

if __name__ == "__main__":
    print("=" * 56)
    print("  HELLCORE NETWORK — Backend v7")
    print("=" * 56)
    
    # Start background polling
    threading.Thread(target=status_worker, daemon=True).start()
    
    print("=" * 56)
    print("  Running on http://localhost:5000")
    print("=" * 56)
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
