from py_vapid import Vapid
v = Vapid()
v.generate_keys()
keys = v.public_key, v.private_key
priv = v.private_pem()
# A simpler way is to just export to JSON or DER
v.save_key('private_key.pem')
v.save_public_key('public_key.pem')
print("Keys saved")
