import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def check_pending():
    try:
        conn = mysql.connector.connect(
            host=os.getenv("AIVEN_HOST"),
            port=int(os.getenv("AIVEN_PORT")),
            user=os.getenv("AIVEN_USER"),
            password=os.getenv("AIVEN_PASSWORD"),
            database=os.getenv("AIVEN_DATABASE"),
            ssl_disabled=False
        )
        c = conn.cursor(dictionary=True)
        c.execute("SELECT * FROM hc_command_queue WHERE status = 'pending'")
        rows = c.fetchall()
        print(f"Found {len(rows)} pending commands:")
        for r in rows:
            print(f"ID: {r['id']} | Command: {r['command']} | Created: {r['created_at']}")
        conn.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    check_pending()
