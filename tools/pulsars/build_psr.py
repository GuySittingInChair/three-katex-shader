"""Pulsars from the ATNF Pulsar Catalogue (Manchester et al. 2005; v2.6.1): period P, its slow-down
dP/dt, distance, Galactic position, binary period, type, associations.
Derived (standard magnetic-dipole spin-down, moment of inertia 1e45 g cm^2):
  surface field B = 3.2e19 sqrt(P Pdot) G, characteristic age tau = P / (2 Pdot), spin-down power Edot = 4 pi^2 I Pdot / P^3.
Outputs (out_psr/): psr.bin (float32 x, y, z kpc (Galactocentric: Sun at x = -8.2), log10 P, log10 Pdot (or 0), flags),
meta.json."""
import json, os
import numpy as np
os.makedirs('out_psr', exist_ok=True)
rows = [l.rstrip('\n').split(';') for l in open('psr/psrcat.csv') if l[0].isdigit()]
def num(x):
    try: return float(x)
    except ValueError: return np.nan
name = [r[1] for r in rows]
P, Pd, D, GL, GB, PB = (np.array([num(r[k]) for r in rows]) for k in (2, 3, 4, 5, 6, 7))
assoc = [r[8] for r in rows]; typ = [r[9] for r in rows]
ok = np.isfinite(P) & np.isfinite(D) & np.isfinite(GL)
mag = np.array(['AXP' in t for t in typ]); gc = np.array(['GC:' in a for a in assoc]); exg = np.array(['EXGAL' in a for a in assoc])
binary = np.isfinite(PB)
hasPd = np.isfinite(Pd) & (Pd > 0)
msp = (P < 0.03) & (~hasPd | (Pd < 1e-17))
R0 = 8.2
l, b = np.radians(GL), np.radians(GB)
x = D * np.cos(b) * np.cos(l) - R0; y = D * np.cos(b) * np.sin(l); z = D * np.sin(b)
B = 3.2e19 * np.sqrt(P * np.where(hasPd, Pd, np.nan)); tau = P / (2 * np.where(hasPd, Pd, np.nan)) / 3.156e7
Ed = 4 * np.pi ** 2 * 1e45 * np.where(hasPd, Pd, np.nan) / P ** 3
print('pulsars', len(P), 'with distance & position', ok.sum(), 'with Pdot', hasPd.sum(), 'MSP', msp.sum(), 'magnetars', mag.sum(), 'in clusters', gc.sum(), 'other galaxies', exg.sum())
fb_msp, fb_norm = binary[msp].mean(), binary[~msp & ~mag].mean()
print('binary fraction: MSP %.0f%%, normal %.1f%%' % (100 * fb_msp, 100 * fb_norm))
def find(n):
    return next(i for i, s in enumerate(name) if s == n)
crab, vela, fast, sgr = find('B0531+21'), find('B0833-45'), find('J1748-2446ad'), find('J1745-2900')
for k in (crab, vela, fast, sgr):
    print(name[k], 'P %.6f Pdot %.2e B %.2e tau %.0f yr Edot %.2e' % (P[k], Pd[k], B[k], tau[k], Ed[k]))
flags = (msp * 1) | (mag * 2) | (binary * 4) | (gc * 8) | (exg * 16) | (hasPd * 32)
idx = np.where(ok)[0]
special = {'crab': crab, 'vela': vela, 'fastest': fast, 'sgrA': sgr}
rec = np.stack([x[idx], y[idx], z[idx], np.log10(P[idx]), np.where(hasPd[idx], np.log10(np.where(hasPd, Pd, 1)[idx]), 0), flags[idx]], -1).astype('<f4')
rec.tofile('out_psr/psr.bin')
spec = {k: dict(i=int(np.where(idx == v)[0][0]), name=name[v], P=float(P[v]), Pdot=float(Pd[v]) if np.isfinite(Pd[v]) else None,
                B=float(B[v]) if np.isfinite(B[v]) else None, tau=float(tau[v]) if np.isfinite(tau[v]) else None, Edot=float(Ed[v]) if np.isfinite(Ed[v]) else None, D=float(D[v])) for k, v in special.items()}
meta = dict(count=int(len(P)), drawn=int(len(idx)), withPdot=int(hasPd.sum()), msp=int(msp.sum()), magnetars=int(mag.sum()), clusters=int(gc.sum()), external=int(exg.sum()),
            binaryMSP=float(fb_msp), binaryNormal=float(fb_norm), R0=R0, special=spec, medianP=float(np.nanmedian(P[~msp])), medianTau=float(np.nanmedian(tau[~msp & hasPd & np.isfinite(tau)])),
            credit='ATNF Pulsar Catalogue v2.6.1 (Manchester, Hobbs, Teoh & Hobbs 2005), CSIRO')
json.dump(meta, open('out_psr/meta.json', 'w'), separators=(',', ':'), allow_nan=False)
print(json.dumps(spec['crab']))
for f in sorted(os.listdir('out_psr')): print(f, os.path.getsize('out_psr/' + f) // 1024, 'KB')
