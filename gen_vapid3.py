import sys
from py_vapid import Vapid
v = Vapid.from_file('private_key.pem')
print("VAPID_PUBLIC_KEY=", b"".join(v.application_server_key).decode("utf-8"))
print("VAPID_PRIVATE_KEY=", v.raw_private.decode('utf-8') if hasattr(v, 'raw_private') else 'N/A')
