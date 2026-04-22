import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def verify():
    try:
        print("Verifying Railway Data...")
        conn = mysql.connector.connect(
            host=os.getenv("MYSQL_HOST"),
            port=int(os.getenv("MYSQL_PORT")),
            user=os.getenv("MYSQL_USER"),
            password="EtBwQFBpBCyWElJkxcCbTLFPGuNZxbHC",
            database=os.getenv("MYSQL_DATABASE")
        )
        c = conn.cursor()
        
        c.execute("SELECT COUNT(*) FROM hc_users")
        user_count = c.fetchone()[0]
        
        c.execute("SELECT COUNT(*) FROM hc_tickets")
        ticket_count = c.fetchone()[0]
        
        print(f"User Count: {user_count} (Expected ~10)")
        print(f"Ticket Count: {ticket_count} (Expected ~11)")
        
        if user_count >= 10 and ticket_count >= 11:
            print("VERIFICATION SUCCESSFUL!")
        else:
            print("VERIFICATION FAILED: Data mismatch.")
            
        conn.close()
    except Exception as e:
        print("Verification error:", e)

if __name__ == "__main__":
    verify()
