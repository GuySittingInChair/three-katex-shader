"""Arp's Atlas of Peculiar Galaxies (1966): all 338 objects.
List, classes and class descriptions: Wikipedia 'Atlas of Peculiar Galaxies' (arp/parse_arp.py -> arp/arp_list.json).
Per object, cached under arp/: NED ObjectLookup for 'Arp N' (position + refcode, type, redshift + refcode), NED-D
distances (median), Wikipedia summary where the list links an article (title checked), DSS2 (else DSS1) red + blue
plates via SkyView, 5 arcmin field. Distance: NED-D median, else Hubble's law from the redshift (H0 = 70), labelled.
Objects that are already in Messier's list or the Unknown Universe (within 3') are not repeated: they get an
'Arp N' tag instead (alsoArp).
Outputs (out_arp/): meta.json, atlas.jpg (tiles of 128 px), img/arpNNN.jpg (320 px)."""
import json, os, re, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from astropy.io import fits
from scipy import ndimage as ndi
from PIL import Image
D = 'arp/'
for sub in ('ned', 'nedd', 'wiki', 'dss'): os.makedirs(D + sub, exist_ok=True)
os.makedirs('out_arp/img', exist_ok=True)
UA = {'User-Agent': 'aiship-data-builder/1.0 (offline build of a public sketch)'}
def fetch(url, path, binary=False, tries=4, pause=0.5):
    if os.path.exists(path) and os.path.getsize(path) > 200: return open(path, 'rb' if binary else 'r').read()
    for k in range(tries):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=240).read()
            open(path, 'wb').write(data); time.sleep(pause)
            return data if binary else data.decode('utf-8', 'replace')
        except Exception as e:
            print('  retry', path, e, flush=True); time.sleep(4 * (k + 1))
    return None
L = json.load(open(D + 'arp_list.json'))
FOV = 5 / 60

def ned(x):
    i = x['arp']
    j = json.loads(fetch('https://ned.ipac.caltech.edu/srs/ObjectLookup?' + urllib.parse.urlencode({'name': f'Arp {i}'}), f'{D}ned/{i}.json'))
    if j.get('ResultCode') != 3:
        os.remove(f'{D}ned/{i}.json'); return None
    P = j['Preferred']
    x.update(nedName=P['Name'], nedType=P['ObjType']['Value'], ra=P['Position']['RA'], dec=P['Position']['Dec'], posRef='NED (' + str(P['Position']['RefCode']) + ')',
             z=(P.get('Redshift') or {}).get('Value'), zRef=(P.get('Redshift') or {}).get('RefCode'))
    h = fetch('https://ned.ipac.caltech.edu/cgi-bin/nDistance?' + urllib.parse.urlencode({'name': P['Name']}), f'{D}nedd/{i}.html') or ''
    t = re.sub(r'<[^>]+>', ' ', h)
    m = re.search(r'Median\s+([\d.]+)\s+([\d.]+)', t)
    if m:
        lo = re.search(r'Min\.\s+([\d.]+)\s+([\d.]+)', t); hi = re.search(r'Max\.\s+([\d.]+)\s+([\d.]+)', t)
        x.update(mpc=float(m.group(2)), lo=float(lo.group(2)) if lo else None, hi=float(hi.group(2)) if hi else None, distSrc='NED-D: median of the published redshift-independent distances')
    elif x['z'] and x['z'] > 0.002:
        x.update(mpc=299792.458 * x['z'] / 70, lo=None, hi=None, distSrc=f"from its redshift z = {x['z']:.4f} (Hubble's law, H₀ = 70 km/s/Mpc)")
    else:
        # NED's entry for a pair or group as a whole often has no redshift: use the first member galaxy Arp listed
        first = re.split(r',|\(| and ', x['name'] or '')[0].strip()
        if first and not first.lower().startswith('arp'):
            jm = json.loads(fetch('https://ned.ipac.caltech.edu/srs/ObjectLookup?' + urllib.parse.urlencode({'name': first}), f'{D}ned/{i}_member.json') or '{}')
            Pm = jm.get('Preferred') or {}
            zm = (Pm.get('Redshift') or {}).get('Value')
            if jm.get('ResultCode') == 3 and zm and zm > 0.002:
                x.update(z=zm, zRef=(Pm.get('Redshift') or {}).get('RefCode'), mpc=299792.458 * zm / 70, lo=None, hi=None,
                         distSrc=f"from the redshift of its member {Pm['Name']}, z = {zm:.4f} (Hubble's law, H₀ = 70 km/s/Mpc)")
    return x

def wiki_all(L):
    import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from wikibatch import fetch_many
    W = fetch_many([x['wiki'] for x in L if x.get('wiki')])
    for x in L:
        w = W.get(x.get('wiki'))
        if w and w.get('extract') and not w.get('disambiguation'):
            x.update(about=w['extract'], wikiUrl=w['url'], wikiTitle=w['title'])
    return L

def dss(x):
    i = x['arp']; got = {}
    for b, names in (('r', ('DSS2 Red', 'DSS1 Red')), ('b', ('DSS2 Blue', 'DSS1 Blue'))):
        for sv in names:
            path = f'{D}dss/{i}_{b}_{sv.split()[0]}.fits'
            data = fetch('https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?' + urllib.parse.urlencode(dict(Position=f"{x['ra']:.5f},{x['dec']:.5f}", Survey=sv, Pixels=400, Size=f'{FOV:.4f}', Return='FITS')), path, binary=True)
            if data and data[:6] == b'SIMPLE':
                a = fits.open(path)[0].data
                if a is not None and a.ndim == 2 and np.mean(a <= np.nanmin(a) + 1e-6) < 0.03:
                    got[b] = (a.astype(np.float32), sv.split()[0]); break
    x['_bands'] = got
    return x

print('NED…', flush=True)
with ThreadPoolExecutor(4) as ex: L = list(ex.map(ned, L))
L = [x for x in L if x and x.get('mpc')]
print('kept', len(L), flush=True)
print('Wikipedia…', flush=True)
L = wiki_all(L)   # batches of 20: Wikipedia rate-limits single requests
print('DSS…', flush=True)
with ThreadPoolExecutor(4) as ex: L = list(ex.map(dss, L))

# duplicates of objects already shown
def sep(a1, d1, a2, d2):
    a1, d1, a2, d2 = map(np.radians, (a1, d1, a2, d2))
    return np.degrees(np.arccos(np.clip(np.sin(d1) * np.sin(d2) + np.cos(d1) * np.cos(d2) * np.cos(a1 - a2), -1, 1))) * 60
messier = json.load(open('out_messier/meta.json'))['objects']; deep = json.load(open('out_deepsky/meta.json'))['objects']
also = {'messier': {}, 'deep': {}}
keep = []
for x in L:
    dm = min(messier, key=lambda o: sep(x['ra'], x['dec'], o['ra'], o['dec'])); dd = min(deep, key=lambda o: sep(x['ra'], x['dec'], o['ra'], o['dec']))
    if sep(x['ra'], x['dec'], dm['ra'], dm['dec']) < 3: also['messier'].setdefault(dm['m'], []).append(x['arp']); continue
    if sep(x['ra'], x['dec'], dd['ra'], dd['dec']) < 3: also['deep'].setdefault(dd['id'], []).append(x['arp']); continue
    keep.append(x)
print('duplicates', also)

stretch = lambda a, lo, hi: np.clip(np.arcsinh(np.clip(a - lo, 0, None) / (hi - lo) * 10) / np.arcsinh(10), 0, 1)
N = 400; yy, xx = np.mgrid[:N, :N]; outer = np.hypot(yy - N / 2, xx - N / 2) > 0.39 * N
TILE = 128; COLS = 20
rows = (len(keep) + COLS - 1) // COLS
atlas = np.zeros((rows * TILE, COLS * TILE, 3), np.uint8)
out = []
for k, x in enumerate(keep):
    g = x.pop('_bands')
    if not g: continue
    rr = g.get('r', g.get('b'))[0]; bb = g.get('b', g.get('r'))[0]
    norm = []
    for a in (rr, bb):
        a = np.nan_to_num(a, nan=np.nanmedian(a)); lo = np.percentile(a, 25)
        norm.append((a - lo) / max(np.percentile(a[outer], 99.7) - np.percentile(a[outer], 25), 1e-6))
    hi = np.percentile(np.max(norm, axis=0), 99.8)
    R_, B_ = (stretch(n, 0, max(hi, 1e-3)) for n in norm)
    rgb = np.stack([R_, 0.35 * R_ + 0.65 * B_, B_], -1)[::-1]
    lum = rgb.mean(-1, keepdims=True); chroma = rgb / np.maximum(lum, 1e-3)
    chroma = np.clip(1 + (np.stack([ndi.gaussian_filter(chroma[..., c], 2.0) for c in range(3)], -1) - 1) * 1.25, 0.2, 2.2)
    img = Image.fromarray((np.clip(lum * chroma, 0, 1) ** 0.9 * 255).astype(np.uint8)).resize((320, 320), Image.LANCZOS)
    img.save(f"out_arp/img/arp{x['arp']:03d}.jpg", quality=78)
    t = len(out); r0, c0 = divmod(t, COLS)
    atlas[r0 * TILE:(r0 + 1) * TILE, c0 * TILE:(c0 + 1) * TILE] = np.asarray(img.resize((TILE, TILE), Image.LANCZOS))
    survey = ' + '.join(sorted({v[1] for v in g.values()})) + (' red + blue' if len(g) == 2 else ' (one plate only)')
    out.append(dict(id=f"arp{x['arp']}", arp=x['arp'], name=x['name'] or f"Arp {x['arp']}", cls=x['cls'], sub=x['sub'], clsText=x['clsText'], notes=x['notes'],
                    nedName=x['nedName'], nedType=x['nedType'], ra=x['ra'], dec=x['dec'], posRef=x['posRef'], z=x['z'], zRef=x['zRef'],
                    ly=x['mpc'] * 3.2616e6, distLo=x['lo'] and x['lo'] * 3.2616e6, distHi=x['hi'] and x['hi'] * 3.2616e6, distSrc=x['distSrc'],
                    survey=survey, fovDeg=FOV, about=x.get('about', ''), wikiUrl=x.get('wikiUrl'), wikiTitle=x.get('wikiTitle'),
                    nedUrl='https://ned.ipac.caltech.edu/byname?objname=' + urllib.parse.quote(x['nedName']), tile=t))
rows = (len(out) + COLS - 1) // COLS
Image.fromarray(atlas[:rows * TILE]).save('out_arp/atlas.jpg', quality=82)
json.dump(dict(n=len(out), tile=TILE, cols=COLS, rows=rows, objects=out, alsoArp=also,
               source='Halton Arp, Atlas of Peculiar Galaxies (Caltech, 1966); list and class descriptions from Wikipedia (CC BY-SA 4.0)',
               credit='Measurements: NASA/IPAC Extragalactic Database (NED). Pictures: Digitized Sky Survey via NASA SkyView.'),
          open('out_arp/meta.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('objects', len(out), 'with Wikipedia summary', sum(1 for o in out if o['about']), 'meta', os.path.getsize('out_arp/meta.json') // 1024, 'KB',
      'images', sum(os.path.getsize('out_arp/img/' + f) for f in os.listdir('out_arp/img')) // 1024, 'KB')
