"""Pick and download Chandra observations for build_bh.py: for each target, the deepest ACIS imaging (no grating)
observations, longest first, until about 150 ks (at most 4), all pointed within 3' of the first. Writes bh/obs.json."""
import json, os, re, sys, urllib.request, urllib.parse
UA = {'User-Agent': 'aiship-data-builder/1.0'}
TARGETS = {'m87': 'M87', 'a2052': 'Abell 2052', 'n5813': 'NGC 5813', 'hydraa': 'Hydra A', 'ms0735': 'MS0735.6+7421',
           'a2199': 'Abell 2199', 'n5044': 'NGC 5044', 'a0335': '2A0335+096', 'a262': 'Abell 262', 'cyga': 'Cygnus A'}
def get(url, t=120): return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t).read()
def hms(ra, dec):
    h, m, s = map(float, ra.split()); d = dec.split(); sg = -1 if d[0].startswith('-') else 1
    return 15 * (h + m / 60 + s / 3600), sg * (abs(float(d[0])) + float(d[1]) / 60 + float(d[2]) / 3600)
out = json.load(open('bh/obs.json')) if os.path.exists('bh/obs.json') else {}
os.makedirs('bh/raw', exist_ok=True)
for key, name in TARGETS.items():
    if key in out: continue
    txt = get('https://cda.harvard.edu/srservices/ocatList.do?' + urllib.parse.urlencode({'target': name, 'format': 'text'})).decode()
    rows = [l.split('\t') for l in txt.splitlines() if l and not l.startswith('#') and l.split('\t')[0].isdigit()]
    cand = []
    for r in rows:
        try:
            if r[2] not in ('ACIS-S', 'ACIS-I') or r[3] != 'NONE' or r[10] != 'archived' or r[12] != 'TE': continue
            cand.append(dict(obsid=int(r[1]), ks=float(r[5]), ra=hms(r[8], r[9])[0], dec=hms(r[8], r[9])[1]))
        except Exception: pass
    cand.sort(key=lambda c: -c['ks'])
    pick = []
    for c in cand:
        if pick and (abs(c['ra'] - pick[0]['ra']) * 60 * 0.8 > 3 or abs(c['dec'] - pick[0]['dec']) * 60 > 3): continue
        pick.append(c)
        if sum(p['ks'] for p in pick) >= 150 or len(pick) >= 4: break
    print(key, name, [(p['obsid'], round(p['ks'])) for p in pick], flush=True)
    files = []
    for p in pick:
        d = p['obsid'] % 10
        base = f"https://cxc.cfa.harvard.edu/cdaftp/byobsid/{d}/{p['obsid']}/primary/"
        f = re.findall(r'acisf0*%d[^"]*_evt2\.fits\.gz' % p['obsid'], get(base).decode())
        if not f: print('  no evt2 for', p['obsid']); continue
        dst = f'bh/raw/{f[0]}'
        if not os.path.exists(dst):
            data = get(base + f[0], 3600); open(dst + '.part', 'wb').write(data); os.replace(dst + '.part', dst)
        print('  got', f[0], os.path.getsize(dst) // 2**20, 'MB', flush=True); files.append(p['obsid'])
    out[key] = dict(name=name, obsids=files, ra=pick[0]['ra'], dec=pick[0]['dec'], ks=round(sum(p['ks'] for p in pick)))
    json.dump(out, open('bh/obs.json', 'w'), indent=1)
