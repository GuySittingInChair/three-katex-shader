"""Pantheon+ (Scolnic et al. 2022, Brout et al. 2022): 1701 light curves of 1550 type Ia supernovae.
Fits, all with the published statistical + systematic covariance and z > 0.01:
  flat LCDM Omega_m; the (Omega_m, Omega_Lambda) plane without assuming flatness; and H0 from the
  Cepheid-calibrated distances (MU_SH0ES) at 0.023 < z < 0.15.
The supernova's absolute magnitude is an unknown offset, removed analytically (it is degenerate with H0).
Outputs (out_sn/): sn.bin (float32 z, mu, mu_err, ra, dec, survey), meta.json."""
import json, os
import numpy as np
from scipy.integrate import cumulative_trapezoid
os.makedirs('out_sn', exist_ok=True)
names = open('sn/pp.dat').readline().split()
raw = np.genfromtxt('sn/pp.dat', skip_header=1, dtype=None, encoding=None)
col = {n: np.array([r[i] for r in raw]) for i, n in enumerate(names)}
N = len(raw)
C = np.loadtxt('sn/cov.txt', skiprows=1).reshape(N, N)
z, zhel, mb, mu, IDS = col['zHD'].astype(float), col['zHEL'].astype(float), col['m_b_corr'].astype(float), col['MU_SH0ES'].astype(float), col['IDSURVEY'].astype(int)
cal = col['IS_CALIBRATOR'].astype(int) == 1
use = (z > 0.01) & ~cal
print('light curves', N, 'used for cosmology', use.sum(), 'unique SNe', len(set(col['CID'][use])))
Ci = np.linalg.inv(C[np.ix_(use, use)]); zu, zh, mbu = z[use], zhel[use], mb[use]
ZG = np.linspace(0, 2.4, 4801)
def dl_unit(Om, OL, zz):
    """H0 dL / c for a universe with matter Om, dark energy OL (curvature Ok = 1 - Om - OL)."""
    Ok = 1 - Om - OL
    E2 = Om * (1 + ZG) ** 3 + OL + Ok * (1 + ZG) ** 2
    if np.any(E2 <= 0): return None
    chi = np.concatenate([[0], cumulative_trapezoid(1 / np.sqrt(E2), ZG)])
    x = np.interp(zz, ZG, chi)
    if Ok > 1e-6: x = np.sinh(np.sqrt(Ok) * x) / np.sqrt(Ok)
    elif Ok < -1e-6: x = np.sin(np.sqrt(-Ok) * x) / np.sqrt(-Ok)
    return x
def chi2(Om, OL):
    d = dl_unit(Om, OL, zu)
    if d is None or np.any(d <= 0): return np.inf
    r = mbu - 5 * np.log10((1 + zh) * d)          # (1+zHEL) dL(zHD)/(1+zHD) ≈ standard Pantheon+ convention
    a, b = Ci.sum(), (Ci @ r).sum()
    return r @ Ci @ r - b * b / a                     # the offset (M + 25 - 5 log10 H0/c) marginalised
# flat
oms = np.linspace(0.15, 0.55, 401); cf = np.array([chi2(o, 1 - o) for o in oms])
j = int(np.argmin(cf)); Om = oms[j]; ok = cf < cf[j] + 1
print('flat LCDM: Om = %.3f (%.3f-%.3f), chi2 %.1f for %d' % (Om, oms[ok].min(), oms[ok].max(), cf[j], use.sum()))
# the plane
gm, gl = np.linspace(0, 1.0, 101), np.linspace(0, 1.4, 141)
grid = np.array([[chi2(a, b) for a in gm] for b in gl])
g0 = np.nanmin(grid[np.isfinite(grid)]); jb = np.unravel_index(np.argmin(grid), grid.shape)
print('plane best Om %.2f OL %.2f' % (gm[jb[1]], gl[jb[0]]))
# probability that the expansion is speeding up now: q0 = Om/2 - OL < 0
P = np.exp(-(np.where(np.isfinite(grid), grid, 1e9) - g0) / 2)
A, B = np.meshgrid(gm, gl); q0 = A / 2 - B
pacc = P[q0 < 0].sum() / P.sum()
dq = float(grid[(q0 >= 0) & np.isfinite(grid)].min() - g0)   # how much worse the best non-accelerating universe fits
from scipy.stats import chi2 as C2, norm
sig = float(norm.isf(C2.sf(dq, 2) / 2))
print('best decelerating universe: dchi2 %.1f = %.1f sigma' % (dq, sig))
print('P(q0 < 0) = %.6f; P(OL > 0) = %.8f' % (pacc, P[B > 0].sum() / P.sum()))
# chi2 differences of the simple alternatives against the best flat model
cb = cf[j]
alts = dict(matterOnly=chi2(1.0, 0.0) - cb, empty=chi2(1e-4, 0.0) - cb, flat=0.0)
print('delta chi2', {k: round(v, 1) for k, v in alts.items()})
# H0 from the Cepheid-calibrated distances, Hubble flow
hf = (z > 0.023) & (z < 0.15) & ~cal
Chf = np.linalg.inv(C[np.ix_(hf, hf)]); dlf = dl_unit(Om, 1 - Om, z[hf]) * (1 + zhel[hf]) / (1 + z[hf]) * (1 + z[hf])
# mu = 5 log10(c/H0 * dl_unit (1+zhel)) + 25 -> log10 H0 = (5 log10(c dl) + 25 - mu)/5
y = 5 * np.log10(299792.458 * dl_unit(Om, 1 - Om, z[hf]) * (1 + zhel[hf])) + 25 - mu[hf]
w = Chf.sum(1); lh = (w @ y) / w.sum() / 5; H0 = 10 ** lh
eH = H0 * np.log(10) / 5 / np.sqrt(Chf.sum())
print('H0 (stat+sys of the SN part only) = %.2f +- %.2f, %d SNe' % (H0, eH, hf.sum()))
# binned residuals against the empty (coasting) universe, for the "fainter than expected" view
dmu_empty = mu - (5 * np.log10(299792.458 / H0 * dl_unit(1e-4, 0, z) * (1 + zhel)) + 25)
edges = np.geomspace(0.01, 2.3, 16); bins = []
for a, b in zip(edges[:-1], edges[1:]):
    s = (z >= a) & (z < b) & ~cal
    if s.sum() < 3: continue
    e = np.sqrt(np.diag(C))[s]; wt = 1 / e ** 2
    bins.append(dict(z=float(np.exp(np.average(np.log(z[s]), weights=wt))), d=float(np.average(dmu_empty[s], weights=wt)), e=float(1 / np.sqrt(wt.sum())), n=int(s.sum())))
# per-supernova record
rec = np.stack([z, mu, np.sqrt(np.diag(C)), col['RA'].astype(float), col['DEC'].astype(float), IDS.astype(float), cal.astype(float)], -1).astype('<f4')
rec.tofile('out_sn/sn.bin')
meta = dict(n=N, used=int(use.sum()), unique=len(set(col['CID'])), Om=float(Om), OmLo=float(oms[ok].min()), OmHi=float(oms[ok].max()), chi2=float(cb),
            plane=dict(om=[0, 1, 101], ol=[0, 1.4, 141], dchi2=np.round(np.minimum(grid - g0, 99), 2).tolist(), best=[float(gm[jb[1]]), float(gl[jb[0]])]),
            pAccel=float(pacc), dchi2Decel=dq, sigmaAccel=sig, alts={k: float(v) for k, v in alts.items()}, H0=float(H0), H0err=float(eH), nH0=int(hf.sum()), bins=bins,
            fields=['zHD', 'MU_SH0ES', 'err (diag of stat+sys cov)', 'RA', 'Dec', 'IDSURVEY', 'Cepheid calibrator'],
            published=dict(Om=0.334, OmErr=0.018, H0=73.04, H0err=1.04, planckH0=67.4),
            credit='Pantheon+ (Scolnic et al. 2022; Brout et al. 2022), github.com/PantheonPlusSH0ES/DataRelease')
json.dump(meta, open('out_sn/meta.json', 'w'), separators=(',', ':'))
for f in sorted(os.listdir('out_sn')): print(f, os.path.getsize('out_sn/' + f) // 1024, 'KB')
