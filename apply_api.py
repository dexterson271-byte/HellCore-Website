import re

FILE = r'c:\Users\user\Desktop\Kq - Copy\app.py'

NEW_BW_CODE = r"""    if gamemode == "bedwars":
        import urllib.request, json
        from concurrent.futures import ThreadPoolExecutor

        bw_stat_map = {
            "wins": "wins", "kills": "kills", "deaths": "deaths",
            "final_kills": "finalkills", "beds_destroyed": "bedsbroken"
        }
        api_stat = bw_stat_map.get(stat, "wins")
        bw_api_key = os.environ.get("BW_API_KEY", "bw_91e25e30cd3ce741b9098925c8513ceadf5d3ab1")
        bw_api_base = os.environ.get("BW_API_BASE", "http://srv125.godlike.club:26239/api/v1")

        try:
            # 1. Get Top 10 from the External API Leaderboard
            url = f"{bw_api_base}/leaderboard?apikey={bw_api_key}&stat={api_stat}"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            res = urllib.request.urlopen(req, timeout=3)
            data = json.loads(res.read())
            
            if not data.get("success"):
                return jsonify([])
            
            top_players = data.get("leaderboard", [])[:10]  # Take top 10

            # 2. Fetch full stats for each player concurrently to fill the columns
            # We also get their website rank from our SQLite database if they have one.
            db_conn = get_db()
            c_local = db_cursor(db_conn)
            
            # Fetch all user ranks for easy dict lookup
            c_local.execute(f"SELECT u.mc_username, r.rank_name FROM hc_ranks r JOIN hc_users u ON r.user_id = u.id WHERE r.gamemode='bedwars'")
            rank_map = {r['mc_username'].lower(): r['rank_name'] for r in to_dict(c_local.fetchall())}
            c_local.close(); db_conn.close()

            def fetch_player_full(p):
                try:
                    p_url = f"{bw_api_base}/player/{p['username']}?apikey={bw_api_key}"
                    p_req = urllib.request.Request(p_url, headers={'User-Agent': 'Mozilla/5.0'})
                    p_res = urllib.request.urlopen(p_req, timeout=2)
                    p_data = json.loads(p_res.read())
                    if p_data.get("success"):
                        ps = p_data["player"]
                        uname = p["username"]
                        return {
                            "username": uname,
                            "mc_username": uname,
                            "kills": ps.get("kills", 0),
                            "deaths": ps.get("deaths", 0),
                            "wins": ps.get("wins", 0),
                            "losses": ps.get("losses", 0),
                            "coins": 0,
                            "final_kills": ps.get("finalKills", 0),
                            "beds_destroyed": ps.get("bedsBroken", 0),
                            "is_bw1058": True,
                            "rank_name": rank_map.get(uname.lower(), None)
                        }
                except Exception:
                    pass
                # Fallback if specific player fails
                uname = p["username"]
                return {
                    "username": uname, "mc_username": uname, 
                    "kills": 0, "deaths": 0, "wins": 0, "losses": 0, "coins": 0,
                    "final_kills": 0, "beds_destroyed": 0,
                    "is_bw1058": True, "rank_name": rank_map.get(uname.lower(), None),
                    api_stat: p["value"] # Ensure at least the sorted stat is correct
                }

            with ThreadPoolExecutor(max_workers=10) as executor:
                rows = list(executor.map(fetch_player_full, top_players))

            return jsonify(rows)

        except Exception as e:
            print("Bedwars API Error:", e)
            pass
"""

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

pat = r'    if gamemode == "bedwars":.*?# Default fallback'
# Replace it using regex DOTALL to cover multiple lines
match = re.search(pat, content, re.DOTALL)
if match:
    new_content = content[:match.start()] + NEW_BW_CODE + "\n    # Default fallback" + content[match.end():]
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Patched app.py successfully!")
else:
    print("Could not match the replacement block.")
