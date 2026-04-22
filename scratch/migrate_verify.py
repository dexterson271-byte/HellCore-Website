import os, sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import app

def migrate():
    db = app.get_db()
    c = db.cursor()
    cols = [
        "ALTER TABLE hc_users ADD COLUMN mc_uuid VARCHAR(36) DEFAULT NULL",
        "ALTER TABLE hc_users ADD COLUMN is_verified TINYINT(1) DEFAULT 0",
        "ALTER TABLE hc_users ADD COLUMN verification_code VARCHAR(10) DEFAULT NULL"
    ]
    for col in cols:
        try:
            c.execute(col)
            print(f"Executed: {col}")
        except:
            print(f"Skipped: {col}")
    db.commit()
    db.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
