import urllib.request, json, sys
url='http://localhost:3000/api/patients/cashier/awaiting-payment'
try:
    req=urllib.request.Request(url, headers={'Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        print('status', resp.status)
        data = json.load(resp)
        if isinstance(data, list):
            print('count', len(data))
            print(json.dumps(data[:2], indent=2, ensure_ascii=False))
        else:
            print('response type', type(data).__name__)
            print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print('ERROR', type(e).__name__, e)
    sys.exit(1)
