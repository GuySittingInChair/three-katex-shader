"""The Unknown Universe: unusual galaxies beyond Messier's catalogue (curated list in deepsky/objects.py).
Per object, fetched once and cached under deepsky/:
  NED ObjectLookup (position + refcode, type, redshift + refcode)  -> ned/<id>.json
  NED-D redshift-independent distances, median                      -> nedd/<id>.html
  Wikipedia lead summary (CC BY-SA 4.0), title checked              -> wiki/<id>.json
  DSS red + blue plates via NASA SkyView (DSS2, else DSS1)          -> dss/<id>_{r,b}.fits
Distance: NED-D median where it has any; otherwise Hubble's law d = cz / H0 with H0 = 70 km/s/Mpc (labelled).
Outputs (out_deepsky/): meta.json, atlas.jpg (8 x 5 tiles of 192 px), img/<id>.jpg (512 px)."""
import json, os, re, sys, time, urllib.request, urllib.parse
import numpy as np
from astropy.io import fits
from scipy import ndimage as ndi
from PIL import Image
sys.path.insert(0, 'deepsky')
from objects import OBJECTS
D = 'deepsky/'
for sub in ('ned', 'nedd', 'wiki', 'dss'): os.makedirs(D + sub, exist_ok=True)
os.makedirs('out_deepsky/img', exist_ok=True)
UA = {'User-Agent': 'aiship-data-builder/1.0 (offline build of a public sketch)'}
def fetch(url, path, binary=False, tries=4):
    if os.path.exists(path) and os.path.getsize(path) > 200: return open(path, 'rb' if binary else 'r').read()
    for k in range(tries):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=240).read()
            open(path, 'wb').write(data); time.sleep(0.8)
            return data if binary else data.decode('utf-8', 'replace')
        except Exception as e:
            print('  retry', path, e); time.sleep(4 * (k + 1))
    return None

LY_PER_MPC = 3.2616e6
out = []
for o in OBJECTS:
    i = o['id']
    # ---- position, type, redshift ----
    pos = None
    if o['ned']:
        j = json.loads(fetch('https://ned.ipac.caltech.edu/srs/ObjectLookup?' + urllib.parse.urlencode({'name': o['ned']}), f'{D}ned/{i}.json'))
        P = j['Preferred']
        pos = dict(ra=P['Position']['RA'], dec=P['Position']['Dec'], ref='NED (' + str(P['Position']['RefCode']) + ')')
        nedName, typ = P['Name'], P['ObjType']['Value']
        z, zref = (P.get('Redshift') or {}).get('Value'), (P.get('Redshift') or {}).get('RefCode')
    else:
        nedName, typ, z, zref = None, None, None, None
    # ---- Wikipedia: summary (+ coordinates when NED couldn't name it) ----
    w = json.loads(fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(o['wiki'].replace(' ', '_')), f'{D}wiki/{i}.json'))
    if (w.get('title') or '').replace('_', ' ').lower() != o['wiki'].lower() and not w.get('extract'):
        raise SystemExit(f'wiki mismatch for {i}: {w.get("title")}')
    if pos is None:
        c = w.get('coordinates')
        if not c: raise SystemExit(f'no position for {i}')
        pos = dict(ra=c['lon'] % 360, dec=c['lat'], ref='Wikipedia, ' + o['wiki'])
    # ---- distance ----
    dist = o.get('dist')          # set by hand only where the distance itself is disputed or missing in NED
    if dist is None and nedName:
        h = fetch('https://ned.ipac.caltech.edu/cgi-bin/nDistance?' + urllib.parse.urlencode({'name': nedName}), f'{D}nedd/{i}.html')
        t = re.sub(r'<[^>]+>', ' ', h or '')
        m = re.search(r'Median\s+([\d.]+)\s+([\d.]+)', t)
        if m:
            mins = re.search(r'Min\.\s+([\d.]+)\s+([\d.]+)', t); maxs = re.search(r'Max\.\s+([\d.]+)\s+([\d.]+)', t)
            dist = dict(mpc=float(m.group(2)), lo=float(mins.group(2)) if mins else None, hi=float(maxs.group(2)) if maxs else None,
                        src='NED-D: median of the published redshift-independent distances')
    if dist is None and z and z > 0.004:
        dist = dict(mpc=299792.458 * z / 70, lo=None, hi=None, src=f'from its redshift z = {z:.4f} (Hubble\'s law, H₀ = 70 km/s/Mpc)')
    if dist is None: raise SystemExit(f'no distance for {i}')
    # ---- picture ----
    fov = o['fov'] / 60
    bands = {}
    order = ('DSS1', 'DSS2') if o.get('surveys') == 'DSS1' else ('DSS2', 'DSS1')   # DSS1 where DSS2's plates join across the object
    for b, names in (('r', tuple(f'{x} Red' for x in order)), ('b', tuple(f'{x} Blue' for x in order))):
        got = None
        for sv in names:
            path = f'{D}dss/{i}_{b}_{sv.split()[0]}.fits'
            data = fetch('https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?' + urllib.parse.urlencode(dict(Position=f"{pos['ra']:.5f},{pos['dec']:.5f}", Survey=sv, Pixels=512, Size=f'{fov:.4f}', Return='FITS')), path, binary=True)
            if data and data[:6] == b'SIMPLE':
                a = fits.open(path)[0].data
                if a is not None and a.ndim == 2:
                    a = a.astype(np.float32)
                    blk = a[:512, :512].reshape(32, 16, 32, 16).std(axis=(1, 3))
                    if np.mean(a <= np.nanmin(a) + 1e-6) < 0.03 and np.mean(blk < 1e-3 * (np.percentile(a, 99) - np.percentile(a, 1) + 1e-6)) < 0.02:
                        got = (a, sv.split()[0]); break
        bands[b] = got
    if not bands['r'] and not bands['b']: raise SystemExit(f'no picture for {i}')
    rr = bands['r'][0] if bands['r'] else bands['b'][0]; bb = bands['b'][0] if bands['b'] else rr
    survey = ' + '.join(sorted({x[1] for x in bands.values() if x})) + (' red + blue' if bands['r'] and bands['b'] else ' (one plate only)')
    yy, xx = np.mgrid[:512, :512]; outer = np.hypot(yy - 255.5, xx - 255.5) > 200
    stretch = lambda a, lo, hi: np.clip(np.arcsinh(np.clip(a - lo, 0, None) / (hi - lo) * 10) / np.arcsinh(10), 0, 1)
    norm = []
    for a in (rr, bb):
        a = np.nan_to_num(a, nan=np.nanmedian(a)); lo = np.percentile(a, 25)
        norm.append((a - lo) / max(np.percentile(a[outer], 99.7) - np.percentile(a[outer], 25), 1e-6))
    hi = np.percentile(np.max(norm, axis=0), 99.8)
    R_, B_ = (stretch(n, 0, max(hi, 1e-3)) for n in norm)
    rgb = np.stack([R_, 0.35 * R_ + 0.65 * B_, B_], -1)[::-1]
    lum = rgb.mean(-1, keepdims=True); chroma = rgb / np.maximum(lum, 1e-3)
    chroma = np.stack([ndi.gaussian_filter(chroma[..., k], 2.0) for k in range(3)], -1)
    chroma = np.clip(1 + (chroma - 1) * 1.25, 0.2, 2.2)
    img = Image.fromarray((np.clip(lum * chroma, 0, 1) ** 0.9 * 255).astype(np.uint8))
    img.save(f'out_deepsky/img/{i}.jpg', quality=80)
    o2 = {k: v for k, v in o.items() if k not in ('ned', 'dist', 'surveys')}
    out.append(dict(**o2, nedQuery=o['ned'], nedName=nedName, nedType=typ, z=z, zRef=zref, ra=pos['ra'], dec=pos['dec'], posRef=pos['ref'],
                    ly=dist['mpc'] * LY_PER_MPC, distLo=dist['lo'] and dist['lo'] * LY_PER_MPC, distHi=dist['hi'] and dist['hi'] * LY_PER_MPC, distSrc=dist['src'],
                    survey=survey, fovDeg=fov, about=(w.get('extract') or '').strip(), wikiUrl=w.get('content_urls', {}).get('desktop', {}).get('page', ''), wikiTitle=w.get('title'),
                    nedUrl=('https://ned.ipac.caltech.edu/byname?objname=' + urllib.parse.quote(nedName)) if nedName else None))
    print(f"{i:10s} {dist['mpc']:10.4f} Mpc  {dist['src'][:20]:20s} {survey:28s} {typ}")

TILE, COLS = 192, 8
atlas = np.zeros((TILE * ((len(out) + COLS - 1) // COLS), TILE * COLS, 3), np.uint8)
for k, o in enumerate(out):
    t = np.asarray(Image.open(f"out_deepsky/img/{o['id']}.jpg").resize((TILE, TILE), Image.LANCZOS))
    r0, c0 = divmod(k, COLS); atlas[r0 * TILE:(r0 + 1) * TILE, c0 * TILE:(c0 + 1) * TILE] = t
    o['tile'] = k
Image.fromarray(atlas).save('out_deepsky/atlas.jpg', quality=86)
json.dump(dict(n=len(out), tile=TILE, cols=COLS, rows=atlas.shape[0] // TILE, objects=out,
               credit='Positions, types, redshifts, distances: NASA/IPAC Extragalactic Database (NED). Pictures: Digitized Sky Survey via NASA SkyView. Summaries: Wikipedia (CC BY-SA 4.0).'),
          open('out_deepsky/meta.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('objects', len(out), 'meta', os.path.getsize('out_deepsky/meta.json') // 1024, 'KB')
