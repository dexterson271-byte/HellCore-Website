import sys
from pywebpush import WebPusher
# To generate VAPID keys natively we can use the vapid command or py_vapid library
import subprocess
try:
    proc = subprocess.run(["vapid", "--generate"], capture_output=True, text=True)
    out = proc.stdout
    priv = ""
    pub = ""
    for line in out.splitlines():
        if line.startswith("Private Key:"):
            priv = line.split("Private Key:")[1].strip()
        elif line.startswith("Public Key:"):
            pub = line.split("Public Key:")[1].strip()
            
    if priv and pub:
        with open(".env", "a") as f:
            f.write(f"\nVAPID_PRIVATE_KEY={priv}\n")
            f.write(f"VAPID_PUBLIC_KEY={pub}\n")
        print(f"Generated Keys:\nPub: {pub}\nPriv: {priv}")
    else:
        print("Failed to parse keys.")
except Exception as e:
    print(e)
