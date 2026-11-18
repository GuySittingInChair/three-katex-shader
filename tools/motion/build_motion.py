"""Where every galaxy on the map is moving.
OBSERVED: redshift (NED, per galaxy, with its reference); redshift-independent distances (NED-D: median, spread, count).
INFERRED (labelled on the page):
  speed along our line of sight  cz  (heliocentric), and in the cosmic-microwave-background frame
     (Sun's motion relative to the CMB: 369.82 km/s towards l = 264.021°, b = 48.253°, Planck 2018 results I);
  the galaxy's own motion along our line of sight  v_pec = c (z_cmb − z_cos) / (1 + z_cos),
     with z_cos from its distance by Hubble's law (H0 = 70, as elsewhere on the site) — only when the distance does
     NOT come from the redshift itself; error from the spread of the published distances;
  its full 3D motion predicted from gravity: the Cosmicflows-4 velocity field (Courtois et al. 2023, A&A 670, L15;
     Zenodo 20653238: 128³ grid, 1000 Mpc/h box, supergalactic axes, observer at the centre), read off at the
     galaxy's position (trilinear). The file does not state its velocity unit; we calibrated it to 54 km/s per unit
     from two independent checks: the continuity equation (div v = −f H δ with f = Ωm^0.55, Ωm = 0.3) and the bulk
     flows the paper publishes (Table 1, ungrouped: 250–420 km/s within 50–300 Mpc/h). See calib below.
Output: out_motion/motion.json"""
import json, os, re, math, time, urllib.request, urllib.parse
import numpy as np
from astropy.io import fits
from astropy.coordinates import SkyCoord, Supergalactic, Galactic, ICRS
import astropy.units as u
C = 299792.458; H0 = 70.0; h = H0 / 100
D = 'flow/'
for sub in ('ned', 'nedd'): os.makedirs(D + sub, exist_ok=True)
os.makedirs('out_motion', exist_ok=True)
UA = {'User-Agent': 'aiship-data-builder/1.0 (offline build of a public sketch)'}

def fetch(url, path, tries=4):
    if os.path.exists(path) and os.path.getsize(path) > 200: return open(path, encoding='utf-8', errors='replace').read()
    for k in range(tries):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=240).read()
            open(path, 'wb').write(data); time.sleep(0.4); return data.decode('utf-8', 'replace')
        except Exception as e:
            print('  retry', path, e, flush=True); time.sleep(4 * (k + 1))
    return None

def nedd_stats(html):
    """NED-D summary: median distance (Mpc), number of distances, std of the moduli (mag)."""
    if not html: return None
    t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html))
    m = re.search(r'Median\s+([\d.]+)\s+([\d.]+)', t)
    if not m: return None
    n = re.search(r'(\d+)\s+Distances? found', t); sd = re.search(r'Std\. Dev\.\s+([\d.]+)\s+([\d.]+)', t)
    return dict(mpc=float(m.group(2)), n=int(n.group(1)) if n else None, sdMod=float(sd.group(1)) if sd else None)

def dist_err(st):
    """fractional distance error: the spread of the published moduli (σ_d/d = 0.461 σ_μ), at least 10%;
    20% when there are fewer than 3 published values (a typical single Tully–Fisher or similar distance)."""
    if not st or not st.get('n') or st['n'] < 3 or st.get('sdMod') is None: return 0.2
    return max(0.10, 0.461 * st['sdMod'])

# ---- the velocity field ----
VF = fits.open(D + 'CF4_new_128-z008_velocity.fits')[0].data.astype(np.float64)   # numpy order [component, SGX, SGY, SGZ]
DF = fits.open(D + 'CF4_new_128-z008_delta.fits')[0].data.astype(np.float64)
N = 128; L = 1000.0; CELL = L / N
# calibration (printed, kept in the output)
k = np.fft.fftfreq(N, CELL) * 2 * np.pi; K = np.meshgrid(k, k, k, indexing='ij')
div = np.real(np.fft.ifftn(sum(1j * K[a] * np.fft.fftn(VF[a]) for a in range(3))))
slope = -np.polyfit(DF.ravel(), div.ravel(), 1)[0]
UNIT_CONT = 100 * 0.3 ** 0.55 / slope
xc = (np.arange(N) + 0.5) * CELL - L / 2; X, Y, Z = np.meshgrid(xc, xc, xc, indexing='ij'); RR = np.sqrt(X ** 2 + Y ** 2 + Z ** 2)
pub = {50: 250, 100: 359, 150: 332, 200: 347, 250: 407, 300: 422}
ratios = [pub[r] / np.linalg.norm([VF[a][RR < r].mean() for a in range(3)]) for r in pub]
UNIT = 54.0
print(f'unit from continuity {UNIT_CONT:.1f} km/s, from published bulk flows {np.round(ratios, 1)} → using {UNIT}')
del div, K, X, Y, Z, RR

def field(p):
    """trilinear velocity (km/s, SG cartesian) and density contrast at p (Mpc/h, SG); None outside the grid."""
    g = (np.asarray(p) + L / 2) / CELL - 0.5
    i0 = np.floor(g).astype(int); f = g - i0
    if (i0 < 0).any() or (i0 + 1 >= N).any(): return None, None
    v = np.zeros(3); d = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[0] if dx else 1 - f[0]) * (f[1] if dy else 1 - f[1]) * (f[2] if dz else 1 - f[2])
                v += w * VF[:, i0[0] + dx, i0[1] + dy, i0[2] + dz]; d += w * DF[i0[0] + dx, i0[1] + dy, i0[2] + dz]
    return v * UNIT, d

def sg_xyz(ra, dec, mpc):
    s = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, distance=mpc * u.Mpc).transform_to(Supergalactic()).cartesian
    return np.array([s.x.value, s.y.value, s.z.value])
def sg_to_eq(v):
    """a vector in supergalactic cartesian → equatorial (ICRS) cartesian"""
    s = SkyCoord(sgx=v[0], sgy=v[1], sgz=v[2], frame=Supergalactic, representation_type='cartesian').transform_to(ICRS()).cartesian
    return np.array([s.x.value, s.y.value, s.z.value])

# Sun relative to the CMB (Planck 2018 results I)
CMB = SkyCoord(l=264.021 * u.deg, b=48.253 * u.deg, frame='galactic').icrs; VSUN_CMB = 369.82
def z_cmb(z, ra, dec):
    cosang = SkyCoord(ra=ra * u.deg, dec=dec * u.deg).separation(CMB).rad; cosang = math.cos(cosang)
    return (1 + z) / (1 - VSUN_CMB * cosang / C) - 1, VSUN_CMB * cosang

# ---- the clusters a galaxy may be falling towards (NED positions and redshifts) ----
ATTR = [('the Virgo Cluster', 'Virgo Cluster'), ('the Coma Cluster', 'Coma Cluster'), ('the Great Attractor (Norma Cluster)', 'ACO 3627'),
        ('the Shapley Supercluster', 'ACO 3558'), ('the Perseus Cluster', 'ACO 426'), ('the Hercules Cluster', 'ACO 2151'),
        ('the Fornax Cluster', 'Fornax Cluster'), ('the Centaurus Cluster', 'ACO 3526')]
def lookup(name, tag):
    j = json.loads(fetch('https://ned.ipac.caltech.edu/srs/ObjectLookup?' + urllib.parse.urlencode({'name': name}), f'{D}ned/{tag}.json') or '{}')
    if j.get('ResultCode') != 3: return None
    P = j['Preferred']; z = P.get('Redshift') or {}
    return dict(nedName=P['Name'], ra=P['Position']['RA'], dec=P['Position']['Dec'], z=z.get('Value'), zRef=z.get('RefCode'), type=P['ObjType']['Value'])
attractors = []
for label, q in ATTR:
    x = lookup(q, 'attr_' + re.sub(r'\W+', '_', q))
    if not x or not x['z']: print('  no attractor', q); continue
    mpc = C * z_cmb(x['z'], x['ra'], x['dec'])[0] / H0      # cluster distance from its redshift (CMB frame)
    attractors.append(dict(label=label, ned=x['nedName'], p=sg_xyz(x['ra'], x['dec'], mpc) * h, mpc=mpc))
    print(f'  attractor {label}: z {x["z"]:.4f}  {mpc:.0f} Mpc')

def heading(p, v):
    """the cluster most nearly in the direction the galaxy moves (within 35°), seen from the galaxy"""
    best = None
    for a in attractors:
        d = a['p'] - p; dist = np.linalg.norm(d)
        if dist < 3: continue
        cos = d @ v / (dist * np.linalg.norm(v))
        if cos > math.cos(math.radians(35)) and (best is None or cos > best[1]): best = (a, cos, dist / h)
    return None if not best else dict(name=best[0]['label'], angle=round(math.degrees(math.acos(min(1, best[1])))), mpc=round(best[2]))

# galaxies inside a big cluster swarm at random speeds the smooth map can't follow. Centres: M87 (Virgo), NGC 1399 (Fornax), NGC 4874 (Coma), NGC 1275 (Perseus)
CLUSTERS = [('the Virgo Cluster', 187.706, 12.391, 8, 12, 25), ('the Fornax Cluster', 54.621, -35.450, 4, 15, 24),
            ('the Coma Cluster', 194.899, 27.959, 2.5, 80, 120), ('the Perseus Cluster', 49.951, 41.512, 2, 55, 85)]
# ---- the galaxies ----
gal = []
for o in json.load(open('out_messier/meta.json'))['objects']:
    if 'alaxy' not in o['type']: continue
    ngc = o['ngc'].split(',')[0].strip()          # by NGC name: NED reads 'M 102' as M101
    x = lookup(ngc, f"m{o['m']}_ngc")
    st = nedd_stats(fetch('https://ned.ipac.caltech.edu/cgi-bin/nDistance?' + urllib.parse.urlencode({'name': x['nedName']}), f"{D}nedd/m{o['m']}_ngc.html")) if x else None
    gal.append(dict(key=f"m{o['m']}", name=o['name'] or f"M{o['m']}", ra=x['ra'], dec=x['dec'], z=x['z'], zRef=x['zRef'], nedName=x['nedName'],
                    mpcCard=st['mpc'] if st else o['ly'] / 3.26156e6, st=st, indep=True,
                    distNote='NED-D: median of the published redshift-independent distances' if st else 'as on its card (Wikipedia)'))
for o in json.load(open('out_deepsky/meta.json'))['objects']:
    if not o.get('z') or not o.get('ly'): continue
    st = nedd_stats(open(f"deepsky/nedd/{o['id']}.html", encoding='utf-8', errors='replace').read()) if os.path.exists(f"deepsky/nedd/{o['id']}.html") else None
    gal.append(dict(key='deep:' + o['id'], name=o['name'], ra=o['ra'], dec=o['dec'], z=o['z'], zRef=o.get('zRef'), nedName=o.get('nedName'),
                    mpcCard=o['ly'] / 3.26156e6, st=st, indep=not str(o.get('distSrc', '')).startswith('from its redshift'), distNote=o.get('distSrc')))
for o in json.load(open('out_arp/meta.json'))['objects']:
    if not o.get('z') or not o.get('ly'): continue
    st = nedd_stats(open(f"arp/nedd/{o['arp']}.html", encoding='utf-8', errors='replace').read()) if os.path.exists(f"arp/nedd/{o['arp']}.html") else None
    gal.append(dict(key=f"arp:{o['arp']}", name=f"Arp {o['arp']}", ra=o['ra'], dec=o['dec'], z=o['z'], zRef=o.get('zRef'), nedName=o.get('nedName'),
                    mpcCard=o['ly'] / 3.26156e6, st=st, indep=str(o.get('distSrc', '')).startswith('NED-D'), distNote=o.get('distSrc')))
print('galaxies', len(gal))

out = []
for g in gal:
    if g['z'] is None: print('  no redshift', g['key']); continue
    mpc = g['mpcCard']
    zc, sunproj = z_cmb(g['z'], g['ra'], g['dec'])
    r = dict(key=g['key'], name=g['name'], nedName=g['nedName'], z=g['z'], zRef=g['zRef'], czHelio=round(C * g['z']), czCmb=round(C * zc),
             mpc=round(mpc, 3), distNote=g['distNote'], indep=g['indep'])
    if g['st']: r['nedd'] = g['st']
    r['localGroup'] = mpc < 1.5
    for cl, ra0, de0, rad, d0, d1 in CLUSTERS:
        if d0 < mpc < d1 and SkyCoord(ra=g['ra'] * u.deg, dec=g['dec'] * u.deg).separation(SkyCoord(ra=ra0 * u.deg, dec=de0 * u.deg)).deg < rad: r['cluster'] = cl
    # the galaxy's own motion along the line of sight (only with an independent distance, outside the Local Group)
    if g['indep'] and not r['localGroup']:
        fe = dist_err(g['st']); zcos = H0 * mpc / C
        r['hubble'] = round(H0 * mpc); r['vpec'] = round(C * (zc - zcos) / (1 + zcos)); r['vpecErr'] = round(H0 * mpc * fe / (1 + zcos)); r['distErrFrac'] = round(fe, 2)
    # the predicted 3D motion from Cosmicflows-4
    p = sg_xyz(g['ra'], g['dec'], mpc) * h
    rh = float(np.linalg.norm(p))
    v, delta = field(p)
    if v is not None and rh < 350:
        rhat = p / rh
        r['cf4'] = dict(v=round(float(np.linalg.norm(v))), vLos=round(float(v @ rhat)), vSky=round(float(np.linalg.norm(v - (v @ rhat) * rhat))),
                        eq=[round(float(c), 4) for c in sg_to_eq(v / np.linalg.norm(v))], delta=round(float(delta), 2), rMpch=round(rh),
                        reliable=rh < 200, nearby=rh < 8)
        hd = heading(p, v)
        if hd: r['cf4']['towards'] = hd
        # angle on the sky crossed per million years by the predicted sideways motion, and the time to cross a full moon's width
        mu = r['cf4']['vSky'] / (4.74047 * mpc * 1e6) * 1e6      # v_t = 4.74 μ d (μ in arcsec/yr, d in pc) → arcsec per Myr
        r['cf4']['moonMyr'] = round(1800 / mu) if mu > 0 else None
    elif v is None or rh >= 350:
        r['cf4'] = dict(outside=True, rMpch=round(rh))
    out.append(r)
    c4 = r.get('cf4', {})
    print(f"{g['key']:>14} {mpc:7.1f} Mpc cz {r['czHelio']:6d} cmb {r['czCmb']:6d} vpec {r.get('vpec', '—'):>6}±{r.get('vpecErr', '—'):<5} cf4 {c4.get('v', '—'):>5} los {c4.get('vLos', '—'):>5} {c4.get('towards', {}).get('name', '')}", flush=True)

# how well the map's line-of-sight prediction matches the measured motion, for galaxies whose distance is well measured
# (outside the big clusters, error under 250 km/s), by how many published distances NED has for them
check = []
for nmin in (3, 10, 20):
    sel = [(r['vpec'], r['cf4']['vLos']) for r in out if 'vpec' in r and r.get('cf4', {}).get('vLos') is not None and r['vpecErr'] < 250
           and not r.get('cluster') and (r.get('nedd') or {}).get('n', 0) >= nmin]
    a = np.array(sel, float)
    check.append(dict(nMin=nmin, n=len(sel), corr=round(float(np.corrcoef(a[:, 0], a[:, 1])[0, 1]), 2), medDiff=round(float(np.median(np.abs(a[:, 0] - a[:, 1])))),
                      medAbs=round(float(np.median(np.abs(a[:, 0]))))))
print('check', check)
json.dump(dict(galaxies=out, unit=UNIT, check=check, unitCheck=dict(continuity=round(UNIT_CONT, 1), bulkFlows=[round(x, 1) for x in ratios]),
               attractors=[dict(label=a['label'], ned=a['ned'], mpc=round(a['mpc'])) for a in attractors],
               H0=H0, sunCmb=dict(v=VSUN_CMB, l=264.021, b=48.253),
               source='Redshifts and distances: NED (NASA/IPAC Extragalactic Database). Predicted motions: Cosmicflows-4 (Courtois et al. 2023, A&A 670, L15; Zenodo 20653238).'),
          open('out_motion/motion.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('written', len(out))
