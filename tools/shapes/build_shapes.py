"""Ring and shell galaxies: the measurements a collision model needs, from deep DESI Legacy Surveys DR10 r-band images
(legacysurvey.org cutout service; far deeper than the DSS plates, which don't show most shells).

OBSERVED: NED position and redshift of each galaxy; the image.
MEASURED HERE (labelled on the page):
  rings — the ring's centre (placed by eye on the image, then refined to the centre of the ridge ellipse), its size and
          shape (the ridge of brightest light along 48 directions, fitted with an ellipse), the companion's position
          (placed by eye, refined to its light centroid) and its light relative to the ring galaxy;
  shells — the host's centre (NED), half-light radius and shape (second moments), and the 'residual' image: the
          photo divided by its own smooth version (the median along ellipses of the host's shape), which is where
          shells show up.
Distances as on the cards (Arp catalogue entry or the Unknown Universe card: NED-D median, else Hubble's law).
Output: out_shapes/shapes.json"""
import json, math, os
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from scipy.ndimage import gaussian_filter, median_filter

os.makedirs('out_shapes', exist_ok=True)
AM = {o['arp']: o for o in json.load(open('out_arp/meta.json'))['objects']}
DM = {o['id']: o for o in json.load(open('out_deepsky/meta.json'))['objects']}
ned = lambda tag: json.load(open(f'shapes/ned_{tag}_.json'))['Preferred']

# (tag, kind, NED tag, card host, by-eye centre and companion in the contact sheet's 300-px tiles (x right, y down))
T = [
    ('arp146', 'ring', 'Arp_146', dict(arp=146), (180, 135, 45), (118, 165), 'the ring galaxy of Arp 146'),
    ('arp147', 'ring', 'Arp_147', dict(arp=147), (182, 140, 30), (118, 165), 'the ring galaxy of Arp 147 (IC 298)'),
    ('arp148', 'ring', 'Arp_148', dict(arp=148), (197, 150, 25), (145, 150), "Mayall's Object (Arp 148)"),
    ('cartwheel', 'ring', 'Cartwheel_Galaxy', dict(deep='cartwheel'), (165, 148, 75), None, 'the Cartwheel Galaxy'),
    ('ngc474', 'shell', 'NGC_474', dict(arp=227), None, None, 'NGC 474 (Arp 227)'),
    ('ic51', 'shell', 'IC_51', dict(arp=230), None, None, 'IC 51 (Arp 230)'),
    ('ic1575', 'shell', 'IC_1575', dict(arp=231), None, None, 'IC 1575 (Arp 231)'),
    ('ngc2911', 'shell', 'NGC_2911', dict(arp=232), None, None, 'NGC 2911 (Arp 232)'),
    ('ic162', 'shell', 'IC_162', dict(arp=228), None, None, 'IC 162 (Arp 228)'),
]
G = 64
out = []
for tag, kind, ntag, host, cen_t, comp_t, label in T:
    hd = fits.open(f'shapes/ls/{tag}.fits')[0]; w = WCS(hd.header)
    img = np.nan_to_num(hd.data.astype(np.float64)); N = img.shape[0]
    pixas = abs(hd.header.get('CD1_1') or hd.header.get('CDELT1')) * 3600
    P = ned(ntag)
    card = AM[host['arp']] if 'arp' in host else DM[host['deep']]
    mpc = card['ly'] / 3.2616e6
    kpc_pix = pixas / 206265 * mpc * 1000
    bg = np.median(np.concatenate([img[:20].ravel(), img[-20:].ravel(), img[:, :20].ravel(), img[:, -20:].ravel()]))
    sky = np.clip(img - bg, 0, None)
    # east is to the left (x decreasing), north up (y increasing): checked
    p0 = w.all_world2pix([[P['Position']['RA'], P['Position']['Dec']]], 0)[0]
    pe = w.all_world2pix([[P['Position']['RA'] + 0.002, P['Position']['Dec']]], 0)[0]; pn = w.all_world2pix([[P['Position']['RA'], P['Position']['Dec'] + 0.002]], 0)[0]
    assert pe[0] < p0[0] and pn[1] > p0[1], tag
    yy, xx = np.mgrid[:N, :N]
    sm = gaussian_filter(sky, 1.5 * N / 600)
    rec = dict(tag=tag, kind=kind, label=label, host=host, nedName=P['Name'], ra=P['Position']['RA'], dec=P['Position']['Dec'], type=P['ObjType']['Value'],
               z=(P.get('Redshift') or {}).get('Value'), zRef=(P.get('Redshift') or {}).get('RefCode'), mpc=round(mpc, 2), distSrc=card.get('distSrc', ''),
               image='DESI Legacy Imaging Surveys DR10, r band', pixArcsec=round(pixas, 4), kpcPerPix=kpc_pix)
    if kind == 'ring':
        c = np.array([cen_t[0] * 2, N - cen_t[1] * 2], float)
        # the ridge: along 48 directions, the brightest point between 0.25 and 1.6 × a first guess of the radius
        def ridge(c, r0):
            pts = []
            for th in np.linspace(0, 2 * np.pi, 48, endpoint=False):
                rs = np.linspace(0.65 * rg, 1.4 * rg, 120); x = c[0] + rs * np.cos(th); y = c[1] + rs * np.sin(th)
                ok = (x >= 0) & (x < N) & (y >= 0) & (y < N)
                if ok.sum() < 20: continue
                vals = sm[y[ok].astype(int), x[ok].astype(int)]; k = np.argmax(vals)
                pts.append((x[ok][k], y[ok][k]))
            return np.array(pts)
        rg = cen_t[2] * 2; r0 = rg       # by-eye radius (tile px → image px): the search stays within 0.65–1.4 × it
        for it in range(4):
            pts = ridge(c, r0)
            # robust: drop the 20% of directions farthest from the median radius (where the companion or a knot sits)
            d = np.hypot(pts[:, 0] - c[0], pts[:, 1] - c[1]); keep = np.abs(d - np.median(d)) <= np.percentile(np.abs(d - np.median(d)), 80)
            pts = pts[keep]; c = pts.mean(0); r0 = float(np.median(np.hypot(pts[:, 0] - c[0], pts[:, 1] - c[1])))
        dx, dy = pts[:, 0] - c[0], pts[:, 1] - c[1]
        ev, evec = np.linalg.eigh(np.cov(np.vstack([dx, dy])))
        q = float(math.sqrt(ev[0] / ev[1])); ang = float(math.atan2(evec[1, 1], evec[0, 1]))
        a_pix = float(np.sqrt(2 * ev[1]))                 # semi-major axis of the ridge ellipse
        rec.update(ringA=a_pix * kpc_pix, ringQ=q, ringAng=ang, centrePix=c.tolist(), ridge=[[round(float((x - c[0]) * kpc_pix), 2), round(float((y - c[1]) * kpc_pix), 2)] for x, y in pts])
        if comp_t:
            pc = np.array([comp_t[0] * 2, N - comp_t[1] * 2], float)
            for it in range(5):   # light centroid in a small aperture
                m = np.hypot(xx - pc[0], yy - pc[1]) < 0.06 * N; wgt = sm[m]
                pc = np.array([(xx[m] * wgt).sum() / wgt.sum(), (yy[m] * wgt).sum() / wgt.sum()])
            sep = math.hypot(*(pc - c)); rap = 0.45 * sep
            lc = sky[np.hypot(xx - pc[0], yy - pc[1]) < min(rap, 0.9 * a_pix)].sum(); lm = sky[np.hypot(xx - c[0], yy - c[1]) < 1.25 * a_pix].sum() - lc * 0
            cw = w.all_pix2world([pc], 0)[0]
            rec.update(compXY=[float((pc[0] - c[0]) * kpc_pix), float((pc[1] - c[1]) * kpc_pix)], compPix=pc.tolist(), compRaDec=[round(float(cw[0]), 6), round(float(cw[1]), 6)], lightRatio=float(lc / max(lm, 1e-9)))
        half = max(1.8 * a_pix, 1.25 * math.hypot(*(np.array(rec.get('compPix', c)) - c)) + 0.12 * N) * kpc_pix
        centre = c
    else:
        c = p0.copy()
        m = np.hypot(xx - c[0], yy - c[1]) < 0.45 * N
        order = np.argsort(np.hypot(xx - c[0], yy - c[1])[m]); cum = np.cumsum(sky[m][order])
        re_pix = float(np.hypot(xx - c[0], yy - c[1])[m][order][np.searchsorted(cum, cum[-1] / 2)])
        mm = np.hypot(xx - c[0], yy - c[1]) < 2 * re_pix; wgt = sky[mm]; dx = xx[mm] - c[0]; dy = yy[mm] - c[1]
        S = np.array([[(wgt * dx * dx).sum(), (wgt * dx * dy).sum()], [(wgt * dx * dy).sum(), (wgt * dy * dy).sum()]]) / wgt.sum()
        ev, evec = np.linalg.eigh(S); q = float(math.sqrt(ev[0] / ev[1])); ang = float(math.atan2(evec[1, 1], evec[0, 1]))
        rec.update(re=re_pix * kpc_pix, q=q, ang=ang, centrePix=c.tolist())
        half = 0.46 * N * kpc_pix
        centre = c
    # bin to 64 × 64 around the centre (x = west = right on the picture... as the pairs: x pixel → right, y → north)
    gx = ((xx - centre[0]) * kpc_pix + half) / (2 * half) * G; gy = ((yy - centre[1]) * kpc_pix + half) / (2 * half) * G
    ok = (gx >= 0) & (gx < G) & (gy >= 0) & (gy < G)
    grid = np.zeros((G, G)); cover = np.zeros((G, G))
    np.add.at(grid, (gy[ok].astype(int), gx[ok].astype(int)), sky[ok]); np.add.at(cover, (gy[ok].astype(int), gx[ok].astype(int)), 1)
    grid = np.where(cover > 0, grid / np.maximum(cover, 1), -1)
    # cutout gaps (masked blocks are exactly 0 in the survey's image) are not compared
    zero = np.zeros((G, G)); np.add.at(zero, (gy[ok].astype(int), gx[ok].astype(int)), (img[ok] == 0).astype(float))
    grid = np.where(zero > 0.3 * np.maximum(cover, 1), -1, grid)
    gm = grid[grid >= 0]; grid = np.where(grid >= 0, grid / max(np.percentile(gm, 99.5), 1e-12), -1)
    cw = w.all_pix2world([centre], 0)[0]
    rec.update(centreRa=round(float(cw[0]), 6), centreDec=round(float(cw[1]), 6))
    rec.update(half=half, grid=[round(float(v), 4) for v in grid.ravel()])
    if kind == 'shell':
        # the smooth host: the median brightness along ellipses of the host's shape, on the binned grid
        X = ((np.arange(G) + 0.5) / G * 2 - 1) * half; XX, YY = np.meshgrid(X, X)
        ca, sa = math.cos(ang), math.sin(ang)
        u_ = XX * ca + YY * sa; v_ = -XX * sa + YY * ca; er = np.hypot(u_, v_ / max(q, 0.2))
        bins = np.linspace(0, er.max() + 1e-6, 40); idx = np.digitize(er, bins)
        smooth = np.zeros((G, G))
        for b in np.unique(idx):
            s = (idx == b) & (grid >= 0)
            if s.any(): smooth[idx == b] = np.median(grid[s])
        smooth = np.clip(gaussian_filter(smooth, 0.8), 1e-5, None)
        rec['smooth'] = [round(float(v), 5) for v in smooth.ravel()]
    print(f"{tag:10s} {kind:5s} {mpc:6.1f} Mpc  {pixas:.3f}″/px = {kpc_pix:.3f} kpc  half {half:5.1f} kpc  " +
          (f"ring a {rec['ringA']:.1f} kpc q {rec['ringQ']:.2f}" + (f"  comp at {np.round(rec['compXY'], 1)} kpc, light {rec['lightRatio']:.2f}" if 'compXY' in rec else '') if kind == 'ring' else f"r½ {rec['re']:.1f} kpc q {rec['q']:.2f}"))
    out.append(rec)
json.dump(dict(targets=out, source='DESI Legacy Imaging Surveys DR10 (legacysurvey.org), r band; positions and redshifts from NED'), open('out_shapes/shapes.json', 'w'), separators=(',', ':'))
