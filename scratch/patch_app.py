import os

path = r'c:\Users\user\Desktop\Kq - Copy\app.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import_old = '''    if category == "purchase":
        ticket_title = title
        priority = pr
        try:
            import requests
            wh = globals().get("STAFF_WEBHOOK", "https://discord.com/api/webhooks/1495099642671792261/LA6pwnEjA74swShTjPwX5qT5iBh_xHUBh6elQS8RK_OZF7anxO5hsXoIlBUsPSRvPavj")
            requests.post(wh, json={
                "content": f"🚨 **New Payment Ticket** created by **{request.cu['username']}** (Ticket #{tid})",
                "embeds": [{
                    "title": d["title"],
                    "description": d["description"][:500] + ("..." if len(d["description"]) > 500 else ""),
                    "color": 0xFF512F
                }]
            }, timeout=3)
        except Exception as e:
            print("Webhook failed:", e)

        # Web Push to staff
        try:
            import json, os
            from pywebpush import webpush, WebPushException
            
            db2 = get_db(); c2 = db_cursor(db2)
            c2.execute("SELECT s.endpoint, s.p256dh, s.auth FROM hc_push_subs s JOIN hc_users u ON s.user_id = u.id WHERE u.role IN ('helper','mod','dev','admin','owner','founder')")
            subs = to_list(c2.fetchall())
            c2.close()

            vapid_priv = os.environ.get("VAPID_PRIVATE_KEY")
            if not vapid_priv and os.path.exists(".env"):
                 with open(".env", "r") as f:
                     for x in f:
                         if "VAPID_PRIVATE_KEY" in x: vapid_priv = x.split("=")[1].strip()

            if vapid_priv and os.path.exists(vapid_priv):
                with open(vapid_priv, "r") as f:
                    vapid_priv = f.read().strip()

            if vapid_priv and subs:
                payload = json.dumps({
                    "title": f"New Ticket: {ticket_title}",
                    "body": f"Created by {request.cu['username']} • Priority: {priority}",
                    "data": {"url": f"/tickets?id={tid}"}
                })
                payload = json.dumps({
                    "title": f"New Ticket: {title}",
                    "body": f"Created by {uname} - Priority: {pr}",
                    "data": {"url": f"/tickets?id={tid}", "unread_count": 1}
                })
                for s in subs:
                    sub_info = {
                        "endpoint": s["endpoint"],
                        "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}
                    }
                    try:
                        webpush(
                            subscription_info=sub_info,
                            data=payload,
                            vapid_private_key=vapid_priv,
                            vapid_claims={"sub": "mailto:admin@hellcore.net"}
                        )
                    except WebPushException as ex:
                        if ex.response and ex.response.status_code in [404, 410]:
                            db3 = get_db(); c3 = db_cursor(db3)
                            c3.execute(f"DELETE FROM hc_push_subs WHERE endpoint={ph()}", (s["endpoint"],))
                            db3.commit(); c3.close()
        except Exception as e:
            print("Web push failed:", e)

    return jsonify({"id":tid,"ok":True,"redirect_url":f"/tickets?id={tid}"})'''

# Normalize line endings for replacement
import_old = import_old.replace('\r\n', '\n')
content_norm = content.replace('\r\n', '\n')

new_logic = '''    if category == "purchase":
        try:
            import requests
            wh = globals().get("STAFF_WEBHOOK", "https://discord.com/api/webhooks/1495099642671792261/LA6pwnEjA74swShTjPwX5qT5iBh_xHUBh6elQS8RK_OZF7anxO5hsXoIlBUsPSRvPavj")
            requests.post(wh, json={
                "content": f"🚨 **New Payment Ticket** created by **{uname}** (Ticket #{tid})",
                "embeds": [{"title": title, "description": description[:500], "color": 0xFF512F}]
            }, timeout=3)
        except: pass

    # Browser push to all staff
    try:
        c_staff = db_cursor(get_db())
        c_staff.execute("SELECT id FROM hc_users WHERE role IN ('helper','mod','dev','admin','owner','founder')")
        staff_ids = [r["id"] for r in to_list(c_staff.fetchall())]
        c_staff.close()
        send_push_notification(staff_ids, f"New Ticket: {title}", f"From {uname} • Priority: {pr}", url=f"/tickets?id={tid}")
    except: pass

    return jsonify({"id":tid,"ok":True,"redirect_url":f"/tickets?id={tid}"})'''

if import_old in content_norm:
    new_content = content_norm.replace(import_old, new_logic)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(new_content)
    print("SUCCESS")
else:
    print("FAILED TO FIND TARGET")
    # Debug: show a slice of where it should be
    idx = content_norm.find('if category == "purchase":')
    if idx != -1:
        print("Found start at:", idx)
        print("Snippet:", content_norm[idx:idx+200])
    else:
        print("Could not even find the start line")
