# Walk the HDUs of a remote FITS file using only small range requests.
import sys, urllib.request, json
from astropy.io import fits
url = sys.argv[1]
def get(a, n):
    r = urllib.request.Request(url, headers={'Range': f'bytes={a}-{a+n-1}'})
    return urllib.request.urlopen(r, timeout=60).read()
off, out = 0, []
while True:
    raw = b''
    while b'END' + b' ' * 77 not in [raw[i:i+80] for i in range(0, len(raw), 80)]:
        chunk = get(off + len(raw), 2880 * 10)
        if not chunk: break
        raw += chunk
    cards = [raw[i:i+80] for i in range(0, len(raw), 80)]
    end = next(i for i, c in enumerate(cards) if c.startswith(b'END     ') or c == b'END' + b' ' * 77)
    hlen = ((end + 1) * 80 + 2879) // 2880 * 2880
    h = fits.Header.fromstring(raw[:(end + 1) * 80].decode('ascii'))
    nax = h.get('NAXIS', 0)
    size = abs(h.get('BITPIX', 8)) // 8 * (eval('*'.join(str(h[f'NAXIS{k+1}']) for k in range(nax))) if nax else 0) + h.get('PCOUNT', 0) * 0
    dlen = (size + 2879) // 2880 * 2880
    out.append(dict(name=h.get('EXTNAME', 'PRIMARY'), off=off, data=off + hlen, bitpix=h.get('BITPIX'), shape=[h.get(f'NAXIS{k+1}') for k in range(nax)], header=raw[:(end+1)*80].decode('ascii')))
    off += hlen + dlen
    if len(out) > 8 or off >= int(sys.argv[2]): break
json.dump(out, open(sys.argv[3], 'w'))
for o in out: print(o['name'], o['off'], o['data'], o['bitpix'], o['shape'])
