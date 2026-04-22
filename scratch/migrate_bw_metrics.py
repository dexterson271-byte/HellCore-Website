import os, sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import app

def migrate():
    db = app.get_db()
    c = db.cursor()
    cols = [
        "ALTER TABLE hc_server_metrics ADD COLUMN arenas INTEGER DEFAULT 0",
        "ALTER TABLE hc_server_metrics ADD COLUMN ingame_players INTEGER DEFAULT 0"
    ]
    for col in cols:
        try:
            c.execute(col)
            print(f"Executed: {col}")
        except:
            print(f"Skipped: {col}")
    db.commit()
    db.close()

if __name__ == "__main__":
    migrate()
