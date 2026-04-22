import mysql.connector
import os

# Railway DB Credentials
DB_CONFIG = {
    "host": "roundhouse.proxy.rlwy.net",
    "port": 22206,
    "user": "root",
    "password": "EtBwQFBpBCyWElJkxcCbTLFPGuNZxbHC",
    "database": "railway"
}

def trigger_import():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        command = "lpv import real_data.json.gz.json.gz"
        sql = "INSERT INTO hc_command_queue (command, status) VALUES (%s, 'pending')"
        cursor.execute(sql, (command,))
        
        conn.commit()
        print(f"SUCCESS: Command '{command}' has been queued for execution.")
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    trigger_import()
