import os
import mysql.connector
import re
from dotenv import load_dotenv

load_dotenv()

def migrate():
    try:
        # Source: Aiven
        print("Connecting to Aiven...")
        src_conn = mysql.connector.connect(
            host=os.getenv("AIVEN_HOST"),
            port=int(os.getenv("AIVEN_PORT")),
            user=os.getenv("AIVEN_USER"),
            password=os.getenv("AIVEN_PASSWORD"),
            database=os.getenv("AIVEN_DATABASE"),
            ssl_disabled=False
        )
        src_c = src_conn.cursor(dictionary=True)

        # Dest: Railway
        print("Connecting to Railway...")
        dest_conn = mysql.connector.connect(
            host=os.getenv("MYSQL_HOST"),
            port=int(os.getenv("MYSQL_PORT")),
            user=os.getenv("MYSQL_USER"),
            password="EtBwQFBpBCyWElJkxcCbTLFPGuNZxbHC", 
            database=os.getenv("MYSQL_DATABASE")
        )
        dest_c = dest_conn.cursor()

        # Disable foreign keys on dest
        dest_c.execute("SET FOREIGN_KEY_CHECKS = 0")

        # Get tables
        src_c.execute("SHOW TABLES")
        tables = [list(t.values())[0] for t in src_c.fetchall()]
        print(f"Found {len(tables)} tables.")

        for table in tables:
            print(f"Migrating {table}...")
            # Get create statement
            src_c.execute(f"SHOW CREATE TABLE `{table}`")
            create_sql = src_c.fetchone()["Create Table"]
            
            # Normalize SQL (Replace double quotes with backticks if they exist)
            create_sql = create_sql.replace('"', '`')
            
            # Drop if exists and create
            dest_c.execute(f"DROP TABLE IF EXISTS `{table}`")
            dest_c.execute(create_sql)

            # Get data
            src_c.execute(f"SELECT * FROM `{table}`")
            rows = src_c.fetchall()
            if rows:
                cols = list(rows[0].keys())
                col_names = ", ".join([f"`{c}`" for c in cols])
                placeholders = ", ".join(["%s"] * len(cols))
                insert_sql = f"INSERT INTO `{table}` ({col_names}) VALUES ({placeholders})"
                
                # Convert data to tuples
                data = [tuple(r.values()) for r in rows]
                
                # Batch insert (max 1000 at a time)
                batch_size = 1000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i+batch_size]
                    dest_c.executemany(insert_sql, batch)
                
                print(f"  Inserted {len(rows)} rows.")
            else:
                print("  Table is empty.")

        # Re-enable foreign keys
        dest_c.execute("SET FOREIGN_KEY_CHECKS = 1")
        dest_conn.commit()
        print("\nSUCCESS: All data moved to Railway!")
        
        src_conn.close()
        dest_conn.close()
    except Exception as e:
        print("\nERROR during migration:", e)

if __name__ == "__main__":
    migrate()
