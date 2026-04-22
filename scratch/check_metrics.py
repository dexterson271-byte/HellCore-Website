import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def check_metrics():
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
        c.execute("SELECT * FROM hc_server_metrics")
        rows = c.fetchall()
        print(f"Server Metrics ({len(rows)} entries):")
        for r in rows:
            print(f"Server: {r['server_name']} | Players: {r['online_players']}/{r['max_players']} | Last Update: {r['last_updated']}")
        conn.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    check_metrics()
