from py_vapid import Vapid, b64urlencode
v = Vapid.from_file('private_key.pem')
k = v.public_key.to_string()
print(b64urlencode(k).decode('ascii'))
