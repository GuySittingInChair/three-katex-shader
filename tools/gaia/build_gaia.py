"""Build the Gaia neighbourhood sketch's data from Gaia DR3.

Input: gaia/s*.csv, 24 strips of 15 degrees in RA of
  SELECT ra, dec, parallax, pmra, pmdec, radial_velocity, phot_g_mean_mag, bp_rp FROM gaiadr3.gaia_source
  WHERE parallax > 10 AND parallax_over_error > 10 AND ruwe < 1.4 AND bp_rp IS NOT NULL
Output (out_gaia/): stars.bin (16 bytes a star: x y z i16 pc*300, vx vy vz i16 km/s*100 (heliocentric,
Galactic: x to the Galactic centre, y along rotation, z to the north Galactic pole), bp_rp u8 *50,
M_G u8 (M+5)*10, flags u8 (1 has radial velocity, 2 Hyades member), G u8 (G+2)*10), meta.json.
"""
import glob, json, os
import numpy as np
import astropy.units as u
from astropy.coordinates import SkyCoord

os.makedirs('out_gaia', exist_ok=True)
d = np.concatenate([np.genfromtxt(f, delimiter=',', skip_header=1, filling_values=np.nan) for f in sorted(glob.glob('gaia/s*.csv'))])
ra, dec, plx, pmra, pmdec, rv, G, bprp = d.T
print('stars', len(ra), 'with RV', np.isfinite(rv).sum())
dist = 1000 / plx
has_rv = np.isfinite(rv)
c = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, distance=dist * u.pc, pm_ra_cosdec=pmra * u.mas / u.yr,
             pm_dec=pmdec * u.mas / u.yr, radial_velocity=np.where(has_rv, rv, 0) * u.km / u.s).galactic
x, y, z = (c.cartesian.xyz.to(u.pc).value)
vel = c.velocity
vx, vy, vz = vel.d_x.to(u.km / u.s).value, vel.d_y.to(u.km / u.s).value, vel.d_z.to(u.km / u.s).value
MG = G + 5 * np.log10(plx / 100)

# ---------- Hyades: near the cluster centre and moving with it ----------
HY = SkyCoord(ra=66.85 * u.deg, dec=15.87 * u.deg, distance=47.0 * u.pc).galactic.cartesian.xyz.to(u.pc).value
near = np.sqrt((x - HY[0]) ** 2 + (y - HY[1]) ** 2 + (z - HY[2]) ** 2) < 10
core = near & has_rv & (np.sqrt((x - HY[0]) ** 2 + (y - HY[1]) ** 2 + (z - HY[2]) ** 2) < 5)
V = np.array([np.median(vx[core]), np.median(vy[core]), np.median(vz[core])])
for _ in range(5):
    dv = np.sqrt((vx[core] - V[0]) ** 2 + (vy[core] - V[1]) ** 2 + (vz[core] - V[2]) ** 2)
    core_ok = np.where(core)[0][dv < 4]
    V = np.array([vx[core_ok].mean(), vy[core_ok].mean(), vz[core_ok].mean()])
# members: with RV, 3D velocity within 3 km/s; without, tangential velocity matches the projected cluster motion
P = np.stack([x, y, z], -1); n = P / np.linalg.norm(P, axis=1)[:, None]
Vv = np.stack([vx, vy, vz], -1)
tan_obs = Vv - (Vv * n).sum(1)[:, None] * n               # for no-RV stars rv was set to 0, so this is all they have
tan_pred = V - (n @ V)[:, None] * n
dtan = np.linalg.norm(tan_obs - tan_pred, axis=1)
d3 = np.linalg.norm(Vv - V, axis=1)
hy = near & np.where(has_rv, d3 < 3, dtan < 2.5)
print('Hyades velocity (km/s, Galactic, heliocentric)', V.round(2), 'members', hy.sum())

# a star a few nearby, well-known ones for labels
NAMED = {'Sirius': (101.287, -16.716), 'Vega': (279.235, 38.784), 'Arcturus': (213.915, 19.182),
         'Altair': (297.696, 8.868), 'Procyon': (114.825, 5.225), 'Fomalhaut': (344.413, -29.622)}
named = {}
for name, (r0, d0) in NAMED.items():
    sep = np.hypot((ra - r0) * np.cos(np.deg2rad(d0)), dec - d0)
    j = int(np.argmin(sep))
    if sep[j] < 0.05: named[name] = j

q16 = lambda a, k: np.round(np.clip(a * k, -32767, 32767)).astype('<i2')
flags = has_rv.astype(np.uint8) | (hy.astype(np.uint8) << 1)
rec = np.zeros(len(x), dtype=[('x', '<i2'), ('y', '<i2'), ('z', '<i2'), ('vx', '<i2'), ('vy', '<i2'), ('vz', '<i2'),
                               ('c', 'u1'), ('m', 'u1'), ('f', 'u1'), ('g', 'u1')])
rec['x'], rec['y'], rec['z'] = q16(x, 300), q16(y, 300), q16(z, 300)
rec['vx'], rec['vy'], rec['vz'] = q16(vx, 100), q16(vy, 100), q16(vz, 100)
rec['c'] = np.round(np.clip(bprp, 0, 5.1) * 50).astype(np.uint8)
rec['m'] = np.round(np.clip(MG + 5, 0, 25.5) * 10).astype(np.uint8)
rec['f'] = flags
rec['g'] = np.round(np.clip(G + 2, 0, 25.5) * 10).astype(np.uint8)
# brightest first, so the named-star indices are stable and the eye-catching ones draw on top
o = np.argsort(G)
inv = np.empty_like(o); inv[o] = np.arange(len(o))
rec = rec[o]
rec.tofile('out_gaia/stars.bin')
fast = (np.abs(d3) > 327).sum()
meta = dict(
    source='Gaia DR3 gaia_source: parallax > 10 mas, parallax_over_error > 10, RUWE < 1.4, with BP-RP colour',
    credit='ESA/Gaia/DPAC', count=int(len(x)), withRV=int(has_rv.sum()), bytesPerStar=16,
    hyades=dict(centre=[float(v) for v in HY], velocity=[float(v) for v in V], members=int(hy.sum())),
    named={k: int(inv[j]) for k, j in named.items()}, clippedVelocities=int(fast),
)
json.dump(meta, open('out_gaia/meta.json', 'w'), separators=(',', ':'))
print(meta['named'], 'fast clipped', fast)
for fn in os.listdir('out_gaia'): print(fn, os.path.getsize(f'out_gaia/{fn}') // 1024, 'KB')
