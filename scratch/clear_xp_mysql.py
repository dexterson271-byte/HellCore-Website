import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

try:
    conn = mysql.connector.connect(
        host=os.environ.get("MYSQL_HOST"),
        port=int(os.environ.get("MYSQL_PORT", 3306)),
        user=os.environ.get("MYSQL_USER"),
        password=os.environ.get("MYSQL_PASSWORD"),
        database=os.environ.get("MYSQL_DATABASE")
    )
    cursor = conn.cursor()
    
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
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
