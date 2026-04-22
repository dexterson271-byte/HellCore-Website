
import sqlite3
import os
import sys

# Add current dir to path to import app (but we don't want to run app.run())
sys.path.append(os.getcwd())

try:
    from app import get_db, db_cursor, _DB_MODE
    
    print(f"--- Database Integrity Check ({_DB_MODE}) ---")
    db = get_db()
    c = db_cursor(db)
    
    # Try to query hc_users
    try:
        c.execute("SELECT id FROM hc_users LIMIT 1")
        print("[OK] hc_users table exists and is accessible.")
    except Exception as e:
        print(f"[FAIL] hc_users table access failed: {e}")
        
    # Check other critical tables
    for table in ['hc_forums', 'hc_stats', 'hc_events', 'hc_staff_channels']:
        try:
            c.execute(f"SELECT id FROM {table} LIMIT 1")
            print(f"[OK] {table} table exists.")
        except Exception as e:
            print(f"[FAIL] {table} table access failed: {e}")
            
    db.close()
    print("------------------------------------------")

except Exception as e:
    print(f"Critical error during check: {e}")
