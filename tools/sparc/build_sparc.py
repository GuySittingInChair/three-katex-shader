"""Galaxy rotation curves from SPARC (Lelli, McGaugh & Schombert 2016, AJ 152, 157): 175 disc galaxies with
Spitzer 3.6 um photometry and HI/Halpha rotation curves. Each curve point gives the measured speed Vobs and the
speeds the visible matter alone would produce: gas, stellar disc and bulge (Newtonian, for mass-to-light 1).
Here: stars at mass-to-light 0.5 (disc) and 0.7 (bulge) at 3.6 um, as in McGaugh, Lelli & Schombert 2016 (PRL 117, 201101).
  Vbar^2 = Vgas|Vgas| + 0.5 Vdisk|Vdisk| + 0.7 Vbul|Vbul|
  gobs = Vobs^2 / R,  gbar = Vbar^2 / R
Fits: the radial acceleration relation gobs = gbar / (1 - exp(-sqrt(gbar/g0))), and the baryonic Tully-Fisher
relation Mb = A Vflat^s with Mb = 0.5 L[3.6] + 1.33 MHI.
Outputs (out_sparc/): sparc.json."""
import json, os, glob
import numpy as np
from scipy.optimize import minimize_scalar
os.makedirs('out_sparc', exist_ok=True)
KPC = 3.0857e19  # m
UD, UB = 0.5, 0.7

gal = {}
for l in open('sparc/raw/SPARC_Lelli2016c.mrt'):
    t = l.split()
    if len(t) != 19 or not t[1].isdigit():
        continue
    name, T, D, inc, L, Rd, MHI, Vf, eVf, Q = t[0], int(t[1]), float(t[2]), float(t[5]), float(t[7]), float(t[11]), float(t[13]), float(t[15]), float(t[16]), int(t[17])
    gal[name] = dict(name=name, T=T, D=D, inc=inc, L=L, Rd=Rd, MHI=MHI, Vf=Vf, eVf=eVf, Q=Q)
print('catalogue', len(gal))

pts = []  # for the RAR
for f in sorted(glob.glob('sparc/raw/rot/*_rotmod.dat')):
    name = os.path.basename(f)[:-11]
    a = np.loadtxt(f, comments='#')
    g = gal[name]
    R, Vo, eV, Vg, Vd, Vb = a[:, 0], a[:, 1], a[:, 2], a[:, 3], a[:, 4], a[:, 5]
    Vbar2 = Vg * np.abs(Vg) + UD * Vd * np.abs(Vd) + UB * Vb * np.abs(Vb)
    g['curve'] = [[round(float(x), 3) for x in row] for row in np.stack([R, Vo, eV, Vg, Vd, Vb], -1)]
    g['Rmax'] = float(R.max())
    # dark fraction at the last point: share of the needed pull not supplied by what we see
    g['dark'] = float(1 - max(Vbar2[-1], 0) / Vo[-1] ** 2)
    good = (g['Q'] < 3) and (g['inc'] >= 30)
    for i in range(len(R)):
        if good and eV[i] / Vo[i] < 0.1 and Vbar2[i] > 0 and R[i] > 0:
            pts.append((name, Vbar2[i] * 1e6 / (R[i] * KPC), Vo[i] ** 2 * 1e6 / (R[i] * KPC)))
names = [p[0] for p in pts]
gb = np.array([p[1] for p in pts]); go = np.array([p[2] for p in pts])
print('RAR points', len(gb), 'galaxies', len(set(names)))
lgb, lgo = np.log10(gb), np.log10(go)
def model(lg0, x=lgb):
    g = 10 ** x
    return np.log10(g / (1 - np.exp(-np.sqrt(g / 10 ** lg0))))
res = minimize_scalar(lambda lg0: np.sum((lgo - model(lg0)) ** 2), bounds=(-11, -9), method='bounded')
g0 = 10 ** res.x
resid = lgo - model(res.x)
# bootstrap over galaxies for the error
un = sorted(set(names)); idx = {n: np.where(np.array(names) == n)[0] for n in un}
rng = np.random.default_rng(1); bs = []
for _ in range(200):
    sel = np.concatenate([idx[un[k]] for k in rng.integers(0, len(un), len(un))])
    r = minimize_scalar(lambda lg0: np.sum((lgo[sel] - model(lg0, lgb[sel])) ** 2), bounds=(-11, -9), method='bounded')
    bs.append(10 ** r.x)
eg0 = float(np.std(bs))
newton = lgo - lgb
print('g0 = %.3e +- %.2e m/s^2 (published 1.20e-10)  scatter %.3f dex (published 0.13)' % (g0, eg0, resid.std()))
print('Newton (gobs = gbar) scatter %.3f dex, mean offset %.2f dex' % (newton.std(), newton.mean()))
print('low-acceleration (gbar < g0/10): mean gobs/gbar = %.1f' % (10 ** newton[gb < g0 / 10].mean()))

# baryonic Tully-Fisher
bt = [g for g in gal.values() if g['Vf'] > 0 and g['Q'] < 3 and g['inc'] >= 30]
Mb = np.array([(UD * g['L'] + 1.33 * g['MHI']) * 1e9 for g in bt]); Vf = np.array([g['Vf'] for g in bt])
x, y = np.log10(Vf), np.log10(Mb)
s, b = np.polyfit(x, y, 1)
# orthogonal-ish: also y-on-x and x-on-y bisector
s2 = 1 / np.polyfit(y, x, 1)[0]
sb = (s * s2 - 1 + np.sqrt((1 + s ** 2) * (1 + s2 ** 2))) / (s + s2)
bb = np.mean(y - sb * x)
btf_scatter = float(np.std(y - sb * x))
print('BTFR', len(bt), 'galaxies: slope OLS %.2f, bisector %.2f (published 3.7-4), scatter %.2f dex' % (s, sb, btf_scatter))
# MOND-ish check: A = 1/(G a0) with a0 = g0 → slope 4 normalisation
G = 6.674e-11; Msun = 1.989e30
A_pred = 1 / (G * g0) * 1e12 / Msun   # Msun per (km/s)^4
print('Mb/Vf^4 median %.1f Msun/(km/s)^4 vs 1/(G g0) = %.1f' % (np.median(Mb / Vf ** 4), A_pred))
dark = np.array([g['dark'] for g in gal.values() if g['Q'] < 3])
print('dark fraction at last point: median %.2f' % np.median(dark))

feature = ['NGC3198', 'DDO154', 'NGC2403', 'UGC02885', 'NGC7814', 'F568-3', 'NGC6503', 'UGC00128', 'NGC2841', 'IC2574']
for n in feature:
    g = gal[n]
    print(n, 'D %.1f Rmax %.1f Vf %.0f dark %.2f Q %d T %d' % (g['D'], g['Rmax'], g['Vf'], g['dark'], g['Q'], g['T']))
out = dict(
    galaxies=[gal[n] for n in sorted(gal)], feature=feature, UD=UD, UB=UB,
    rar=dict(n=len(gb), ngal=len(un), g0=g0, eg0=eg0, scatter=float(resid.std()), newtonScatter=float(newton.std()),
             lgb=[round(float(v), 3) for v in lgb], lgo=[round(float(v), 3) for v in lgo], lowBoost=float(10 ** newton[gb < g0 / 10].mean())),
    btf=dict(n=len(bt), slope=float(sb), slopeOLS=float(s), icpt=float(bb), scatter=btf_scatter,
             lv=[round(float(v), 4) for v in x], lm=[round(float(v), 3) for v in y]),
    darkMedian=float(np.median(dark)),
    credit='SPARC (Lelli, McGaugh & Schombert 2016, AJ 152, 157), astroweb.case.edu/SPARC')
json.dump(out, open('out_sparc/sparc.json', 'w'), separators=(',', ':'), allow_nan=False)
print('sparc.json', os.path.getsize('out_sparc/sparc.json') // 1024, 'KB')
