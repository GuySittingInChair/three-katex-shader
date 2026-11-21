"""The nearby universe flowing: a movie of how matter within ~230 Mpc of us gathered into today's clusters and walls,
and where it is headed, from the Cosmicflows-4 velocity and density fields (Courtois et al. 2023, A&A 670, L15;
Zenodo 20653238; same grids, axes and calibrated velocity unit as build_motion.py).

Method (INFERRED from the map, then SIMULATED with linear theory — said so on the page):
  * tracer points are placed where the matter is today: drawn with probability ∝ 1 + δ (the map's density contrast,
    clipped at 0), jittered inside the grid cell;
  * linear theory of gravitational growth (the same theory the map itself is built on: δ = −∇·v / (H₀ f)) says each
    bit of matter has moved along a straight line, its displacement growing with the growth factor D(t):
        x(t) = x_now + (D(t) − 1) ψ,   ψ = v / (H₀ f)       (the Zel'dovich approximation, 1970)
    with v the map's 3D peculiar velocity at x_now and f = dlnD/dlna today;
  * D(t), a(t) and the cosmic time come from flat ΛCDM, Ωm = 0.3, H₀ = 70, computed here.
Coordinates are comoving (the expansion of the universe taken out), supergalactic, Mpc/h with h = 0.7.
Output: out_flow/flow.json (metadata, time table, labels) + out_flow/flow.bin (int16 positions and displacements)."""
import json, math, os, re
import numpy as np
from astropy.io import fits
from astropy.coordinates import SkyCoord, Supergalactic
import astropy.units as u
from scipy.integrate import quad

D = 'flow/'; os.makedirs('out_flow', exist_ok=True)
C = 299792.458; h = 0.7; H0 = 100 * h; OM = 0.3; OL = 0.7
VF = fits.open(D + 'CF4_new_128-z008_velocity.fits')[0].data.astype(np.float64)   # [comp, SGX, SGY, SGZ]
DF = fits.open(D + 'CF4_new_128-z008_delta.fits')[0].data.astype(np.float64)
N = 128; L = 1000.0; CELL = L / N
UNIT = 54.0      # km/s per unit, calibrated in build_motion.py (continuity 53.8; published bulk flows 52–59)
R = 160.0        # Mpc/h: Shapley (~140) inside; the map is well constrained within ~200
NP = 90000

# ---- cosmology: a(t), D(a), f ----
E = lambda a: math.sqrt(OM / a ** 3 + OL)
def growth(a):   # Heath (1977): D ∝ E(a) ∫₀^a da' / (a' E(a'))³
    return E(a) * quad(lambda x: 1 / (x * E(x)) ** 3, 1e-8, a, limit=200)[0]
D1 = growth(1.0)
f_now = (lambda e=1e-4: (math.log(growth(1 + e)) - math.log(growth(1 - e))) / (math.log(1 + e) - math.log(1 - e)))()
TH = 977.8 / H0          # 1/H0 in Gyr
age = lambda a: TH * quad(lambda x: 1 / (x * E(x)), 1e-10, a, limit=200)[0]
T_NOW = age(1.0)
tab = []
for a in np.concatenate([np.geomspace(0.02, 1, 90)[:-1], np.geomspace(1, 6, 50)]):
    tab.append((round(age(a), 4), round(float(a), 5), round(growth(a) / D1, 5)))
D_INF = growth(200) / D1
print(f'f today {f_now:.3f} (Ωm^0.55 = {OM ** 0.55:.3f}); age {T_NOW:.2f} Gyr; D(∞)/D(now) = {D_INF:.3f}; last row {tab[-1]}')

# ---- tracers ----
rng = np.random.default_rng(20261120)
xc = (np.arange(N) + 0.5) * CELL - L / 2
X, Y, Z = np.meshgrid(xc, xc, xc, indexing='ij'); RR = np.sqrt(X ** 2 + Y ** 2 + Z ** 2)
inside = RR < R + CELL
w = np.clip(1 + DF, 0, None) * inside
pc = w.ravel() / w.sum()
cells = rng.choice(pc.size, size=int(NP * 1.4), p=pc)
ii = np.array(np.unravel_index(cells, DF.shape)).T
pos = xc[ii] + (rng.random(ii.shape) - 0.5) * CELL
keep = np.linalg.norm(pos, axis=1) < R
pos = pos[keep][:NP]

def trilinear(G, p):
    g = (p + L / 2) / CELL - 0.5; i0 = np.floor(g).astype(int); fr = g - i0
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                ww = (fr[:, 0] if dx else 1 - fr[:, 0]) * (fr[:, 1] if dy else 1 - fr[:, 1]) * (fr[:, 2] if dz else 1 - fr[:, 2])
                out = out + ww * G[..., i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz]
    return out
vel = trilinear(VF, pos).T * UNIT                 # km/s, SG cartesian
dlt = trilinear(DF, pos)
psi = vel / (100 * f_now)                         # Mpc/h (H0 = 100 h)
print(f'{len(pos)} tracers; |v| median {np.median(np.linalg.norm(vel, axis=1)):.0f} km/s; |ψ| median {np.median(np.linalg.norm(psi, axis=1)):.1f} Mpc/h, 99% {np.percentile(np.linalg.norm(psi, axis=1), 99):.1f}')
# how uniform does it get going back? (a check that the backwards run makes sense: the spread of counts in 10 Mpc/h cells)
def clump(p):
    H, _ = np.histogramdd(p[np.linalg.norm(p, axis=1) < 120], bins=24, range=[(-120, 120)] * 3); H = H[H > 0]
    return float(H.std() / H.mean())
uni = rng.random((len(pos) * 3, 3)) * 2 * R - R; uni = uni[np.linalg.norm(uni, axis=1) < R][:len(pos)]
noise = clump(uni)   # what pure randomness gives with this many points
ex = lambda c: math.sqrt(max(0, c * c - noise * noise))
cl_now, cl_early = ex(clump(pos)), ex(clump(pos - psi))
print(f'clumpiness beyond random noise (std/mean of counts in 10 Mpc/h boxes): now {cl_now:.2f}, at D=0 {cl_early:.2f} (noise {noise:.2f})')

# observer (the Local Group) and its displacement
v0, _ = trilinear(VF, np.zeros((1, 3))).T[0] * UNIT, None

# ---- labels: the clusters, from NED (cached by build_motion.py) ----
def sg_xyz(ra, dec, mpc):
    s = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, distance=mpc * u.Mpc).transform_to(Supergalactic()).cartesian
    return np.array([s.x.value, s.y.value, s.z.value])
CMB = SkyCoord(l=264.021 * u.deg, b=48.253 * u.deg, frame='galactic').icrs
labels = []
for label, q in [('Virgo Cluster', 'Virgo Cluster'), ('Coma Cluster', 'Coma Cluster'), ('Great Attractor (Norma)', 'ACO 3627'),
                 ('Shapley Supercluster', 'ACO 3558'), ('Perseus Cluster', 'ACO 426'), ('Hercules Cluster', 'ACO 2151'),
                 ('Fornax Cluster', 'Fornax Cluster'), ('Centaurus Cluster', 'ACO 3526')]:
    j = json.load(open(f'{D}ned/attr_' + re.sub(r'\W+', '_', q) + '.json'))
    P = j['Preferred']; z = P['Redshift']['Value']; ra, dec = P['Position']['RA'], P['Position']['Dec']
    cosang = math.cos(SkyCoord(ra=ra * u.deg, dec=dec * u.deg).separation(CMB).rad)
    zc = (1 + z) / (1 - 369.82 * cosang / C) - 1
    p = sg_xyz(ra, dec, C * zc / H0) * h
    vv = trilinear(VF, p[None, :]).T[0] * UNIT
    labels.append(dict(name=label, ned=P['Name'], z=z, zRef=P['Redshift'].get('RefCode'), p=[round(x, 1) for x in p], psi=[round(x / (100 * f_now), 2) for x in vv]))
    print(f'  {label}: SG {np.round(p, 1)} Mpc/h, |v| {np.linalg.norm(vv):.0f} km/s')

# ---- write: int16 in units of 0.01 Mpc/h for ψ and 0.01 Mpc/h for positions (|x| < 160 → 16000 < 32767) ----
q16 = np.round(pos * 100).astype(np.int16); p16 = np.round(np.clip(psi, -327, 327) * 100).astype(np.int16)
d8 = np.round(np.clip(np.log10(np.clip(1 + dlt, 0.05, 20)), -1.3, 1.3) / 1.3 * 127).astype(np.int8)
buf = np.concatenate([q16.ravel(), p16.ravel()]).astype('<i2').tobytes() + d8.astype('i1').tobytes()
open('out_flow/flow.bin', 'wb').write(buf)
json.dump(dict(
    n=len(pos), R=R, layout='int16 LE: n×3 positions today (SGX,SGY,SGZ; 0.01 Mpc/h), then n×3 displacements ψ (0.01 Mpc/h); then int8 n: log10(1+δ)/1.3×127',
    f=round(f_now, 4), age=round(T_NOW, 3), dInf=round(D_INF, 4), table=tab, tableCols=['t_Gyr', 'a', 'D/D_now'],
    observer=dict(v=[round(x, 1) for x in v0], psi=[round(x / (100 * f_now), 2) for x in v0]),
    clumpiness=dict(now=round(cl_now, 3), early=round(cl_early, 3)),
    labels=labels, h=h, unit=UNIT, cosmology=dict(Om=OM, OL=OL, H0=H0),
    source='Cosmicflows-4 velocity and density fields (Courtois et al. 2023, A&A 670, L15; Zenodo record 20653238), moved with linear theory (Zel\'dovich 1970).',
), open('out_flow/flow.json', 'w'))
print('bytes', len(buf), os.path.getsize('out_flow/flow.json'))
