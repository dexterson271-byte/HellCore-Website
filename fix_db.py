import sqlite3
from datetime import datetime

DB_PATH = 'hellcore.db'

def fix():
    try:
        db = sqlite3.connect(DB_PATH)
        c = db.cursor()
        
        # 1. Add column if missing
        try:
            c.execute("ALTER TABLE hc_events ADD COLUMN link_url TEXT DEFAULT ''")
            db.commit()
            print("[OK] Column 'link_url' added.")
        except sqlite3.OperationalError:
            print("[INFO] Column 'link_url' already exists.")

        # 2. Reset events
        c.execute("DELETE FROM hc_events")
        
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
            c.execute("INSERT INTO hc_events (title, description, image_url, link_url, created_at) VALUES (?, ?, ?, ?, ?)", 
                        (title, desc, img, link, datetime.now()))
        
        db.commit()
        print(f"[OK] Successfully re-bootstrapped {len(evs)} events.")
        db.close()
    except Exception as e:
        print(f"[ERR] {e}")

if __name__ == "__main__":
    fix()
