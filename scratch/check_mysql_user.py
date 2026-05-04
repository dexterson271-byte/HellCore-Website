import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

host = os.environ.get("MYSQL_HOST")
port = int(os.environ.get("MYSQL_PORT", 3306))
user = os.environ.get("MYSQL_USER")
password = os.environ.get("MYSQL_PASSWORD")
database = os.environ.get("MYSQL_DATABASE")

try:
    conn = mysql.connector.connect(
        host=host, port=port, user=user, password=password, database=database
    )
    c = conn.cursor(dictionary=True)
    c.execute("SELECT id, username, role, session_token FROM hc_users WHERE username='KqTF'")
    row = c.fetchone()
    print(row if row else "Not Found")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
