"""Every numbered asteroid's orbit from the JPL Small-Body Database (SBDB query API), osculating elements.
All are carried to one epoch (mean anomaly advanced at n = k / a^1.5). Statistics use all of them; the
site gets a subset (every non-main-belt object, and the brightest main-belt ones) to keep the download small.
Outputs (out_ast/): orbits.bin (float32 a, u16 e*65535, i/180*65535, node, peri, M (/360*65535), u8 H*10,
u8 class), meta.json (counts, the a-histogram, the Kirkwood gaps, Trojan clouds, Hildas)."""
import json, os
import numpy as np
os.makedirs('out_ast', exist_ok=True)
D = json.load(open('ast/numbered.json'))
rows = D['data']
def col(k, f=float):
    j = D['fields'].index(k); return np.array([f(r[j]) if r[j] not in (None, '') else np.nan for r in rows])
a, e, inc, om, w, ma, ep, H = (col(k) for k in ('a', 'e', 'i', 'om', 'w', 'ma', 'epoch', 'H'))
cls = np.array([r[D['fields'].index('class')] for r in rows])
vals, cnt = np.unique(ep[np.isfinite(ep)], return_counts=True); EP = float(vals[cnt.argmax()])
k = 0.9856076686                                   # deg/day for a = 1 AU
bound = (e < 1) & (a > 0)
n = np.where(bound, k / np.abs(a) ** 1.5, 0)
M = (ma + n * (EP - ep)) % 360
print('numbered', len(a), 'epoch JD', EP, 'classes', dict(zip(*np.unique(cls, return_counts=True))))
CODES = ['MBA', 'IMB', 'OMB', 'TJN', 'APO', 'ATE', 'AMO', 'IEO', 'MCA', 'CEN', 'TNO', 'HYA', 'PAA', 'AST']
cid = np.array([CODES.index(c) if c in CODES else 13 for c in cls])
# ---- Kirkwood gaps ----
aJ = 5.2026
mb = (cls == 'MBA') | (cls == 'IMB') | (cls == 'OMB')
edges = np.arange(1.8, 4.2001, 0.005); hist = np.histogram(a[mb], edges)[0]
gaps = []
for p, q in ((3, 1), (5, 2), (7, 3), (2, 1)):
    ar = aJ * (q / p) ** (2 / 3)
    # the gap: lowest 0.01-AU window within 0.03 AU of the prediction, against the 0.05-AU shoulders
    cen = edges[:-1] + 0.0025
    best = None
    for c0 in np.arange(ar - 0.03, ar + 0.03, 0.0025):
        inn = ((a[mb] > c0 - 0.005) & (a[mb] < c0 + 0.005)).sum() / 0.01
        if best is None or inn < best[1]: best = (c0, inn)
    c0 = best[0]
    side = (((a[mb] > c0 - 0.08) & (a[mb] < c0 - 0.03)) | ((a[mb] > c0 + 0.03) & (a[mb] < c0 + 0.08))).sum() / 0.1
    gaps.append(dict(p=p, q=q, predicted=float(ar), found=float(c0), inside=float(best[1]), around=float(side), ratio=float(best[1] / side)))
    print('%d:%d predicted %.3f found %.3f, density %.0f vs %.0f per AU (%.1f%%)' % (p, q, ar, c0, best[1], side, 100 * best[1] / side))
# ---- Jupiter now, for the Trojans: mean longitude from the JPL approximate elements ----
T = (EP - 2451545.0) / 36525
LJ = (34.39644051 + 3034.74612775 * T) % 360
lam = (om + w + M) % 360                            # mean longitude of each asteroid
tj = cls == 'TJN'
dl = (lam[tj] - LJ + 180) % 360 - 180
L4, L5 = int((dl > 0).sum()), int((dl < 0).sum())
print('Trojans: L4 (ahead) %d, L5 (behind) %d, mean offsets %.1f / %.1f deg' % (L4, L5, dl[dl > 0].mean(), dl[dl < 0].mean()))
hil = (a > 3.7) & (a < 4.2) & (e < 0.3) & (inc < 20)
print('Hildas', hil.sum())
# ---- the subset for the site ----
keep = ~mb | (H < 16.2)
keep &= bound & np.isfinite(H) & (a < 60)
print('shipped', keep.sum())
o = np.argsort(H[keep])                               # brightest first
idx = np.where(keep)[0][o]
rec = np.zeros(len(idx), dtype=[('a', '<f4'), ('e', '<u2'), ('i', '<u2'), ('om', '<u2'), ('w', '<u2'), ('M', '<u2'), ('H', 'u1'), ('c', 'u1')])
u16 = lambda x, s: np.clip(np.round(x / s * 65535), 0, 65535).astype('<u2')
rec['a'] = a[idx]; rec['e'] = u16(e[idx], 1); rec['i'] = u16(inc[idx], 180); rec['om'] = u16(om[idx] % 360, 360); rec['w'] = u16(w[idx] % 360, 360); rec['M'] = u16(M[idx], 360)
rec['H'] = np.clip(np.round(H[idx] * 10), 0, 255); rec['c'] = cid[idx]
rec.tofile('out_ast/orbits.bin')
hb = np.histogram(a[mb], np.arange(1.8, 4.2001, 0.01))[0]
# a vs sin(i) density image for the families view (all main belt), 400 x 200
img, _, _ = np.histogram2d(a[mb], np.sin(np.radians(inc[mb])), bins=[400, 200], range=[[2.0, 3.6], [0, 0.4]])
img8 = np.clip(np.log1p(img) / np.log1p(img.max()) * 255, 0, 255).astype(np.uint8)
img8.T.tofile('out_ast/ai.bin')
meta = dict(epochJD=EP, count=int(len(a)), shipped=int(len(idx)), classes=CODES, classCounts={c: int((cls == c).sum()) for c in CODES},
            mainBelt=int(mb.sum()), aJ=aJ, gaps=gaps, hist=dict(a0=1.8, da=0.01, n=hb.tolist()), trojans=dict(L4=L4, L5=L5), hildas=int(hil.sum()),
            ai=dict(w=400, h=200, a=[2.0, 3.6], sini=[0, 0.4]), jupiterL=float(LJ),
            credit='NASA/JPL Small-Body Database (ssd.jpl.nasa.gov), orbits from the Minor Planet Center observations')
json.dump(meta, open('out_ast/meta.json', 'w'), separators=(',', ':'))
for f in sorted(os.listdir('out_ast')): print(f, os.path.getsize('out_ast/' + f) // 1024, 'KB')
