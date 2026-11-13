"""Colliding pairs: for every Arp object that names two or more galaxies, the facts a motion model needs.
OBSERVED (NED ObjectLookup, per member galaxy): sky position, redshift (with its reference).
INFERRED, labelled on the page:
  line-of-sight speed difference  dv = c (z2 − z1) / (1 + z̄)  (km/s; one of the three components of their relative motion)
  sky separation in kpc, at the Arp entry's distance (NED-D median, else Hubble's law; see build_arp.py)
  light ratio: background-subtracted red-plate light within each member's aperture (DSS via SkyView, as in build_arp.py)
For a triplet or a group, the two members closest together on the sky are modelled; the others are listed as left out.
Also stored per pair: the red plate binned to 64 × 64 around the pair (for the orbit fit in tools/galaxies/fit_pairs.mjs).
Output: out_pairs/pairs.json"""
import json, os, re, time, urllib.request, urllib.parse, math
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
D = 'arp/'
os.makedirs(D + 'nedm', exist_ok=True); os.makedirs('out_pairs', exist_ok=True)
UA = {'User-Agent': 'aiship-data-builder/1.0 (offline build of a public sketch)'}
C = 299792.458

def lookup(name):
    path = D + 'nedm/' + re.sub(r'[^A-Za-z0-9+-]+', '_', name) + '.json'
    if not (os.path.exists(path) and os.path.getsize(path) > 100):
        for k in range(4):
            try:
                data = urllib.request.urlopen(urllib.request.Request('https://ned.ipac.caltech.edu/srs/ObjectLookup?' + urllib.parse.urlencode({'name': name}), headers=UA), timeout=120).read()
                open(path, 'wb').write(data); time.sleep(0.4); break
            except Exception as e:
                print('  retry', name, e, flush=True); time.sleep(4 * (k + 1))
        else: return None
    j = json.load(open(path))
    if j.get('ResultCode') != 3: return None
    P = j['Preferred']; z = (P.get('Redshift') or {})
    return dict(name=name, nedName=P['Name'], ra=P['Position']['RA'], dec=P['Position']['Dec'], type=P['ObjType']['Value'],
                z=z.get('Value'), zErr=z.get('Uncertainty'), zRef=z.get('RefCode'))

def members(name):
    m = re.search(r'\(([^)]*,[^)]*)\)', name)          # 'Antennae Galaxies (NGC 4038, NGC 4039)'
    if m: name = m.group(1)
    parts = [p.strip() for p in re.split(r',|\+|;| and ', name) if p.strip()]
    return [p for p in parts if not re.search(r'compan|cloud', p, re.I)]

AM = json.load(open('out_arp/meta.json'))
A = {o['arp']: dict(o, host=dict(arp=o['arp'])) for o in AM['objects']}
# Arp objects shown as another card (a Messier object or one of the Unknown Universe): use that card's distance
for cat, f, key in (('messier', 'out_messier/meta.json', 'm'), ('deep', 'out_deepsky/meta.json', 'id')):
    objs = {str(o[key]): o for o in json.load(open(f))['objects']}
    for k, arps in AM['alsoArp'][cat].items():
        o = objs.get(str(k))
        if o and o.get('ly'):
            for n in arps: A.setdefault(n, dict(id=o.get('id', f'm{k}'), name=o.get('name') or f'M{k}', ly=o['ly'], distSrc=o.get('distSrc', 'as on its card'), host={cat: o[key]}))
L = json.load(open(D + 'arp_list.json'))
sep = lambda a, b: math.degrees(math.acos(min(1, math.sin(math.radians(a['dec'])) * math.sin(math.radians(b['dec'])) + math.cos(math.radians(a['dec'])) * math.cos(math.radians(b['dec'])) * math.cos(math.radians(a['ra'] - b['ra']))))) * 60
out, skipped = [], []
for x in L:
    ms = members(x['name'] or '')
    if len(ms) < 2: continue
    o = A.get(x['arp'])
    if not o: skipped.append((x['arp'], 'not on the map (no distance)')); continue
    got = [g for g in (lookup(m) for m in ms) if g]
    got = [g for g in got if g['z'] and g['z'] > 0]
    if len(got) < 2: skipped.append((x['arp'], 'fewer than two members with a redshift')); continue
    # the closest pair on the sky
    pairs = [(sep(a, b), i, j) for i, a in enumerate(got) for j, b in enumerate(got) if i < j]
    s, i, j = min(pairs); a, b = got[i], got[j]
    if s > 4.4: skipped.append((x['arp'], f'members {s:.1f}′ apart: wider than the photo')); continue
    if s < 0.05: skipped.append((x['arp'], 'members at the same position in NED')); continue
    mpc = o['ly'] / 3.2616e6
    kpc_per_arcmin = mpc * 1000 * math.radians(1 / 60)
    dv = C * (b['z'] - a['z']) / (1 + (a['z'] + b['z']) / 2)
    if abs(dv) > 1200: skipped.append((x['arp'], f'line-of-sight speeds differ by {dv:.0f} km/s: probably not a physical pair')); continue
    # light within each member's aperture on the red plate
    fpath = next((f'{D}dss/{x["arp"]}_r_{sv}.fits' for sv in ('DSS2', 'DSS1') if os.path.exists(f'{D}dss/{x["arp"]}_r_{sv}.fits')), None)
    if not fpath: skipped.append((x['arp'], 'no red plate')); continue
    hd = fits.open(fpath)[0]; img = np.nan_to_num(hd.data.astype(np.float64), nan=np.nanmedian(hd.data)); w = WCS(hd.header)
    N = img.shape[0]
    pa = w.all_world2pix([[a['ra'], a['dec']]], 0)[0]; pb = w.all_world2pix([[b['ra'], b['dec']]], 0)[0]
    pe = w.all_world2pix([[a['ra'] + 0.01 / math.cos(math.radians(a['dec'])), a['dec']]], 0)[0]; pn = w.all_world2pix([[a['ra'], a['dec'] + 0.01]], 0)[0]
    assert pe[0] < pa[0] and pn[1] > pa[1], 'expected east to the left and north up on the plate'
    if not all(0 <= p < N for p in (*pa, *pb)): skipped.append((x['arp'], 'a member falls outside the photo')); continue
    bg = np.percentile(img, 30); sky = np.clip(img - bg, 0, None)
    yy, xx = np.mgrid[:N, :N]
    pixS = math.hypot(*(pa - pb))
    rap = max(4, 0.45 * pixS)
    la = sky[np.hypot(xx - pa[0], yy - pa[1]) < rap].sum(); lb = sky[np.hypot(xx - pb[0], yy - pb[1]) < rap].sum()
    def rhalf(p):
        d = np.hypot(xx - p[0], yy - p[1]); m = d < rap
        order = np.argsort(d[m]); cum = np.cumsum(sky[m][order])
        return float(d[m][order][np.searchsorted(cum, cum[-1] / 2)])
    ra_, rb_ = rhalf(pa), rhalf(pb)
    def shape(p, rh):
        # second moments of the light within 2 r½ (inside the aperture): axis ratio and the major axis's angle from +x
        m = np.hypot(xx - p[0], yy - p[1]) < min(rap, 2 * rh); wgt = sky[m]; dx = xx[m] - p[0]; dy = yy[m] - p[1]
        sxx, syy, sxy = (wgt * dx * dx).sum() / wgt.sum(), (wgt * dy * dy).sum() / wgt.sum(), (wgt * dx * dy).sum() / wgt.sum()
        ev, evec = np.linalg.eigh([[sxx, sxy], [sxy, syy]])
        return dict(q=float(math.sqrt(max(ev[0], 1e-9) / ev[1])), ang=float(math.atan2(evec[1, 1], evec[0, 1])))
    sa_, sb_ = shape(pa, ra_), shape(pb, rb_)
    if lb > la: a, b, pa, pb, la, lb, dv, ra_, rb_, sa_, sb_ = b, a, pb, pa, lb, la, -dv, rb_, ra_, sb_, sa_        # 'main' = the brighter one
    # the model's frame: x = pixel x = west (right on the shown picture), y = north (up), z = towards us; kpc,
    # main galaxy at the origin
    arcmin_per_pix = (5 / N)
    kpc_pix = arcmin_per_pix * kpc_per_arcmin
    comp_xy = [float((pb[0] - pa[0]) * kpc_pix), float((pb[1] - pa[1]) * kpc_pix)]
    # the photo around the pair: a square of side 4 × separation (at least 40 kpc), centred on the main galaxy, 64 × 64
    half = max(20.0, 2.0 * math.hypot(*comp_xy))
    G = 64; grid = np.zeros((G, G))
    gx = ((xx - pa[0]) * kpc_pix + half) / (2 * half) * G; gy = ((yy - pa[1]) * kpc_pix + half) / (2 * half) * G
    ok = (gx >= 0) & (gx < G) & (gy >= 0) & (gy < G)
    np.add.at(grid, (gy[ok].astype(int), gx[ok].astype(int)), sky[ok])
    cover = np.zeros((G, G)); np.add.at(cover, (gy[ok].astype(int), gx[ok].astype(int)), 1)
    grid = np.where(cover > 0, grid / np.maximum(cover, 1), -1)      # −1 = outside the photo (not compared)
    gm = grid[grid >= 0]
    grid = np.where(grid >= 0, grid / max(np.percentile(gm, 99.5), 1e-9), -1)
    left = [g['name'] for k, g in enumerate(got) if k not in (i, j)]
    out.append(dict(arp=x['arp'], id=o['id'], name=x['name'] if 'arp' not in o['host'] else o['name'], mpc=mpc, distSrc=o['distSrc'], sepArcmin=s, sepKpc=math.hypot(*comp_xy),
                    main={k: a[k] for k in ('name', 'nedName', 'ra', 'dec', 'type', 'z', 'zErr', 'zRef')},
                    comp={k: b[k] for k in ('name', 'nedName', 'ra', 'dec', 'type', 'z', 'zErr', 'zRef')},
                    dv=dv, shapeMain=sa_, shapeComp=sb_, reMain=ra_ * kpc_pix, reComp=rb_ * kpc_pix, host=o['host'], lightRatio=float(lb / max(la, 1e-9)), compXY=comp_xy, half=half, grid=[round(float(v), 3) for v in grid.ravel()],
                    plate=os.path.basename(fpath).split('_')[-1].split('.')[0], left=left))
    print(f"Arp {x['arp']:3d} {a['name']:>12} + {b['name']:<12} {s:4.1f}′ = {math.hypot(*comp_xy):5.1f} kpc  dv {dv:+6.0f} km/s  light {lb / la:.2f}  r½ {ra_ * kpc_pix:.1f}/{rb_ * kpc_pix:.1f} kpc  q {sa_['q']:.2f}/{sb_['q']:.2f}", flush=True)
json.dump(dict(pairs=out, skipped=skipped), open('out_pairs/pairs.json', 'w'), separators=(',', ':'))
print('pairs', len(out), 'skipped', len(skipped)); [print('  skip', s) for s in skipped]
