"""Kepler-11's planets, found from scratch in its public Kepler light curve (17 quarters, 2009-2013, long
cadence, PDCSAP flux from MAST). Normalise each quarter, divide out slow wiggles with a running median,
then a box least-squares (BLS) search: take the strongest period, mask its transits, search again.
Each planet's depth gives its size, (Rp/R*)^2 = depth; its period gives its distance (Kepler's third law).
Star: R = 1.065 Rsun, M = 0.961 Msun (Lissauer et al. 2013).
Outputs (out_kep/): lc.bin (float32 time - 2454833 (BKJD), int16 flux in ppm, int16 raw ppm, u8 quarter), meta.json."""
import glob, json, os
import numpy as np
from astropy.io import fits
from astropy.timeseries import BoxLeastSquares
from scipy.ndimage import median_filter
os.makedirs('out_kep', exist_ok=True)
T, F, RAW, Q = [], [], [], []
for f in sorted(glob.glob('kep/*.fits')):
    h = fits.open(f); d = h[1].data; q = h[0].header['QUARTER']
    ok = (d['SAP_QUALITY'] == 0) & np.isfinite(d['PDCSAP_FLUX']) & np.isfinite(d['TIME'])
    t, fl, sap = d['TIME'][ok], d['PDCSAP_FLUX'][ok], d['SAP_FLUX'][ok]
    T.append(t); F.append(fl / np.median(fl)); RAW.append(sap / np.median(sap)); Q.append(np.full(len(t), q))
t, f, raw, qq = map(np.concatenate, (T, F, RAW, Q))
print('points', len(t), 'span %.1f d' % (t[-1] - t[0]))
# detrend: running median over 1.5 days (49 cadences), per quarter, transits are < 0.45 d long
flat = np.empty_like(f)
for q in np.unique(qq):
    s = qq == q
    flat[s] = f[s] / median_filter(f[s], size=73, mode='nearest')
# clip upward outliers (flares, cosmic rays); keep the dips
mad = 1.4826 * np.median(np.abs(flat - 1))
keep = flat < 1 + 5 * mad
t, flat, f, raw, qq = t[keep], flat[keep], f[keep], raw[keep], qq[keep]
print('scatter %.0f ppm per 30 min' % (mad * 1e6))
RS, MS = 1.065, 0.961
planets, pgrams = [], []
mask = np.ones(len(t), bool)
periods = np.exp(np.linspace(np.log(3), np.log(150), 60000))
durations = np.array([0.08, 0.12, 0.16, 0.2, 0.25, 0.3, 0.38, 0.45])
for it in range(7):
    bls = BoxLeastSquares(t[mask], flat[mask], dy=np.full(mask.sum(), mad))
    r = bls.power(periods, durations, objective='snr')
    j = int(np.argmax(r.power))
    P, t0, dur, depth = r.period[j], r.transit_time[j], r.duration[j], r.depth[j]
    st = bls.compute_stats(P, dur, t0)
    snr = r.depth_snr[j]
    # periodogram, thinned for display (keep the max in each bin)
    nb = 1500; pw = r.power.reshape(nb, -1).max(1); pp = np.exp(np.log(periods).reshape(nb, -1).mean(1))
    print('search %d: P %.4f d, depth %.0f ppm, dur %.2f d, SNR %.1f, power %.1f' % (it, P, depth * 1e6, dur, snr, r.power[j]))
    if snr < 10: break
    # refine: fold and measure the depth from points inside the middle half of the transit
    ph = ((t - t0 + 0.5 * P) % P) - 0.5 * P
    inn = mask & (np.abs(ph) < dur * 0.3); out = mask & (np.abs(ph) > dur) & (np.abs(ph) < 3 * dur)
    dep = 1 - np.median(flat[inn]) / np.median(flat[out])
    edep = 1.4826 * np.median(np.abs(flat[inn] - np.median(flat[inn]))) / np.sqrt(inn.sum())
    rp = RS * np.sqrt(dep) * 109.08                 # Earth radii
    a = ((P / 365.25) ** 2 * MS) ** (1 / 3)         # AU
    ntr = len(np.unique(np.round((t[inn] - t0) / P)))
    # binned fold for display: +-1.2 durations, 80 bins
    W = max(0.6, 2.5 * dur); edges = np.linspace(-W, W, 81); bf = []
    for a0, a1 in zip(edges[:-1], edges[1:]):
        s = mask & (ph >= a0) & (ph < a1)
        bf.append(float(np.mean(flat[s]) - 1) * 1e6 if s.sum() else None)
    planets.append(dict(P=float(P), t0=float(t0), dur=float(dur), depth=float(dep * 1e6), depthErr=float(edep * 1e6), snr=float(snr), rp=float(rp), a=float(a), transits=int(ntr), fold=dict(w=float(W), y=bf)))
    pgrams.append(dict(p=pp.round(4).tolist(), power=pw.round(2).tolist(), peak=float(P)))
    mask &= np.abs(ph) > 1.5 * dur
order = np.argsort([p['P'] for p in planets])
names = 'bcdefg'
pub = dict(b=(10.304, 1.80), c=(13.025, 2.87), d=(22.687, 3.12), e=(31.996, 4.19), f=(46.689, 2.49), g=(118.381, 3.33))
for k, i in enumerate(order):
    p = planets[i]; p['name'] = names[k] if k < 6 else '?'; p['found'] = int(i)
    pp_ = pub.get(p['name'])
    print('%s P %.3f (pub %.3f)  Rp %.2f (pub %.2f) Re  a %.3f AU  depth %.0f+-%.0f ppm  %d transits' % (p['name'], p['P'], pp_[0], p['rp'], pp_[1], p['a'], p['depth'], p['depthErr'], p['transits']))
    p['published'] = dict(P=pp_[0], rp=pp_[1])
rec = np.zeros(len(t), dtype=[('t', '<f4'), ('f', '<i2'), ('r', '<i2'), ('q', 'u1')])
rec['t'] = t; rec['f'] = np.clip(np.round((flat - 1) * 1e6), -32000, 32000); rec['r'] = np.clip(np.round((raw - 1) * 1e6 / 2), -32000, 32000); rec['q'] = qq
rec.tofile('out_kep/lc.bin')
meta = dict(n=int(len(t)), t0=float(t[0]), t1=float(t[-1]), bjdOffset=2454833.0, scatterPpm=float(mad * 1e6), star=dict(R=RS, M=MS, teff=5657, kepmag=13.709),
            rawScale=2, planets=planets, searches=pgrams, recordBytes=9,
            credit='NASA Kepler mission, light curves from MAST (STScI); star from Lissauer et al. 2013')
json.dump(meta, open('out_kep/meta.json', 'w'), separators=(',', ':'))
for fn in sorted(os.listdir('out_kep')): print(fn, os.path.getsize('out_kep/' + fn) // 1024, 'KB')
