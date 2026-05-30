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
import hmac
import re
import traceback
import secrets
import io
import base64
import threading
import random
import datetime as dt
from datetime import datetime, timedelta
from collections import defaultdict, deque
from functools import wraps
from html import escape as html_escape
import urllib.request
import urllib.error
import urllib.parse
import mysql.connector
from mysql.connector import pooling
import sys
# Ensure store directory is in path for shared_store import
store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "store")
if store_dir not in sys.path:
    sys.path.append(store_dir)

from shared_store import build_purchase_metadata, rank_payload, notify_discord_ticket

# Load environment variables for local testing
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from flask import Flask, request, jsonify, render_template, send_from_directory, Response, redirect, g, session

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "hc-shield-" + hashlib.sha256(b"hellcore-net-2026").hexdigest()[:32])

# ═══════════════════════════════════════════════════════════════════
# ██████  DDoS PROTECTION SYSTEM  ██████████████████████████████████
# ═══════════════════════════════════════════════════════════════════
#
#  Layers:
#  1. Permanent IP ban list (manual + auto-escalated)
#  2. Temporary IP ban (auto-triggered on threshold breach)
#  3. Per-IP sliding-window rate limiter
#  4. Global flood guard (total req/s across all IPs)
#  5. Suspicious User-Agent / bot fingerprint blocking
#  6. Progressive strike system (3 strikes → temp-ban)
#
# ═══════════════════════════════════════════════════════════════════

import math

# ── tunables ──────────────────────────────────────────────────────
DDOS_ENABLED               = True   # master switch

# Per-IP limits  (requests per window)
DDOS_IP_LIMIT_SHORT        = 60     # max req in SHORT window
DDOS_IP_WINDOW_SHORT       = 10     # seconds  (6 req/s sustained)
DDOS_IP_LIMIT_LONG         = 600    # max req in LONG window
DDOS_IP_WINDOW_LONG        = 60     # seconds  (10 req/s sustained)

# Auto-temp-ban after N violations
DDOS_STRIKE_THRESHOLD      = 3      # strikes before temp-ban
DDOS_TEMP_BAN_SECONDS      = 300    # 5 min temp-ban per violation burst
DDOS_TEMP_BAN_MAX_SECONDS  = 86400  # cap at 24h regardless of escalations

# Global flood guard
DDOS_GLOBAL_LIMIT          = 2000   # total req per global window
DDOS_GLOBAL_WINDOW         = 5      # seconds

# Whitelist — these IPs are NEVER rate-limited (add your server IPs here)
DDOS_WHITELIST_IPS = set(os.environ.get("DDOS_WHITELIST_IPS", "127.0.0.1,::1").split(","))

# Permanent ban list — loaded from env + runtime admin calls
_DDOS_PERM_BANS_ENV = set(filter(None, os.environ.get("DDOS_PERM_BAN_IPS", "").split(",")))

# Suspicious user-agents (exact substrings, case-insensitive)
DDOS_BAD_UA_PATTERNS = [
    "python-requests", "go-http-client", "libwww-perl", "curl/",
    "java/", "masscan", "zgrab", "nikto", "sqlmap", "nmap",
    "dirbuster", "wfuzz", "hydra", "burpsuite", "nuclei",
    "scrapy", "wget/", "httpclient", "http_request",
]

# Paths that are public and explicitly excluded from strict limits
DDOS_RELAXED_PREFIXES = ("/static/", "/favicon")

# Discord webhook for attack alerts (falls back to STAFF_WEBHOOK if not set)
DDOS_DISCORD_WEBHOOK = (
    os.environ.get("DDOS_ALERT_WEBHOOK") or
    os.environ.get("STAFF_WEBHOOK") or ""
)
# Cooldown between Discord alerts (seconds) — prevents spam
DDOS_DISCORD_COOLDOWN   = 60
_ddos_last_alert_ts     = 0.0   # last time we sent an alert




AFK_XP_PER_SESSION = 5
AFK_SESSION_SECONDS = 300
AFK_DAILY_XP_CAP = 60
AD_DAILY_LIMIT = max(1, AFK_DAILY_XP_CAP // AFK_XP_PER_SESSION)
AD_COOLDOWN_SECONDS = 0
AD_MIN_DURATION_SECONDS = AFK_SESSION_SECONDS
AD_COMPLETION_WINDOW_SECONDS = 900
AD_IP_COMPLETION_LIMIT = 60
AD_IP_COMPLETION_WINDOW_SECONDS = 3600
AD_TOKEN_SECRET = os.environ.get("HC_AD_TOKEN_SECRET", "hellcore-ad-token-secret")
AD_PROOF_SECRET = os.environ.get("HC_AD_PROOF_SECRET", "hellcore-mock-ad-proof-v1")
AD_IP_COMPLETIONS = defaultdict(deque)
AD_IP_COMPLETIONS_LOCK = threading.Lock()
STORE_RANK_SEEDS = [
    {
        "name": "Bronze",
        "xp_cost": 100,
        "tier_order": 1,
        "perks": [
            "Bronze chat badge",
            "Starter profile flair",
            "Unlocks Bronze-only showcase frame",
        ],
    },
    {
        "name": "Silver",
        "xp_cost": 250,
        "tier_order": 2,
        "perks": [
            "Silver chat badge",
            "Profile card accent upgrade",
            "Priority access to seasonal badge drops",
        ],
    },
    {
        "name": "Gold",
        "xp_cost": 500,
        "tier_order": 3,
        "perks": [
            "Gold chat badge",
            "Animated profile shine",
            "Exclusive Gold lobby cosmetics pack",
        ],
    },
]
MOCK_AD_PAYLOAD = {
    "id": "hellcore-afk-session",
    "title": "Hellcore AFK XP Session",
    "description": "Keep this tab open for 5 minutes to earn AFK XP.",
    "duration_seconds": AD_MIN_DURATION_SECONDS,
    "reward_range": {"min": AFK_XP_PER_SESSION, "max": AFK_XP_PER_SESSION},
    "creative_type": "afk",
}

@app.after_request
def add_header(r):
    """Disable caching for all API responses"""
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    return r

@app.route("/rbw")
def rbw_redirect():
    html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Hellcore Network RBW</title>
    <meta name="description" content="Click to join the RBW Discord server.">
    <meta property="og:title" content="Hellcore Network RBW">
    <meta property="og:description" content="Click here to join the RBW Discord server!">
    <meta property="og:image" content="https://hellcore.net/static/logo.png">
    <meta property="og:url" content="https://hellcore.net/rbw">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="theme-color" content="#FF512F">
    <meta http-equiv="refresh" content="0; url=https://discord.gg/nnBrfme7Wk">
    <script>window.location.href = "https://discord.gg/nnBrfme7Wk";</script>
</head>
<body style="background:#09090b; color:#fff; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh;">
    <p>Redirecting to Discord... <a href="https://discord.gg/nnBrfme7Wk" style="color:#FF512F;">Click here</a> if not redirected.</p>
</body>
</html>"""
    return Response(html, mimetype="text/html")

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
RAILWAY_HOST     = os.environ.get("MYSQL_HOST") or os.environ.get("MYSQLHOST") or ""
RAILWAY_PORT     = int(os.environ.get("MYSQL_PORT") or os.environ.get("MYSQLPORT") or 3306)
RAILWAY_USER     = os.environ.get("MYSQL_USER") or os.environ.get("MYSQLUSER") or "root"
RAILWAY_PASSWORD = os.environ.get("MYSQL_PASSWORD") or os.environ.get("MYSQLPASSWORD") or ""
RAILWAY_DATABASE = os.environ.get("MYSQL_DATABASE") or os.environ.get("MYSQLDATABASE") or "railway"

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


def utcnow():
    return datetime.utcnow()


def parse_db_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, dt.date):
        return datetime.combine(value, datetime.min.time())
    raw = str(value).strip()
    if not raw:
        return None
    cleaned = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(cleaned)
        if parsed.tzinfo:
            return parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
        return parsed
    except Exception:
        pass
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(raw, fmt)
        except Exception:
            continue
    return None


def isoformat_utc(value):
    parsed = parse_db_datetime(value)
    return parsed.strftime("%Y-%m-%dT%H:%M:%SZ") if parsed else None


def get_user_ad_block_state(user_row, now=None):
    now = now or utcnow()
    blocked_until = parse_db_datetime((user_row or {}).get("ads_blocked_until"))
    manual_block = bool((user_row or {}).get("ads_blocked"))
    active = manual_block or (blocked_until and blocked_until > now)
    return {
        "blocked": bool(active),
        "reason": (user_row or {}).get("ads_block_reason") or "",
        "until": isoformat_utc(blocked_until),
    }


def utc_day_bounds(now=None):
    now = now or utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    return (request.remote_addr or "unknown").strip() or "unknown"


TICKET_UPLOAD_FIELDS = {
    "ticket_id",
    "user_id",
    "username",
    "staff_id",
    "channel_id",
    "category",
    "opened_at",
    "closed_at",
    "transcript",
    "attachments",
    "close_reason",
}


def ticket_upload_auth_status():
    bot_secret = os.environ.get("HC_BOT_SECRET", "hellcore-secret-123")
    website_key = os.environ.get("WEBSITE_API_KEY", "hellcore_secret_key")
    provided_secret = request.headers.get("X-Bot-Secret", "")
    provided_key = request.headers.get("X-API-Key", "")
    secret_ok = bool(bot_secret and provided_secret and hmac.compare_digest(provided_secret, bot_secret))
    key_ok = bool(website_key and provided_key and hmac.compare_digest(provided_key, website_key))
    return {
        "ok": secret_ok or key_ok,
        "method": "bot_secret" if secret_ok else ("api_key" if key_ok else ""),
        "provided_any": bool(provided_secret or provided_key),
        "provided_both": bool(provided_secret and provided_key),
    }


def public_headers_snapshot():
    sensitive = {"authorization", "cookie", "x-api-key", "x-bot-secret"}
    out = {}
    for key, value in request.headers.items():
        if key.lower() in sensitive:
            out[key] = "[redacted]"
        else:
            out[key] = str(value)[:1000]
    return out


def valid_isoish_datetime(value):
    raw = str(value or "").strip()
    if not raw:
        return False
    try:
        datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return True
    except Exception:
        return False


def ticket_quality_level(score):
    score = max(0, min(100, int(score)))
    if score <= 30:
        return "weak"
    if score <= 70:
        return "needs review"
    return "solid"


def score_ticket_upload_payload(data, auth_status):
    score = 100
    notes = []
    errors = []

    if not isinstance(data, dict):
        return 0, "weak", ["Request body must be a JSON object."], ["Request body must be a JSON object."]

    missing = [field for field in TICKET_UPLOAD_FIELDS if field not in data]
    if missing:
        score -= min(60, 15 * len(missing))
        msg = "Missing required fields: " + ", ".join(sorted(missing))
        notes.append(msg)
        errors.append(msg)

    unexpected = sorted(set(data.keys()) - TICKET_UPLOAD_FIELDS)
    if unexpected:
        score -= min(25, 5 * len(unexpected))
        notes.append("Unexpected fields: " + ", ".join(unexpected[:12]))

    ticket_id = str(data.get("ticket_id") or "").strip()
    if "ticket_id" in data and not ticket_id:
        score -= 15
        errors.append("ticket_id cannot be empty.")
        notes.append("Empty ticket_id.")
    elif ticket_id and not re.fullmatch(r"[A-Za-z0-9_.:-]{3,100}", ticket_id):
        score -= 20
        errors.append("ticket_id must be 3-100 stable characters.")
        notes.append("Invalid ticket_id format.")

    for field in ("user_id", "staff_id", "channel_id"):
        value = str(data.get(field) or "").strip()
        if field in data and not value:
            score -= 10
            errors.append(f"{field} cannot be empty.")
            notes.append(f"Empty {field}.")
        elif value and not re.fullmatch(r"[0-9]{3,32}", value):
            score -= 8
            notes.append(f"{field} is not a normal Discord snowflake-style ID.")

    username = str(data.get("username") or "").strip()
    if "username" in data and not username:
        score -= 10
        errors.append("username cannot be empty.")
        notes.append("Empty username.")

    category = str(data.get("category") or "").strip()
    if "category" in data and not category:
        score -= 8
        errors.append("category cannot be empty.")
        notes.append("Empty category.")

    transcript = str(data.get("transcript") or "").strip()
    if "transcript" in data and not transcript:
        score -= 25
        errors.append("transcript cannot be empty.")
        notes.append("Empty transcript.")

    if "close_reason" in data and not str(data.get("close_reason") or "").strip():
        score -= 8
        notes.append("Missing close reason.")

    for field in ("opened_at", "closed_at"):
        if field in data and not valid_isoish_datetime(data.get(field)):
            score -= 15
            errors.append(f"{field} must be an ISO timestamp.")
            notes.append(f"Invalid {field} timestamp.")

    attachments = data.get("attachments")
    if "attachments" in data:
        if not isinstance(attachments, list):
            score -= 20
            errors.append("attachments must be a JSON array.")
            notes.append("Malformed attachments; expected array.")
        else:
            for idx, item in enumerate(attachments[:20]):
                if not isinstance(item, (dict, str)):
                    score -= 5
                    notes.append(f"Attachment #{idx + 1} has an unusual shape.")
                    break

    ua = request.headers.get("User-Agent", "").strip()
    if not ua:
        score -= 10
        notes.append("Missing user-agent.")
    elif re.search(r"(chatgpt|openai|copilot|generated|ai-tool|curl|python-requests)", ua, re.I):
        score -= 15
        notes.append("Unusual/generated-looking user-agent.")

    if not auth_status.get("provided_any"):
        score -= 30
        notes.append("No auth header supplied.")
    elif auth_status.get("provided_both"):
        score -= 5
        notes.append("Both API key and bot secret were sent; one auth method is enough.")

    score = max(0, min(100, score))
    if not notes:
        notes.append("Clean upload shape.")
    return score, ticket_quality_level(score), notes, errors


def record_ticket_upload_attempt(ticket_id, raw_body, headers_json, outcome, score, level, notes):
    try:
        db = get_db(); c = db_cursor(db)
        c.execute(
            f"INSERT INTO hc_discord_ticket_upload_attempts(ticket_id,uploader_ip,user_agent,headers_json,raw_body,outcome,quality_score,quality_level,quality_notes) VALUES({phs(9)})",
            (
                str(ticket_id or "")[:100],
                get_client_ip(),
                request.headers.get("User-Agent", "")[:255],
                headers_json,
                raw_body,
                outcome,
                int(score),
                level,
                "\n".join(notes or []),
            ),
        )
        db.commit()
    except Exception as e:
        print(f"[WARN] Failed to record ticket upload attempt: {e}")


def apies_required(f):
    @wraps(f)
    def w(*a, **k):
        if session.get("apies_authorized"):
            return f(*a, **k)
        return jsonify({"error": "Ticket panel password required"}), 403
    return w


def serialize_discord_ticket_row(row):
    d = to_dict(row)
    if not d:
        return None
    d["created_at"] = isoformat_utc(d.get("created_at"))
    try:
        d["attachments"] = json.loads(d.get("attachments") or "[]")
    except Exception:
        d["attachments"] = []
    try:
        d["headers"] = json.loads(d.get("headers_json") or "{}")
    except Exception:
        d["headers"] = {}
    d.pop("headers_json", None)
    return d


def sign_ad_token(token_uuid):
    signature = hmac.new(
        AD_TOKEN_SECRET.encode("utf-8"),
        token_uuid.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{token_uuid}.{signature}"


def verify_ad_token_signature(token):
    if "." not in str(token):
        return False
    token_uuid, provided = str(token).split(".", 1)
    expected = sign_ad_token(token_uuid).split(".", 1)[1]
    return hmac.compare_digest(provided, expected)


def build_completion_proof(token):
    return hashlib.sha256(f"{token}{AD_PROOF_SECRET}".encode("utf-8")).hexdigest()


def prune_ip_completion_window(ip_address, now=None):
    now = now or utcnow()
    window_start = now - timedelta(seconds=AD_IP_COMPLETION_WINDOW_SECONDS)
    with AD_IP_COMPLETIONS_LOCK:
        bucket = AD_IP_COMPLETIONS[ip_address]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        return bucket


def is_ip_completion_limited(ip_address, now=None):
    bucket = prune_ip_completion_window(ip_address, now=now)
    return len(bucket) >= AD_IP_COMPLETION_LIMIT


def record_ip_completion(ip_address, now=None):
    bucket = prune_ip_completion_window(ip_address, now=now)
    with AD_IP_COMPLETIONS_LOCK:
        bucket.append(now or utcnow())


def parse_rank_perks(value):
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def serialize_store_rank(row):
    data = to_dict(row)
    if not data:
        return None
    return {
        "id": data["id"],
        "name": data["name"],
        "xp_cost": int(data.get("xp_cost") or 0),
        "tier_order": int(data.get("tier_order") or 0),
        "perks": parse_rank_perks(data.get("perks")),
    }


def get_store_rank_by_id(cursor, rank_id):
    if not rank_id:
        return None
    cursor.execute(f"SELECT * FROM hc_xp_ranks WHERE id={ph()}", (rank_id,))
    return serialize_store_rank(cursor.fetchone())


def get_all_store_ranks(cursor):
    cursor.execute("SELECT * FROM hc_xp_ranks ORDER BY tier_order ASC, xp_cost ASC, id ASC")
    return [serialize_store_rank(row) for row in to_list(cursor.fetchall())]


def log_xp_transaction(cursor, user_id, amount, balance_after, reason, reference_type="", reference_id=0, metadata=None):
    cursor.execute(
        f"""INSERT INTO hc_xp_transactions
            (user_id, amount, balance_after, reason, reference_type, reference_id, metadata, created_at)
            VALUES ({ph()}, {ph()}, {ph()}, {ph()}, {ph()}, {ph()}, {ph()}, {ph()})""",
        (
            user_id,
            int(amount),
            int(balance_after),
            reason,
            reference_type,
            int(reference_id or 0),
            json.dumps(metadata or {}),
            utcnow(),
        ),
    )


def get_current_store_rank(cursor, user_id):
    cursor.execute(f"SELECT current_xp, rank_id FROM hc_users WHERE id={ph()}", (user_id,))
    user_row = to_dict(cursor.fetchone()) or {}
    rank = get_store_rank_by_id(cursor, user_row.get("rank_id"))
    return {
        "current_xp": int(user_row.get("current_xp") or 0),
        "rank": rank,
    }


def get_latest_completed_ad(cursor, user_id):
    cursor.execute(
        f"""SELECT completed_at FROM hc_ad_watches
            WHERE user_id={ph()} AND completed_at IS NOT NULL
            ORDER BY completed_at DESC LIMIT 1""",
        (user_id,),
    )
    row = to_dict(cursor.fetchone())
    return parse_db_datetime(row.get("completed_at")) if row else None


def get_active_ad_watch(cursor, user_id, now=None):
    now = now or utcnow()
    lower_bound = now - timedelta(seconds=AD_COMPLETION_WINDOW_SECONDS)
    cursor.execute(
        f"""SELECT * FROM hc_ad_watches
            WHERE user_id={ph()} AND completed_at IS NULL AND started_at >= {ph()}
            ORDER BY started_at DESC LIMIT 1""",
        (user_id, lower_bound),
    )
    return to_dict(cursor.fetchone())


def get_daily_ad_watch_count(cursor, user_id, now=None):
    day_start, day_end = utc_day_bounds(now=now)
    cursor.execute(
        f"""SELECT COUNT(*) AS count FROM hc_ad_watches
            WHERE user_id={ph()} AND started_at >= {ph()} AND started_at < {ph()} AND status='completed'""",
        (user_id, day_start, day_end),
    )
    row = to_dict(cursor.fetchone()) or {}
    return int(row.get("count") or row.get("COUNT(*)") or 0)


def get_daily_reward_xp(cursor, user_id, now=None):
    day_start, day_end = utc_day_bounds(now=now)
    cursor.execute(
        f"""SELECT COALESCE(SUM(xp_awarded), 0) AS total_xp FROM hc_ad_watches
            WHERE user_id={ph()} AND started_at >= {ph()} AND started_at < {ph()} AND status='completed'""",
        (user_id, day_start, day_end),
    )
    row = to_dict(cursor.fetchone()) or {}
    return int(row.get("total_xp") or row.get("SUM(xp_awarded)") or 0)


def get_next_ad_available_at(cursor, user_id, now=None):
    now = now or utcnow()
    last_completed = get_latest_completed_ad(cursor, user_id)
    if not last_completed:
        return None
    next_time = last_completed + timedelta(seconds=AD_COOLDOWN_SECONDS)
    return next_time if next_time > now else None


def get_reward_profile(cursor, user_id, now=None):
    now = now or utcnow()
    current = get_current_store_rank(cursor, user_id)
    cursor.execute(
        f"SELECT ads_blocked, ads_block_reason, ads_blocked_until FROM hc_users WHERE id={ph()}",
        (user_id,),
    )
    user_row = to_dict(cursor.fetchone()) or {}
    ad_block = get_user_ad_block_state(user_row, now=now)
    daily_ads_watched = get_daily_ad_watch_count(cursor, user_id, now=now)
    daily_xp_earned = get_daily_reward_xp(cursor, user_id, now=now)
    next_available = get_next_ad_available_at(cursor, user_id, now=now)
    active_watch = get_active_ad_watch(cursor, user_id, now=now)
    if active_watch:
        active_started_at = parse_db_datetime(active_watch.get("started_at")) or now
        active_retry = active_started_at + timedelta(seconds=AD_COMPLETION_WINDOW_SECONDS)
        if not next_available or active_retry > next_available:
            next_available = active_retry
    else:
        active_started_at = None
        active_retry = None
    return {
        "current_xp": current["current_xp"],
        "rank": current["rank"],
        "ads_today": daily_ads_watched,
        "ads_remaining": max(0, AD_DAILY_LIMIT - daily_ads_watched),
        "daily_xp_earned": daily_xp_earned,
        "daily_xp_remaining": max(0, AFK_DAILY_XP_CAP - daily_xp_earned),
        "xp_per_session": AFK_XP_PER_SESSION,
        "session_seconds": AFK_SESSION_SECONDS,
        "daily_xp_cap": AFK_DAILY_XP_CAP,
        "next_ad": isoformat_utc(next_available),
        "active_ad_in_progress": bool(active_watch),
        "active_session_token": active_watch.get("ad_token") if active_watch else "",
        "active_session_started_at": isoformat_utc(active_started_at) if active_started_at else None,
        "active_session_expires_at": isoformat_utc(active_retry) if active_retry else None,
        "ads_blocked": ad_block["blocked"],
        "ads_block_reason": ad_block["reason"],
        "ads_blocked_until": ad_block["until"],
        "daily_ads_watched": daily_ads_watched,
        "ads_remaining_today": max(0, AD_DAILY_LIMIT - daily_ads_watched),
        "next_ad_available_at": isoformat_utc(next_available),
    }


def normalize_rank_command_name(value):
    text = str(value or "").strip().lower()
    aliases = {
        "vip": "vip",
        "vip+": "vip+",
        "vip plus": "vip+",
        "mvp": "mvp",
        "mvp+": "mvp+",
        "mvp plus": "mvp+",
        "mvp++": "mvp++",
        "mvp plus plus": "mvp++",
    }
    return aliases.get(text, text)


def canonical_rank_display(value):
    normalized = normalize_rank_command_name(value)
    labels = {
        "vip": "VIP",
        "vip+": "VIP+",
        "mvp": "MVP",
        "mvp+": "MVP+",
        "mvp++": "MVP++",
    }
    return labels.get(normalized, str(value or "").strip())


def resolve_purchase_username(user_row):
    row = user_row or {}
    return str(row.get("mc_username") or row.get("username") or "").strip()


def seed_store_ranks(cursor):
    for rank in STORE_RANK_SEEDS:
        cursor.execute(f"SELECT id FROM hc_xp_ranks WHERE name={ph()}", (rank["name"],))
        existing = to_dict(cursor.fetchone())
        if existing:
            cursor.execute(
                f"""UPDATE hc_xp_ranks
                    SET xp_cost={ph()}, tier_order={ph()}, perks={ph()}
                    WHERE id={ph()}""",
                (
                    rank["xp_cost"],
                    rank["tier_order"],
                    json.dumps(rank["perks"]),
                    existing["id"],
                ),
            )
        else:
            cursor.execute(
                f"""INSERT INTO hc_xp_ranks(name, xp_cost, tier_order, perks, created_at)
                    VALUES({ph()}, {ph()}, {ph()}, {ph()}, {ph()})""",
                (
                    rank["name"],
                    rank["xp_cost"],
                    rank["tier_order"],
                    json.dumps(rank["perks"]),
                    utcnow(),
                ),
            )


MAIN_SPA_ROUTES = {
    "",
    "about",
    "admin",
    "cart",
    "forums",
    "games",
    "players",
    "profile",
    "rules",
    "staff",
    "store",
    "store/bw",
    "store/free",
    "store/sw",
    "tickets",
}

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
    HTML_TEXT = "LONGTEXT" if mysql else "TEXT"

    tables = [
f"""CREATE TABLE IF NOT EXISTS hc_users(
  id INTEGER PRIMARY KEY {AI},
  email VARCHAR(200) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  mc_username VARCHAR(50) DEFAULT '',
  is_verified INTEGER DEFAULT 0,
  discord_id VARCHAR(50) DEFAULT '',
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
  xp INTEGER DEFAULT 0,
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
  source_app VARCHAR(32) DEFAULT 'main',
  details_json TEXT,
  rank_snapshot TEXT,
  mc_username VARCHAR(50) DEFAULT '',
  created_at {DT})""",

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
  author_id INTEGER, -- Nullable for guests
  email VARCHAR(200), -- For guests
  source VARCHAR(50) DEFAULT 'web', -- e.g. 'store', 'web'
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

f"""CREATE TABLE IF NOT EXISTS hc_ticket_transcripts(
  id INTEGER PRIMARY KEY {AI},
  public_id VARCHAR(80) UNIQUE NOT NULL,
  guild_id VARCHAR(40) DEFAULT '',
  guild_name VARCHAR(200) DEFAULT '',
  channel_id VARCHAR(40) DEFAULT '',
  channel_name VARCHAR(120) DEFAULT '',
  owner_id VARCHAR(40) DEFAULT '',
  ticket_type VARCHAR(80) DEFAULT '',
  ticket_type_label VARCHAR(120) DEFAULT '',
  claimed_staff_id VARCHAR(40) DEFAULT '',
  status VARCHAR(40) DEFAULT '',
  priority VARCHAR(40) DEFAULT '',
  created_time VARCHAR(80) DEFAULT '',
  requested_by_id VARCHAR(40) DEFAULT '',
  requested_by_name VARCHAR(120) DEFAULT '',
  reason TEXT,
  filename VARCHAR(200) DEFAULT '',
  html {HTML_TEXT} NOT NULL,
  created_at {DT},
  updated_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_discord_ticket_logs(
  id INTEGER PRIMARY KEY {AI},
  ticket_id VARCHAR(100) UNIQUE NOT NULL,
  user_id VARCHAR(60) NOT NULL,
  username VARCHAR(120) NOT NULL,
  staff_id VARCHAR(60) NOT NULL,
  channel_id VARCHAR(60) NOT NULL,
  category VARCHAR(80) NOT NULL,
  opened_at VARCHAR(80) NOT NULL,
  closed_at VARCHAR(80) NOT NULL,
  transcript {HTML_TEXT} NOT NULL,
  attachments TEXT,
  close_reason TEXT,
  uploader_ip VARCHAR(80) DEFAULT '',
  user_agent VARCHAR(255) DEFAULT '',
  headers_json TEXT,
  raw_body {HTML_TEXT},
  quality_score INTEGER DEFAULT 100,
  quality_level VARCHAR(30) DEFAULT 'solid',
  quality_notes TEXT,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_discord_ticket_upload_attempts(
  id INTEGER PRIMARY KEY {AI},
  ticket_id VARCHAR(100) DEFAULT '',
  uploader_ip VARCHAR(80) DEFAULT '',
  user_agent VARCHAR(255) DEFAULT '',
  headers_json TEXT,
  raw_body {HTML_TEXT},
  outcome VARCHAR(40) DEFAULT '',
  quality_score INTEGER DEFAULT 0,
  quality_level VARCHAR(30) DEFAULT 'weak',
  quality_notes TEXT,
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

f"""CREATE TABLE IF NOT EXISTS hc_xp_ranks(
  id INTEGER PRIMARY KEY {AI},
  name VARCHAR(40) NOT NULL UNIQUE,
  xp_cost INTEGER NOT NULL,
  tier_order INTEGER NOT NULL UNIQUE,
  perks TEXT,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_xp_transactions(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER DEFAULT 0,
  reason VARCHAR(50) NOT NULL,
  reference_type VARCHAR(50) DEFAULT '',
  reference_id INTEGER DEFAULT 0,
  metadata TEXT,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_rank_purchases(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  rank_id INTEGER NOT NULL,
  previous_rank_id INTEGER DEFAULT 0,
  xp_spent INTEGER NOT NULL,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_ad_watches(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  ad_token VARCHAR(255) NOT NULL UNIQUE,
  token_uuid VARCHAR(64) NOT NULL UNIQUE,
  token_signature VARCHAR(128) NOT NULL,
  session_fingerprint VARCHAR(255) DEFAULT '',
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  completion_proof VARCHAR(128) DEFAULT '',
  xp_awarded INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  failure_reason VARCHAR(50) DEFAULT '',
  last_attempt_at DATETIME,
  ip_address VARCHAR(64) DEFAULT '',
  completion_ip VARCHAR(64) DEFAULT '',
  status VARCHAR(20) DEFAULT 'started',
  ad_payload TEXT,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_command_queue(
  id INTEGER PRIMARY KEY {AI},
  command VARCHAR(255) NOT NULL,
  target VARCHAR(20) DEFAULT 'proxy',
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
f"""CREATE TABLE IF NOT EXISTS hc_temp_tokens(
  token VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL)""",
f"""CREATE TABLE IF NOT EXISTS hc_trials(
  id INTEGER PRIMARY KEY {AI},
  title VARCHAR(100) NOT NULL,
  gamemode VARCHAR(30) NOT NULL,
  rank_name VARCHAR(30) NOT NULL,
  duration_days INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at {DT})""",
f"""CREATE TABLE IF NOT EXISTS hc_user_trials(
  id INTEGER PRIMARY KEY {AI},
  user_id INTEGER NOT NULL,
  trial_id INTEGER NOT NULL,
  claimed_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_tournament_teams(
  id INTEGER PRIMARY KEY {AI},
  team_name VARCHAR(80) NOT NULL,
  logo_url VARCHAR(500) DEFAULT '',
  captain_user_id INTEGER NOT NULL,
  invite_token VARCHAR(80) UNIQUE NOT NULL,
  status VARCHAR(30) DEFAULT 'incomplete',
  created_at {DT},
  updated_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_tournament_members(
  id INTEGER PRIMARY KEY {AI},
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  discord_id VARCHAR(50) NOT NULL,
  discord_input VARCHAR(120) DEFAULT '',
  minecraft_ign_snapshot VARCHAR(50) NOT NULL,
  minecraft_ign_lc VARCHAR(50) NOT NULL,
  rbw_uuid VARCHAR(80) DEFAULT '',
  rbw_source VARCHAR(80) DEFAULT 'hc_users',
  verification_code VARCHAR(4) DEFAULT '',
  verification_status VARCHAR(30) DEFAULT 'pending',
  verified_user_id INTEGER DEFAULT 0,
  verified_at DATETIME,
  code_used_at DATETIME,
  code_expires_at DATETIME,
  role VARCHAR(20) DEFAULT 'member',
  joined_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_tournament_logs(
  id INTEGER PRIMARY KEY {AI},
  action_type VARCHAR(80) NOT NULL,
  user_id INTEGER,
  staff_user_id INTEGER,
  team_id INTEGER,
  details_json TEXT,
  created_at {DT})""",

f"""CREATE TABLE IF NOT EXISTS hc_tournament_settings(
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at {DT})""",
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
    
    for col in ["email", "source"]:
        try: c.execute(f"ALTER TABLE hc_tickets ADD COLUMN {col} VARCHAR(200)")
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
        "ALTER TABLE hc_ticket_msgs ADD COLUMN meta_json TEXT",
        "ALTER TABLE hc_stats ADD COLUMN xp INTEGER DEFAULT 0",
        "ALTER TABLE hc_ads ADD COLUMN last_ad_time DATETIME"
    ]:
        try: c.execute(sql)
        except: pass

    # MIGRATION: User last_seen
    try: 
        c.execute("ALTER TABLE hc_users ADD COLUMN last_seen DATETIME")
    except: 
        pass
    try: 
        c.execute("ALTER TABLE hc_users ADD COLUMN is_verified INTEGER DEFAULT 0")
    except:
        pass
    try:
        c.execute("ALTER TABLE hc_users ADD COLUMN current_xp INTEGER DEFAULT 0")
    except:
        pass
    try:
        c.execute("ALTER TABLE hc_users ADD COLUMN rank_id INTEGER DEFAULT NULL")
    except:
        pass
    try:
        c.execute("ALTER TABLE hc_users ADD COLUMN ads_blocked INTEGER DEFAULT 0")
    except:
        pass
    try:
        c.execute("ALTER TABLE hc_users ADD COLUMN ads_block_reason VARCHAR(255) DEFAULT ''")
    except:
        pass
    try:
        c.execute("ALTER TABLE hc_users ADD COLUMN ads_blocked_until DATETIME")
    except:
        pass
    try:
        c.execute("ALTER TABLE hc_users ADD COLUMN discord_id VARCHAR(50) DEFAULT ''")
    except:
        pass
    for sql in [
        "ALTER TABLE hc_users ADD COLUMN mc_uuid VARCHAR(80) DEFAULT ''",
        "ALTER TABLE hc_users ADD COLUMN verification_code VARCHAR(30) DEFAULT ''",
        "ALTER TABLE hc_users ADD COLUMN discord_username VARCHAR(120) DEFAULT ''",
        "ALTER TABLE hc_users ADD COLUMN discord_global_name VARCHAR(120) DEFAULT ''",
        "ALTER TABLE hc_users ADD COLUMN discord_avatar VARCHAR(255) DEFAULT ''",
        "ALTER TABLE hc_users ADD COLUMN discord_linked_at DATETIME",
        "ALTER TABLE hc_tournament_teams ADD COLUMN logo_url VARCHAR(500) DEFAULT ''",
        "ALTER TABLE hc_tournament_teams ADD COLUMN status VARCHAR(30) DEFAULT 'incomplete'",
        "ALTER TABLE hc_tournament_teams ADD COLUMN updated_at DATETIME",
        "ALTER TABLE hc_tournament_members ADD COLUMN minecraft_ign_lc VARCHAR(50) DEFAULT ''",
        "ALTER TABLE hc_tournament_members ADD COLUMN rbw_uuid VARCHAR(80) DEFAULT ''",
        "ALTER TABLE hc_tournament_members ADD COLUMN rbw_source VARCHAR(80) DEFAULT 'hc_users'",
        "ALTER TABLE hc_tournament_members ADD COLUMN discord_input VARCHAR(120) DEFAULT ''",
        "ALTER TABLE hc_tournament_members ADD COLUMN verification_code VARCHAR(4) DEFAULT ''",
        "ALTER TABLE hc_tournament_members ADD COLUMN verification_status VARCHAR(30) DEFAULT 'pending'",
        "ALTER TABLE hc_tournament_members ADD COLUMN verified_user_id INTEGER DEFAULT 0",
        "ALTER TABLE hc_tournament_members ADD COLUMN verified_at DATETIME",
        "ALTER TABLE hc_tournament_members ADD COLUMN code_used_at DATETIME",
        "ALTER TABLE hc_tournament_members ADD COLUMN code_expires_at DATETIME"
    ]:
        try:
            c.execute(sql)
        except:
            pass
    try:
        c.execute("ALTER TABLE hc_ranks ADD COLUMN expires_at DATETIME")
    except:
        pass

    db.commit() # <── Commit migrations
    for sql in [
        "ALTER TABLE hc_store_orders ADD COLUMN ticket_id INTEGER DEFAULT 0",
        "ALTER TABLE hc_store_orders ADD COLUMN order_code VARCHAR(32) DEFAULT ''",
        "ALTER TABLE hc_store_orders ADD COLUMN payment_method VARCHAR(32) DEFAULT 'upi'",
        "ALTER TABLE hc_store_orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending'",
        "ALTER TABLE hc_store_orders ADD COLUMN source_app VARCHAR(32) DEFAULT 'main'",
        "ALTER TABLE hc_store_orders ADD COLUMN details_json TEXT",
        "ALTER TABLE hc_store_orders ADD COLUMN rank_snapshot TEXT",
        "ALTER TABLE hc_command_queue ADD COLUMN target VARCHAR(20) DEFAULT 'proxy'"
    ]:
        try:
            c.execute(sql)
        except:
            pass
    for sql in [
        "ALTER TABLE hc_discord_ticket_logs ADD COLUMN quality_score INTEGER DEFAULT 100",
        "ALTER TABLE hc_discord_ticket_logs ADD COLUMN quality_level VARCHAR(30) DEFAULT 'solid'",
        "ALTER TABLE hc_discord_ticket_logs ADD COLUMN quality_notes TEXT",
        "ALTER TABLE hc_discord_ticket_logs ADD COLUMN headers_json TEXT",
        "ALTER TABLE hc_discord_ticket_logs ADD COLUMN raw_body TEXT",
        "ALTER TABLE hc_discord_ticket_logs ADD COLUMN uploader_ip VARCHAR(80) DEFAULT ''",
        "ALTER TABLE hc_discord_ticket_logs ADD COLUMN user_agent VARCHAR(255) DEFAULT ''"
    ]:
        try:
            c.execute(sql)
        except:
            pass
    db.commit()
    for key, value in [
        ("tournament_registration_open", "1"),
        ("tournament_max_teams", "12"),
        ("tournament_team_size", "4"),
    ]:
        try:
            if _DB_MODE == "sqlite":
                c.execute("INSERT OR IGNORE INTO hc_tournament_settings(setting_key,setting_value) VALUES(?,?)", (key, value))
            else:
                c.execute("INSERT IGNORE INTO hc_tournament_settings(setting_key,setting_value) VALUES(%s,%s)", (key, value))
        except Exception as e:
            print(f"  [DB WARN] Tournament setting init failed: {e}")
    db.commit()
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
    seed_store_ranks(c)
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
        c.execute(f"SELECT * FROM hc_users WHERE session_token={ph()}", (token,))
        row = c.fetchone()
        return to_dict(row)
    except Exception as e:
        print(f"[DB ERROR] Token lookup failed: {e}")
        return None

def auth_required(f):
    @wraps(f)
    def w(*a, **k):
        # SINGLE SOURCE OF TRUTH: HTTP-Only Cookie
        token = request.cookies.get("hc_token", "")
        u = get_user_by_token(token)
        
        if not u:
            # DIAGNOSTIC: Log the EXACT path that failed
            print(f"[AUTH] {request.path} Token: {token[:10] if token else 'NONE'}")
            return jsonify({"error":"Authentication failed. Please login again."}), 401
            
        request.cu = u; return f(*a, **k)
    return w

def staff_required(f):
    @wraps(f)
    def w(*a, **k):
        token = request.cookies.get("hc_token", "")
        u = get_user_by_token(token)
        if not u:
            print(f"[AUTH] STAFF {request.path} Token: {token[:10] if token else 'NONE'}")
            return jsonify({"error":"Staff access required"}), 401
        if u["role"] not in STAFF_ROLES: return jsonify({"error":"Staff required"}), 403
        request.cu = u; return f(*a, **k)
    return w

def admin_required(f):
    @wraps(f)
    def w(*a, **k):
        # Allow Bot Secret bypass
        bot_secret = os.environ.get("HC_BOT_SECRET", "")
        provided   = request.headers.get("X-Bot-Secret", "")
        if bot_secret and provided and hmac.compare_digest(provided, bot_secret):
            return f(*a, **k)

        token = request.cookies.get("hc_token", "")
        u = get_user_by_token(token)
        if not u:
            return jsonify({"error":"Admin access required"}), 401
        if u["role"] not in ADMIN_ROLES: return jsonify({"error":"Admin required"}), 403
        request.cu = u; return f(*a, **k)
    return w

def ddos_admin_required(f):
    """Secondary lock for DDoS panel"""
    @wraps(f)
    def w(*a, **k):
        # Always allow bot secret
        bot_secret = os.environ.get("HC_BOT_SECRET", "")
        provided   = request.headers.get("X-Bot-Secret", "")
        if bot_secret and provided and hmac.compare_digest(provided, bot_secret):
            return f(*a, **k)
            
        # Must be admin first (reuse logic or check session)
        token = request.cookies.get("hc_token", "")
        u = get_user_by_token(token)
        if not u or u["role"] not in ADMIN_ROLES:
            return jsonify({"error": "Admin access required"}), 401
            
        # Then check DDoS password
        if not session.get("ddos_authorized"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "DDoS Shield password required"}), 403
            return redirect("/admin/ddos") # Will trigger login UI
            
        return f(*a, **k)
    return w

def optional_auth(f):
    @wraps(f)
    def w(*a, **k):
        token = request.cookies.get("hc_token", "")
        request.cu = get_user_by_token(token)
        return f(*a, **k)
    return w


def current_user_optional():
    token = request.cookies.get("hc_token", "")
    return get_user_by_token(token)


def require_json():
    return request.get_json(silent=True) or {}


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
            
        c.execute(f"DELETE FROM hc_ranks WHERE user_id={ph()} AND expires_at IS NOT NULL AND expires_at < {ph()}", (user_id, datetime.now()))
        if owns_cursor and db: db.commit()
        
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


def enrich_user_with_rank(data, user_id=None, cursor=None):
    payload = get_rank_payload_for_user(user_id or data.get("id"), cursor)
    data["primary_rank"] = payload["primary_rank"]
    data["rank_details"] = payload["rank_details"]
    return data


def get_ticket_order_summary(ticket_id, cursor=None):
    if not ticket_id:
        return None
    owns_cursor = cursor is None
    db = None
    c = cursor
    try:
        if owns_cursor:
            db = get_db()
            c = db_cursor(db)
        c.execute(
            f"SELECT id, order_code, items, total, status, payment_method, payment_status, "
            f"source_app, details_json, rank_snapshot, mc_username, created_at "
            f"FROM hc_store_orders WHERE ticket_id={ph()} ORDER BY id DESC",
            (ticket_id,),
        )
        order = to_dict(c.fetchone())
        if not order:
            return None
        for field in ("items", "details_json", "rank_snapshot"):
            try:
                order[field] = json.loads(order.get(field) or "[]")
            except Exception:
                order[field] = [] if field == "items" else {}
        order["created_at"] = ts(order.get("created_at"))
        return order
    except Exception:
        traceback.print_exc()
        return None
    finally:
        if owns_cursor and c is not None:
            c.close()


def is_known_main_spa_path(path):
    clean = (path or "/").strip("/")
    if clean in MAIN_SPA_ROUTES:
        return True
    if clean.startswith("tickets/"):
        return True
    return False


def build_main_spa_response():
    return render_template("index.html", ad_completion_secret=AD_PROOF_SECRET), 200


def pusher_trigger(channel, event_name, payload):
    if not pusher_client:
        return
    try:
        pusher_client.trigger(channel, event_name, payload)
    except Exception:
        traceback.print_exc()


def emit_ticket_event(ticket_id, event_name, payload):
    if not ticket_id:
        return
    pusher_trigger(f"ticket-{ticket_id}", event_name, payload)
    if event_name in ("ticket-created", "ticket-updated"):
        pusher_trigger("tickets-global", event_name, payload)

def send_push_notification(user_ids, title, body, url=None, data=None):
    if not user_ids: return
    if isinstance(user_ids, (int, str)): user_ids = [user_ids]
    try:
        from pywebpush import webpush, WebPushException
        vapid_priv = os.environ.get("VAPID_PRIVATE_KEY")
        if not vapid_priv and os.path.exists(".env"):
             with open(".env", "r") as f:
                 for x in f:
                     if "VAPID_PRIVATE_KEY=" in x: vapid_priv = x.split("=")[1].strip()
        if vapid_priv and os.path.exists(vapid_priv):
            with open(vapid_priv, "r") as f: vapid_priv = f.read().strip()
        if not vapid_priv: return

        db = get_db(); c = db_cursor(db)
        phs_list = ",".join([ph()] * len(user_ids))
        c.execute(f"SELECT endpoint, p256dh, auth FROM hc_push_subs WHERE user_id IN ({phs_list})", tuple(user_ids))
        subs = to_list(c.fetchall())
        if not subs: return

        notif_data = {"title": title, "body": body, "data": data or {}}
        if url: notif_data["data"]["url"] = url
        payload = json.dumps(notif_data)

        for s in subs:
            try:
                webpush(
                    subscription_info={"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}},
                    data=payload, vapid_private_key=vapid_priv,
                    vapid_claims={"sub": "mailto:admin@hellcore.net"}
                )
            except WebPushException as ex:
                if ex.response and ex.response.status_code in [404, 410]:
                    c.execute(f"DELETE FROM hc_push_subs WHERE endpoint={ph()}", (s["endpoint"],))
                    db.commit()
    except Exception as e:
        print(f"[PUSH ERROR] {e}")

def log_audit(admin_id, action, target_id=None, details="", status="success", execution_time=0.0):
    try:
        db = get_db(); c = db_cursor(db)
        try:
            c.execute(f"INSERT INTO hc_audit_logs(admin_id, action, target_id, details, status, execution_time) VALUES({phs(6)})",
                      (admin_id, action, target_id, details, status, execution_time))
        except:
            c.execute(f"INSERT INTO hc_audit_logs(admin_id, action, target_id, details) VALUES({phs(4)})",
                      (admin_id, action, target_id, details))
        db.commit()
    except:
        traceback.print_exc()
    finally:
        if 'c' in locals(): c.close()
        if 'db' in locals(): db.close()

def normalize_ticket_priority(v):
    p = str(v or "normal").strip().lower()
    return p if p in ("low", "normal", "high", "urgent") else "normal"

def can_view_ticket(ticket, user, email=""):
    if user and (ticket["author_id"] == user["id"] or user["role"] in STAFF_ROLES):
        return True
    # Guest access: match by email when no author_id or author_id is 0
# ═══════════════════════════════════════════════════════════════════
# ██████  DDoS PROTECTION SYSTEM  ██████████████████████████████████
# ═══════════════════════════════════════════════════════════════════

_ddos_alert_lock        = threading.Lock()
# Track attack state so we can send "attack ended" notice too
_ddos_attack_active     = False
_ddos_attack_start      = 0.0
_ddos_attack_blk_start  = 0

# ── internal state (in-memory, thread-safe) ───────────────────────
_ddos_lock      = threading.Lock()

# {ip: deque of timestamps}  — short window
_ddos_short_win  = defaultdict(deque)
# {ip: deque of timestamps}  — long window
_ddos_long_win   = defaultdict(deque)
# {ip: strike_count}
_ddos_strikes    = defaultdict(int)
# {ip: (ban_until_ts, reason)}  — temporary bans
_ddos_temp_bans  = {}              # type: dict[str, tuple[float, str]]
# {ip: reason}  — permanent bans (runtime)
_ddos_perm_bans  = {ip: "env" for ip in _DDOS_PERM_BANS_ENV}
# global flood window  (deque of timestamps)
_ddos_global_win = deque()
# audit log (last 500 events)
_ddos_audit      = deque(maxlen=500)
# total request counter
_ddos_total_req  = 0
# total blocked counter
_ddos_total_blk  = 0

# ── time-series tracking (for dashboard graph) — 60-min ring buffer ─
# Each slot = one minute: {ts, total_req, blocked_req, unique_ips}
_DDOS_SERIES_SLOTS   = 60   # keep last 60 minutes
_ddos_series         = deque(maxlen=_DDOS_SERIES_SLOTS)
_ddos_cur_minute     = -1   # epoch-minute of the current open slot
_ddos_slot_req       = 0    # requests in current minute
_ddos_slot_blk       = 0    # blocked in current minute
_ddos_slot_ips: set  = set()

# ── extra metrics ────────────────────────────────────────────────
_ddos_reasons = defaultdict(int)  # {reason_key: count}
_server_start_time = time.time()


def _ddos_now() -> float:
    return time.time()


def _ddos_log(event: str, ip: str, detail: str = ""):
    """Append to the in-memory audit ring."""
    _ddos_audit.append({
        "ts": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "event": event,
        "ip": ip,
        "detail": detail,
    })


def _ddos_tick_series(ip: str, blocked: bool):
    """Update per-minute time-series slot. Must be called inside _ddos_lock."""
    global _ddos_cur_minute, _ddos_slot_req, _ddos_slot_blk, _ddos_slot_ips
    now = _ddos_now()
    minute = int(now // 60)
    if minute != _ddos_cur_minute:
        # seal old slot
        if _ddos_cur_minute >= 0:
            _ddos_series.append({
                "ts":         datetime.utcfromtimestamp(_ddos_cur_minute * 60).strftime("%H:%M"),
                "total":      _ddos_slot_req,
                "blocked":    _ddos_slot_blk,
                "unique_ips": len(_ddos_slot_ips),
            })
        _ddos_cur_minute = minute
        _ddos_slot_req   = 0
        _ddos_slot_blk   = 0
        _ddos_slot_ips   = set()
    _ddos_slot_req += 1
    if blocked:
        _ddos_slot_blk += 1
    _ddos_slot_ips.add(ip)


def _ddos_send_discord_alert(event_type: str, ip: str, detail: str):
    """
    Fire-and-forget Discord webhook alert.
    Throttled to once per DDOS_DISCORD_COOLDOWN seconds.
    """
    global _ddos_last_alert_ts, _ddos_attack_active, _ddos_attack_start, _ddos_attack_blk_start
    if not DDOS_DISCORD_WEBHOOK:
        return
    now = _ddos_now()
    with _ddos_alert_lock:
        since_last = now - _ddos_last_alert_ts
        if since_last < DDOS_DISCORD_COOLDOWN:
            return
        _ddos_last_alert_ts = now
        if not _ddos_attack_active:
            _ddos_attack_active    = True
            _ddos_attack_start     = now
            _ddos_attack_blk_start = _ddos_total_blk

    color_map = {
        "rate_limit_short": 0xFF6B35,
        "rate_limit_long":  0xFF4500,
        "global_flood":     0xFF0000,
        "temp_ban":         0xFFA500,
        "perm_ban":         0x8B0000,
        "bad_ua":           0xFFD700,
    }
    color = color_map.get(event_type, 0xFF512F)

    attack_duration = int(now - _ddos_attack_start)
    blk_this_attack = _ddos_total_blk - _ddos_attack_blk_start

    payload = {
        "username": "Hellcore Shield",
        "avatar_url": "https://hellcore.net/static/logo.png",
        "embeds": [{
            "title": "🚨 DDoS Attack Detected!",
            "color": color,
            "description": (
                f"**Hellcore Network** is under attack.\n"
                f"The protection system is actively blocking requests."
            ),
            "fields": [
                {"name": "🔍 Event",         "value": f"`{event_type}`",                  "inline": True},
                {"name": "🌐 Attacker IP",   "value": f"`{ip}`",                           "inline": True},
                {"name": "📋 Detail",         "value": detail[:200] or "—",                "inline": False},
                {"name": "🛡 Blocked (attack)","value": str(blk_this_attack),              "inline": True},
                {"name": "⏱ Attack Duration", "value": f"{attack_duration}s",             "inline": True},
                {"name": "📊 Total Blocked",   "value": str(_ddos_total_blk),              "inline": True},
            ],
            "footer": {"text": "Hellcore Shield • DDoS Protection"},
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }]
    }

    def _post():
        try:
            data = json.dumps(payload).encode("utf-8")
            req  = urllib.request.Request(
                DDOS_DISCORD_WEBHOOK,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception as exc:
            print(f"[DDoS] Discord alert failed: {exc}")

    threading.Thread(target=_post, daemon=True).start()


def _ddos_prune(dq: deque, cutoff: float):
    """Remove entries older than cutoff from the left of the deque."""
    while dq and dq[0] < cutoff:
        dq.popleft()


def _ddos_check_and_count(ip: str) -> tuple[bool, str]:
    """
    Core gate function.
    Returns (allow: bool, reason: str).
    Must be called inside _ddos_lock.
    """
    global _ddos_total_req, _ddos_total_blk
    _ddos_total_req += 1
    now = _ddos_now()

    # 1. Permanent ban
    if ip in _ddos_perm_bans:
        _ddos_total_blk += 1
        _ddos_reasons["perm_ban"] += 1
        _ddos_tick_series(ip, True)
        return False, f"IP permanently banned: {_ddos_perm_bans[ip]}"

    # 2. Temporary ban
    if ip in _ddos_temp_bans:
        ban_until, reason = _ddos_temp_bans[ip]
        if now < ban_until:
            _ddos_total_blk += 1
            _ddos_reasons["temp_ban"] += 1
            remaining = int(ban_until - now)
            _ddos_tick_series(ip, True)
            return False, f"IP temporarily banned ({remaining}s remaining): {reason}"
        else:
            del _ddos_temp_bans[ip]   # expired

    # 3. Global flood guard
    cutoff_g = now - DDOS_GLOBAL_WINDOW
    _ddos_prune(_ddos_global_win, cutoff_g)
    _ddos_global_win.append(now)
    if len(_ddos_global_win) > DDOS_GLOBAL_LIMIT:
        _ddos_total_blk += 1
        _ddos_reasons["global_flood"] += 1
        detail = f"{len(_ddos_global_win)} req in {DDOS_GLOBAL_WINDOW}s"
        _ddos_log("global_flood", ip, detail)
        _ddos_tick_series(ip, True)
        threading.Thread(target=_ddos_send_discord_alert, args=("global_flood", ip, detail), daemon=True).start()
        return False, "Server under high load — please retry in a moment"

    # 4. Short-window per-IP limit
    cutoff_s = now - DDOS_IP_WINDOW_SHORT
    sw = _ddos_short_win[ip]
    _ddos_prune(sw, cutoff_s)
    sw.append(now)
    if len(sw) > DDOS_IP_LIMIT_SHORT:
        _ddos_total_blk += 1
        _ddos_reasons["rate_limit_short"] += 1
        _ddos_strikes[ip] += 1
        detail = f"{len(sw)} req in {DDOS_IP_WINDOW_SHORT}s"
        _maybe_temp_ban(ip, now, "short-window rate limit exceeded")
        _ddos_log("rate_limit_short", ip, detail)
        _ddos_tick_series(ip, True)
        threading.Thread(target=_ddos_send_discord_alert, args=("rate_limit_short", ip, detail), daemon=True).start()
        return False, "Too many requests — slow down"

    # 5. Long-window per-IP limit
    cutoff_l = now - DDOS_IP_WINDOW_LONG
    lw = _ddos_long_win[ip]
    _ddos_prune(lw, cutoff_l)
    lw.append(now)
    if len(lw) > DDOS_IP_LIMIT_LONG:
        _ddos_total_blk += 1
        _ddos_reasons["rate_limit_long"] += 1
        _ddos_strikes[ip] += 1
        detail = f"{len(lw)} req in {DDOS_IP_WINDOW_LONG}s"
        _maybe_temp_ban(ip, now, "long-window rate limit exceeded")
        _ddos_log("rate_limit_long", ip, detail)
        _ddos_tick_series(ip, True)
        threading.Thread(target=_ddos_send_discord_alert, args=("rate_limit_long", ip, detail), daemon=True).start()
        return False, "Too many requests — slow down"

    _ddos_tick_series(ip, False)
    return True, ""


def _maybe_temp_ban(ip: str, now: float, reason: str):
    """Escalate to a temp-ban if the strike threshold is reached."""
    strikes = _ddos_strikes[ip]
    if strikes >= DDOS_STRIKE_THRESHOLD:
        duration = min(
            DDOS_TEMP_BAN_SECONDS * (2 ** (strikes - DDOS_STRIKE_THRESHOLD)),
            DDOS_TEMP_BAN_MAX_SECONDS
        )
        ban_until = now + duration
        _ddos_temp_bans[ip] = (ban_until, reason)
        detail = f"{duration}s — strikes={strikes} — {reason}"
        _ddos_log("temp_ban", ip, detail)
        threading.Thread(target=_ddos_send_discord_alert, args=("temp_ban", ip, detail), daemon=True).start()


def _ddos_check_ua(ua: str) -> bool:
    """Return True if the UA is suspicious (should be blocked)."""
    if not ua:
        return False   # no UA — let other layers decide
    ua_lower = ua.lower()
    return any(pat in ua_lower for pat in DDOS_BAD_UA_PATTERNS)


@app.before_request
def ddos_protect():
    """DDoS protection gate — runs before every request handler."""
    if not DDOS_ENABLED:
        return

    # --- derive client IP (supports proxies / Cloudflare / Railway) ---
    ip = get_client_ip()

    # --- whitelist ---
    if ip in DDOS_WHITELIST_IPS:
        return

    # --- bad user-agent fast-path ---
    ua = request.headers.get("User-Agent", "")
    if _ddos_check_ua(ua):
        with _ddos_lock:
            global _ddos_total_blk
            _ddos_total_blk += 1
            _ddos_reasons["bad_ua"] += 1
            _ddos_log("bad_ua", ip, ua[:120])
        return jsonify({"error": "Forbidden", "code": 403}), 403

    # --- relaxed paths still go through global guard ─ handled inside ─
    # --- rate limit check ---
    with _ddos_lock:
        allowed, reason = _ddos_check_and_count(ip)

    if not allowed:
        resp = jsonify({"error": reason, "code": 429})
        resp.status_code = 429
        resp.headers["Retry-After"] = "60"
        return resp



# ── DDoS Admin API (requires HC bot secret or founder session) ─────

@app.route("/api/ddos/stats")
@ddos_admin_required
def ddos_stats():
    """GET /api/ddos/stats — DDoS protection dashboard stats."""
    with _ddos_lock:
        # merge current open slot into series snapshot
        open_slot = {
            "ts":         datetime.utcnow().strftime("%H:%M"),
            "total":      _ddos_slot_req,
            "blocked":    _ddos_slot_blk,
            "unique_ips": len(_ddos_slot_ips),
        }
        series_snapshot = list(_ddos_series) + [open_slot]
        stats = {
            "enabled":        DDOS_ENABLED,
            "total_requests": _ddos_total_req,
            "total_blocked":  _ddos_total_blk,
            "series":         series_snapshot,
            "reasons":        dict(_ddos_reasons),
            "uptime_s":       int(time.time() - _server_start_time),
            "block_rate_pct": round(100 * _ddos_total_blk / max(_ddos_total_req, 1), 2),
            "active_temp_bans": [
                {"ip": ip, "until": datetime.utcfromtimestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ"), "reason": r}
                for ip, (ts, r) in list(_ddos_temp_bans.items()) if ts > _ddos_now()
            ],
            "perm_bans": [
                {"ip": ip, "reason": r} for ip, r in list(_ddos_perm_bans.items())
            ],
            "strikes": [
                {"ip": ip, "count": c} for ip, c in sorted(_ddos_strikes.items(), key=lambda x: -x[1])[:50]
            ],
            "recent_audit": list(_ddos_audit)[-50:],
            "limits": {
                "short_req":     DDOS_IP_LIMIT_SHORT,
                "short_win":     DDOS_IP_WINDOW_SHORT,
                "long_req":      DDOS_IP_LIMIT_LONG,
                "long_win":      DDOS_IP_WINDOW_LONG,
                "global_req":    DDOS_GLOBAL_LIMIT,
                "global_win":    DDOS_GLOBAL_WINDOW,
                "strike_limit":  DDOS_STRIKE_THRESHOLD,
                "temp_ban_base": DDOS_TEMP_BAN_SECONDS,
            }
        }
    return jsonify(stats)


@app.route("/api/ddos/ban", methods=["POST"])
@ddos_admin_required
def ddos_ban():
    """POST /api/ddos/ban  {ip, reason?, permanent?} — ban an IP."""
    data      = request.get_json(force=True) or {}
    ip        = (data.get("ip") or "").strip()
    reason    = (data.get("reason") or "manual ban").strip()
    permanent = bool(data.get("permanent", False))
    if not ip:
        return jsonify({"error": "ip required"}), 400
    with _ddos_lock:
        if permanent:
            _ddos_perm_bans[ip] = reason
            _ddos_log("perm_ban", ip, reason)
        else:
            _ddos_temp_bans[ip] = (_ddos_now() + DDOS_TEMP_BAN_SECONDS, reason)
            _ddos_log("temp_ban", ip, reason)
    return jsonify({"ok": True, "ip": ip, "permanent": permanent})


@app.route("/api/ddos/unban", methods=["POST"])
@ddos_admin_required
def ddos_unban():
    """POST /api/ddos/unban  {ip} — remove temp + perm ban for an IP."""
    data = request.get_json(force=True) or {}
    ip   = (data.get("ip") or "").strip()
    if not ip:
        return jsonify({"error": "ip required"}), 400
    with _ddos_lock:
        removed = []
        if ip in _ddos_perm_bans:
            del _ddos_perm_bans[ip]
            removed.append("perm_ban")
        if ip in _ddos_temp_bans:
            del _ddos_temp_bans[ip]
            removed.append("temp_ban")
        if ip in _ddos_strikes:
            del _ddos_strikes[ip]
            removed.append("strikes")
        _ddos_log("unban", ip, f"cleared: {removed}")
    return jsonify({"ok": True, "ip": ip, "cleared": removed})


@app.route("/api/ddos/whitelist", methods=["POST"])
@ddos_admin_required
def ddos_whitelist_add():
    """POST /api/ddos/whitelist  {ip} — add IP to whitelist at runtime."""
    data = request.get_json(force=True) or {}
    ip   = (data.get("ip") or "").strip()
    if not ip:
        return jsonify({"error": "ip required"}), 400
    DDOS_WHITELIST_IPS.add(ip)
    _ddos_log("whitelist_add", ip)
    return jsonify({"ok": True, "ip": ip})


@app.route("/api/ddos/config", methods=["GET", "POST"])
@ddos_admin_required
def ddos_config():
    """Manage DDoS protection settings at runtime."""
    global DDOS_ENABLED, DDOS_IP_LIMIT_SHORT, DDOS_IP_WINDOW_SHORT
    global DDOS_IP_LIMIT_LONG, DDOS_IP_WINDOW_LONG, DDOS_GLOBAL_LIMIT
    global DDOS_GLOBAL_WINDOW, DDOS_STRIKE_THRESHOLD, DDOS_TEMP_BAN_SECONDS

    if request.method == "POST":
        data = request.get_json(force=True) or {}
        if "enabled" in data:          DDOS_ENABLED = bool(data["enabled"])
        if "short_req" in data:       DDOS_IP_LIMIT_SHORT = int(data["short_req"])
        if "short_win" in data:       DDOS_IP_WINDOW_SHORT = int(data["short_win"])
        if "long_req" in data:        DDOS_IP_LIMIT_LONG = int(data["long_req"])
        if "long_win" in data:        DDOS_IP_WINDOW_LONG = int(data["long_win"])
        if "global_req" in data:      DDOS_GLOBAL_LIMIT = int(data["global_req"])
        if "global_win" in data:      DDOS_GLOBAL_WINDOW = int(data["global_win"])
        if "strike_limit" in data:    DDOS_STRIKE_THRESHOLD = int(data["strike_limit"])
        if "temp_ban_base" in data:   DDOS_TEMP_BAN_SECONDS = int(data["temp_ban_base"])
        _ddos_log("config_update", "system", f"Updated DDoS settings: {list(data.keys())}")
        return jsonify({"ok": True})

    return jsonify({
        "enabled":        DDOS_ENABLED,
        "short_req":     DDOS_IP_LIMIT_SHORT,
        "short_win":     DDOS_IP_WINDOW_SHORT,
        "long_req":      DDOS_IP_LIMIT_LONG,
        "long_win":      DDOS_IP_WINDOW_LONG,
        "global_req":    DDOS_GLOBAL_LIMIT,
        "global_win":    DDOS_GLOBAL_WINDOW,
        "strike_limit":  DDOS_STRIKE_THRESHOLD,
        "temp_ban_base": DDOS_TEMP_BAN_SECONDS,
    })


@app.route("/admin/ddos", methods=["GET", "POST"])
@admin_required
def ddos_dashboard():
    """Serve the DDoS protection admin dashboard with secondary password gate."""
    
    # Handle Login POST
    if request.method == "POST":
        pwd = request.form.get("password")
        if pwd == "Hellcore@Kq":
            session["ddos_authorized"] = True
            return redirect("/admin/ddos")
        return render_template("ddos_login.html", error="Invalid Shield Password")

    # If already authorized, show dashboard
    if session.get("ddos_authorized"):
        return render_template("ddos_dashboard.html")
        
    # Otherwise show login
    return render_template("ddos_login.html")

# ── end DDoS protection ────────────────────────────────────────────

    if email and ticket.get("email") and email.lower() == ticket["email"].lower():
        if not ticket["author_id"] or ticket["author_id"] == 0:
            return True
    return False

def can_manage_ticket(ticket, user, email=""):
    if user and (ticket["author_id"] == user["id"] or user["role"] in STAFF_ROLES):
        return True
    if email and ticket.get("email") and email.lower() == ticket["email"].lower():
        if not ticket["author_id"] or ticket["author_id"] == 0:
            return True
    return False

def add_ticket_activity(c, ticket_id, actor_id, action, details=""):
    c.execute(
        f"INSERT INTO hc_ticket_activity(ticket_id,actor_id,action,details) VALUES({phs(4)})",
        (ticket_id, actor_id, action, details)
    )


def create_purchase_order_record(c, user, cart_items, source_app="main", payment_method="upi", payment_status="awaiting_proof"):
    if not user:
        raise ValueError("Authenticated user required")
    if not cart_items:
        raise ValueError("Cart is empty")

    rank_info = get_rank_payload_for_user(user["id"], c)
    total_usd = sum(float(item.get("item_price") or item.get("price") or 0) for item in cart_items)
    total_inr = round(total_usd * 83.0, 2)
    payment_details = {
        "upi_id": os.environ.get("STORE_UPI_ID", "lakshitdhirani@fam"),
        "amount_usd": f"{total_usd:.2f}",
        "amount_inr": f"{total_inr:.2f}",
    }
    meta = build_purchase_metadata(
        user=user,
        items=cart_items,
        rank_info=rank_info,
        payment_method=payment_method,
        payment_status=payment_status,
        payment_details=payment_details,
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
    add_ticket_activity(c, ticket_id, user["id"], "order_created", f"{meta['order_code']} from {source_app}")
    
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

# ═══════════════════════════════════════════════════════
# CORS
# ═══════════════════════════════════════════════════════
@app.after_request
def cors(r):
    origin = request.headers.get("Origin")
    if origin and ("hellcore.net" in origin or "localhost" in origin):
        r.headers["Access-Control-Allow-Origin"] = origin
    else:
        r.headers["Access-Control-Allow-Origin"] = "*"
        
    r.headers["Access-Control-Allow-Headers"] = "Content-Type,X-Auth-Token,Authorization,X-API-Key,X-Bot-Secret"
    r.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    r.headers["Access-Control-Allow-Credentials"] = "true"
    return r

@app.route("/api/<path:p>", methods=["OPTIONS"])
def opts(p): return jsonify({}), 200

# ═══════════════════════════════════════════════════════
# FRONTEND
# ═══════════════════════════════════════════════════════
# Serves index.html for the root path, or a Discord ticket log when ticket_id is provided.
@app.route("/")
def index():
    ticket_id = request.args.get("ticket_id", "").strip()
    if ticket_id:
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{3,100}", ticket_id):
            return Response("Invalid ticket id", status=400, mimetype="text/plain")
        db = get_db(); c = db_cursor(db)
        c.execute(f"SELECT transcript FROM hc_discord_ticket_logs WHERE ticket_id={ph()}", (ticket_id,))
        row = to_dict(c.fetchone())
        if not row:
            return Response("Ticket log not found.", status=404, mimetype="text/plain")
        transcript = str(row.get("transcript") or "")
        if "<html" not in transcript[:500].lower():
            transcript = (
                "<!doctype html><html><head><meta charset=\"utf-8\"><title>Ticket "
                + html_escape(ticket_id)
                + "</title></head><body><pre>"
                + html_escape(transcript)
                + "</pre></body></html>"
            )
        response = Response(transcript, mimetype="text/html; charset=utf-8")
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response
    return render_template("index.html", ad_completion_secret=AD_PROOF_SECRET)

@app.route("/static/<path:f>")
def static_f(f): return send_from_directory("static", f)

@app.route("/sw.js")
def root_service_worker():
    return send_from_directory(app.root_path, "sw.js")

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
        payload = {
            "token": tok,
            "id": uid,
            "username": us,
            "email": em,
            "mc_username": mc,
            "role": "player",
        }
        resp = jsonify(enrich_user_with_rank(payload, uid, c))
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

@app.route("/api/auth/unlink", methods=["POST"])
@auth_required
def auth_unlink():
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_users SET mc_username='', mc_uuid='', is_verified=0 WHERE id={ph()}", (request.cu["id"],))
    db.commit()
    return jsonify({"success":True})

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
        pusher_trigger("tickets-global", "presence", {"user_id": u["id"], "username": u["username"], "role": u["role"], "online": True, "last_seen": now.isoformat()})
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
        rows = [enrich_user_with_rank(row, row.get("id"), c) for row in to_list(c.fetchall())]
        return jsonify(rows)
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
        # Final Correct Cookie Configuration for Cross-Subdomain Stability
        resp = jsonify({"token":tok,"id":row["id"],"username":row["username"],
                        "email":row["email"],"mc_username":row["mc_username"] or "","role":row["role"],
                        "is_verified":bool(row.get("is_verified",0))})
        resp.set_cookie(
            "hc_token", 
            tok, 
            max_age=60*60*24*30, 
            path="/", 
            domain=".hellcore.net" if "hellcore.net" in request.host else None,
            samesite="None",
            secure=True
        )
        payload = {
            "token": tok,
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "mc_username": row["mc_username"] or "",
            "role": row["role"],
            "is_verified": bool(row.get("is_verified", 0)),
            "current_xp": int(row.get("current_xp") or 0),
        }
        resp.set_data(json.dumps(enrich_user_with_rank(payload, row["id"], c)))
        resp.mimetype = "application/json"
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
    resp = jsonify({"ok":True})
    resp.set_cookie("hc_token", "", expires=0, path="/", domain=".hellcore.net" if "hellcore.net" in request.host else None, samesite="None", secure=True)
    return resp

@app.route("/api/auth/me")
@auth_required
def auth_me():
    u = request.cu
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT current_xp FROM hc_users WHERE id={ph()}", (u["id"],))
    xp_row = to_dict(c.fetchone()) or {}
    payload = {
        "id": u["id"],
        "username": u["username"],
        "email": u["email"],
        "mc_username": u.get("mc_username") or "",
        "role": u["role"],
        "is_verified": bool(u.get("is_verified", 0)),
        "current_xp": int(xp_row.get("current_xp") or u.get("current_xp") or 0),
    }
    payload = enrich_user_with_rank(payload, u["id"], c)
    payload["ranks"] = payload["rank_details"]
    return jsonify(payload)

@app.route("/api/auth/temp-token", methods=["POST"])
@auth_required
def get_temp_token():
    # Generate a 10-minute temporary token for checkout redirects
    db = get_db(); c = db_cursor(db)
    token = secrets.token_hex(32)
    expires = datetime.now() + timedelta(minutes=10)
    c.execute(f"INSERT INTO hc_temp_tokens (token, user_id, expires_at) VALUES ({ph()}, {ph()}, {ph()})", (token, request.cu["id"], expires))
    db.commit()
    return jsonify({"temp_token": token})

@app.route("/api/auth/warmup", methods=["POST"])
def session_warmup():
    # Restore session cookie using a temporary token
    d = request.get_json(force=True) or {}
    temp = d.get("token")
    if not temp: return jsonify({"error":"No token"}), 400
    
    db = get_db(); c = db_cursor(db)
    # Clear old tokens
    c.execute(f"DELETE FROM hc_temp_tokens WHERE expires_at < {ph()}", (datetime.now(),))
    
    c.execute(f"SELECT user_id FROM hc_temp_tokens WHERE token={ph()} AND expires_at > {ph()}", (temp, datetime.now()))
    row = to_dict(c.fetchone())
    if not row: return jsonify({"error":"Invalid or expired token"}), 401
    
    # Found user, get their real session token or generate a new one
    uid = row["user_id"]
    c.execute(f"SELECT * FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    
    tok = user.get("session_token")
    if not tok:
        tok = secrets.token_hex(32)
        c.execute(f"UPDATE hc_users SET session_token={ph()} WHERE id={ph()}", (tok, uid))
        
    c.execute(f"DELETE FROM hc_temp_tokens WHERE token={ph()}", (temp,))
    db.commit()
    
    warm_user = enrich_user_with_rank(
        {"id": user["id"], "username": user["username"], "role": user["role"]},
        user["id"],
        c,
    )
    resp = jsonify({"ok":True, "user": warm_user})
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

@app.route("/api/bot/verify", methods=["POST"])
def bot_verify():
    """Endpoint for Discord bot to link discord_id to a user using their verification code."""
    data = request.get_json() or {}
    secret = request.headers.get("X-Bot-Secret")
    if secret != os.environ.get("HC_BOT_SECRET", "hellcore-secret-123"):
        return jsonify({"error": "Forbidden"}), 403
    
    code = data.get("code")
    discord_id = data.get("discord_id")
    if not code or not discord_id:
        return jsonify({"error": "Missing params"}), 400
        
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id, username FROM hc_users WHERE verification_code={ph()}", (code,))
    row = to_dict(c.fetchone())
    if not row:
        return jsonify({"error": "Invalid or expired code"}), 404
    c.execute(f"SELECT id FROM hc_users WHERE discord_id={ph()} AND id!={ph()}", (str(discord_id), row["id"]))
    if c.fetchone():
        return jsonify({"error": "That Discord account is already linked to another website account."}), 409

    c.execute(f"UPDATE hc_users SET discord_id={ph()}, verification_code=NULL WHERE id={ph()}", (str(discord_id), row["id"]))
    db.commit()
    log_tournament_action("discord_linked", user_id=row["id"], details={"discord_id": str(discord_id), "source": "bot_verify"})
    return jsonify({"ok": True, "username": row["username"]})

@app.route("/api/bot/ranks")
def bot_ranks():
    """Endpoint for Discord bot to fetch all verified users and their ranks."""
    secret = request.headers.get("X-Bot-Secret")
    if secret != os.environ.get("HC_BOT_SECRET", "hellcore-secret-123"):
        return jsonify({"error": "Forbidden"}), 403
        
    db = get_db(); c = db_cursor(db)
    # Get all users who have a discord_id linked
    c.execute("SELECT id, username, discord_id FROM hc_users WHERE discord_id != ''")
    users = to_list(c.fetchall())
    
    results = []
    for u in users:
        # Get ranks for this user
        c.execute(f"SELECT gamemode, rank_name FROM hc_ranks WHERE user_id={ph()}", (u["id"],))
        ranks = to_list(c.fetchall())
        results.append({
            "username": u["username"],
            "discord_id": u["discord_id"],
            "ranks": {r["gamemode"]: r["rank_name"] for r in ranks}
        })
        
    return jsonify(results)

@app.route("/api/bot/unlink", methods=["POST"])
def bot_unlink():
    """Endpoint for Discord bot to unlink a discord_id from any user."""
    data = request.get_json() or {}
    secret = request.headers.get("X-Bot-Secret")
    if secret != os.environ.get("HC_BOT_SECRET", "hellcore-secret-123"):
        return jsonify({"error": "Forbidden"}), 403
        
    discord_id = data.get("discord_id")
    if not discord_id:
        return jsonify({"error": "Missing params"}), 400
        
    db = get_db(); c = db_cursor(db)
    c.execute(
        f"UPDATE hc_users SET discord_id='', discord_username='', discord_global_name='', discord_avatar='', discord_linked_at=NULL WHERE discord_id={ph()}",
        (str(discord_id),)
    )
    db.commit()
    return jsonify({"ok": True})


# -------------------------------------------------------
# HELLCORE 4v4 RBW TOURNAMENT
# -------------------------------------------------------
TOURNAMENT_TITLE = "HELLCORE 4v4 RBW TOURNAMENT"
TOURNAMENT_DATE = "31 May 2026"
_TOURNAMENT_SCHEMA_CHECKED = False


def ensure_tournament_schema():
    """Create/repair tournament tables when production boot migrations were skipped."""
    global _TOURNAMENT_SCHEMA_CHECKED
    if _TOURNAMENT_SCHEMA_CHECKED:
        return
    db = get_db()
    c = db_cursor(db)
    mysql = _DB_MODE != "sqlite"
    AI = "AUTO_INCREMENT" if mysql else "AUTOINCREMENT"
    DT = "DATETIME DEFAULT CURRENT_TIMESTAMP" if mysql else "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    try:
        c.execute(f"""CREATE TABLE IF NOT EXISTS hc_tournament_teams(
          id INTEGER PRIMARY KEY {AI},
          team_name VARCHAR(80) NOT NULL,
          logo_url VARCHAR(500) DEFAULT '',
          captain_user_id INTEGER NOT NULL,
          invite_token VARCHAR(80) UNIQUE NOT NULL,
          status VARCHAR(30) DEFAULT 'incomplete',
          created_at {DT},
          updated_at {DT})""")
        c.execute(f"""CREATE TABLE IF NOT EXISTS hc_tournament_members(
          id INTEGER PRIMARY KEY {AI},
          team_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          discord_id VARCHAR(50) NOT NULL,
          discord_input VARCHAR(120) DEFAULT '',
          minecraft_ign_snapshot VARCHAR(50) NOT NULL,
          minecraft_ign_lc VARCHAR(50) NOT NULL,
          rbw_uuid VARCHAR(80) DEFAULT '',
          rbw_source VARCHAR(80) DEFAULT 'hc_users',
          verification_code VARCHAR(4) DEFAULT '',
          verification_status VARCHAR(30) DEFAULT 'pending',
          verified_user_id INTEGER DEFAULT 0,
          verified_at DATETIME,
          code_used_at DATETIME,
          code_expires_at DATETIME,
          role VARCHAR(20) DEFAULT 'member',
          joined_at {DT})""")
        c.execute(f"""CREATE TABLE IF NOT EXISTS hc_tournament_logs(
          id INTEGER PRIMARY KEY {AI},
          action_type VARCHAR(80) NOT NULL,
          user_id INTEGER,
          staff_user_id INTEGER,
          team_id INTEGER,
          details_json TEXT,
          created_at {DT})""")
        c.execute(f"""CREATE TABLE IF NOT EXISTS hc_tournament_settings(
          setting_key VARCHAR(80) PRIMARY KEY,
          setting_value VARCHAR(255) NOT NULL,
          updated_at {DT})""")
        for sql in [
            "ALTER TABLE hc_users ADD COLUMN discord_username VARCHAR(120) DEFAULT ''",
            "ALTER TABLE hc_users ADD COLUMN discord_global_name VARCHAR(120) DEFAULT ''",
            "ALTER TABLE hc_users ADD COLUMN discord_avatar VARCHAR(255) DEFAULT ''",
            "ALTER TABLE hc_users ADD COLUMN discord_linked_at DATETIME",
            "ALTER TABLE hc_tournament_teams ADD COLUMN logo_url VARCHAR(500) DEFAULT ''",
            "ALTER TABLE hc_tournament_teams ADD COLUMN status VARCHAR(30) DEFAULT 'incomplete'",
            "ALTER TABLE hc_tournament_teams ADD COLUMN updated_at DATETIME",
            "ALTER TABLE hc_tournament_members ADD COLUMN minecraft_ign_lc VARCHAR(50) DEFAULT ''",
            "ALTER TABLE hc_tournament_members ADD COLUMN rbw_uuid VARCHAR(80) DEFAULT ''",
            "ALTER TABLE hc_tournament_members ADD COLUMN rbw_source VARCHAR(80) DEFAULT 'hc_users'",
            "ALTER TABLE hc_tournament_members ADD COLUMN discord_input VARCHAR(120) DEFAULT ''",
            "ALTER TABLE hc_tournament_members ADD COLUMN verification_code VARCHAR(4) DEFAULT ''",
            "ALTER TABLE hc_tournament_members ADD COLUMN verification_status VARCHAR(30) DEFAULT 'pending'",
            "ALTER TABLE hc_tournament_members ADD COLUMN verified_user_id INTEGER DEFAULT 0",
            "ALTER TABLE hc_tournament_members ADD COLUMN verified_at DATETIME",
            "ALTER TABLE hc_tournament_members ADD COLUMN code_used_at DATETIME",
            "ALTER TABLE hc_tournament_members ADD COLUMN code_expires_at DATETIME",
        ]:
            try:
                c.execute(sql)
            except Exception:
                pass
        for key, value in [
            ("tournament_registration_open", "1"),
            ("tournament_max_teams", "12"),
            ("tournament_team_size", "4"),
        ]:
            if _DB_MODE == "sqlite":
                c.execute("INSERT OR IGNORE INTO hc_tournament_settings(setting_key,setting_value) VALUES(?,?)", (key, value))
            else:
                c.execute("INSERT IGNORE INTO hc_tournament_settings(setting_key,setting_value) VALUES(%s,%s)", (key, value))
        db.commit()
        _TOURNAMENT_SCHEMA_CHECKED = True
    finally:
        try:
            c.close()
        except Exception:
            pass


def tournament_setting(key, default=""):
    try:
        ensure_tournament_schema()
        db = get_db(); c = db_cursor(db)
        c.execute(f"SELECT setting_value FROM hc_tournament_settings WHERE setting_key={ph()}", (key,))
        row = to_dict(c.fetchone())
        return str((row or {}).get("setting_value") or default)
    except Exception:
        traceback.print_exc()
        return str(default)


def tournament_limits():
    def as_int(value, fallback):
        try:
            return int(value)
        except Exception:
            return fallback
    return {
        "registration_open": tournament_setting("tournament_registration_open", "1") == "1",
        "max_teams": as_int(tournament_setting("tournament_max_teams", "12") or 12, 12),
        "team_size": as_int(tournament_setting("tournament_team_size", "4") or 4, 4),
    }


def clean_team_name(value):
    name = re.sub(r"\s+", " ", str(value or "")).strip()
    name = re.sub(r"[^\w ._\-#&()]", "", name, flags=re.UNICODE).strip()
    if len(name) < 3 or len(name) > 40:
        return ""
    return name


def clean_logo_url(value):
    url = str(value or "").strip()
    if not url:
        return ""
    if len(url) > 500:
        return ""
    if url.startswith("/static/") or url.startswith("/api/"):
        return url
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return url
    return ""


def user_discord_linked(user):
    return bool(str((user or {}).get("discord_id") or "").strip())


def user_rbw_profile(user):
    ign = str((user or {}).get("mc_username") or "").strip() or str((user or {}).get("username") or "").strip()
    if not ign:
        return None
    return {
        "minecraft_ign": ign,
        "rbw_uuid": str((user or {}).get("mc_uuid") or "").strip(),
        "rbw_source": "hellcore_link" if bool((user or {}).get("is_verified", 0)) else "website_username",
    }


def clean_minecraft_ign(value):
    ign = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_]{3,16}", ign):
        return ""
    return ign


def clean_discord_ref(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) < 2 or len(text) > 120:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9_.#@\- ]{2,120}", text):
        return ""
    return text


def generate_tournament_code(cursor):
    for _ in range(100):
        code = f"{secrets.randbelow(10000):04d}"
        cursor.execute(
            f"""SELECT id FROM hc_tournament_members
                WHERE verification_code={ph()} AND verification_status!='verified'""",
            (code,),
        )
        if not cursor.fetchone():
            return code
    return f"{secrets.randbelow(10000):04d}"


def parse_tournament_roster(data, captain_user):
    raw_players = data.get("players")
    if not isinstance(raw_players, list):
        raw_players = []
    profile = user_rbw_profile(captain_user) or {}
    captain_discord = str(
        captain_user.get("discord_username")
        or captain_user.get("discord_global_name")
        or captain_user.get("discord_id")
        or ""
    ).strip()
    fallback = [{
        "minecraft_ign": profile.get("minecraft_ign") or captain_user.get("username") or "",
        "discord": captain_discord,
        "role": "captain",
    }]
    source = (raw_players or fallback)[:4]
    roster = []
    for idx in range(4):
        raw = source[idx] if idx < len(source) and isinstance(source[idx], dict) else {}
        ign = clean_minecraft_ign(raw.get("minecraft_ign") or raw.get("ign") or raw.get("username"))
        discord_ref = clean_discord_ref(raw.get("discord") or raw.get("discord_input") or raw.get("discord_username") or raw.get("discord_id"))
        role = "captain" if idx == 0 else "member"
        roster.append({
            "slot": idx + 1,
            "minecraft_ign": ign,
            "minecraft_ign_lc": ign.lower(),
            "discord_input": discord_ref,
            "role": role,
        })
    return roster


def validate_tournament_roster(roster):
    if len(roster) != 4:
        return "Exactly 4 players are required."
    if any(not p["minecraft_ign"] for p in roster):
        return "All 4 Minecraft IGNs are required and must be valid Minecraft usernames."
    igns = [p["minecraft_ign_lc"] for p in roster]
    if len(set(igns)) != len(igns):
        return "Duplicate Minecraft IGNs are not allowed."
    discords = [p["discord_input"].lower() for p in roster if p["discord_input"]]
    if len(set(discords)) != len(discords):
        return "Duplicate Discord usernames or IDs are not allowed."
    return ""


def tournament_user_blocker(user):
    if not user:
        return "You must log in before registering for the tournament."
    return ""


def public_base_url():
    return os.environ.get("WEBSITE_PUBLIC_URL", request.host_url.rstrip("/")).rstrip("/")


def send_tournament_webhook(action_type, user=None, staff=None, team=None, details=None):
    url = os.environ.get("TOURNAMENT_WEBHOOK_URL", "").strip()
    if not url:
        return
    payload = {
        "content": None,
        "embeds": [{
            "title": f"Tournament: {action_type}",
            "color": 16732463,
            "fields": [
                {"name": "Website User", "value": f"{(user or {}).get('username','-')} / {(user or {}).get('id','-')}", "inline": True},
                {"name": "Discord", "value": f"{(user or {}).get('discord_username','-')} / {(user or {}).get('discord_id','-')}", "inline": True},
                {"name": "Minecraft IGN", "value": str((details or {}).get("minecraft_ign") or (user or {}).get("mc_username") or "-"), "inline": True},
                {"name": "Team", "value": str((team or {}).get("team_name") or (details or {}).get("team_name") or "-"), "inline": True},
                {"name": "Staff", "value": str((staff or {}).get("username") or "-"), "inline": True},
                {"name": "Time", "value": datetime.utcnow().isoformat() + "Z", "inline": True},
            ],
            "footer": {"text": TOURNAMENT_TITLE},
        }]
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "HellCoreTournament/1.0"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=4)
    except Exception as e:
        print(f"[TOURNAMENT WEBHOOK] Failed: {e}")


def log_tournament_action(action_type, user_id=None, staff_user_id=None, team_id=None, details=None):
    details = details or {}
    db = get_db(); c = db_cursor(db)
    c.execute(
        f"INSERT INTO hc_tournament_logs(action_type,user_id,staff_user_id,team_id,details_json) VALUES({phs(5)})",
        (action_type, user_id, staff_user_id, team_id, json.dumps(details, ensure_ascii=False)),
    )
    db.commit()

    user = None; staff = None; team = None
    if user_id:
        c.execute(f"SELECT * FROM hc_users WHERE id={ph()}", (user_id,))
        user = to_dict(c.fetchone())
    if staff_user_id:
        c.execute(f"SELECT * FROM hc_users WHERE id={ph()}", (staff_user_id,))
        staff = to_dict(c.fetchone())
    if team_id:
        c.execute(f"SELECT * FROM hc_tournament_teams WHERE id={ph()}", (team_id,))
        team = to_dict(c.fetchone())
    send_tournament_webhook(action_type, user=user, staff=staff, team=team, details=details)


def get_user_tournament_member(user_id, cursor=None):
    c = cursor or db_cursor(get_db())
    c.execute(
        f"""SELECT m.*, t.team_name, t.invite_token, t.status, t.captain_user_id
            FROM hc_tournament_members m
            JOIN hc_tournament_teams t ON t.id=m.team_id
            WHERE m.user_id={ph()} OR m.verified_user_id={ph()}""",
        (user_id, user_id),
    )
    return to_dict(c.fetchone())


def recalc_team_status(team_id, cursor=None):
    c = cursor or db_cursor(get_db())
    limits = tournament_limits()
    c.execute(f"SELECT status FROM hc_tournament_teams WHERE id={ph()}", (team_id,))
    team = to_dict(c.fetchone())
    if not team:
        return "incomplete"
    c.execute(
        f"""SELECT COUNT(*) cnt FROM hc_tournament_members
            WHERE team_id={ph()} AND verification_status='verified'""",
        (team_id,),
    )
    count = int((to_dict(c.fetchone()) or {}).get("cnt") or 0)
    if count < limits["team_size"]:
        status = "pending verification"
    elif team.get("status") == "confirmed":
        status = "confirmed"
    else:
        status = "complete"
    c.execute(f"UPDATE hc_tournament_teams SET status={ph()}, updated_at={ph()} WHERE id={ph()}", (status, datetime.now(), team_id))
    return status


def serialize_tournament_team(team_id=None, public=False, cursor=None):
    c = cursor or db_cursor(get_db())
    where = f"WHERE t.id={ph()}" if team_id else ""
    params = (team_id,) if team_id else ()
    c.execute(
        f"""SELECT t.*, cu.username captain_username, cu.mc_username captain_mc
            FROM hc_tournament_teams t
            LEFT JOIN hc_users cu ON cu.id=t.captain_user_id
            {where}
            ORDER BY t.created_at ASC""",
        params,
    )
    teams = to_list(c.fetchall())
    out = []
    limits = tournament_limits()
    for t in teams:
        c.execute(
            f"""SELECT m.*, u.username website_username, u.discord_username, u.discord_global_name
                FROM hc_tournament_members m
                LEFT JOIN hc_users u ON u.id=m.user_id
                WHERE m.team_id={ph()}
                ORDER BY CASE WHEN m.role='captain' THEN 0 ELSE 1 END, m.joined_at ASC""",
            (t["id"],),
        )
        members = to_list(c.fetchall())
        safe_members = []
        for m in members:
            verification_status = str(m.get("verification_status") or "pending").strip().lower()
            safe = {
                "role": m.get("role") or "member",
                "minecraft_ign": m.get("minecraft_ign_snapshot") or "",
                "verification_status": "Verified" if verification_status == "verified" else "Pending",
                "verified": verification_status == "verified",
            }
            if not public:
                safe.update({
                    "id": m["id"],
                    "user_id": m["user_id"],
                    "verified_user_id": m.get("verified_user_id") or 0,
                    "website_username": m.get("website_username") or "",
                    "discord_id": m.get("discord_id") or "",
                    "discord_input": m.get("discord_input") or "",
                    "discord_username": m.get("discord_input") or m.get("discord_username") or m.get("discord_global_name") or m.get("discord_id") or "",
                    "discord_global_name": m.get("discord_global_name") or "",
                    "rbw_uuid": m.get("rbw_uuid") or "",
                    "rbw_source": m.get("rbw_source") or "hc_users.mc_username",
                    "verification_code": m.get("verification_code") or "",
                    "code_status": "used" if verification_status == "verified" else "active",
                    "verified_at": isoformat_utc(m.get("verified_at")),
                    "code_expires_at": isoformat_utc(m.get("code_expires_at")),
                    "joined_at": isoformat_utc(m.get("joined_at")),
                })
            safe_members.append(safe)
        verified_count = sum(1 for m in safe_members if m.get("verified"))
        item = {
            "team_name": t["team_name"],
            "logo_url": t.get("logo_url") or "",
            "status": t.get("status") or "pending verification",
            "player_count": len(members),
            "team_size": limits["team_size"],
            "registered_slots": len(members),
            "verified_count": verified_count,
            "captain": next((m["minecraft_ign"] for m in safe_members if m["role"] == "captain"), t.get("captain_mc") or ""),
            "members": safe_members,
            "players": safe_members,
        }
        if not public:
            item.update({
                "id": t["id"],
                "captain_user_id": t["captain_user_id"],
                "invite_token": t["invite_token"],
                "invite_url": f"{public_base_url()}/tournament/join/{t['invite_token']}",
                "created_at": isoformat_utc(t.get("created_at")),
                "updated_at": isoformat_utc(t.get("updated_at")),
            })
        out.append(item)
    return out[0] if team_id and out else None if team_id else out


def assert_tournament_joinable(user, team_id=None):
    limits = tournament_limits()
    if not limits["registration_open"]:
        return "Registration is currently closed."
    blocker = tournament_user_blocker(user)
    if blocker:
        return blocker
    db = get_db(); c = db_cursor(db)
    c.execute("SELECT COUNT(*) cnt FROM hc_tournament_teams")
    if not team_id and int((to_dict(c.fetchone()) or {}).get("cnt") or 0) >= limits["max_teams"]:
        return "Tournament registration is full."
    profile = user_rbw_profile(user)
    c.execute(
        f"""SELECT m.id FROM hc_tournament_members m
            WHERE m.user_id={ph()} OR m.discord_id={ph()} OR m.minecraft_ign_lc={ph()}""",
        (user["id"], str(user.get("discord_id") or ""), profile["minecraft_ign"].lower()),
    )
    if c.fetchone():
        return "You are already registered on a tournament team."
    return ""


@app.route("/auth/discord/start")
@auth_required
def discord_oauth_start():
    client_id = os.environ.get("DISCORD_CLIENT_ID", "").strip()
    redirect_uri = os.environ.get("DISCORD_REDIRECT_URI", f"{request.host_url.rstrip('/')}/auth/discord/callback").strip()
    if not client_id:
        return Response("Discord OAuth is not configured.", status=500, mimetype="text/plain")
    state = secrets.token_urlsafe(24)
    session["discord_oauth_state"] = state
    params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "identify",
        "state": state,
        "prompt": "consent",
    })
    return redirect(f"https://discord.com/oauth2/authorize?{params}")


@app.route("/auth/discord/callback")
@auth_required
def discord_oauth_callback():
    if request.args.get("state") != session.pop("discord_oauth_state", ""):
        return Response("Invalid Discord OAuth state.", status=400, mimetype="text/plain")
    code = request.args.get("code", "").strip()
    if not code:
        return Response("Missing Discord OAuth code.", status=400, mimetype="text/plain")
    client_id = os.environ.get("DISCORD_CLIENT_ID", "").strip()
    client_secret = os.environ.get("DISCORD_CLIENT_SECRET", "").strip()
    redirect_uri = os.environ.get("DISCORD_REDIRECT_URI", f"{request.host_url.rstrip('/')}/auth/discord/callback").strip()
    if not client_id or not client_secret:
        return Response("Discord OAuth is not configured.", status=500, mimetype="text/plain")

    token_data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    }).encode("utf-8")
    try:
        req = urllib.request.Request(
            "https://discord.com/api/oauth2/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "HellCoreTournament/1.0"},
            method="POST",
        )
        token = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
        access_token = token.get("access_token")
        req = urllib.request.Request(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}", "User-Agent": "HellCoreTournament/1.0"},
        )
        discord_user = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    except Exception as e:
        return Response(f"Discord OAuth failed: {e}", status=502, mimetype="text/plain")

    discord_id = str(discord_user.get("id") or "").strip()
    if not discord_id:
        return Response("Discord did not return an account ID.", status=502, mimetype="text/plain")

    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id, username FROM hc_users WHERE discord_id={ph()} AND id!={ph()}", (discord_id, request.cu["id"]))
    if c.fetchone():
        return Response("That Discord account is already linked to another website account.", status=409, mimetype="text/plain")
    username = str(discord_user.get("username") or "")[:120]
    global_name = str(discord_user.get("global_name") or "")[:120]
    avatar_hash = str(discord_user.get("avatar") or "")
    avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar_hash}.png?size=128" if avatar_hash else ""
    c.execute(
        f"""UPDATE hc_users SET discord_id={ph()}, discord_username={ph()}, discord_global_name={ph()},
            discord_avatar={ph()}, discord_linked_at={ph()} WHERE id={ph()}""",
        (discord_id, username, global_name, avatar_url, datetime.now(), request.cu["id"]),
    )
    db.commit()
    user = get_user_by_token(request.cookies.get("hc_token", ""))
    log_tournament_action("discord_linked", user_id=request.cu["id"], details={"discord_id": discord_id, "discord_username": username})
    return redirect("/tournament")


@app.route("/tournament")
@optional_auth
def tournament_page():
    return render_template("tournament.html", page="home", invite_token="", title=TOURNAMENT_TITLE, date=TOURNAMENT_DATE)


@app.route("/tournament/link-discord")
@optional_auth
def tournament_link_discord_page():
    return render_template("tournament.html", page="link", invite_token="", title=TOURNAMENT_TITLE, date=TOURNAMENT_DATE)


@app.route("/tournament/create")
@optional_auth
def tournament_create_page():
    return render_template("tournament.html", page="create", invite_token="", title=TOURNAMENT_TITLE, date=TOURNAMENT_DATE)


@app.route("/tournament/verify")
@optional_auth
def tournament_verify_page():
    return render_template("tournament.html", page="verify", invite_token="", title=TOURNAMENT_TITLE, date=TOURNAMENT_DATE)


@app.route("/tournament/my-team")
@optional_auth
def tournament_my_team_page():
    return render_template("tournament.html", page="my", invite_token="", title=TOURNAMENT_TITLE, date=TOURNAMENT_DATE)


@app.route("/tournament/join/<invite_token>")
@optional_auth
def tournament_join_page(invite_token):
    return render_template("tournament.html", page="join", invite_token=invite_token, title=TOURNAMENT_TITLE, date=TOURNAMENT_DATE)


@app.route("/tournament/teams")
def tournament_public_teams_page():
    return render_template("tournament_teams.html", title=TOURNAMENT_TITLE, date=TOURNAMENT_DATE)


@app.route("/staff/tournament")
@staff_required
def staff_tournament_page():
    return render_template("staff_tournament.html", page="teams", title=TOURNAMENT_TITLE)


@app.route("/staff/tournament/logs")
@staff_required
def staff_tournament_logs_page():
    return render_template("staff_tournament.html", page="logs", title=TOURNAMENT_TITLE)


@app.route("/api/tournament/status")
@optional_auth
def tournament_status_api():
    try:
        ensure_tournament_schema()
        user = request.cu
        db = get_db(); c = db_cursor(db)
        limits = tournament_limits()
        c.execute("SELECT COUNT(*) cnt FROM hc_tournament_teams")
        team_count = int((to_dict(c.fetchone()) or {}).get("cnt") or 0)
        member = get_user_tournament_member(user["id"], c) if user else None
        team = serialize_tournament_team(member["team_id"], public=False, cursor=c) if member else None
        if team and user and team.get("captain_user_id") != user["id"] and user.get("role") not in STAFF_ROLES:
            for roster_member in team.get("members", []):
                roster_member.pop("verification_code", None)
            for roster_member in team.get("players", []):
                roster_member.pop("verification_code", None)
        blocker = tournament_user_blocker(user) if user else "You must log in before registering for the tournament."
        return jsonify({
            "title": TOURNAMENT_TITLE,
            "date": TOURNAMENT_DATE,
            "registration_open": limits["registration_open"],
            "max_teams": limits["max_teams"],
            "team_size": limits["team_size"],
            "team_count": team_count,
            "logged_in": bool(user),
            "discord_linked": user_discord_linked(user),
            "minecraft_profile": user_rbw_profile(user),
            "blocker": blocker,
            "my_team": team,
            "is_staff": bool(user and user.get("role") in STAFF_ROLES),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Tournament status unavailable: {e}"}), 500


@app.route("/api/tournament/teams")
def tournament_public_teams_api():
    try:
        ensure_tournament_schema()
        q = request.args.get("q", "").strip().lower()
        status_filter = request.args.get("status", "all").strip().lower()
        all_teams = serialize_tournament_team(public=True)
        teams = list(all_teams)
        if status_filter in ("complete", "incomplete", "pending", "pending verification", "confirmed", "disqualified"):
            if status_filter == "complete":
                teams = [t for t in teams if t["status"] in ("complete", "confirmed")]
            elif status_filter in ("pending", "pending verification", "incomplete"):
                teams = [t for t in teams if t["status"] in ("pending verification", "incomplete", "pending")]
            else:
                teams = [t for t in teams if t["status"] == status_filter]
        if q:
            teams = [
                t for t in teams
                if q in t["team_name"].lower() or any(q in m["minecraft_ign"].lower() for m in t["members"])
            ]
        limits = tournament_limits()
        return jsonify({
            "teams": teams,
            "registration_open": limits["registration_open"],
            "max_teams": limits["max_teams"],
            "team_size": limits["team_size"],
            "registered_teams": len(all_teams),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Tournament teams unavailable: {e}", "teams": []}), 500


@app.route("/api/tournament/team", methods=["POST"])
@auth_required
def tournament_create_team_api():
    ensure_tournament_schema()
    user = request.cu
    error = assert_tournament_joinable(user)
    if error:
        return jsonify({"error": error}), 400
    data = require_json()
    name = clean_team_name(data.get("team_name"))
    if not name:
        return jsonify({"error": "Team name must be 3-40 characters."}), 400
    logo_url = clean_logo_url(data.get("logo_url"))
    roster = parse_tournament_roster(data, user)
    roster_error = validate_tournament_roster(roster)
    if roster_error:
        return jsonify({"error": roster_error}), 400
    profile = user_rbw_profile(user)
    db = get_db(); c = db_cursor(db)
    for player in roster:
        c.execute(
            f"""SELECT m.id, t.team_name FROM hc_tournament_members m
                JOIN hc_tournament_teams t ON t.id=m.team_id
                WHERE m.minecraft_ign_lc={ph()}""",
            (player["minecraft_ign_lc"],),
        )
        existing = to_dict(c.fetchone())
        if existing:
            return jsonify({"error": f"{player['minecraft_ign']} is already registered on another tournament team."}), 400
        if player["discord_input"]:
            c.execute(
                f"""SELECT m.id FROM hc_tournament_members m
                    WHERE LOWER(COALESCE(m.discord_input, m.discord_id, ''))={ph()}""",
                (player["discord_input"].lower(),),
            )
            if c.fetchone():
                return jsonify({"error": f"{player['discord_input']} is already registered on another tournament team."}), 400
    token = secrets.token_urlsafe(18)
    now = datetime.now()
    expires = now + timedelta(days=14)
    c.execute(
        f"INSERT INTO hc_tournament_teams(team_name,logo_url,captain_user_id,invite_token,status,created_at,updated_at) VALUES({phs(7)})",
        (name, logo_url, user["id"], token, "pending verification", now, now),
    )
    team_id = c.lastrowid
    created_codes = []
    for player in roster:
        is_captain = player["role"] == "captain"
        code = generate_tournament_code(c)
        c.execute(
            f"""INSERT INTO hc_tournament_members(
                team_id,user_id,discord_id,discord_input,minecraft_ign_snapshot,
                minecraft_ign_lc,rbw_uuid,rbw_source,verification_code,
                verification_status,verified_user_id,code_expires_at,role,joined_at
            ) VALUES({phs(14)})""",
            (
                team_id,
                user["id"] if is_captain else 0,
                str(user.get("discord_id") or "") if is_captain else "",
                player["discord_input"],
                player["minecraft_ign"],
                player["minecraft_ign_lc"],
                profile["rbw_uuid"] if is_captain else "",
                profile["rbw_source"] if is_captain else "captain_roster",
                code,
                "pending",
                0,
                expires,
                player["role"],
                now,
            ),
        )
        created_codes.append({"minecraft_ign": player["minecraft_ign"], "discord": player["discord_input"], "verification_code": code})
    db.commit()
    for item in created_codes:
        log_tournament_action(
            "player_verification_code_generated",
            user_id=user["id"],
            team_id=team_id,
            details={"team_name": name, "minecraft_ign": item["minecraft_ign"], "discord": item["discord"]},
        )
    log_tournament_action(
        "team_created_with_4_players",
        user_id=user["id"],
        team_id=team_id,
        details={"team_name": name, "players": created_codes},
    )
    team_payload = serialize_tournament_team(team_id)
    return jsonify({
        "ok": True,
        "team": team_payload,
        "players": team_payload.get("players", []),
        "verification_codes": created_codes,
    })


@app.route("/api/tournament/join/<invite_token>", methods=["POST"])
@auth_required
def tournament_join_team_api(invite_token):
    ensure_tournament_schema()
    user = request.cu
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tournament_teams WHERE invite_token={ph()}", (invite_token,))
    team = to_dict(c.fetchone())
    if not team:
        return jsonify({"error": "Invalid invite link."}), 404
    error = assert_tournament_joinable(user, team["id"])
    if error:
        return jsonify({"error": error}), 400
    limits = tournament_limits()
    c.execute(f"SELECT COUNT(*) cnt FROM hc_tournament_members WHERE team_id={ph()}", (team["id"],))
    count = int((to_dict(c.fetchone()) or {}).get("cnt") or 0)
    if count >= limits["team_size"]:
        return jsonify({"error": "This team is already full."}), 400
    profile = user_rbw_profile(user)
    now = datetime.now()
    c.execute(
        f"""INSERT INTO hc_tournament_members(team_id,user_id,discord_id,minecraft_ign_snapshot,
            minecraft_ign_lc,rbw_uuid,rbw_source,role,joined_at) VALUES({phs(9)})""",
        (team["id"], user["id"], str(user.get("discord_id") or ""), profile["minecraft_ign"], profile["minecraft_ign"].lower(), profile["rbw_uuid"], profile["rbw_source"], "member", now),
    )
    status = recalc_team_status(team["id"], c)
    db.commit()
    log_tournament_action("player_joined", user_id=user["id"], team_id=team["id"], details={"team_name": team["team_name"], "minecraft_ign": profile["minecraft_ign"]})
    if status == "complete":
        log_tournament_action("team_full", team_id=team["id"], details={"team_name": team["team_name"]})
    return jsonify({"ok": True, "team": serialize_tournament_team(team["id"])})


@app.route("/api/tournament/verify", methods=["POST"])
@optional_auth
def tournament_verify_slot_api():
    ensure_tournament_schema()
    data = require_json()
    ign = clean_minecraft_ign(data.get("minecraft_ign") or data.get("username"))
    code = str(data.get("code") or "").strip()
    if not ign or not re.fullmatch(r"[0-9]{4}", code):
        return jsonify({"error": "Invalid username or code."}), 400
    limits = tournament_limits()
    if not limits["registration_open"]:
        return jsonify({"error": "Registration closed if backend blocks verification."}), 400

    db = get_db(); c = db_cursor(db)
    c.execute(
        f"""SELECT m.*, t.team_name, t.status team_status
            FROM hc_tournament_members m
            JOIN hc_tournament_teams t ON t.id=m.team_id
            WHERE m.minecraft_ign_lc={ph()}""",
        (ign.lower(),),
    )
    member = to_dict(c.fetchone())
    if not member:
        log_tournament_action("invalid_verification_attempt", details={"minecraft_ign": ign, "ip_address": get_client_ip(), "reason": "unknown_player"})
        return jsonify({"error": "Invalid username or code."}), 404
    if str(member.get("verification_status") or "").lower() == "verified":
        return jsonify({"error": "Player already verified."}), 400
    if str(member.get("verification_code") or "") != code:
        log_tournament_action(
            "invalid_verification_attempt",
            team_id=member.get("team_id"),
            details={"minecraft_ign": ign, "ip_address": get_client_ip(), "reason": "wrong_code"},
        )
        return jsonify({"error": "Invalid username or code."}), 400
    expires_at = parse_db_datetime(member.get("code_expires_at"))
    if expires_at and expires_at < datetime.now():
        return jsonify({"error": "Code expired."}), 400
    if str(member.get("team_status") or "").lower() in ("deleted", "removed"):
        return jsonify({"error": "Team was deleted."}), 404

    user = request.cu
    now = datetime.now()
    c.execute(
        f"""UPDATE hc_tournament_members
            SET verification_status='verified',
                verified_user_id={ph()},
                user_id=CASE WHEN user_id=0 THEN {ph()} ELSE user_id END,
                discord_id=CASE WHEN discord_id='' THEN {ph()} ELSE discord_id END,
                verified_at={ph()},
                code_used_at={ph()}
            WHERE id={ph()}""",
        (
            user["id"] if user else 0,
            user["id"] if user else 0,
            str((user or {}).get("discord_id") or ""),
            now,
            now,
            member["id"],
        ),
    )
    status = recalc_team_status(member["team_id"], c)
    db.commit()
    log_tournament_action(
        "player_verified",
        user_id=user["id"] if user else None,
        team_id=member["team_id"],
        details={"minecraft_ign": ign, "team_name": member["team_name"], "ip_address": get_client_ip()},
    )
    if status == "complete":
        log_tournament_action("team_completed_verification", team_id=member["team_id"], details={"team_name": member["team_name"]})
    return jsonify({
        "ok": True,
        "minecraft_ign": member["minecraft_ign_snapshot"],
        "team_name": member["team_name"],
        "team": serialize_tournament_team(member["team_id"]),
        "discord_required": False,
    })


@app.route("/api/tournament/leave", methods=["POST"])
@auth_required
def tournament_leave_team_api():
    user = request.cu
    db = get_db(); c = db_cursor(db)
    member = get_user_tournament_member(user["id"], c)
    if not member:
        return jsonify({"error": "You are not on a tournament team."}), 404
    if member["role"] == "captain":
        return jsonify({"error": "Captains cannot leave their team. Ask staff to delete or manage the team."}), 400
    c.execute(f"SELECT COUNT(*) cnt FROM hc_tournament_members WHERE team_id={ph()}", (member["team_id"],))
    count = int((to_dict(c.fetchone()) or {}).get("cnt") or 0)
    if count >= tournament_limits()["team_size"]:
        return jsonify({"error": "You cannot leave after your team is full. Ask staff for help."}), 400
    c.execute(f"DELETE FROM hc_tournament_members WHERE id={ph()}", (member["id"],))
    recalc_team_status(member["team_id"], c)
    db.commit()
    log_tournament_action("player_left", user_id=user["id"], team_id=member["team_id"], details={"minecraft_ign": member["minecraft_ign_snapshot"], "team_name": member["team_name"]})
    return jsonify({"ok": True})


@app.route("/api/staff/tournament/teams")
@staff_required
def staff_tournament_teams_api():
    q = request.args.get("q", "").strip().lower()
    teams = serialize_tournament_team(public=False)
    if q:
        teams = [
            t for t in teams
            if q in t["team_name"].lower()
            or any(q in str(m.get("website_username","")).lower() or q in str(m.get("discord_username","")).lower()
                   or q in str(m.get("discord_id","")).lower() or q in str(m.get("minecraft_ign","")).lower()
                   for m in t["members"])
        ]
    return jsonify({"teams": teams, "settings": tournament_limits()})


@app.route("/api/staff/tournament/teams/<int:team_id>/rename", methods=["POST"])
@staff_required
def staff_tournament_rename_api(team_id):
    name = clean_team_name(require_json().get("team_name"))
    if not name:
        return jsonify({"error": "Team name must be 3-40 characters."}), 400
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_tournament_teams SET team_name={ph()}, updated_at={ph()} WHERE id={ph()}", (name, datetime.now(), team_id))
    db.commit()
    log_tournament_action("team_renamed", staff_user_id=request.cu["id"], team_id=team_id, details={"team_name": name})
    return jsonify({"ok": True, "team": serialize_tournament_team(team_id)})


@app.route("/api/staff/tournament/teams/<int:team_id>/confirm", methods=["POST"])
@staff_required
def staff_tournament_confirm_api(team_id):
    db = get_db(); c = db_cursor(db)
    c.execute(
        f"""SELECT COUNT(*) cnt FROM hc_tournament_members
            WHERE team_id={ph()} AND verification_status='verified'""",
        (team_id,),
    )
    count = int((to_dict(c.fetchone()) or {}).get("cnt") or 0)
    if count < tournament_limits()["team_size"]:
        return jsonify({"error": "Only fully verified teams can be confirmed."}), 400
    c.execute(f"UPDATE hc_tournament_teams SET status='confirmed', updated_at={ph()} WHERE id={ph()}", (datetime.now(), team_id))
    db.commit()
    log_tournament_action("team_confirmed", staff_user_id=request.cu["id"], team_id=team_id)
    return jsonify({"ok": True, "team": serialize_tournament_team(team_id)})


@app.route("/api/staff/tournament/members/<int:member_id>", methods=["DELETE"])
@staff_required
def staff_tournament_remove_member_api(member_id):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tournament_members WHERE id={ph()}", (member_id,))
    member = to_dict(c.fetchone())
    if not member:
        return jsonify({"error": "Member not found."}), 404
    c.execute(f"DELETE FROM hc_tournament_members WHERE id={ph()}", (member_id,))
    recalc_team_status(member["team_id"], c)
    db.commit()
    log_tournament_action("player_removed", user_id=member["user_id"], staff_user_id=request.cu["id"], team_id=member["team_id"], details={"minecraft_ign": member["minecraft_ign_snapshot"]})
    return jsonify({"ok": True})


@app.route("/api/staff/tournament/teams/<int:team_id>", methods=["DELETE"])
@staff_required
def staff_tournament_delete_team_api(team_id):
    team = serialize_tournament_team(team_id)
    if not team:
        return jsonify({"error": "Team not found."}), 404
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_tournament_members WHERE team_id={ph()}", (team_id,))
    c.execute(f"DELETE FROM hc_tournament_teams WHERE id={ph()}", (team_id,))
    db.commit()
    log_tournament_action("team_deleted", staff_user_id=request.cu["id"], team_id=team_id, details={"team_name": team["team_name"]})
    return jsonify({"ok": True})


@app.route("/api/staff/tournament/settings", methods=["POST"])
@staff_required
def staff_tournament_settings_api():
    open_value = "1" if bool(require_json().get("registration_open")) else "0"
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_tournament_settings SET setting_value={ph()}, updated_at={ph()} WHERE setting_key='tournament_registration_open'", (open_value, datetime.now()))
    db.commit()
    log_tournament_action("registration_open_changed", staff_user_id=request.cu["id"], details={"registration_open": open_value == "1"})
    return jsonify({"ok": True, "settings": tournament_limits()})


@app.route("/api/staff/tournament/logs")
@staff_required
def staff_tournament_logs_api():
    db = get_db(); c = db_cursor(db)
    c.execute(
        """SELECT l.*, u.username user_name, s.username staff_name, t.team_name
           FROM hc_tournament_logs l
           LEFT JOIN hc_users u ON u.id=l.user_id
           LEFT JOIN hc_users s ON s.id=l.staff_user_id
           LEFT JOIN hc_tournament_teams t ON t.id=l.team_id
           ORDER BY l.created_at DESC LIMIT 300"""
    )
    rows = []
    for r in to_list(c.fetchall()):
        r["created_at"] = isoformat_utc(r.get("created_at"))
        try:
            r["details"] = json.loads(r.get("details_json") or "{}")
        except Exception:
            r["details"] = {}
        r.pop("details_json", None)
        rows.append(r)
    return jsonify(rows)


@app.route("/api/staff/tournament/export")
@staff_required
def staff_tournament_export_api():
    fmt = request.args.get("format", "json").lower()
    teams = serialize_tournament_team(public=False)
    if fmt == "csv":
        lines = ["team_name,status,role,minecraft_ign,website_username,discord_username,discord_id"]
        for t in teams:
            for m in t["members"]:
                vals = [t["team_name"], t["status"], m["role"], m["minecraft_ign"], m.get("website_username",""), m.get("discord_username",""), m.get("discord_id","")]
                lines.append(",".join('"' + str(v).replace('"', '""') + '"' for v in vals))
        return Response("\n".join(lines), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=hellcore-tournament.csv"})
    return jsonify({"teams": teams})

@app.route("/api/bot/tickets/transcripts", methods=["POST"])
def bot_ticket_transcript_upload():
    """Store a Discord ticket transcript and return a public hellcore.net link."""
    bot_secret = os.environ.get("HC_BOT_SECRET", "hellcore-secret-123")
    website_key = os.environ.get("WEBSITE_API_KEY", "hellcore_secret_key")
    provided_secret = request.headers.get("X-Bot-Secret", "")
    provided_key = request.headers.get("X-API-Key", "")
    secret_ok = bool(bot_secret and provided_secret and hmac.compare_digest(provided_secret, bot_secret))
    key_ok = bool(website_key and provided_key and hmac.compare_digest(provided_key, website_key))
    if not (secret_ok or key_ok):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json(silent=True) or {}
    ticket_id = str(data.get("ticket_id") or data.get("channel_id") or "").strip()
    html_body = str(data.get("html") or "")
    if not ticket_id or not html_body:
        return jsonify({"error": "Missing ticket_id or html"}), 400
    if not re.fullmatch(r"[A-Za-z0-9_-]{3,80}", ticket_id):
        return jsonify({"error": "Invalid ticket_id"}), 400

    fields = {
        "public_id": ticket_id,
        "guild_id": str(data.get("guild_id") or ""),
        "guild_name": str(data.get("guild_name") or "")[:200],
        "channel_id": str(data.get("channel_id") or ""),
        "channel_name": str(data.get("channel_name") or "")[:120],
        "owner_id": str(data.get("owner_id") or ""),
        "ticket_type": str(data.get("ticket_type") or "")[:80],
        "ticket_type_label": str(data.get("ticket_type_label") or "")[:120],
        "claimed_staff_id": str(data.get("claimed_staff_id") or ""),
        "status": str(data.get("status") or "")[:40],
        "priority": str(data.get("priority") or "")[:40],
        "created_time": str(data.get("created_time") or "")[:80],
        "requested_by_id": str(data.get("requested_by_id") or ""),
        "requested_by_name": str(data.get("requested_by_name") or "")[:120],
        "reason": str(data.get("reason") or ""),
        "filename": str(data.get("filename") or f"{ticket_id}-transcript.html")[:200],
        "html": html_body,
    }

    db = get_db(); c = db_cursor(db)
    now = datetime.now()
    if _DB_MODE == "sqlite":
        cols = list(fields.keys()) + ["created_at", "updated_at"]
        vals = list(fields.values()) + [now, now]
        update_cols = [col for col in fields.keys() if col != "public_id"] + ["updated_at"]
        update_sql = ", ".join(f"{col}=excluded.{col}" for col in update_cols)
        c.execute(
            f"INSERT INTO hc_ticket_transcripts ({','.join(cols)}) VALUES ({phs(len(cols))}) "
            f"ON CONFLICT(public_id) DO UPDATE SET {update_sql}",
            vals,
        )
    else:
        cols = list(fields.keys()) + ["created_at", "updated_at"]
        vals = list(fields.values()) + [now, now]
        update_cols = [col for col in fields.keys() if col != "public_id"] + ["updated_at"]
        update_sql = ", ".join(f"{col}=VALUES({col})" for col in update_cols)
        c.execute(
            f"INSERT INTO hc_ticket_transcripts ({','.join(cols)}) VALUES ({phs(len(cols))}) "
            f"ON DUPLICATE KEY UPDATE {update_sql}",
            vals,
        )
    db.commit()

    url = f"{request.host_url.rstrip('/')}/tickets/{ticket_id}"
    return jsonify({"ok": True, "ticket_id": ticket_id, "url": url, "transcript_url": url})


@app.route("/api/tickets/upload", methods=["POST"])
def discord_ticket_log_upload():
    """Immutable Discord ticket-log upload endpoint for bot integrations."""
    raw_body = request.get_data(cache=True, as_text=True) or ""
    headers_json = json.dumps(public_headers_snapshot(), sort_keys=True)
    auth_status = ticket_upload_auth_status()
    if not auth_status["ok"]:
        record_ticket_upload_attempt("", raw_body, headers_json, "unauthorized", 0, "weak", ["Invalid or missing API authentication."])
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True)
    score, level, notes, errors = score_ticket_upload_payload(data, auth_status)
    ticket_id = str((data or {}).get("ticket_id") or "").strip() if isinstance(data, dict) else ""
    if errors:
        record_ticket_upload_attempt(ticket_id, raw_body, headers_json, "invalid", score, level, notes)
        return jsonify({"error": "Invalid ticket upload", "details": errors}), 400

    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_discord_ticket_logs WHERE ticket_id={ph()}", (ticket_id,))
    if c.fetchone():
        dup_notes = list(notes) + ["Duplicate upload attempt; original ticket log was not changed."]
        dup_score = min(score, 60)
        record_ticket_upload_attempt(ticket_id, raw_body, headers_json, "duplicate", dup_score, ticket_quality_level(dup_score), dup_notes)
        return jsonify({"error": "Ticket log already uploaded", "ticket_id": ticket_id}), 409

    attachments_json = json.dumps(data.get("attachments") or [], ensure_ascii=False)
    values = (
        ticket_id,
        str(data.get("user_id") or "").strip(),
        str(data.get("username") or "").strip()[:120],
        str(data.get("staff_id") or "").strip(),
        str(data.get("channel_id") or "").strip(),
        str(data.get("category") or "").strip()[:80],
        str(data.get("opened_at") or "").strip(),
        str(data.get("closed_at") or "").strip(),
        str(data.get("transcript") or ""),
        attachments_json,
        str(data.get("close_reason") or ""),
        get_client_ip(),
        request.headers.get("User-Agent", "")[:255],
        headers_json,
        raw_body,
        score,
        level,
        "\n".join(notes),
    )
    c.execute(
        f"INSERT INTO hc_discord_ticket_logs(ticket_id,user_id,username,staff_id,channel_id,category,opened_at,closed_at,transcript,attachments,close_reason,uploader_ip,user_agent,headers_json,raw_body,quality_score,quality_level,quality_notes) VALUES({phs(18)})",
        values[:15] + (100, "approved", "Auto approved."),
    )
    db.commit()
    public_base = os.environ.get("WEBSITE_PUBLIC_URL", "https://hellcore.net").rstrip("/")
    ticket_url = f"{public_base}/?ticket_id={urllib.parse.quote(ticket_id)}"
    return jsonify({"ok": True, "ticket_id": ticket_id, "url": ticket_url, "ticket_url": ticket_url}), 201


@app.route("/api/tickets/docs")
def discord_ticket_upload_docs():
    base_url = request.host_url.rstrip("/")
    sample = {
        "ticket_id": "ticket-12345",
        "user_id": "123456789012345678",
        "username": "PlayerName",
        "staff_id": "234567890123456789",
        "channel_id": "345678901234567890",
        "category": "support",
        "opened_at": "2026-05-28T12:00:00Z",
        "closed_at": "2026-05-28T12:30:00Z",
        "transcript": "Ticket transcript text or HTML",
        "attachments": [{"name": "proof.png", "url": "https://example.com/proof.png"}],
        "close_reason": "Resolved",
    }
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hellcore Ticket Upload API</title>
<style>
body{{margin:0;background:#080808;color:#f5f5f5;font-family:Inter,Arial,sans-serif;line-height:1.5}}
main{{max-width:900px;margin:0 auto;padding:42px 18px}}
h1,h2{{font-family:Arial,sans-serif}}code,pre{{background:#151515;border:1px solid #2b2b2b;border-radius:8px}}
code{{padding:2px 5px}}pre{{padding:16px;overflow:auto}}.ok{{color:#35d07f}}.err{{color:#ff6b6b}}
</style></head><body><main>
<h1>Hellcore Ticket Upload API</h1>
<p>Use this endpoint to upload a completed Discord ticket log to Hellcore.</p>
<h2>Endpoint</h2>
<pre>POST {html_escape(base_url)}/api/tickets/upload</pre>
<h2>Authentication</h2>
<p>Send one authentication header with each request:</p>
<pre>X-API-Key: YOUR_API_KEY</pre>
<h2>Required JSON Fields</h2>
<p><code>{'</code>, <code>'.join(sorted(TICKET_UPLOAD_FIELDS))}</code></p>
<h2>Example Request Body</h2>
<pre>{html_escape(json.dumps(sample, indent=2))}</pre>
<h2>Responses</h2>
<pre class="ok">201 Created: {{"ok": true, "ticket_id": "ticket-12345", "ticket_url": "https://hellcore.net/?ticket_id=ticket-12345"}}</pre>
<pre class="err">400 Bad Request: invalid or missing fields
401 Unauthorized: missing or invalid API key
409 Conflict: ticket_id was already uploaded</pre>
<h2>Production Notes</h2>
<p>Use stable ticket IDs, ISO timestamps, a JSON array for attachments, complete transcripts, and handle duplicate uploads without retry loops.</p>
</main></body></html>"""
    return Response(html, mimetype="text/html; charset=utf-8")


@app.route("/apies", methods=["GET", "POST"])
def apies_panel():
    error = ""
    if request.method == "POST":
        password = request.form.get("password", "")
        if hmac.compare_digest(password, "kqhere"):
            session["apies_authorized"] = True
            return redirect("/apies")
        error = "Invalid password"
    return render_template("apies.html", authorized=bool(session.get("apies_authorized")), error=error)


@app.route("/api/apies/tickets")
@apies_required
def apies_tickets_list():
    filters = []
    params = []

    filter_map = {
        "ticket_id": "ticket_id",
        "user_id": "user_id",
        "username": "username",
        "staff_id": "staff_id",
        "category": "category",
    }
    for arg, col in filter_map.items():
        val = request.args.get(arg, "").strip()
        if val:
            if arg in ("username", "category"):
                filters.append(f"{col} LIKE {ph()}")
                params.append(f"%{val}%")
            else:
                filters.append(f"{col}={ph()}")
                params.append(val)

    keyword = request.args.get("keyword", "").strip()
    if keyword:
        filters.append(f"transcript LIKE {ph()}")
        params.append(f"%{keyword}%")

    date_from = request.args.get("date_from", "").strip()
    if date_from:
        filters.append(f"created_at >= {ph()}")
        params.append(date_from)

    date_to = request.args.get("date_to", "").strip()
    if date_to:
        filters.append(f"created_at <= {ph()}")
        params.append(date_to + " 23:59:59" if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_to) else date_to)

    where = " WHERE " + " AND ".join(filters) if filters else ""
    db = get_db(); c = db_cursor(db)
    c.execute(
        "SELECT id,ticket_id,user_id,username,staff_id,channel_id,category,opened_at,closed_at,"
        "close_reason,uploader_ip,user_agent,created_at "
        f"FROM hc_discord_ticket_logs{where} ORDER BY created_at DESC LIMIT 200",
        tuple(params),
    )
    rows = []
    for row in to_list(c.fetchall()):
        row["created_at"] = isoformat_utc(row.get("created_at"))
        rows.append(row)
    return jsonify(rows)


@app.route("/api/apies/tickets/<int:log_id>")
@apies_required
def apies_ticket_detail(log_id):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_discord_ticket_logs WHERE id={ph()}", (log_id,))
    ticket = serialize_discord_ticket_row(c.fetchone())
    if not ticket:
        return jsonify({"error": "Ticket log not found"}), 404

    return jsonify(ticket)

@app.route("/tickets/<ticket_id>")
@app.route("/ticket/<ticket_id>")
@app.route("/ticket-<ticket_id>")
def ticket_transcript_view(ticket_id):
    """Public read-only transcript page."""
    ticket_id = str(ticket_id or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{3,80}", ticket_id):
        return Response("Invalid ticket id", status=400, mimetype="text/plain")

    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT html FROM hc_ticket_transcripts WHERE public_id={ph()}", (ticket_id,))
    row = to_dict(c.fetchone())
    if not row:
        return Response("Ticket transcript not found.", status=404, mimetype="text/plain")

    response = Response(row["html"], mimetype="text/html; charset=utf-8")
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response

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
@optional_auth
def tickets_list():
    u = request.cu; db = get_db(); c = db_cursor(db)
    email = request.args.get("email", "").strip()
    
    if u and u["role"] in STAFF_ROLES:
        # Staff sees all
        c.execute("SELECT t.*, u.username author_name, a.username assigned_name FROM hc_tickets t "
                  "LEFT JOIN hc_users u ON t.author_id=u.id "
                  "LEFT JOIN hc_users a ON t.assigned_to=a.id "
                  "ORDER BY COALESCE(t.last_message_at, t.created_at) DESC")
    elif u:
        # User sees their own
        c.execute(f"SELECT t.*, u.username author_name, a.username assigned_name FROM hc_tickets t "
                  f"LEFT JOIN hc_users u ON t.author_id=u.id "
                  f"LEFT JOIN hc_users a ON t.assigned_to=a.id "
                  f"WHERE t.author_id={ph()} ORDER BY COALESCE(t.last_message_at, t.created_at) DESC",
                  (u["id"],))
    elif email:
        # Guest sees by email
        c.execute(f"SELECT t.*, CAST(NULL AS CHAR) author_name, CAST(NULL AS CHAR) assigned_name FROM hc_tickets t "
                  f"WHERE t.email={ph()} AND (t.author_id IS NULL OR t.author_id=0) "
                  f"ORDER BY COALESCE(t.last_message_at, t.created_at) DESC",
                  (email,))
    else:
        return jsonify([])
        
    rows = to_list(c.fetchall())
    for r in rows:
        r["created_at"] = ts(r["created_at"])
        r["last_message_at"] = ts(r.get("last_message_at") or r["created_at"])
        c.execute(f"SELECT COUNT(*) cnt, COALESCE(MAX(id), 0) last_message_id FROM hc_ticket_msgs WHERE ticket_id={ph()}", (r["id"],))
        mc = to_dict(c.fetchone())
        r["message_count"] = int(mc["cnt"]) if mc else 0
        r["last_message_id"] = int(mc.get("last_message_id") or 0) if mc else 0
        r["priority"] = normalize_ticket_priority(r.get("priority"))
        enrich_user_with_rank(r, r.get("author_id"), c)
        r["author_name"] = r.get("author_name") or r.get("email") or "Guest"
        if r.get("category") == "purchase" or r.get("source") == "store":
            r["order_summary"] = get_ticket_order_summary(r["id"], c)

    return jsonify(rows)

@app.route("/api/tickets", methods=["POST"])
@optional_auth
def ticket_create():
    d = request.get_json(force=True) or {}
    title = d.get("title") or d.get("subject")
    description = d.get("description") or d.get("message")
    email = d.get("email", "").strip()
    source = d.get("source", "web")
    
    if not title or not description:
        return jsonify({"error":"All fields required"}), 400
        
    u = request.cu
    if not u and not email:
        return jsonify({"error": "Email required for guest tickets"}), 400

    if u and u.get("role") not in STAFF_ROLES:
        if not u.get("is_verified"):
             return jsonify({"error": "Please verify your Minecraft identity to create support tickets."}), 403



    db = get_db(); c = db_cursor(db)
    pr = normalize_ticket_priority(d.get("priority"))
    now = datetime.now()
    category = d.get("category","general")
    
    uid = u["id"] if u else 0
    uemail = u["email"] if u else email
    uname = u["username"] if u else "Guest"
    
    c.execute(f"INSERT INTO hc_tickets(title,description,author_id,email,source,category,priority,last_message_at) VALUES({phs(8)})",
              (title, description, uid, uemail, source, category, pr, now))
    db.commit(); tid = c.lastrowid
    emit_ticket_event(tid, "ticket-created", {
        "ticket_id": tid,
        "title": title,
        "username": uname,
        "priority": pr,
        "category": category,
        "url": f"/tickets?id={tid}",
    })

    # Discord Webhook Notification
    notify_discord_ticket(tid, title, description, uname, category)

    # Browser push to all staff
    try:
        c_staff = db_cursor(get_db())
        c_staff.execute("SELECT id FROM hc_users WHERE role IN ('helper','mod','dev','admin','owner','founder')")
        staff_ids = [r["id"] for r in to_list(c_staff.fetchall())]
        c_staff.close()
        send_push_notification(staff_ids, f"New Ticket: {title}", f"From {uname} • Priority: {pr}", url=f"/tickets?id={tid}")
    except: pass

    return jsonify({"id":tid,"ok":True,"redirect_url":f"/tickets?id={tid}"})

@app.route("/api/push/subscribe", methods=["POST"])
@auth_required
def push_subscribe():
    d = request.get_json(force=True) or {}
    sub = d.get("subscription")
    if not sub: return jsonify({"error": "Missing subscription"}), 400
    # Any authenticated user can subscribe to their own push notifications

    
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
@optional_auth
def ticket_get(tid):
    u = request.cu; db = get_db(); c = db_cursor(db)
    email = request.args.get("email", "").strip()
    
    c.execute(f"SELECT t.*, u.username author_name, a.username assigned_name FROM hc_tickets t "
              f"LEFT JOIN hc_users u ON t.author_id=u.id LEFT JOIN hc_users a ON t.assigned_to=a.id WHERE t.id={ph()}", (tid,))
    t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if not can_view_ticket(t, u, email):
        return jsonify({"error":"Forbidden"}), 403
    t["created_at"] = ts(t["created_at"])
    t["last_message_at"] = ts(t.get("last_message_at") or t["created_at"])
    t["priority"] = normalize_ticket_priority(t.get("priority"))
    enrich_user_with_rank(t, t.get("author_id"), c)
    t["author_name"] = t.get("author_name") or t.get("email") or "Guest"
    t["order_summary"] = get_ticket_order_summary(tid, c)
    perms = {
        "can_manage": can_manage_ticket(t, u, email),
        "can_delete": bool(u and (t["author_id"] == u["id"] or u["role"] in ADMIN_ROLES)),
        "can_assign": bool(u and u["role"] in STAFF_ROLES),
        "can_internal_note": bool(u and u["role"] in STAFF_ROLES),
        "can_rank_grant": bool(u and u["role"] in ADMIN_ROLES),
    }
    c.execute(f"SELECT m.*, u.username author_name, u.role author_role FROM hc_ticket_msgs m "
              f"LEFT JOIN hc_users u ON m.author_id=u.id WHERE m.ticket_id={ph()} ORDER BY m.created_at ASC", (tid,))
    msgs = to_list(c.fetchall())
    for m in msgs:
        m["created_at"] = ts(m["created_at"])
        m["is_internal"] = int(m.get("is_internal") or 0)
        enrich_user_with_rank(m, m.get("author_id"), c)
        if m["is_internal"] and (not u or u["role"] not in STAFF_ROLES):
            m["content"] = "[Internal note]"
    if not u or u["role"] not in STAFF_ROLES:
        msgs = [m for m in msgs if int(m.get("is_internal") or 0) == 0]
    
    c.execute(f"SELECT a.*, u.username actor_name FROM hc_ticket_activity a "
              f"LEFT JOIN hc_users u ON a.actor_id=u.id WHERE a.ticket_id={ph()} ORDER BY a.created_at DESC LIMIT 40", (tid,))
    acts = to_list(c.fetchall())
    for a in acts: a["created_at"] = ts(a["created_at"])
    
    staff = []
    if u and u["role"] in STAFF_ROLES:
        c.execute("SELECT id, username, role FROM hc_users WHERE role IN ('helper','mod','dev','admin','owner','founder') ORDER BY username ASC")
        staff = [enrich_user_with_rank(row, row.get("id"), c) for row in to_list(c.fetchall())]
    
    return jsonify({"ticket":t,"messages":msgs,"activity":acts,"staff":staff,"permissions":perms})

@app.route("/api/tickets/<int:tid>/typing", methods=["POST"])
@optional_auth
def ticket_typing(tid):
    if not pusher_client: return jsonify({"ok":False}), 501
    u = request.cu
    if not u: return jsonify({"ok":False}), 401
    typing_rank = get_rank_payload_for_user(u["id"])
    pusher_client.trigger(f'ticket-{tid}', 'typing', {
        "username": u["username"],
        "primary_rank": typing_rank["primary_rank"],
    })
    return jsonify({"ok":True})

@app.route("/api/tickets/<int:tid>/msg", methods=["POST"])
@optional_auth
def ticket_msg(tid):
    d = request.get_json(force=True) or {}
    content = d.get("content", "").strip()
    email = d.get("email", "").strip()
    img_data = d.get("image")
    is_internal = 1 if bool(d.get("is_internal")) else 0
    
    if not content and not img_data:
        return jsonify({"error":"Content or image required"}), 400
        
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,)); t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if not can_view_ticket(t, u, email):
        return jsonify({"error":"Forbidden"}), 403
    if is_internal and (not u or u["role"] not in STAFF_ROLES):
        return jsonify({"error":"Staff only note"}), 403
        
    img_url = ""
    # ... Image handling ... (Keep existing logic but handle missing u)
    uid = u["id"] if u else 0
    
    mtype = "internal" if is_internal else ("admin" if u and u["role"] in STAFF_ROLES else "user")
    c.execute(f"INSERT INTO hc_ticket_msgs(ticket_id,author_id,content,image_url,is_internal,message_type) VALUES({phs(6)})",
              (tid, uid, content, img_url, is_internal, mtype))
    mid = c.lastrowid
    c.execute(f"UPDATE hc_tickets SET last_message_at={ph()} WHERE id={ph()}", (datetime.now(), tid))
    if is_internal and u:
        add_ticket_activity(c, tid, u["id"], "internal_note", content[:120])
    db.commit()
    
    c.execute(f"SELECT m.*, u.username author_name, u.role author_role FROM hc_ticket_msgs m "
              f"LEFT JOIN hc_users u ON m.author_id=u.id WHERE m.id={ph()}", (mid,))
    msg = to_dict(c.fetchone())
    msg["created_at"] = ts(msg["created_at"])
    enrich_user_with_rank(msg, msg.get("author_id"), c)

    # WebSocket Update
    emit_ticket_event(tid, "new-message", {"message": msg})
    emit_ticket_event(tid, "ticket-updated", {
        "ticket_id": tid,
        "last_message_id": mid,
        "status": t.get("status", "open"),
        "priority": t.get("priority", "normal"),
    })

    # Browser Push Notification
    if not is_internal:
        author_name = msg.get("author_name") or "System"
        notif_title = f"New reply: Ticket #{tid}"
        notif_body = f"{author_name}: {content[:60]}..."
        notif_url = f"/tickets?id={tid}"
        
        if u and u["role"] in STAFF_ROLES:
            # Staff replied -> Notify author
            if t["author_id"]:
                send_push_notification(t["author_id"], notif_title, notif_body, url=notif_url)
        else:
            # User replied -> Notify staff
            try:
                c_push = db_cursor(get_db())
                # Notify assigned staff or all staff if not assigned
                if t.get("assigned_to"):
                    target_staff = [t["assigned_to"]]
                else:
                    c_push.execute("SELECT id FROM hc_users WHERE role IN ('helper','mod','dev','admin','owner','founder')")
                    target_staff = [r["id"] for r in to_list(c_push.fetchall())]
                c_push.close()
                send_push_notification(target_staff, notif_title, notif_body, url=notif_url)
            except: pass

    return jsonify({"ok":True,"message":msg})

@app.route("/api/tickets/<int:tid>/updates")
@optional_auth
def ticket_updates(tid):
    after_id = int(request.args.get("after_id", "0") or 0)
    email = request.args.get("email", "").strip()
    u = request.cu; db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_tickets WHERE id={ph()}", (tid,))
    t = to_dict(c.fetchone())
    if not t: return jsonify({"error":"Not found"}), 404
    if not can_view_ticket(t, u, email):
        return jsonify({"error":"Forbidden"}), 403
    c.execute(f"SELECT m.*, u.username author_name, u.role author_role FROM hc_ticket_msgs m "
              f"LEFT JOIN hc_users u ON m.author_id=u.id WHERE m.ticket_id={ph()} AND m.id>{ph()} ORDER BY m.id ASC", (tid, after_id))
    msgs = to_list(c.fetchall())
    for m in msgs:
        m["created_at"] = ts(m["created_at"])
        enrich_user_with_rank(m, m.get("author_id"), c)
    if not u or u["role"] not in STAFF_ROLES:
        msgs = [m for m in msgs if int(m.get("is_internal") or 0) == 0]
    c.execute(f"SELECT status,priority,assigned_to,last_message_at,COALESCE((SELECT MAX(id) FROM hc_ticket_msgs WHERE ticket_id={ph()}),0) last_message_id FROM hc_tickets WHERE id={ph()}", (tid, tid))
    meta = to_dict(c.fetchone()) or {}
    meta["last_message_at"] = ts(meta.get("last_message_at"))
    meta["order_summary"] = get_ticket_order_summary(tid, c)
    
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
        event_status = "closed"
        event_priority = t.get("priority")
        event_assigned_to = t.get("assigned_to")
    elif action == "reopen":
        c.execute(f"UPDATE hc_tickets SET status='open' WHERE id={ph()}", (tid,))
        add_ticket_activity(c, tid, u["id"], "status", "open")
        event_status = "open"
        event_priority = t.get("priority")
        event_assigned_to = t.get("assigned_to")
    elif action == "assign":
        if u["role"] not in STAFF_ROLES:
            return jsonify({"error":"Staff only"}), 403
        assigned_to = d.get("assigned_to")
        if assigned_to in (None, "", 0):
            c.execute(f"UPDATE hc_tickets SET assigned_to=NULL WHERE id={ph()}", (tid,))
            add_ticket_activity(c, tid, u["id"], "assignment", "unassigned")
            event_assigned_to = None
        else:
            c.execute(f"SELECT id, username FROM hc_users WHERE id={ph()}", (int(assigned_to),))
            au = to_dict(c.fetchone())
            if not au:
                return jsonify({"error":"Assignee not found"}), 404
            c.execute(f"UPDATE hc_tickets SET assigned_to={ph()} WHERE id={ph()}", (au["id"], tid))
            add_ticket_activity(c, tid, u["id"], "assignment", f"assigned_to:{au['username']}")
            event_assigned_to = au["id"]
        event_status = t.get("status")
        event_priority = t.get("priority")
    elif action == "priority":
        if u["role"] not in STAFF_ROLES:
            return jsonify({"error":"Staff only"}), 403
        p = normalize_ticket_priority(d.get("priority"))
        c.execute(f"UPDATE hc_tickets SET priority={ph()} WHERE id={ph()}", (p, tid))
        add_ticket_activity(c, tid, u["id"], "priority", p)
        event_status = t.get("status")
        event_priority = p
        event_assigned_to = t.get("assigned_to")
    elif action in ("payment_received", "payment_pending", "need_details"):
        if u["role"] not in STAFF_ROLES:
            return jsonify({"error":"Staff only"}), 403
        add_ticket_activity(c, tid, u["id"], "payment", action)
        event_status = t.get("status")
        event_priority = t.get("priority")
        event_assigned_to = t.get("assigned_to")
    else:
        return jsonify({"error":"Unknown action"}), 400

    c.execute(f"UPDATE hc_tickets SET last_message_at={ph()} WHERE id={ph()}", (datetime.now(), tid))
    db.commit()
    emit_ticket_event(tid, "ticket-updated", {
        "ticket_id": tid,
        "status": event_status,
        "priority": event_priority,
        "assigned_to": event_assigned_to,
    })
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
    emit_ticket_event(tid, "ticket-updated", {"ticket_id": tid, "status": "closed"})
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
    c.execute(f"INSERT INTO hc_command_queue(command,target) VALUES({phs(2)})", (cmd, "proxy"))
    add_ticket_activity(c, tid, u["id"], "rank_grant", f"{mode}:{username}:{rank}:{duration}")
    c.execute(f"INSERT INTO hc_ticket_msgs(ticket_id,author_id,content,is_internal,message_type) VALUES({phs(5)})",
              (tid, u["id"], f"Rank grant queued for {username} -> {rank} ({mode}{' '+duration if mode=='temp_add' else ''})", 1, "system"))
    c.execute(f"UPDATE hc_tickets SET last_message_at={ph()} WHERE id={ph()}", (datetime.now(), tid))
    db.commit()
    emit_ticket_event(tid, "ticket-updated", {"ticket_id": tid, "status": t.get("status", "open"), "rank_grant": True})
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
    emit_ticket_event(tid, "ticket-updated", {"ticket_id": tid, "deleted": True})
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

@app.route("/api/store/checkout", methods=["POST"])
@auth_required
def store_checkout():
    # Supports both logged-in users and guests
    d = request.get_json(force=True) or {}
    email = d.get("email", "").strip()
    
    u = request.cu
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_cart WHERE user_id={ph()}", (u["id"],))
    cart_items = to_list(c.fetchall())
    if not cart_items:
        return jsonify({"error": "Cart is empty"}), 400
    result = create_purchase_order_record(c, u, cart_items, source_app="main")
    c.execute(f"DELETE FROM hc_cart WHERE user_id={ph()}", (u["id"],))
    db.commit()
    emit_ticket_event(result["ticket_id"], "ticket-updated", {
        "ticket_id": result["ticket_id"],
        "status": "open",
        "priority": "high",
        "order_code": result["order_code"],
    })
    return jsonify(result)

    uid = u["id"] if u else None
    uemail = u["email"] if u else email
    
    if not u and not email:
        return jsonify({"error": "Email required for guest checkout"}), 400

    db = get_db(); c = db_cursor(db)
    
    # 1. Create Ticket
    # We use a unique order ID in the title for tracking
    title = "🧾 Store Order #" + secrets.token_hex(4).upper()
    desc = "Direct checkout from store."
    c.execute(
        f"INSERT INTO hc_tickets (title, description, author_id, email, source, status, last_message_at) VALUES ({phs(7)})",
        (title, desc, uid, uemail, "store", "open", datetime.now())
    )
    tid = c.lastrowid
    
    # 2. Create Initial Message (System notification)
    c.execute(
        f"INSERT INTO hc_ticket_msgs (ticket_id, author_id, content, message_type) VALUES ({phs(4)})",
        (tid, uid or 0, "🧾 Order received. Processing your request...", "system")
    )
    
    db.commit()
    return jsonify({"ticket_id": tid})

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
@admin_required
def gift_send():
    d = request.get_json(force=True) or {}
    to_nm = str(d.get("to_username","")).strip()
    item_name = normalize_rank_command_name(d.get("item_name", ""))
    if item_name not in {"vip", "vip+", "mvp", "mvp+", "mvp++"}:
        return jsonify({"error":"Unsupported gift rank"}), 400
    display_name = canonical_rank_display(item_name)
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT id FROM hc_users WHERE username={ph()}", (to_nm,))
    if not c.fetchone(): return jsonify({"error":"Player not found"}), 404
    c.execute(f"INSERT INTO hc_gifts(from_user_id,to_username,item_type,item_name,gamemode) VALUES({phs(5)})",
              (request.cu["id"], to_nm, "rank", display_name, d.get("gamemode","global")))
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
    if str(g.get("item_type") or "rank").lower() != "rank":
        return jsonify({"error":"Unsupported gift type"}), 400
    username = resolve_purchase_username(u)
    if not username:
        return jsonify({"error":"Link a Minecraft account before accepting this gift."}), 400
    rank_name = normalize_rank_command_name(g.get("item_name"))
    display_name = canonical_rank_display(rank_name)
    gamemode = str(g.get("gamemode") or "global").strip().lower() or "global"
    c.execute(f"DELETE FROM hc_ranks WHERE user_id={ph()} AND gamemode={ph()}", (u["id"], gamemode))
    c.execute(f"INSERT INTO hc_ranks(user_id,gamemode,rank_name) VALUES({phs(3)})", (u["id"], gamemode, rank_name))
    c.execute(f"INSERT INTO hc_command_queue(command,target,status) VALUES({phs(3)})",
              (f"lpv user {username} parent set {rank_name}", "proxy", "pending"))
    c.execute(f"INSERT INTO hc_inventory(user_id,item_type,item_name,gamemode,gifted_by) VALUES({phs(5)})",
              (u["id"], g["item_type"], display_name, gamemode, g["from_user_id"]))
    c.execute(f"UPDATE hc_gifts SET status='accepted' WHERE id={ph()}", (gid,))
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
        c.execute(
            f"""SELECT id,email,username,mc_username,role,created_at,current_xp,is_verified,last_seen,
                ads_blocked,ads_block_reason,ads_blocked_until,rank_id
                FROM hc_users WHERE username LIKE {ph()} OR email LIKE {ph()}""",
            (f"%{q}%", f"%{q}%")
        )
    else:
        c.execute(
            """SELECT id,email,username,mc_username,role,created_at,current_xp,is_verified,last_seen,
                ads_blocked,ads_block_reason,ads_blocked_until,rank_id
                FROM hc_users ORDER BY created_at DESC LIMIT 50"""
        )
    
    rows = to_list(c.fetchall())
    
    scored = []
    for r in rows:
        r["created_at"] = ts(r["created_at"])
        r["last_seen"] = ts(r.get("last_seen"))
        ad_block = get_user_ad_block_state(r)
        r["ads_blocked"] = ad_block["blocked"]
        r["ads_block_reason"] = ad_block["reason"]
        r["ads_blocked_until"] = ad_block["until"]
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

@app.route("/api/admin/users/<int:uid>/verify", methods=["POST"])
@admin_required
def admin_verify_user(uid):

    d = request.get_json(force=True) or {}
    status = 1 if d.get("verified") else 0
    db = get_db(); c = db_cursor(db)
    c.execute(f"UPDATE hc_users SET is_verified={ph()} WHERE id={ph()}", (status, uid))
    db.commit()
    return jsonify({"success":True})

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

@app.route("/api/admin/users/<int:uid>/xp", methods=["POST"])
@admin_required
def admin_user_xp(uid):
    d = request.get_json(force=True) or {}
    amount = d.get("xp")
    if amount is None:
        return jsonify({"error": "XP amount required"}), 400
    
    db = get_db(); c = db_cursor(db)
    # Check if user exists
    c.execute(f"SELECT username FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    c.execute(f"UPDATE hc_users SET current_xp={ph()} WHERE id={ph()}", (amount, uid))
    
    # Audit log
    log_audit(request.cu["id"], "CHANGE_XP", uid, f"Changed XP for {user['username']} to {amount}")
    
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/users/<int:uid>/xp-adjust", methods=["POST"])
@admin_required
def admin_user_xp_adjust(uid):
    d = request.get_json(force=True) or {}
    delta = d.get("delta")
    if delta is None:
        return jsonify({"error": "XP delta required"}), 400
    try:
        delta = int(delta)
    except Exception:
        return jsonify({"error": "XP delta must be an integer"}), 400

    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT username,current_xp FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    if not user:
        return jsonify({"error": "User not found"}), 404

    new_xp = max(0, int(user.get("current_xp") or 0) + delta)
    c.execute(f"UPDATE hc_users SET current_xp={ph()} WHERE id={ph()}", (new_xp, uid))
    log_audit(request.cu["id"], "ADJUST_XP", uid, f"Adjusted XP for {user['username']} by {delta}; new balance {new_xp}")
    db.commit()
    return jsonify({"ok": True, "current_xp": new_xp})

@app.route("/api/admin/users/<int:uid>/ads-block", methods=["POST"])
@admin_required
def admin_user_ads_block(uid):
    d = request.get_json(force=True) or {}
    blocked = 1 if d.get("blocked") else 0
    reason = str(d.get("reason") or "").strip()[:255]
    hours = d.get("hours")
    blocked_until = None
    if blocked and hours not in (None, ""):
        try:
            blocked_until = utcnow() + timedelta(hours=max(0, int(hours)))
        except Exception:
            return jsonify({"error": "Hours must be a whole number"}), 400

    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT username FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    if not user:
        return jsonify({"error": "User not found"}), 404

    c.execute(
        f"UPDATE hc_users SET ads_blocked={ph()}, ads_block_reason={ph()}, ads_blocked_until={ph()} WHERE id={ph()}",
        (blocked, reason, blocked_until, uid)
    )
    action = "BLOCK_ADS" if blocked else "UNBLOCK_ADS"
    log_audit(request.cu["id"], action, uid, f"Ads blocked={blocked}; reason={reason}; until={blocked_until}")
    db.commit()
    return jsonify({"ok": True, "blocked": bool(blocked), "until": isoformat_utc(blocked_until), "reason": reason})

@app.route("/api/admin/users/<int:uid>/ad-sessions/reset", methods=["POST"])
@admin_required
def admin_user_reset_ad_sessions(uid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT username FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    if not user:
        return jsonify({"error": "User not found"}), 404
    now = utcnow()
    c.execute(
        f"""UPDATE hc_ad_watches
            SET status={ph()}, failure_reason={ph()}, last_attempt_at={ph()}
            WHERE user_id={ph()} AND completed_at IS NULL""",
        ("reset_by_admin", "reset_by_admin", now, uid)
    )
    log_audit(request.cu["id"], "RESET_AD_SESSIONS", uid, f"Cleared active ad sessions for {user['username']}")
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/users/<int:uid>/trials/reset", methods=["POST"])
@admin_required
def admin_user_reset_trials(uid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT username FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    if not user:
        return jsonify({"error": "User not found"}), 404
    c.execute(f"DELETE FROM hc_user_trials WHERE user_id={ph()}", (uid,))
    log_audit(request.cu["id"], "RESET_TRIALS", uid, f"Reset trial claims for {user['username']}")
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/users/<int:uid>/unlink", methods=["POST"])
@admin_required
def admin_user_unlink(uid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT username FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    if not user:
        return jsonify({"error": "User not found"}), 404
    c.execute(
        f"UPDATE hc_users SET mc_username='', mc_uuid='', is_verified=0, verification_code=NULL WHERE id={ph()}",
        (uid,)
    )
    log_audit(request.cu["id"], "UNLINK_MC", uid, f"Unlinked Minecraft account for {user['username']}")
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/users/<int:uid>/logout", methods=["POST"])
@admin_required
def admin_user_logout(uid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT username FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    if not user:
        return jsonify({"error": "User not found"}), 404
    c.execute(f"UPDATE hc_users SET session_token=NULL WHERE id={ph()}", (uid,))
    log_audit(request.cu["id"], "FORCE_LOGOUT", uid, f"Cleared session token for {user['username']}")
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/users/<int:uid>/rank-reset", methods=["POST"])
@admin_required
def admin_user_rank_reset(uid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT username FROM hc_users WHERE id={ph()}", (uid,))
    user = to_dict(c.fetchone())
    if not user:
        return jsonify({"error": "User not found"}), 404
    c.execute(f"DELETE FROM hc_ranks WHERE user_id={ph()}", (uid,))
    c.execute(f"UPDATE hc_users SET rank_id=NULL WHERE id={ph()}", (uid,))
    log_audit(request.cu["id"], "RESET_RANKS", uid, f"Cleared ranks for {user['username']}")
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/users/<int:uid>/logs")
@admin_required
def admin_user_logs(uid):
    db = get_db(); c = db_cursor(db)
    # Fetch audit logs where this user was the target
    c.execute(f"SELECT a.*, u.username as admin_name FROM hc_audit_logs a LEFT JOIN hc_users u ON a.admin_id = u.id WHERE a.target_id={ph()} ORDER BY a.created_at DESC LIMIT 100", (uid,))
    audit_rows = to_list(c.fetchall())
    for r in audit_rows: r["created_at"] = ts(r["created_at"])
    
    # Fetch store events for this user
    c.execute(f"SELECT * FROM hc_store_events WHERE user_id={ph()} ORDER BY created_at DESC LIMIT 100", (uid,))
    store_rows = to_list(c.fetchall())
    for r in store_rows: r["created_at"] = ts(r["created_at"])
    
    return jsonify({
        "audit_logs": audit_rows,
        "store_events": store_rows
    })

@app.route("/api/store/orders/history")
@auth_required
def store_order_history():
    uid = request.cu["id"]
    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_store_orders WHERE user_id={ph()} ORDER BY created_at DESC", (uid,))
    rows = to_list(c.fetchall())
    for r in rows:
        r["created_at"] = ts(r["created_at"])
        try:
            r["items"] = json.loads(r.get("items") or "[]")
        except:
            r["items"] = []
    return jsonify(rows)

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
@optional_auth
def admin_announcement():
    db = get_db(); c = db_cursor(db)
    if request.method == "POST":
        if not request.cu or request.cu["role"] not in ADMIN_ROLES:
            return jsonify({"error":"Admin required"}), 403
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
        c.execute(f"INSERT INTO hc_command_queue(command,target) VALUES({phs(2)})", (cmd, "proxy"))
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
# XP STORE & REWARDED ADS
# ═══════════════════════════════════════════════════════
@app.route("/api/user/xp")
@auth_required
def user_xp():
    db = get_db(); c = db_cursor(db)
    return jsonify(get_reward_profile(c, request.cu["id"]))


@app.route("/api/store/ranks")
@auth_required
def store_ranks():
    db = get_db(); c = db_cursor(db)
    current = get_current_store_rank(c, request.cu["id"])
    current_rank = current["rank"]
    current_tier = int(current_rank["tier_order"]) if current_rank else 0
    current_rank_id = current_rank["id"] if current_rank else None
    ranks = []
    for rank in get_all_store_ranks(c):
        ranks.append({
            **rank,
            "already_purchased": current_tier >= int(rank["tier_order"]),
            "is_current": current_rank_id == rank["id"],
            "affordable": current["current_xp"] >= int(rank["xp_cost"]),
        })
    return jsonify(ranks)


@app.route("/api/store/purchase", methods=["POST"])
@auth_required
def store_purchase():
    d = request.get_json(force=True) or {}
    rank_id = int(d.get("rank_id") or 0)
    if not rank_id:
        return jsonify({"error": "Choose a valid rank to purchase.", "code": "invalid_rank"}), 400

    db = get_db(); c = db_cursor(db)
    user_id = request.cu["id"]
    target_rank = get_store_rank_by_id(c, rank_id)
    if not target_rank:
        return jsonify({"error": "That rank no longer exists.", "code": "invalid_rank"}), 404

    current = get_current_store_rank(c, user_id)
    current_rank = current["rank"]
    current_xp = int(current["current_xp"])

    if current_rank:
        if int(current_rank["id"]) == int(target_rank["id"]):
            return jsonify({"error": "You already own this rank.", "code": "already_owned"}), 400
        if int(current_rank["tier_order"]) > int(target_rank["tier_order"]):
            return jsonify({"error": "You already own a higher tier rank.", "code": "lower_tier_owned"}), 400

    if current_xp < int(target_rank["xp_cost"]):
        needed = int(target_rank["xp_cost"]) - current_xp
        return jsonify({
            "error": f"You need {needed} more XP to buy {target_rank['name']}.",
            "code": "insufficient_xp",
            "needed_xp": needed,
        }), 400

    new_balance = current_xp - int(target_rank["xp_cost"])
    previous_rank_id = current_rank["id"] if current_rank else 0
    c.execute(
        f"UPDATE hc_users SET current_xp={ph()}, rank_id={ph()} WHERE id={ph()}",
        (new_balance, target_rank["id"], user_id),
    )
    c.execute(
        f"""INSERT INTO hc_rank_purchases(user_id, rank_id, previous_rank_id, xp_spent, created_at)
            VALUES ({ph()}, {ph()}, {ph()}, {ph()}, {ph()})""",
        (user_id, target_rank["id"], previous_rank_id, target_rank["xp_cost"], utcnow()),
    )
    purchase_id = c.lastrowid
    log_xp_transaction(
        c,
        user_id,
        -int(target_rank["xp_cost"]),
        new_balance,
        "rank_purchase",
        "rank_purchase",
        purchase_id,
        {
            "rank_id": target_rank["id"],
            "rank_name": target_rank["name"],
            "previous_rank_id": previous_rank_id,
        },
    )
    db.commit()
    return jsonify({
        "success": True,
        "current_xp": new_balance,
        "rank": target_rank,
    })


@app.route("/api/ads/request", methods=["POST"])
@auth_required
def ads_request():
    d = request.get_json(force=True) or {}
    session_fingerprint = str(d.get("session_fingerprint") or "default_session").strip()

    db = get_db(); c = db_cursor(db)
    now = utcnow()
    user_id = request.cu["id"]
    c.execute(f"SELECT ads_blocked, ads_block_reason, ads_blocked_until FROM hc_users WHERE id={ph()}", (user_id,))
    ad_block = get_user_ad_block_state(to_dict(c.fetchone()) or {}, now=now)
    if ad_block["blocked"]:
        return jsonify({
            "error": ad_block["reason"] or "Ad rewards are disabled for this account.",
            "code": "ads_blocked",
            "retry_after": ad_block["until"],
        }), 403

    daily_count = get_daily_ad_watch_count(c, user_id, now=now)
    if daily_count >= AD_DAILY_LIMIT:
        _, next_day = utc_day_bounds(now=now)
        return jsonify({
            "error": "You have reached today's AFK XP cap. Come back after the UTC reset.",
            "code": "daily_limit_reached",
            "retry_after": isoformat_utc(next_day),
        }), 429

    next_available = get_next_ad_available_at(c, user_id, now=now)
    if next_available:
        return jsonify({
            "error": "Your AFK session cooldown is still active.",
            "code": "cooldown_active",
            "retry_after": isoformat_utc(next_available),
        }), 429

    active_watch = get_active_ad_watch(c, user_id, now=now)
    if active_watch:
        active_started = parse_db_datetime(active_watch.get("started_at")) or now
        retry_after = active_started + timedelta(seconds=AD_COMPLETION_WINDOW_SECONDS)
        error_code = "active_tab_conflict" if active_watch.get("session_fingerprint") != session_fingerprint else "ad_already_active"
        error_message = (
            "Another AFK session is already open in a different tab."
            if error_code == "active_tab_conflict"
            else "Finish or wait out your current AFK session before starting another."
        )
        return jsonify({
            "error": error_message,
            "code": error_code,
            "retry_after": isoformat_utc(retry_after),
        }), 409

    token_uuid = str(uuid.uuid4())
    ad_token = sign_ad_token(token_uuid)
    _, token_signature = ad_token.split(".", 1)
    ad_payload = dict(MOCK_AD_PAYLOAD)
    ad_payload["requested_at"] = isoformat_utc(now)
    ad_payload["xp_reward"] = AFK_XP_PER_SESSION

    c.execute(
        f"""INSERT INTO hc_ad_watches
            (user_id, ad_token, token_uuid, token_signature, session_fingerprint, started_at, ip_address, status, ad_payload, created_at)
            VALUES ({ph()}, {ph()}, {ph()}, {ph()}, {ph()}, {ph()}, {ph()}, {ph()}, {ph()}, {ph()})""",
        (
            user_id,
            ad_token,
            token_uuid,
            token_signature,
            session_fingerprint,
            now,
            get_client_ip(),
            "started",
            json.dumps(ad_payload),
            now,
        ),
    )
    db.commit()
    return jsonify({
        "ad_token": ad_token,
        "ad": ad_payload,
        "xp_reward": AFK_XP_PER_SESSION,
        "session_seconds": AFK_SESSION_SECONDS,
    })


@app.route("/api/ads/complete", methods=["POST"])
@auth_required
def ads_complete():
    d = request.get_json(force=True) or {}
    ad_token = str(d.get("ad_token") or "").strip()
    completion_proof = str(d.get("completion_proof") or "").strip()
    if not ad_token or not completion_proof:
        return jsonify({"error": "Both ad_token and completion_proof are required.", "code": "missing_fields"}), 400
    if not verify_ad_token_signature(ad_token):
        return jsonify({"error": "The ad token signature is invalid.", "code": "invalid_token"}), 400

    db = get_db(); c = db_cursor(db)
    c.execute(f"SELECT * FROM hc_ad_watches WHERE ad_token={ph()} AND user_id={ph()}", (ad_token, request.cu["id"]))
    watch = to_dict(c.fetchone())
    if not watch:
        return jsonify({"error": "This ad session could not be found.", "code": "invalid_token"}), 400
    if watch.get("completed_at"):
        return jsonify({"error": "This ad token has already been completed.", "code": "token_replayed"}), 409

    now = utcnow()
    started_at = parse_db_datetime(watch.get("started_at"))
    if not started_at:
        return jsonify({"error": "The ad session is missing a valid start time.", "code": "invalid_state"}), 400

    elapsed = int((now - started_at).total_seconds())
    next_failure_count = int(watch.get("failure_count") or 0) + 1
    if elapsed > AD_COMPLETION_WINDOW_SECONDS:
        c.execute(
            f"""UPDATE hc_ad_watches
                SET status={ph()}, failure_reason={ph()}, failure_count={ph()}, last_attempt_at={ph()}
                WHERE id={ph()}""",
            ("expired", "expired", next_failure_count, now, watch["id"]),
        )
        db.commit()
        return jsonify({"error": "This AFK session expired before completion.", "code": "token_expired"}), 400

    if completion_proof != build_completion_proof(ad_token):
        c.execute(
            f"""UPDATE hc_ad_watches
                SET failure_reason={ph()}, failure_count={ph()}, last_attempt_at={ph()}
                WHERE id={ph()}""",
            ("invalid_proof", next_failure_count, now, watch["id"]),
        )
        db.commit()
        return jsonify({"error": "The completion proof was invalid.", "code": "invalid_proof"}), 400

    if elapsed < AD_MIN_DURATION_SECONDS:
        c.execute(
            f"""UPDATE hc_ad_watches
                SET failure_reason={ph()}, failure_count={ph()}, last_attempt_at={ph()}
                WHERE id={ph()}""",
            ("too_fast", next_failure_count, now, watch["id"]),
        )
        db.commit()
        return jsonify({"error": "This AFK session ended too early to award XP.", "code": "too_fast"}), 400

    completion_ip = get_client_ip()
    if is_ip_completion_limited(completion_ip, now=now):
        c.execute(
            f"""UPDATE hc_ad_watches
                SET failure_reason={ph()}, failure_count={ph()}, last_attempt_at={ph()}
                WHERE id={ph()}""",
            ("ip_rate_limited", next_failure_count, now, watch["id"]),
        )
        db.commit()
        return jsonify({"error": "Too many ad completions came from this IP in the last hour.", "code": "ip_rate_limited"}), 429

    current = get_current_store_rank(c, request.cu["id"])
    awarded_xp = AFK_XP_PER_SESSION
    new_balance = current["current_xp"] + awarded_xp
    c.execute(f"UPDATE hc_users SET current_xp={ph()} WHERE id={ph()}", (new_balance, request.cu["id"]))
    c.execute(
        f"""UPDATE hc_ad_watches
            SET completed_at={ph()}, completion_proof={ph()}, xp_awarded={ph()}, duration_seconds={ph()},
                completion_ip={ph()}, status={ph()}, failure_reason={ph()}, last_attempt_at={ph()}
            WHERE id={ph()}""",
        (
            now,
            completion_proof,
            awarded_xp,
            elapsed,
            completion_ip,
            "completed",
            "",
            now,
            watch["id"],
        ),
    )
    log_xp_transaction(
        c,
        request.cu["id"],
        awarded_xp,
        new_balance,
        "afk_reward",
        "afk_session",
        watch["id"],
        {
            "ad_token": ad_token,
            "duration_seconds": elapsed,
        },
    )
    db.commit()
    record_ip_completion(completion_ip, now=now)
    return jsonify({
        "success": True,
        "xp_earned": awarded_xp,
        "current_xp": new_balance,
    })


@app.route("/api/admin/reward-logs")
@admin_required
def admin_reward_logs():
    user_filter = str(request.args.get("user") or "").strip()
    date_filter = str(request.args.get("date") or "").strip()
    db = get_db(); c = db_cursor(db)

    purchases_sql = (
        "SELECT rp.id, rp.xp_spent, rp.created_at, u.username, xr.name AS rank_name "
        "FROM hc_rank_purchases rp "
        "LEFT JOIN hc_users u ON rp.user_id = u.id "
        "LEFT JOIN hc_xp_ranks xr ON rp.rank_id = xr.id "
        "WHERE 1=1"
    )
    ads_sql = (
        "SELECT aw.id, aw.started_at, aw.completed_at, aw.duration_seconds, aw.xp_awarded, aw.status, "
        "aw.failure_reason, aw.session_fingerprint, aw.ip_address, aw.completion_ip, aw.failure_count, "
        "u.username FROM hc_ad_watches aw "
        "LEFT JOIN hc_users u ON aw.user_id = u.id "
        "WHERE 1=1"
    )
    params_purchases = []
    params_ads = []

    if user_filter:
        purchases_sql += f" AND u.username LIKE {ph()}"
        ads_sql += f" AND u.username LIKE {ph()}"
        like_value = f"%{user_filter}%"
        params_purchases.append(like_value)
        params_ads.append(like_value)
    if date_filter:
        try:
            day_start = datetime.strptime(date_filter, "%Y-%m-%d")
            day_end = day_start + timedelta(days=1)
            purchases_sql += f" AND rp.created_at >= {ph()} AND rp.created_at < {ph()}"
            ads_sql += f" AND aw.started_at >= {ph()} AND aw.started_at < {ph()}"
            params_purchases.extend([day_start, day_end])
            params_ads.extend([day_start, day_end])
        except Exception:
            return jsonify({"error": "Use YYYY-MM-DD for the date filter."}), 400

    purchases_sql += " ORDER BY rp.created_at DESC LIMIT 50"
    ads_sql += " ORDER BY aw.started_at DESC LIMIT 50"

    c.execute(purchases_sql, tuple(params_purchases))
    purchases = [
        {
            "id": row["id"],
            "username": row.get("username") or "Unknown",
            "rank_name": row.get("rank_name") or "Unknown",
            "xp_spent": int(row.get("xp_spent") or 0),
            "created_at": isoformat_utc(row.get("created_at")),
        }
        for row in to_list(c.fetchall())
    ]

    c.execute(ads_sql, tuple(params_ads))
    ad_watches = []
    for row in to_list(c.fetchall()):
        suspicious = bool(
            (row.get("status") == "completed" and int(row.get("duration_seconds") or 0) < AD_MIN_DURATION_SECONDS)
            or row.get("failure_reason") in {"too_fast", "invalid_proof", "ip_rate_limited"}
            or int(row.get("failure_count") or 0) > 0
        )
        ad_watches.append({
            "id": row["id"],
            "username": row.get("username") or "Unknown",
            "started_at": isoformat_utc(row.get("started_at")),
            "completed_at": isoformat_utc(row.get("completed_at")),
            "duration_seconds": int(row.get("duration_seconds") or 0),
            "xp_awarded": int(row.get("xp_awarded") or 0),
            "status": row.get("status") or "started",
            "failure_reason": row.get("failure_reason") or "",
            "session_fingerprint": row.get("session_fingerprint") or "",
            "ip_address": row.get("completion_ip") or row.get("ip_address") or "",
            "suspicious": suspicious,
        })

    return jsonify({
        "rank_purchases": purchases,
        "ad_watches": ad_watches,
    })

@app.route("/api/admin/audit-logs")
def admin_audit_logs():
    # Basic security: check for a secret key to prevent public access
    api_key = request.headers.get("X-API-Key")
    if api_key != os.environ.get("WEBSITE_API_KEY", "hellcore_secret_key"):
        return jsonify({"error": "Unauthorized"}), 401

    time_filter = request.args.get("time", "1day")
    now = datetime.utcnow()
    if time_filter == "1month":
        since = now - timedelta(days=30)
    else:
        since = now - timedelta(days=1)
    
    db = get_db(); c = db_cursor(db)
    # Check if table exists first
    try:
        c.execute(f"SELECT l.*, u.username as admin_name FROM hc_audit_logs l "
                  f"LEFT JOIN hc_users u ON l.admin_id = u.id "
                  f"WHERE l.created_at >= {ph()} "
                  f"ORDER BY l.created_at DESC", (since,))
        logs = to_list(c.fetchall())
        for l in logs:
            l["created_at"] = isoformat_utc(l.get("created_at"))
        return jsonify(logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ═══════════════════════════════════════════════════════
# ADS & REWARDS
# ═══════════════════════════════════════════════════════

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

@app.route("/api/reward-profile")
@auth_required
def reward_profile():
    db = get_db(); c = db_cursor(db)
    return jsonify(get_reward_profile(c, request.cu["id"]))

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

    reward = {"xp": 500, "coins": 0, "vip_hours": 0}
    label = ""
    icon = ""

    if rarity == "common":
        amt = random.randint(100, 300)
        reward["coins"] = amt; label = f"{amt} Coins & 500 XP"; icon = "ic-cart"
    elif rarity == "rare":
        if random.random() > 0.7:
            reward["vip_hours"] = 1; label = "1H VIP Rank & 500 XP"; icon = "ic-shield"
        else:
            amt = random.randint(500, 1000)
            reward["coins"] = amt; label = f"{amt} Coins & 500 XP"; icon = "ic-cart"
    elif rarity == "epic":
        if random.random() > 0.5:
            reward["vip_hours"] = 6; label = "6H VIP Rank & 500 XP"; icon = "ic-shield"
        else:
            reward["coins"] = 2500; label = "2,500 Coins & 500 XP"; icon = "ic-cart"
    elif rarity == "legendary":
        if random.random() > 0.5:
            reward["vip_hours"] = 24; label = "24H MVP+ Rank & 500 XP"; icon = "ic-crown"
        else:
            reward["coins"] = 10000; label = "10,000 Coins & 500 XP"; icon = "ic-cart"

    last_str = today.strftime("%Y-%m-%d")
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    c.execute(f"UPDATE hc_ads SET ads_today={ph()}, last_ad_date={ph()}, last_ad_time={ph()}, ad_streak={ph()} WHERE user_id={ph()}",
             (ads_today, last_str, now_str, ad_streak, u["id"]))

    c.execute(f"INSERT INTO hc_inventory(user_id,item_type,item_name,gamemode,status) VALUES({phs(5)})",
             (u["id"], "reward", label, "global", "claimed"))
    
    # Actually grant stats and rewards
    c.execute(f"UPDATE hc_stats SET coins = coins + {ph()}, xp = xp + {ph()} WHERE user_id={ph()} AND gamemode='global'", (reward["coins"], reward["xp"], u["id"]))
    if c.rowcount == 0 and (reward["coins"] > 0 or reward["xp"] > 0):
         c.execute(f"INSERT IGNORE INTO hc_stats(user_id, gamemode, coins, xp) VALUES({phs(4)})", (u["id"], "global", reward["coins"], reward["xp"]))

    if reward["vip_hours"] > 0 and u["mc_username"]:
        cmd = f"lpv user {u['mc_username']} parent addtemp vip {reward['vip_hours']}h"
        c.execute(f"INSERT INTO hc_command_queue(command,target) VALUES({phs(2)})", (cmd, "proxy"))

    db.commit()
    return jsonify({"ok": True, "ads_today": ads_today, "ad_streak": ad_streak, "reward": reward})

@app.route("/api/ads/recent")
def ads_recent():
    try:
        db = get_db(); c = db_cursor(db)
        c.execute("SELECT u.username, x.amount, x.created_at FROM hc_xp_transactions x "
                  "JOIN hc_users u ON x.user_id = u.id "
                  "WHERE x.reason='ad_reward' ORDER BY x.created_at DESC LIMIT 10")
        rows = to_list(c.fetchall())
        
        for r in rows: 
            r["created_at"] = ts(r["created_at"])
            r["item_name"] = f"Earned {r['amount']} XP"
        return jsonify(rows)
    except Exception as e:
        traceback.print_exc()
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
    pusher_trigger("tickets-global", "presence", {
        "user_id": cu["id"],
        "username": cu["username"],
        "role": cu["role"],
        "online": True,
        "last_seen": now.isoformat(),
    })
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
    payload = []
    for row in reversed(to_list(rows)):
        row["created_at"] = ts(row.get("created_at"))
        enrich_user_with_rank(row, row.get("author_id"), c)
        payload.append(row)
    return jsonify(payload)

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
                author_rank = get_rank_payload_for_user(request.cu["id"])
                pusher_client.trigger('staff-chat', 'new-message', {
                    "channel_id": cid,
                    "author_id": request.cu["id"],
                    "username": request.cu["username"],
                    "role": request.cu["role"],
                    "primary_rank": author_rank["primary_rank"],
                    "rank_details": author_rank["rank_details"],
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
@app.route("/ad-banner")
def ad_banner():
    return """
    <html>
    <head><style>body { margin: 0; padding: 0; background: transparent; display: flex; align-items: center; justify-content: center; min-height: 100vh; overflow: hidden; }</style></head>
    <body>
      <script src="https://quge5.com/88/tag.min.js" data-zone="233677" async data-cfasync="false"></script>
    </body>
    </html>
    """

@app.route("/ads.txt")
def ads_txt():
    # Verification for publisher ID provided by user
    content = "google.com, pub-8470357358025733, DIRECT, f08c47fec0942fa0"
    return Response(content, mimetype="text/plain")

# -------------------------------------------------------
# LEGAL & SEO ROUTES (Server-Side Rendered for AdSense)
# -------------------------------------------------------
@app.route("/privacy")
def privacy_policy():
    return render_template("privacy.html")

@app.route("/terms")
def terms_of_service():
    return render_template("terms.html")

@app.route("/news")
def news_feed():
    try:
        import json
        with open("articles.json", "r", encoding="utf-8") as f:
            articles = json.load(f)
    except:
        articles = []
    return render_template("news.html", articles=articles, single=False)

@app.route("/news/<slug>")
def news_article(slug):
    try:
        import json
        with open("articles.json", "r", encoding="utf-8") as f:
            articles = json.load(f)
    except:
        articles = []
    article = next((a for a in articles if a.get("slug") == slug), None)
    if not article:
        return "Article not found", 404
    return render_template("news.html", article=article, single=True)

@app.route("/robots.txt")
def robots_txt():
    content = "User-agent: *\nAllow: /\nSitemap: https://hellcore.net/sitemap.xml"
    return Response(content, mimetype="text/plain")

# -------------------------------------------------------
# CATCH-ALL ROUTE (Serves frontend for all valid paths)
# -------------------------------------------------------
@app.route("/<path:p>")
def catch_all(p):
    if is_known_main_spa_path("/" + p):
        return build_main_spa_response()
    return "Not Found", 404

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
# TRIALS (ADMIN & USER)
# -------------------------------------------------------
@app.route("/api/admin/trials", methods=["GET"])
@admin_required
def admin_get_trials():
    db = get_db(); c = db_cursor(db)
    c.execute("SELECT * FROM hc_trials ORDER BY created_at DESC")
    return jsonify(to_list(c.fetchall()))

@app.route("/api/admin/trials", methods=["POST"])
@admin_required
def admin_save_trial():
    d = request.get_json() or {}
    db = get_db(); c = db_cursor(db)
    
    if "id" in d and d["id"]:
        c.execute(f"UPDATE hc_trials SET title={ph()}, gamemode={ph()}, rank_name={ph()}, duration_days={ph()}, is_active={ph()} WHERE id={ph()}",
                  (d["title"], d["gamemode"], d["rank_name"], int(d["duration_days"]), 1 if d.get("is_active", 1) else 0, d["id"]))
    else:
        c.execute(f"INSERT INTO hc_trials (title, gamemode, rank_name, duration_days, is_active, created_at) VALUES ({phs(6)})",
                  (d["title"], d["gamemode"], d["rank_name"], int(d["duration_days"]), 1 if d.get("is_active", 1) else 0, datetime.now()))
    db.commit()
    return jsonify({"success": True})

@app.route("/api/admin/trials/<int:tid>", methods=["DELETE"])
@admin_required
def admin_delete_trial(tid):
    db = get_db(); c = db_cursor(db)
    c.execute(f"DELETE FROM hc_trials WHERE id={ph()}", (tid,))
    db.commit()
    return jsonify({"success": True})

@app.route("/api/trials", methods=["GET"])
def get_active_trials():
    db = get_db(); c = db_cursor(db)
    c.execute("SELECT * FROM hc_trials WHERE is_active=1")
    trials = to_list(c.fetchall())
    
    # If logged in, attach whether user has claimed it
    token = request.cookies.get("hc_token")
    u = get_user_by_token(token) if token else None
    
    if u:
        c.execute(f"SELECT trial_id FROM hc_user_trials WHERE user_id={ph()}", (u["id"],))
        claimed = {row["trial_id"] for row in to_list(c.fetchall())}
        for t in trials:
            t["claimed"] = t["id"] in claimed
    else:
        for t in trials:
            t["claimed"] = False
            
    return jsonify(trials)

@app.route("/api/trials/claim/<int:tid>", methods=["POST"])
@auth_required
def claim_trial(tid):
    u = request.cu
    db = get_db(); c = db_cursor(db)
    
    # 1. Check if verified
    if not u.get("is_verified"):
        return jsonify({"error": "You must link your Minecraft account to claim free trials."}), 403
        
    # 2. Check if trial exists and is active
    c.execute(f"SELECT * FROM hc_trials WHERE id={ph()} AND is_active=1", (tid,))
    trial = c.fetchone()
    if not trial:
        return jsonify({"error": "Trial not found or no longer active."}), 404
    trial = to_dict(trial)
        
    # 3. Check if already claimed
    c.execute(f"SELECT id FROM hc_user_trials WHERE user_id={ph()} AND trial_id={ph()}", (u["id"], tid))
    if c.fetchone():
        return jsonify({"error": "You have already claimed this trial offer."}), 400

    mc_username = str(u.get("mc_username") or "").strip()
    if not mc_username:
        return jsonify({"error": "You must link a valid Minecraft username before claiming a free trial."}), 400
        
    # 4. Grant Rank with expiration (Database)
    expires_at = datetime.now() + timedelta(days=int(trial["duration_days"]))
    upsert(
        c,
        "hc_ranks",
        {"user_id": u["id"], "gamemode": trial["gamemode"], "rank_name": trial["rank_name"], "expires_at": expires_at},
        {"user_id", "gamemode"}
    )
              
    # 5. Push command to proxy (Direct Command Engine)
    cmd = f"lpv user {mc_username} parent addtemp {trial['rank_name']} {trial['duration_days']}d"
    c.execute(f"INSERT INTO hc_command_queue(command,target) VALUES({phs(2)})", (cmd, "proxy"))
              
    # 6. Record claim
    c.execute(f"INSERT INTO hc_user_trials (user_id, trial_id, claimed_at) VALUES ({ph()}, {ph()}, {ph()})",
              (u["id"], tid, datetime.now()))
              
    db.commit()
    return jsonify({"success": True, "expires_at": expires_at.isoformat()})

@app.errorhandler(404)

def not_found(e):
    if is_known_main_spa_path(request.path):
        return build_main_spa_response()
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return "Not Found", 404

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
