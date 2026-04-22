import mysql.connector

def test_railway():
    try:
        conn = mysql.connector.connect(
            host="roundhouse.proxy.rlwy.net",
            port=22206,
            user="root",
            password="EtBwQFBpBCyWElJkxcCbTLFPGuNZxbHC",
            database="railway",
            connection_timeout=10
        )
        print("Successfully connected to Railway MySQL!")
        conn.close()
    except Exception as e:
        print("Failed to connect:", e)

if __name__ == "__main__":
    test_railway()
