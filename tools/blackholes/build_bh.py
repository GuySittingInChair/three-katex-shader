"""Black hole sound waves, after NASA/CXC's 2022 Perseus sonification (Arcand, Russo, Santaguida).
Their published method: take the Chandra X-ray image of the hot cluster gas, read the ripples (real pressure =
sound waves driven by the central black hole) along lines running outwards from the centre, sweep those lines round
like a radar, and raise the result 57 and 58 octaves. Their code isn't public; this rebuilds the method from raw data.

Per object (list in BH below; add one entry to add a black hole), cached under bh/:
  Chandra level-2 event files from the CDA (cxc.cfa.harvard.edu/cdaftp/byobsid/...)        -> bh/raw/*.evt2.fits.gz
Steps:
  1. events 0.5-7 keV -> one image, 1 arcsec pixels, centred on the black hole (all ObsIDs reprojected, TAN)
  2. a rough exposure map per ObsID: each CCD's footprint (from where its events land), blurred by the 16" dither,
     times its live time -- so chip gaps don't read as dark rings
  3. ripples = (image smoothed 2.5") / (image smoothed 14") - 1, both exposure-corrected: the "fractional residual",
     a few per cent bright/dim around the smooth glow (Fabian et al. 2003 enhanced the ripples the same way)
  4. 360 radial profiles (1 deg apart, each averaged over a 6 deg wedge), r_min..r_max in 1" steps -> int8 table
  5. sound speed + kpc/arcsec from the discovery paper give seconds per arcsec at true speed; the page plays the
     profiles at that rate x 2^57 and x 2^58 (one octave up), sweeping round once every SWEEP seconds
  Other black holes (kind='shocks'): no published ripple train, only shock fronts and bubbles. Their observations
  come from bh_fetch.py (bh/obs.json), the centre is the X-ray peak, the scale comes from the redshift (H0=70,
  Omega_m=0.3) or a measured distance, the sound speed from the gas temperature, c_s = sqrt(5/3 kT / (0.6 m_p)),
  and the main spacing is measured from the data itself (strongest repeat in the radial profiles), not published.
Outputs (out_bh/): meta.json, <id>.prof (int8, 360 x n), <id>.jpg (the ripple image the radar sweeps)."""
import glob, gzip, io, json, os, sys
import numpy as np
from astropy.io import fits
from scipy import ndimage as ndi
from PIL import Image

KPC = 3.0857e19            # metres
YR = 365.25 * 86400
BH = [
    dict(id='perseus', name='The black hole in the Perseus cluster', galaxy='NGC 1275',
         ra=49.950667, dec=41.511694, obsids=[3209, 4289],
         kpc_per_arcsec=1 / 2.7, cs_kms=1170, wave_kpc=11, period_yr=9.6e6, rmin=45, rmax=200,
         dist='240 million light-years', ref='Fabian et al. 2003',
         note='ripples 36,000 light-years apart'),
    dict(id='centaurus', name='The black hole in the Centaurus cluster', galaxy='NGC 4696',
         ra=192.205417, dec=-41.310833, obsids=[4954, 4955, 5310],
         kpc_per_arcsec=0.213, cs_kms=None, wave_kpc=9, period_yr=1e7, rmin=20, rmax=220,
         dist='150 million light-years', ref='Sanders & Fabian 2008',
         note='ripples 29,000 light-years apart'),
]
# Shock fronts and bubbles (no confirmed ripple train): kT = central gas temperature (keV, approximate, from the
# papers named), z = redshift or dist_mpc = measured distance for nearby galaxies, rmin/rmax = radii read (arcsec).
SH = dict(kind='shocks', center='peak', wave_kpc=None, period_yr=None)
BH += [
    dict(SH, id='m87', obs='m87', name='M87, the black hole in the Virgo cluster', galaxy='M87', dist_mpc=16.5, kT=2.0,
         rmin=25, rmax=240, ref='Forman et al. 2007', note='a shock ring and bubbles'),
    dict(SH, id='a2052', obs='a2052', name='The black hole in Abell 2052', galaxy='UGC 9799', z=0.0355, kT=3.0,
         rmin=10, rmax=150, ref='Blanton et al. 2011', note='bubbles inside shells of shocked gas'),
    dict(SH, id='n5813', obs='n5813', name='The black hole in NGC 5813', galaxy='NGC 5813', dist_mpc=32.2, kT=0.7,
         rmin=12, rmax=230, ref='Randall et al. 2015', note='three outbursts, three pairs of shock fronts'),
    dict(SH, id='hydraa', obs='hydraa', name='Hydra A', galaxy='Hydra A', z=0.0549, kT=3.5,
         rmin=12, rmax=240, ref='Nulsen et al. 2005', note='one of the largest shock fronts known'),
    dict(SH, id='ms0735', obs='ms0735', name='The black hole in MS 0735.6+7421', galaxy='MS 0735.6+7421', z=0.216, kT=5.0,
         rmin=6, rmax=120, ref='McNamara et al. 2005', note='one of the most powerful outbursts ever seen'),
    dict(SH, id='a2199', obs='a2199', depth=0.5, name='The black hole in Abell 2199', galaxy='NGC 6166', z=0.0302, kT=4.0,
         rmin=10, rmax=170, ref='Nulsen et al. 2013', note='a shock and bubbles'),
    dict(SH, id='n5044', obs='n5044', name='The black hole in NGC 5044', galaxy='NGC 5044', dist_mpc=31.2, kT=1.0,
         rmin=12, rmax=220, ref='David et al. 2009', note='a galaxy group full of cavities'),
    dict(SH, id='a0335', obs='a0335', name='The black hole in 2A 0335+096', galaxy='2A 0335+096', z=0.0349, kT=2.5,
         rmin=10, rmax=170, ref='Sanders et al. 2009', note='a stirred-up core full of bubbles'),
    dict(SH, id='a262', obs='a262', name='The black hole in Abell 262', galaxy='NGC 708', z=0.0163, kT=2.0,
         rmin=10, rmax=170, ref='Blanton et al. 2004', note='bubbles blown by radio jets'),
    dict(SH, id='cyga', obs='cyga', depth=0.45, name='Cygnus A', galaxy='Cygnus A', z=0.0561, kT=5.5,
         rmin=15, rmax=150, ref='Snios et al. 2018', note='a jet-blown cocoon edged by a shock'),
]
def kpc_per_arcsec(o):   # angular scale: measured distance, or flat Lambda-CDM (H0 70, Omega_m 0.3) from redshift
    if o.get('dist_mpc'): return o['dist_mpc'] * 1e3 * np.radians(1 / 3600)
    zz = np.linspace(0, o['z'], 2001); E = np.sqrt(0.3 * (1 + zz) ** 3 + 0.7)
    Dc = 299792.458 / 70 * np.trapezoid(1 / E, zz)                     # comoving distance, Mpc
    return Dc / (1 + o['z']) * 1e3 * np.radians(1 / 3600)
def ly_text(o):          # "how far", in light-years (light-travel-ish: distance or c z / H0)
    mpc = o.get('dist_mpc') or 299792.458 * o['z'] / 70
    mly = mpc * 3.2616
    return f"{mly / 1000:.1f} billion light-years" if mly >= 1000 else f"{int(float(f'{mly:.2g}')):,} million light-years"
OBS = json.load(open('bh/obs.json')) if os.path.exists('bh/obs.json') else {}
for o in BH:
    o.setdefault('kind', 'ripples')
    if o['kind'] == 'shocks':
        o['kpc_per_arcsec'] = kpc_per_arcsec(o)
        o['cs_kms'] = round(np.sqrt(5 / 3 * o['kT'] * 1.602e-16 / (0.6 * 1.6726e-27)) / 1e3)
        o['dist'] = ly_text(o)
        if o['obs'] in OBS: o.update(obsids=OBS[o['obs']]['obsids'], ra=OBS[o['obs']]['ra'], dec=OBS[o['obs']]['dec'])
    if o['cs_kms'] is None:   # where the paper gives wavelength + period but no sound speed, speed = wavelength / period
        o['cs_kms'] = round(o['wave_kpc'] * KPC / (o['period_yr'] * YR) / 1e3)

def events(path):
    with fits.open(path, memmap=False) as h:
        ev = h['EVENTS']; hd = ev.header; d = ev.data
        cols = [c.name.lower() for c in ev.columns]
        ix, iy = cols.index('x') + 1, cols.index('y') + 1
        wcs = dict(crx=hd[f'TCRVL{ix}'], cry=hd[f'TCRVL{iy}'], px=hd[f'TCRPX{ix}'], py=hd[f'TCRPX{iy}'],
                   dx=hd[f'TCDLT{ix}'], dy=hd[f'TCDLT{iy}'])
        e = d['energy']; keep = (e > 500) & (e < 7000)
        return (np.asarray(d['x'][keep], float), np.asarray(d['y'][keep], float), np.asarray(d['ccd_id'][keep]),
                wcs, float(hd.get('LIVETIME', hd.get('EXPOSURE'))), float(hd.get('ROLL_NOM', 0)))

def sky_to_radec(x, y, w):   # Chandra sky pixels -> RA/Dec (gnomonic / TAN projection)
    xi = np.radians((x - w['px']) * w['dx']); eta = np.radians((y - w['py']) * w['dy'])
    a0, d0 = np.radians(w['crx']), np.radians(w['cry'])
    den = np.cos(d0) - eta * np.sin(d0)
    ra = a0 + np.arctan2(xi, den)
    dec = np.arctan2(np.sin(d0) + eta * np.cos(d0), np.hypot(xi, den))
    return ra, dec

def radec_to_plane(ra, dec, a0, d0):   # RA/Dec -> arcsec offsets on a tangent plane at the black hole (east = -x)
    cosc = np.sin(d0) * np.sin(dec) + np.cos(d0) * np.cos(dec) * np.cos(ra - a0)
    X = np.cos(dec) * np.sin(ra - a0) / cosc
    Y = (np.cos(d0) * np.sin(dec) - np.sin(d0) * np.cos(dec) * np.cos(ra - a0)) / cosc
    return -np.degrees(X) * 3600, np.degrees(Y) * 3600

def build(o):
    half = o['rmax'] + 40; n = 2 * half
    img = np.zeros((n, n)); exp = np.zeros((n, n))
    a0, d0 = np.radians(o['ra']), np.radians(o['dec'])
    evs = []
    for ob in o['obsids']:
        f = glob.glob(f'bh/raw/acisf{ob:05d}N*_evt2.fits.gz')
        if not f: sys.exit(f'missing ObsID {ob}: download bh/raw/acisf{ob:05d}N*_evt2.fits.gz')
        x, y, ccd, w, live, roll = events(f[0])
        evs.append((ob, *radec_to_plane(*sky_to_radec(x, y, w), a0, d0), ccd, live))
    if o.get('center') == 'peak':   # the black hole sits at the X-ray peak: find it within 60" of the pointing
        h, _, _ = np.histogram2d(np.concatenate([e[2] for e in evs]), np.concatenate([e[1] for e in evs]),
                                 bins=240, range=[[-120, 120], [-120, 120]])
        h = ndi.gaussian_filter(h, 3); yy0, xx0 = np.mgrid[-120:120, -120:120] + 0.5; h[np.hypot(xx0, yy0) > 60] = 0
        py0, px0 = np.unravel_index(np.argmax(h), h.shape); dx0, dy0 = xx0[py0, px0], yy0[py0, px0]
        evs = [(ob, X - dx0, Y - dy0, ccd, live) for ob, X, Y, ccd, live in evs]
        print(f"  {o['id']}: centre moved {np.hypot(dx0, dy0):.0f}\" to the X-ray peak")
    for ob, X, Y, ccd, live in evs:
        ix = np.floor(X + half).astype(int); iy = np.floor(Y + half).astype(int)
        ok = (ix >= 0) & (ix < n) & (iy >= 0) & (iy < n)
        np.add.at(img, (iy[ok], ix[ok]), 1)
        # exposure: each CCD's footprint on a 4" grid, holes filled, then blurred by the dither (~16" box)
        for c in np.unique(ccd[ok]):
            m = ok & (ccd == c); g = np.zeros((n // 4 + 1, n // 4 + 1), bool)
            g[iy[m] // 4, ix[m] // 4] = True
            g = ndi.binary_fill_holes(ndi.binary_closing(g, iterations=2))
            g = ndi.binary_erosion(g, iterations=3)   # closing grew the outline ~8"; pull it back past the true edge
            foot = np.kron(g, np.ones((4, 4)))[:n, :n]
            exp += live * ndi.uniform_filter(foot.astype(float), 16)
        print(f"  {o['id']} ObsID {ob}: {ok.sum():,} events, live {live / 1e3:.0f} ks")
    # trust only pixels every ObsID covered fully: chip gaps (where the dithered exposure dips) are masked, not guessed
    ref = np.percentile(exp[exp > 0], 80)    # typical full depth (seams where two chip outlines overlap would inflate the max)
    # (o['depth']: how much of the full depth a spot needs; lower for targets observed at several roll angles,
    #  whose chip gaps fall in different places -- the exposure correction handles the uneven depth)
    cov = ndi.binary_erosion(exp > o.get('depth', 0.9) * ref, iterations=3)
    good = cov.copy()
    # point sources (stars, background galaxies) are not gas: compact spots far above their surroundings are masked
    sm1 = ndi.gaussian_filter(np.where(good, img, 0), 1.2); sm8 = ndi.gaussian_filter(np.where(good, img, 0), 8)
    ps = (sm1 > sm8 + 4 * np.sqrt(np.maximum(sm8, 1e-3) / (4 * np.pi * 1.2 ** 2))) & (sm1 > 1.8 * sm8)
    ps = ndi.binary_dilation(ps, iterations=5); yy, xx = np.mgrid[0:n, 0:n]
    ps &= np.hypot(xx - half, yy - half) > o['rmin'] * 0.8          # (but never the central black hole region)
    good &= ~ps
    def smooth(s):   # exposure-weighted Gaussian smoothing ("normalised convolution")
        num = ndi.gaussian_filter(np.where(good, img, 0), s); den = ndi.gaussian_filter(np.where(good, exp, 0), s)
        return num / np.maximum(den, 1e-9)
    frac = np.where(good, smooth(2.5) / np.maximum(smooth(14), 1e-12) - 1, np.nan)
    # radial profiles
    ang = np.radians(np.arange(360)); rs = np.arange(o['rmin'], o['rmax'] + 1, 1.0)
    prof = np.zeros((360, len(rs))); cover = np.zeros(360)
    raw = np.zeros((360, len(rs)))
    for k in range(360):
        vals = []
        for da in np.radians(np.linspace(-3, 3, 7)):
            px = half + rs * np.cos(ang[k] + da); py = half + rs * np.sin(ang[k] + da)
            vals.append(ndi.map_coordinates(np.nan_to_num(frac, nan=np.nan), [py, px], order=1, cval=np.nan))
        v = np.nanmean(np.array(vals), 0); cover[k] = np.isfinite(v).mean()
        # gaps: fill by interpolation; then remove slow trends longer than ~2.5 ripple wavelengths (keep the ripples)
        fin = np.isfinite(v); raw[k] = np.interp(rs, rs[fin], v[fin]) if fin.any() else np.zeros_like(rs)
    if o['wave_kpc'] is None:
        # no published spacing: measure it. Average power spectrum of the profiles (slow trend removed), strongest
        # spacing between 8" (and 2 kpc) and half the range read; then period = spacing / sound speed
        span = len(rs); d = raw - ndi.gaussian_filter1d(raw, span / 4, axis=1, mode='nearest')
        pw = (np.abs(np.fft.rfft(d * np.hanning(span), 4 * span, axis=1)) ** 2).mean(0)
        lamf = 4 * span / np.maximum(np.arange(len(pw)), 1e-9)
        # gas is lumpier at bigger sizes (power falls roughly as 1/frequency); multiply by frequency to even that out,
        # so the peak is the spacing that stands out, not simply the biggest allowed
        pw = pw * np.arange(len(pw))
        okl = (lamf >= max(8, 2 / o['kpc_per_arcsec'])) & (lamf <= span / 3)
        lam_as = lamf[okl][np.argmax(pw[okl])]
        o['wave_kpc'] = round(float(lam_as * o['kpc_per_arcsec']), 2)
        o['period_yr'] = float(o['wave_kpc'] * KPC / (o['cs_kms'] * 1e3) / YR)
        print(f"  {o['id']}: strongest spacing {lam_as:.0f}\" = {o['wave_kpc']} kpc, one per {o['period_yr'] / 1e6:.1f} Myr")
    lam = o['wave_kpc'] / o['kpc_per_arcsec']
    for k in range(360):
        prof[k] = raw[k] - ndi.gaussian_filter1d(raw[k], lam * 0.9, mode='nearest')
    # volume scale set by the ripples, not the bright core or bubbles (those clip at the int8 limit)
    clip = np.percentile(np.abs(prof), 97)
    q = np.clip(np.round(prof / clip * 127), -127, 127).astype(np.int8)
    q.tofile(f"out_bh/{o['id']}.prof")
    # the picture: fractional residual, -clip..+clip -> dark violet .. white; point sources neutral, uncovered dark
    v = np.clip(np.nan_to_num(frac, nan=0) / clip, -1, 1) * 0.5 + 0.5
    rgb = np.stack([v ** 1.2, v ** 1.8 * 0.85, 0.25 + 0.75 * v ** 0.9], -1) * np.where(cov, 1, 0.08)[..., None]
    Image.fromarray((rgb[::-1] * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(f"out_bh/{o['id']}.jpg", quality=88)
    sec_per_arcsec = o['kpc_per_arcsec'] * KPC / (o['cs_kms'] * 1e3)
    return dict({k: o[k] for k in ('id', 'name', 'galaxy', 'obsids', 'kpc_per_arcsec', 'cs_kms', 'wave_kpc', 'period_yr',
                                   'rmin', 'rmax', 'dist', 'ref', 'note', 'kind')}, kT=o.get('kT'),
                n=len(rs), secPerArcsec=sec_per_arcsec, clipFrac=round(float(clip), 4), cover=round(float(cover.mean()), 3),
                imgHalfArcsec=half)

if __name__ == '__main__':
    os.makedirs('out_bh', exist_ok=True)
    only = sys.argv[1:]
    out = [build(o) for o in BH if not only or o['id'] in only]
    old = {m['id']: m for m in json.load(open('out_bh/meta.json'))['objects']} if only and os.path.exists('out_bh/meta.json') else {}
    old.update({m['id']: m for m in out})
    json.dump({'source': 'Chandra X-ray Center archive (public); method after NASA/CXC 2022 Perseus sonification',
               'objects': [old[o['id']] for o in BH if o['id'] in old]}, open('out_bh/meta.json', 'w'), indent=1)
    for m in out: print(m['id'], 'profiles', m['n'], 'samples, ripple amplitude ±%.1f%%' % (m['clipFrac'] * 100), 'cover', m['cover'])
