import sqlite3

conn = sqlite3.connect('hellcore.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()

for table_name in tables:
    name = table_name[0]
    if name.startswith('hc_'):
        cursor.execute(f"PRAGMA table_info({name})")
        columns = [c[1] for c in cursor.fetchall()]
        print(f"{name}: {columns}")

conn.close()
