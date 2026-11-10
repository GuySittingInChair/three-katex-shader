"""Build the Cosmic Web sketch's data from SDSS DR18 (main galaxy sample spectra).

Input: sdss/ra*.csv from SkyServer SqlSearch:
  SELECT s.ra, s.dec, s.z, p.dered_g - p.dered_r AS gr, p.petroMag_r AS r
  FROM SpecObj s JOIN PhotoObj p ON s.bestObjID = p.objID
  WHERE s.class='GALAXY' AND s.z BETWEEN 0.005 AND 0.2 AND s.zWarning=0 AND s.legacy_target1 & 0x40 > 0
  (in 30-degree RA chunks)
Outputs (out_sdss/): galaxies.bin (structure of arrays: ra u16, dec u16, z u16, gr u8, flags u8),
meta.json (counts, quantisation, Coma, the measured correlation function).
"""
import glob, json, os
import numpy as np
from scipy.spatial import cKDTree

os.makedirs('out_sdss', exist_ok=True)
rows = []
for f in sorted(glob.glob('sdss/ra*.csv')):
    a = np.genfromtxt(f, delimiter=',', skip_header=2)
    if a.ndim == 2 and len(a): rows.append(a)
d = np.concatenate(rows)
ra, dec, z, gr, rmag = d.T
ok = np.isfinite(gr) & np.isfinite(rmag) & (rmag > 10) & (rmag < 17.8)
ra, dec, z, gr, rmag = ra[ok], dec[ok], z[ok], gr[ok], rmag[ok]
print('galaxies', len(ra), 'dec range', dec.min(), dec.max())

# ---------- cosmology (same as the sketch: Planck 2018) ----------
H0, OM, OR = 67.66, 0.3111, 9.1e-5
OL = 1 - OM - OR
C = 299792.458
zz = np.linspace(0, 0.25, 25001)
Ez = np.sqrt(OM * (1 + zz) ** 3 + OR * (1 + zz) ** 4 + OL)
Dtab = np.concatenate([[0], np.cumsum((1 / Ez[1:] + 1 / Ez[:-1]) / 2 * np.diff(zz))]) * C / H0   # Mpc
Dc = np.interp(z, zz, Dtab)

def xyz(ra, dec, D):
    r, d = np.deg2rad(ra), np.deg2rad(dec)
    return np.stack([D * np.cos(d) * np.cos(r), D * np.sin(d), D * np.cos(d) * np.sin(r)], -1)

# ---------- Coma: members by projected radius and velocity, and its velocity spread ----------
COMA = dict(ra=194.9531, dec=27.9807, z=0.0231)
cd = np.deg2rad(COMA['dec'])
sep = np.rad2deg(np.arccos(np.clip(np.sin(np.deg2rad(dec)) * np.sin(cd) + np.cos(np.deg2rad(dec)) * np.cos(cd) * np.cos(np.deg2rad(ra - COMA['ra'])), -1, 1)))
Dcoma = np.interp(COMA['z'], zz, Dtab)
Rproj = np.deg2rad(sep) * Dcoma                                    # Mpc
v = C * (z - COMA['z']) / (1 + COMA['z'])
cand = (Rproj < 2.0) & (np.abs(v) < 4000)
# 3-sigma clipping in velocity
memb = cand.copy()
for _ in range(10):
    mu, sd = v[memb].mean(), v[memb].std()
    new = cand & (np.abs(v - mu) < 3 * sd)
    if (new == memb).all(): break
    memb = new
zc = np.median(z[memb])
vv = C * (z[memb] - zc) / (1 + zc)
sigma = vv.std(ddof=1)
print(f'Coma members {memb.sum()}, z {zc:.5f}, sigma_v {sigma:.0f} km/s')

# ---------- two-point correlation function, Landy–Szalay, on a volume-limited sample ----------
DL = (1 + z) * Dc
Mr = rmag - 5 * np.log10(DL * 1e5)                                 # no k-correction (small at z < 0.1)
ZMAX, MLIM = 0.1, -20.5
vl = (z > 0.02) & (z < ZMAX) & (Mr < MLIM)
P = xyz(ra[vl], dec[vl], Dc[vl])
print('volume-limited sample', vl.sum())
# footprint: 0.5-degree cells (ra, sin dec) holding any main-sample galaxy
CELL = 0.5
gi = np.floor(ra / CELL).astype(int); gj = np.floor((np.sin(np.deg2rad(dec)) + 1) / (np.deg2rad(CELL))).astype(int)
cells = np.unique(gi * 100000 + gj)
footprint_sr = len(cells) * np.deg2rad(CELL) ** 2
print(f'footprint {footprint_sr:.3f} sr = {footprint_sr * (180 / np.pi) ** 2:.0f} deg2')
rng = np.random.default_rng(1)
NR = 4 * vl.sum()
pick = rng.choice(cells, NR)
rra = (pick // 100000 + rng.random(NR)) * CELL
rsd = (pick % 100000 + rng.random(NR)) * np.deg2rad(CELL) - 1
rdec = np.rad2deg(np.arcsin(np.clip(rsd, -1, 1)))
Dlo, Dhi = np.interp(0.02, zz, Dtab), np.interp(ZMAX, zz, Dtab)
rD = (Dlo ** 3 + rng.random(NR) * (Dhi ** 3 - Dlo ** 3)) ** (1 / 3)   # uniform in volume
R = xyz(rra, rdec, rD)
edges = np.logspace(np.log10(1.5), np.log10(80), 19)
td, tr = cKDTree(P), cKDTree(R)
DD = np.diff(td.count_neighbors(td, edges)).astype(float)
RR = np.diff(tr.count_neighbors(tr, edges)).astype(float)
DR = np.diff(td.count_neighbors(tr, edges)).astype(float)
nd, nr = len(P), len(R)
DDn, RRn, DRn = DD / (nd * (nd - 1)), RR / (nr * (nr - 1)), DR / (nd * nr)
xi = (DDn - 2 * DRn + RRn) / RRn
rc = np.sqrt(edges[1:] * edges[:-1])
fit = (rc > 2) & (rc < 25) & (xi > 0)
slope, icpt = np.polyfit(np.log(rc[fit]), np.log(xi[fit]), 1)
gamma = -slope
r0 = np.exp(icpt / gamma)
print('xi:', ' '.join(f'{r:.1f}:{x:.2f}' for r, x in zip(rc, xi)))
print(f'power law: r0 = {r0:.2f} Mpc ({r0 * H0 / 100:.2f} Mpc/h), gamma = {gamma:.2f}')

# ---------- pack ----------
q = lambda x, lo, hi: np.round((x - lo) / (hi - lo) * 65535).clip(0, 65535).astype('<u2')
DEC0, DEC1, ZQ = -20.0, 90.0, 0.2
flags = (memb.astype(np.uint8) * 1) | (vl.astype(np.uint8) * 2)
o = np.argsort(rng.random(len(ra)))  # shuffled, so any prefix is a fair sample
parts = [q(ra[o], 0, 360), q(dec[o], DEC0, DEC1), q(z[o], 0, ZQ),
         np.round(np.clip(gr[o], 0, 1.275) * 200).astype(np.uint8), flags[o]]
with open('out_sdss/galaxies.bin', 'wb') as f:
    for p in parts: f.write(p.tobytes())
meta = dict(
    source='SDSS DR18 main galaxy sample (legacy_target1 & 0x40), zWarning = 0, 0.005 < z < 0.2; '
           'colour g - r from dereddened model magnitudes',
    credit='Sloan Digital Sky Survey',
    count=int(len(ra)), layout=['ra u16 0..360', f'dec u16 {DEC0}..{DEC1}', f'z u16 0..{ZQ}', 'gr u8 /200', 'flags u8 (1 Coma member, 2 in the clustering sample)'],
    dec=[DEC0, DEC1], zq=ZQ, footprintSr=float(footprint_sr),
    coma=dict(ra=COMA['ra'], dec=COMA['dec'], z=float(zc), members=int(memb.sum()), sigma=float(sigma), D=float(Dcoma)),
    xi=dict(r=[round(float(x), 3) for x in rc], xi=[round(float(x), 4) for x in xi], DD=[int(x) for x in DD],
            r0=float(r0), gamma=float(gamma), n=int(nd), randoms=int(nr), zmax=ZMAX, Mlim=MLIM),
)
json.dump(meta, open('out_sdss/meta.json', 'w'), separators=(',', ':'))
for fn in os.listdir('out_sdss'): print(fn, os.path.getsize(f'out_sdss/{fn}') // 1024, 'KB')
