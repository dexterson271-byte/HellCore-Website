import sqlite3
import os

db_path = "hellcore.db"

if not os.path.exists(db_path):
    print(f"Error: {db_path} not found.")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Check if KqTF exists
    cursor.execute("SELECT username, current_xp FROM hc_users WHERE username = 'KqTF'")
    user = cursor.fetchone()
    if user:
        print(f"Found user: {user[0]} with {user[1]} XP")
    else:
        print("User KqTF not found!")
    
    # Clear XP for others
    cursor.execute("UPDATE hc_users SET current_xp = 0 WHERE username != 'KqTF'")
    affected = cursor.rowcount
    conn.commit()
    print(f"Successfully cleared XP for {affected} users.")
    
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
