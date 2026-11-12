"""DSS2 Blue / Red / IR cutouts of each Messier object from NASA SkyView (FITS, 512 px), field = 1.6 x the object's
major axis, between 12 arcmin and 4 degrees. Skips files already downloaded, so it can be re-run."""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
os.makedirs('dss', exist_ok=True)
d = json.load(open('messier_raw.json'))
def major_arcmin(s):
    s = s.replace('′', "'").replace('″', '"')
    vals = []
    for num, unit in re.findall(r'([\d.]+)\s*([°\'"])', s):
        v = float(num); vals.append(v * 60 if unit == '°' else v / 60 if unit == '"' else v)
    return max(vals) if vals else 10.0
jobs = []
for x in d:
    fov = min(240.0, max(12.0, 1.6 * major_arcmin(x['dims']))) / 60   # degrees
    x['fov'] = fov
    for band, sv in (('b', 'DSS2 Blue'), ('r', 'DSS2 Red'), ('i', 'DSS2 IR')):
        jobs.append((x['m'], band, sv, x['ra'], x['dec'], fov))
json.dump({x['m']: x['fov'] for x in d}, open('fov.json', 'w'))
def get(job):
    m, band, sv, ra, dec, fov = job
    out = f'dss/m{m:03d}_{band}.fits'
    if os.path.exists(out) and os.path.getsize(out) > 100000: return
    url = ('https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?' + urllib.parse.urlencode(
        dict(Position=f'{ra:.5f},{dec:.5f}', Survey=sv, Pixels=512, Size=f'{fov:.4f}', Return='FITS')))
    for attempt in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'aiship-data-builder/1.0'}), timeout=180).read()
            if data[:6] == b'SIMPLE':
                open(out, 'wb').write(data); print('ok', out, flush=True); return
            print('not fits', out, data[:80], flush=True)
        except Exception as e:
            print('retry', out, e, flush=True)
        time.sleep(5)
import urllib.parse
with ThreadPoolExecutor(4) as ex: list(ex.map(get, jobs))
print('done', len([f for f in os.listdir('dss') if f.endswith('.fits')]))
