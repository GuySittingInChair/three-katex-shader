"""Every confirmed exoplanet, from the NASA Exoplanet Archive (Planetary Systems Composite Parameters, pscomppars):
one row per planet with the archive's preferred value for each quantity.
Derived:
  - discoveries per year and per method;
  - the radius valley: kernel density of log10 R for transiting planets with P < 100 d and radius known to 10%,
    its two peaks and the minimum between them (Fulton et al. 2017: peaks ~1.3 and ~2.4 Re), along the tilt that makes it deepest;
  - the mass-radius relation from planets with a MEASURED mass (pl_bmassprov == 'Mass', mass to 25%, radius to 10%):
    continuous broken power law in log-log with two break points, least squares in log R, breaks grid-searched
    (Chen & Kipping 2017: slopes 0.279 / 0.589 / -0.044, breaks 2.04 Me and 131.6 Me);
  - the habitable zone: Kopparapu et al. (2014) S_eff(Teff) for runaway greenhouse and maximum greenhouse
    (conservative) and recent Venus / early Mars (optimistic); planets inside, and the small ones (R < 1.6 Re). Fits are for 2600-7200 K; used down to 2500 K so TRAPPIST-1 (2566 K) counts.
Insolation, when missing, is L/a^2 with L = R*^2 (Teff/5772)^4.
Outputs (out_exo/): exo.bin (float32 x 13 per planet), meta.json."""
import csv, json, os
import numpy as np
os.makedirs('out_exo', exist_ok=True)
rows = [r for r in csv.DictReader(open('exo/pscomp.csv')) if r['pl_controv_flag'] != '1']
num = lambda x: float(x) if x not in ('', None) else np.nan
col = lambda k: np.array([num(r[k]) for r in rows])
n = len(rows)
P, a, R, Re1, Re2, M, Me1, Me2, S, Teq, Teff, Ms, Rs, D, ra, dec, yr, npl = (col(k) for k in
    'pl_orbper pl_orbsmax pl_rade pl_radeerr1 pl_radeerr2 pl_bmasse pl_bmasseerr1 pl_bmasseerr2 pl_insol pl_eqt st_teff st_mass st_rad sy_dist ra dec disc_year sy_pnum'.split())
meth = [r['discoverymethod'] for r in rows]
prov = [r['pl_bmassprov'] for r in rows]
METHODS = ['Transit', 'Radial Velocity', 'Microlensing', 'Imaging', 'Transit Timing Variations', 'Eclipse Timing Variations',
           'Orbital Brightness Modulation', 'Pulsar Timing', 'Astrometry', 'Pulsation Timing Variations', 'Disk Kinematics']
mi = np.array([METHODS.index(m) if m in METHODS else len(METHODS) for m in meth])
print('planets', n, {m: int((mi == i).sum()) for i, m in enumerate(METHODS)})

# fill insolation from the star
L = Rs ** 2 * (Teff / 5772) ** 4
Sfill = np.where(np.isfinite(S), S, L / a ** 2)
print('insolation known', np.isfinite(S).sum(), 'filled', np.isfinite(Sfill).sum())

# discoveries per year
years = list(range(int(np.nanmin(yr)), int(np.nanmax(yr)) + 1))
perYear = {m: [int(((yr == y) & (mi == i)).sum()) for y in years] for i, m in enumerate(METHODS[:4])}
total = [int((yr == y).sum()) for y in years]
top = sorted(zip(total, years))[-3:]
print('busiest years', top)

# ---- radius valley ----
# The valley moves to smaller radii further from the star (R_valley ~ P^m, m ~ -0.1: Van Eylen et al. 2018), so it is
# measured along tilted lines: q = log R - m log(P / 10 d) is the radius the planet would have at the valley's tilt,
# scaled to a 10-day orbit. m is the tilt that makes the valley deepest.
rerr = np.nanmax(np.stack([Re1, -Re2]), axis=0) / R
vs = (mi == 0) & (P < 100) & (rerr < 0.10) & (R > 0.5) & (R < 6)
grid = np.linspace(np.log10(0.7), np.log10(5), 400)
bw = 0.035
def valley_at(m, lr, lp):
    q = lr - m * (lp - 1)
    k = np.exp(-0.5 * ((grid[:, None] - q[None, :]) / bw) ** 2).sum(1)
    a = np.where((grid > np.log10(0.9)) & (grid < np.log10(1.7)))[0]; b = np.where((grid > np.log10(1.9)) & (grid < np.log10(3.5)))[0]
    p1, p2 = a[k[a].argmax()], b[k[b].argmax()]; v = p1 + k[p1:p2].argmin()
    return k, p1, p2, v, k[v] / min(k[p1], k[p2])
lr, lpv = np.log10(R[vs]), np.log10(P[vs])
ms = np.round(np.arange(-0.25, 0.051, 0.005), 3)
depths = np.array([valley_at(m, lr, lpv)[4] for m in ms])
mBest = float(ms[depths.argmin()])
flat = ms[depths <= depths.min() + 0.01]          # tilts that are as good, within 0.01 in depth
kde, p1, p2, valley, depth = valley_at(mBest, lr, lpv)
kde = kde / (kde.sum() * (grid[1] - grid[0]))
_, _, _, _, depth0 = valley_at(0.0, lr, lpv)
rng = np.random.default_rng(1)
vb = []
for _ in range(200):
    j = rng.integers(0, len(lr), len(lr)); _, _, _, v2, _ = valley_at(mBest, lr[j], lpv[j]); vb.append(10 ** grid[v2])
rv = dict(n=int(vs.sum()), m=mBest, mRange=[float(flat.min()), float(flat.max())], peak1=float(10 ** grid[p1]), peak2=float(10 ** grid[p2]),
          valley=float(10 ** grid[valley]), valleyErr=float(np.std(vb)), depth=float(depth), depthFlat=float(depth0),
          grid=[float(x) for x in grid[::4]], kde=[round(float(x), 4) for x in kde[::4]])
print('radius valley: n %d, tilt m %.3f (as deep for %.3f..%.3f), peaks %.2f %.2f Re, valley %.2f +- %.2f Re at P = 10 d, depth %.2f (untilted %.2f)'
      % (rv['n'], mBest, flat.min(), flat.max(), rv['peak1'], rv['peak2'], rv['valley'], rv['valleyErr'], depth, depth0))

# ---- mass-radius ----
merr = np.nanmax(np.stack([Me1, -Me2]), axis=0) / M
mr = np.array([p == 'Mass' for p in prov]) & (merr < 0.25) & (rerr < 0.10) & np.isfinite(M) & np.isfinite(R)
x, y = np.log10(M[mr]), np.log10(R[mr])
def fit(b1, b2):
    # continuous piecewise linear: y = c + s1 x + (s2-s1) max(0, x-b1) + (s3-s2) max(0, x-b2)
    A = np.stack([np.ones_like(x), x, np.maximum(0, x - b1), np.maximum(0, x - b2)], 1)
    c, *_ = np.linalg.lstsq(A, y, rcond=None)
    return c, ((A @ c - y) ** 2).sum()
best = None
for b1 in np.linspace(0.0, 1.2, 61):
    for b2 in np.linspace(1.6, 2.8, 61):
        c, r2 = fit(b1, b2)
        if best is None or r2 < best[0]: best = (r2, b1, b2, c)
r2, b1, b2, c = best
s1, s2, s3 = c[1], c[1] + c[2], c[1] + c[2] + c[3]
res = y - np.stack([np.ones_like(x), x, np.maximum(0, x - b1), np.maximum(0, x - b2)], 1) @ c
mrm = dict(n=int(mr.sum()), c=float(c[0]), s=[float(s1), float(s2), float(s3)], breaks=[float(10 ** b1), float(10 ** b2)], scatter=float(res.std()))
print('mass-radius: n %d, slopes %.3f %.3f %.3f, breaks %.2f Me %.1f Me, scatter %.3f dex' % (mrm['n'], s1, s2, s3, 10 ** b1, 10 ** b2, res.std()))

# ---- habitable zone (Kopparapu et al. 2014, 1 Earth mass) ----
KOP = {'recentVenus': (1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15), 'runaway': (1.107, 1.332e-4, 1.580e-8, -8.308e-12, -1.931e-15),
       'maxGreenhouse': (0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16), 'earlyMars': (0.320, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16)}
def seff(k, T):
    s0, A, B, C, Dd = KOP[k]; t = T - 5780; return s0 + A * t + B * t ** 2 + C * t ** 3 + Dd * t ** 4
ok = np.isfinite(Sfill) & np.isfinite(Teff) & (Teff > 2500) & (Teff < 7200)
cons = ok & (Sfill <= seff('runaway', Teff)) & (Sfill >= seff('maxGreenhouse', Teff))
opt = ok & (Sfill <= seff('recentVenus', Teff)) & (Sfill >= seff('earlyMars', Teff))
small = np.isfinite(R) & (R < 1.6)
consSmall = [rows[i]['pl_name'] for i in np.where(cons & small)[0]]
hz = dict(cons=int(cons.sum()), opt=int(opt.sum()), consSmall=len(consSmall), optSmall=int((opt & small).sum()), coef=KOP, names=sorted(consSmall))
print('HZ: conservative %d (small %d), optimistic %d (small %d)' % (hz['cons'], hz['consSmall'], hz['opt'], hz['optSmall']))
print('  small, conservative:', ', '.join(sorted(consSmall)))

# ---- per-planet records ----
# ra, dec (deg), distance (pc), method, year, log P, log R, log M (nan if none), mass kind (1 measured, 0.5 min mass, 0 from M-R), log S, Teff,
# sample flags (1 radius-valley sample, +2 measured-mass sample), log a (AU)
mk = np.array([1.0 if p == 'Mass' else 0.5 if p in ('Msini', 'Msin(i)/sin(i)') else 0.0 for p in prov])
rec = np.stack([ra, dec, D, mi.astype(float), yr, np.log10(P), np.log10(R), np.log10(M), mk, np.log10(Sfill), Teff, vs.astype(float) + 2 * mr.astype(float), np.log10(a)], 1).astype('<f4')
rec.tofile('out_exo/exo.bin')
counts = {m: int((mi == i).sum()) for i, m in enumerate(METHODS)}
named = {}
for nm in ['Proxima Cen b', 'TRAPPIST-1 e', 'TRAPPIST-1 f', 'TRAPPIST-1 g', 'Kepler-186 f', 'Kepler-452 b', '51 Peg b', 'HD 209458 b', 'K2-18 b', 'TOI-700 d', 'Kepler-16 b', 'PSR B1257+12 c', 'HR 8799 b', 'OGLE-2005-BLG-390L b', 'LHS 1140 b', 'WASP-12 b', 'Kepler-11 f', '55 Cnc e']:
    i = next((j for j, r in enumerate(rows) if r['pl_name'] == nm), None)
    if i is not None: named[nm] = i
print('named found', len(named), [k for k in ['Proxima Cen b', 'TRAPPIST-1 e', 'Kepler-186 f', '51 Peg b'] if k in named])
meta = dict(n=n, stride=13, methods=METHODS, counts=counts, years=years, perYear=perYear, total=total, valley=rv, mr=mrm, hz=hz, named=named,
            nWithR=int(np.isfinite(R).sum()), nWithM=int(np.isfinite(M).sum()), nMeasuredM=int((mk == 1).sum()), maxDist=float(np.nanmax(D)),
            fetched=open('exo/fetched.txt').read().strip(),
            credit='NASA Exoplanet Archive (NASA/Caltech-IPAC), Planetary Systems Composite Parameters table')
json.dump(meta, open('out_exo/meta.json', 'w'), separators=(',', ':'), allow_nan=False)
print('exo.bin', os.path.getsize('out_exo/exo.bin') // 1024, 'KB')
