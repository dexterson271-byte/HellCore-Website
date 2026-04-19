import sqlite3
import random
import uuid

def setup_bw():
    db = sqlite3.connect('hellcore.db')
    c = db.cursor()
    
    # Create the standard BedWars1058 table
    c.execute('''
    CREATE TABLE IF NOT EXISTS bw1058_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid VARCHAR(36) NOT NULL,
        name VARCHAR(16) NOT NULL,
        first_play TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_play TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        wins INT DEFAULT 0,
        kills INT DEFAULT 0,
        final_kills INT DEFAULT 0,
        deaths INT DEFAULT 0,
        final_deaths INT DEFAULT 0,
        games_played INT DEFAULT 0,
        beds_destroyed INT DEFAULT 0,
        level INT DEFAULT 1,
        xp INT DEFAULT 0
    )
    ''')
    
    # Check if we have data
    c.execute("SELECT count(*) FROM bw1058_stats")
    if c.fetchone()[0] == 0:
        print("Inserting dummy BedWars1058 data...")
        users = [
            ("Notch", 55, 300, 45, 80),
            ("Jeb_", 30, 150, 20, 50),
            ("Dream", 120, 800, 150, 15),
            ("Technoblade", 999, 5000, 2000, 5),
            ("TommyInnit", 15, 60, 5, 200)
        ]
        
        for name, wins, kills, final_kills, deaths in users:
            uid = str(uuid.uuid4())
            beds = int(wins * 1.5)
            games = wins + int(deaths / 2)
            c.execute('''
            INSERT INTO bw1058_stats (uuid, name, wins, kills, final_kills, deaths, final_deaths, games_played, beds_destroyed, level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (uid, name, wins, kills, final_kills, deaths, int(deaths/4), games, beds, int(wins/5)+1))
            
    db.commit()
    db.close()
    print("BedWars1058 stats table ready!")

if __name__ == "__main__":
    setup_bw()
