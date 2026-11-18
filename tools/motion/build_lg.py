"""The Local Group's four biggest galaxies — the Milky Way, Andromeda (M31), Triangulum (M33), the Large Magellanic Cloud —
moved through time from their measured 3D motions.
OBSERVED (quoted from the papers; see SRC):
  M31: proper motion (μα*, μδ) = (48.9 ± 10.5, −36.9 ± 8.1) μas/yr  (Salomon et al. 2021, Gaia EDR3, Table 4, 'Blue', corrected);
       distance 785 ± 25 kpc (as adopted there); line-of-sight velocity −301 km/s (as adopted by van der Marel et al. 2019)
  M33: (24 ± 7, 3 ± 8) μas/yr (van der Marel et al. 2019, Gaia DR2 + VLBA water masers, eq. 11); 794 kpc and −180 km/s as adopted there
  LMC: μW = −1.910 ± 0.020, μN = 0.229 ± 0.047 mas/yr (Kallivayalil et al. 2013); v_sys 262.2 ± 3.4 km/s and m−M = 18.50 ± 0.10
       (the values that paper's Table uses)
INFERRED: 3D positions and velocities relative to the Milky Way's centre — astropy's Galactocentric frame (v4.0 parameters:
  R0 = 8.122 kpc, z_sun = 20.8 pc, Sun's velocity (12.9, 245.6, 7.78) km/s).
  Masses: the two scenarios of van der Marel et al. 2019 §IV.2 — MW 1e12 & M31 2e12, or both 1.5e12 M☉; M33 2.5e11, LMC 1e11 M☉.
ASSUMED (ours): each halo is a Hernquist sphere with scale a = 30 kpc (M/1e12)^(1/3) (M33, LMC: 20, 15 kpc); dynamical friction
  from Chandrasekhar's formula (ln Λ = 3, local dispersion v_c/√2); the halos don't deform or lose mass.
SIMULATED: 1000 draws within the measurement errors per mass scenario, leapfrog with 1 Myr steps, from −6 to +10 Gyr.
Outputs: out_lg/lg.json (statistics + sample orbits)"""
import json, math, os
import numpy as np
from scipy.special import erf
import astropy.units as u
from astropy.coordinates import SkyCoord, Galactocentric, galactocentric_frame_defaults
galactocentric_frame_defaults.set('v4.0')
os.makedirs('out_lg', exist_ok=True)
G = 4.30091e-6          # kpc (km/s)^2 / M☉
KMS_KPC_MYR = 1.02271e-3  # 1 km/s = 1.02271e-3 kpc/Myr

SRC = dict(
    M31=dict(ra=10.68470833, dec=41.26875, pm=(48.9, 10.5, -36.9, 8.1), d=(785, 25), vlos=(-301, 4),
             cite='Salomon et al. 2021 (MNRAS 507, 2592; arXiv:2012.09204), Gaia EDR3; v_los as adopted by van der Marel et al. 2019'),
    M33=dict(ra=23.46204167, dec=30.66022222, pm=(24, 7, 3, 8), d=(794, 40), vlos=(-180, 4),
             cite='van der Marel et al. 2019 (ApJ 872, 24; arXiv:1805.04079), Gaia DR2 + VLBA water masers (Brunthaler et al. 2005)'),
    LMC=dict(ra=80.89416667, dec=-69.75611111, pm=(1910, 20, 229, 47), d=(50.1, 2.3), vlos=(262.2, 3.4),
             cite='Kallivayalil et al. 2013 (ApJ 764, 161; arXiv:1301.0832), HST'),
)
# NOTE: the M33 distance error (±5%) and the M31/M33 line-of-sight errors (±4 km/s) are our assumption; the papers adopt fixed values.
NAMES = ['MW', 'M31', 'M33', 'LMC']
SCEN = [dict(name='heavier Andromeda', M=[1e12, 2e12, 2.5e11, 1e11]), dict(name='equal masses', M=[1.5e12, 1.5e12, 2.5e11, 1e11])]
rng = np.random.default_rng(20261118)
ND = 1000

def draws(n):
    pos = np.zeros((n, 4, 3)); vel = np.zeros((n, 4, 3))
    for k, name in enumerate(NAMES[1:], 1):
        s = SRC[name]; pa, ea, pd, ed = s['pm']
        c = SkyCoord(ra=np.full(n, s['ra']) * u.deg, dec=np.full(n, s['dec']) * u.deg,
                     distance=(s['d'][0] + s['d'][1] * rng.standard_normal(n)) * u.kpc,
                     pm_ra_cosdec=(pa + ea * rng.standard_normal(n)) * u.uas / u.yr, pm_dec=(pd + ed * rng.standard_normal(n)) * u.uas / u.yr,
                     radial_velocity=(s['vlos'][0] + s['vlos'][1] * rng.standard_normal(n)) * u.km / u.s).transform_to(Galactocentric())
        pos[:, k] = np.stack([c.x.to_value(u.kpc), c.y.to_value(u.kpc), c.z.to_value(u.kpc)], 1)
        vel[:, k] = np.stack([c.v_x.to_value(u.km / u.s), c.v_y.to_value(u.km / u.s), c.v_z.to_value(u.km / u.s)], 1)
    return pos, vel

def scale(M): return 30.0 * (M / 1e12) ** (1 / 3)
def accel(pos, vel, M, A, fric_sign):
    """pos, vel: (n, 4, 3) kpc, km/s → acceleration in (km/s)/Myr"""
    n = pos.shape[0]; acc = np.zeros_like(pos)
    for i in range(4):
        for j in range(4):
            if i == j: continue
            d = pos[:, i] - pos[:, j]; r = np.linalg.norm(d, axis=1, keepdims=True) + 1e-6
            # force on j from i: the larger halo's Hernquist profile for both (equal and opposite, so momentum is conserved)
            ah = A[i] if M[i] >= M[j] else A[j]
            acc[:, j] += G * M[i] / (r + ah) ** 2 * d / r
            # dynamical friction
            if M[j] < M[i] or (M[j] == M[i] and j > i):      # once per pair: the lighter body through the heavier halo; the host takes the reaction
                dv = vel[:, j] - vel[:, i]; v = np.linalg.norm(dv, axis=1, keepdims=True) + 1e-6
                re_ = np.maximum(r, 0.5 * A[j])     # the satellite is extended too: don't let the formula's central cusp blow up
                rho = M[i] * A[i] / (2 * math.pi * re_ * (re_ + A[i]) ** 3)
                vc = np.sqrt(G * M[i] * re_ / (re_ + A[i]) ** 2); X = v / vc            # v / (√2 σ) with σ = v_c/√2

                fx = erf(X) - 2 * X / math.sqrt(math.pi) * np.exp(-X * X)
                df = fric_sign * (-4 * math.pi * G * G * M[j] * rho * 3.0 / v ** 3 * fx * dv)
                acc[:, j] += df; acc[:, i] -= M[j] / M[i] * df          # the host takes the reaction
    return acc * KMS_KPC_MYR      # (km/s)^2/kpc → (km/s)/Myr

def integrate(pos, vel, M, T, dt=1.0, every=25):
    """leapfrog from 0 to T Myr (T may be negative); returns snapshots (k, n, 4, 3)"""
    A = np.array([scale(M[0]), scale(M[1]), 20.0, 15.0])
    steps = int(abs(T) / dt); h = dt * np.sign(T); fs = 1.0 if T > 0 else 1.0   # friction keeps its sign: running back in time it speeds bodies up
    p, v = pos.copy(), vel.copy(); out = [p.copy()]
    a = accel(p, v, M, A, fs)
    for s in range(steps):
        v = v + 0.5 * h * a
        p = p + h * v * KMS_KPC_MYR
        a = accel(p, v, M, A, fs)
        v = v + 0.5 * h * a
        if (s + 1) % every == 0: out.append(p.copy())
    return np.array(out)

res = []
for sc in SCEN:
    pos, vel = draws(ND)
    # the Milky Way's own centre at rest at the origin
    fwd = integrate(pos, vel, sc['M'], 10000); back = integrate(pos, vel, sc['M'], -6000)
    t = np.concatenate([-np.arange(back.shape[0])[::-1][:-1] * 25, np.arange(fwd.shape[0]) * 25])
    path = np.concatenate([back[::-1][:-1], fwd])          # (k, n, 4, 3)
    sep = np.linalg.norm(path[:, :, 1] - path[:, :, 0], axis=2)          # MW–M31 (k, n)
    fut = t > 0
    # first close approach in the future: the first local minimum of the separation
    firstT, firstD, mergeT = [], [], []
    for n in range(ND):
        s = sep[fut, n]; tt = t[fut]
        # the first real close pass: a minimum after which they move at least 20 kpc apart again;
        # if they spiral straight in without bouncing, the first pass is when they first come within 30 kpc
        k0 = None
        for k in range(1, len(s) - 1):
            if s[k] < s[k - 1] and s[k] <= s[k + 1] and s[k:].max() > s[k] + 20 and s[k:k + 80].max() > s[k] + 20: k0 = k; break
            if s[k] < 30: k0 = k; break
        firstT.append(tt[k0] if k0 is not None else np.nan); firstD.append(s[k0] if k0 is not None else np.nan)
        # merged: from some time on, they stay within 30 kpc
        inside = s < 30; mt = np.nan
        for k in range(len(s)):
            if inside[k:].all(): mt = tt[k]; break
        mergeT.append(mt)
    firstT, firstD, mergeT = map(np.array, (firstT, firstD, mergeT))
    pct = lambda a, q: float(np.nanpercentile(a, q))
    st = dict(name=sc['name'], masses=sc['M'],
              firstPeri=dict(t16=pct(firstT, 16), t50=pct(firstT, 50), t84=pct(firstT, 84), d16=pct(firstD, 16), d50=pct(firstD, 50), d84=pct(firstD, 84)),
              mergeBy10=float(np.mean(~np.isnan(mergeT))), merge50=pct(mergeT, 50) if np.any(~np.isnan(mergeT)) else None,
              headOn=float(np.nanmean(firstD < 30)),
              hit=dict(t16=pct(firstT[firstD < 30], 16), t50=pct(firstT[firstD < 30], 50), t84=pct(firstT[firstD < 30], 84)),
              miss=dict(n=int(np.sum(firstD >= 30)), d50=pct(firstD[firstD >= 30], 50) if np.any(firstD >= 30) else None,
                        t50=pct(firstT[firstD >= 30], 50) if np.any(firstD >= 30) else None),
              m33NowToM31=float(np.median(np.linalg.norm(path[t == 0][0][:, 2] - path[t == 0][0][:, 1], axis=1))))
    # the M33–M31 history: closest approach to M31 in the last 6 Gyr
    s33 = np.linalg.norm(path[:, :, 2] - path[:, :, 1], axis=2)
    past = t < 0
    st['m33PastMin'] = dict(d16=pct(s33[past].min(0), 16), d50=pct(s33[past].min(0), 50), d84=pct(s33[past].min(0), 84))
    st['lmcPastMin'] = dict(d50=pct(np.linalg.norm(path[:, :, 3] - path[:, :, 0], axis=2)[past].min(0), 50))
    # velocities now, relative to the MW (km/s) for the mean measurement
    vr = [(np.sum((pos[:, k] - pos[:, 0]) * (vel[:, k] - vel[:, 0]), 1) / np.linalg.norm(pos[:, k] - pos[:, 0], axis=1)) for k in (1, 2, 3)]
    vt = [np.sqrt(np.maximum(np.sum((vel[:, k] - vel[:, 0]) ** 2, 1) - vr[i] ** 2, 0)) for i, k in enumerate((1, 2, 3))]
    st['now'] = {NAMES[k]: dict(dist=float(np.median(np.linalg.norm(pos[:, k], axis=1))), vRad=float(np.median(vr[i])), vRad16=pct(vr[i], 16), vRad84=pct(vr[i], 84),
                                vTan=float(np.median(vt[i])), vTan16=pct(vt[i], 16), vTan84=pct(vt[i], 84)) for i, k in enumerate((1, 2, 3))}
    # sample orbits for the page: 20 draws, every 50 Myr, kpc rounded to 0.1
    pick = rng.choice(ND, 20, replace=False)
    # first: the draw whose first pass comes closest to the median time ('a typical future')
    hit = firstD < 30
    typ = int(np.nanargmin(np.where(hit, np.abs(firstT - np.nanmedian(firstT[hit])), np.inf)))
    pick = np.concatenate([[typ], [p for p in pick if p != typ][:19]])
    # a view that looks face-on at the plane the MW–M31 orbit lies in (from all draws, from 2 Gyr ago on)
    rel = (path[t >= -2000][:, :, 1] - path[t >= -2000][:, :, 0]).reshape(-1, 3)
    _, _, vt_ = np.linalg.svd(rel - rel.mean(0), full_matrices=False)
    st['viewBasis'] = [[round(float(x), 4) for x in row] for row in vt_]       # rows: in-plane 1, in-plane 2, normal
    st['t'] = [int(x) for x in t[::2]]
    st['orbits'] = np.round(path[::2][:, pick] * 10).astype(int).transpose(1, 2, 0, 3).tolist()     # (draw, body, time, xyz) in 0.1 kpc
    st['orbitFirstPeri'] = [None if np.isnan(firstT[i]) else float(firstT[i]) for i in pick]
    res.append(st)
    f = st['firstPeri']
    print(f"{sc['name']}: first MW–M31 pass at {f['t50']/1000:.2f} Gyr ({f['t16']/1000:.2f}–{f['t84']/1000:.2f}), distance {f['d50']:.0f} kpc ({f['d16']:.0f}–{f['d84']:.0f}); "
          f"merged by +10 Gyr in {st['mergeBy10']*100:.0f}% (median {st['merge50']}); head-on (<30 kpc) {st['headOn']*100:.0f}%", flush=True)
    print('   now', {k: {a: round(b) for a, b in v.items()} for k, v in st['now'].items()}, 'M33 past closest to M31', st['m33PastMin'], 'LMC past min', st['lmcPastMin'])

json.dump(dict(scenarios=res, names=NAMES, src={k: dict(v) for k, v in SRC.items()}, draws=ND,
               frame='astropy Galactocentric v4.0 (R0 = 8.122 kpc, z_sun = 20.8 pc, v_sun = (12.9, 245.6, 7.78) km/s); x towards the Sun→Galactic centre axis reversed? see astropy docs',
               model=dict(halo='Hernquist, a = 30 kpc (M/1e12)^(1/3); M33 20 kpc; LMC 15 kpc', friction='Chandrasekhar, ln Λ = 3', dt=1, unitOrbits='0.1 kpc'),
               ref=dict(vdm2019='van der Marel et al. 2019 §IV.2: first pericentre ~4.5 Gyr at ~130 kpc (two-body, DR2+HST); including M33 and the LMC delays it by ~1 Gyr and halves the impact parameter (~75 kpc)')),
          open('out_lg/lg.json', 'w'), separators=(',', ':'))
print('lg.json', os.path.getsize('out_lg/lg.json') // 1024, 'KB')
