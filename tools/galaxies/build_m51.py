"""M51, the Whirlpool Galaxy, as a 3D structure built from its photograph, plus the real supernovae seen in it.

OBSERVED  - the photograph: DSS2 red, blue and IR plates via NASA SkyView, 1024 px over 0.25 deg (0.88"/px).
          - positions of NGC 5194/5195, SN 1994I, SN 2005cs, SN 2011dh, AT 2019abn: NED, each with its refcode.
          - supernova types, discovery dates and peak magnitudes: their Wikipedia articles (which cite IAUCs/ATels).
          - distance: NED-D, median of the published redshift-independent distances to M51.
INFERRED  - deprojection: the disk is turned face-on using inclination 22 deg, position angle 173 deg
            (PAWS: Colombo et al. 2014, ApJ 784, 3). Each pixel's light becomes stars at that place in the disk.
          - star-forming regions: compact knots that are bluer than their surroundings (young massive stars).
            Inferred from colour only, not from spectra.
ARTISTIC  - the disk's thickness (a photo can't show it): exponential, scale height 0.3 kpc, thicker bulge.
          - NGC 5195's depth: placed 2 kpc behind M51's disk plane (it is known to lie behind the tidal arm,
            the exact depth isn't measured here).
For events (PROCEDURAL, chosen in the browser): sampling points for core-collapse supernovae weighted by
young (blue-excess) light, and for Type Ia by old (red/IR) light.
Outputs (out_m51/): stars.bin (float32 x 7: x, y, z kpc in the disk frame; r, g, b; weight), meta.json."""
import json, os, re
import numpy as np
from astropy.io import fits
from scipy import ndimage as ndi
os.makedirs('out_m51', exist_ok=True)
D = 'm51/'
rng = np.random.default_rng(51)

def ned(name):
    j = json.load(open(f'{D}ned_{name}.json'))['Preferred']
    return dict(ra=j['Position']['RA'], dec=j['Position']['Dec'], ref=j['Position']['RefCode'], ned=j['Name'])
C5194, C5195 = ned('NGC_5194'), ned('NGC_5195')
# distance: NED-D median
t = re.sub(r'<[^>]+>', ' ', open(f'{D}nedd.html').read())
m = re.search(r'Median\s+([\d.]+)\s+([\d.]+)', t)
mod_med, dist_mpc = float(m.group(1)), float(m.group(2))
nref = len(re.findall(r'\b\d{4}[A-Za-z&.]+\S*\d+[A-Z]\b', t))
KPC_PER_ARCSEC = dist_mpc * 1000 * np.pi / (180 * 3600)
INC, PA = np.radians(22.0), np.radians(173.0)

# ---- the photograph ----
bands = {k: fits.open(f'{D}m51_{k}.fits')[0].data.astype(np.float64) for k in 'rbi'}
hdr = fits.open(f'{D}m51_r.fits')[0].header
N = bands['r'].shape[0]
scale = abs(hdr['CDELT1']) * 3600 if 'CDELT1' in hdr else 0.25 * 3600 / N   # arcsec per pixel
ra0, dec0 = hdr['CRVAL1'], hdr['CRVAL2']
cpx, cpy = hdr['CRPIX1'] - 1, hdr['CRPIX2'] - 1
def sky_offset(ra, dec):
    """arcsec east, north of the image centre"""
    return (ra - ra0) * np.cos(np.radians(dec0)) * 3600, (dec - dec0) * 3600
def to_pix(ra, dec):
    e, n = sky_offset(ra, dec)
    return cpx - e / scale, cpy + n / scale            # RA grows to the left in a north-up image
def to_disk(east, north):
    """sky offsets (arcsec from NGC 5194's centre) -> face-on disk coordinates (kpc). x along the major axis."""
    # rotate so the major axis (position angle PA, east of north) is x
    xm = east * np.sin(PA) + north * np.cos(PA)
    ym = -east * np.cos(PA) + north * np.sin(PA)
    return xm * KPC_PER_ARCSEC, ym / np.cos(INC) * KPC_PER_ARCSEC

stretch = lambda a, lo, hi: np.clip(np.arcsinh(np.clip(a - lo, 0, None) / (hi - lo) * 10) / np.arcsinh(10), 0, 1)
bg = {k: np.percentile(a, 30) for k, a in bands.items()}
yy, xx = np.mgrid[:N, :N].astype(np.float64)
gx, gy = to_pix(C5194['ra'], C5194['dec'])
hx, hy = to_pix(C5195['ra'], C5195['dec'])
# balance plates on stars in the outer field, then natural colour (as for the Messier pictures)
outer = np.hypot(xx - N / 2, yy - N / 2) > 0.42 * N
norm = {}
for k, a in bands.items():
    s = np.percentile(a[outer], 99.7) - bg[k]
    norm[k] = (a - bg[k]) / s
hi = np.percentile(np.maximum(norm['r'], norm['b']), 99.9)
R_, B_ = stretch(norm['r'], 0, hi), stretch(norm['b'], 0, hi)
rgb = np.stack([R_, 0.35 * R_ + 0.65 * B_, B_], -1)
lum = np.clip(norm['r'] + norm['b'], 0, None)

# masks: the galaxy (inside 6.5' of the centre, deprojected), the companion, and field stars (point-like, not galaxy)
e_off, n_off = (gx - xx) * scale, (yy - gy) * scale
dx, dy = to_disk(e_off, n_off)
rdisk = np.hypot(dx, dy)
comp = np.hypot((xx - hx) * scale, (yy - hy) * scale) < 70
smooth = ndi.gaussian_filter(lum, 3)
pointy = (lum - smooth) > 4 * np.std(lum[outer] - smooth[outer])
stars_mask = pointy & (rdisk > 2.0) & ~comp & (ndi.gaussian_filter(lum, 12) < np.percentile(lum, 85))   # isolated foreground stars
gal = ((rdisk < 13.5) | comp) & ~stars_mask

# ---- sample star particles where the light is ----
# weight: light above the sky, smoothed a little (noise mustn't count as galaxy), emphasised so arms stand out
lum_s = ndi.gaussian_filter(lum, 1.5)
sky = np.percentile(lum_s[outer], 75); noise = np.std(lum_s[outer])
gal &= ndi.gaussian_filter(lum, 6) > sky + 2.0 * noise
w = np.where(gal, np.clip(lum_s - sky - 1.0 * noise, 0, None), 0) ** 1.4
w /= w.sum()
NP = 90000
idx = rng.choice(w.size, NP, p=w.ravel())
py, px = np.unravel_index(idx, w.shape)
px = px + rng.random(NP) - 0.5; py = py + rng.random(NP) - 0.5
e_s, n_s = (gx - px) * scale, (py - gy) * scale
X, Y = to_disk(e_s, n_s)
R = np.hypot(X, Y)
iscomp = comp[np.clip(py.round().astype(int), 0, N - 1), np.clip(px.round().astype(int), 0, N - 1)]
# thickness (assumed): thin exponential disk, thicker bulge inside 1 kpc
hz = np.where(R < 1.0, 0.6 * (1 - R) + 0.3, 0.3)
Z = rng.laplace(0, hz / np.sqrt(2), NP)
# the companion is a separate puffy galaxy: keep its sky position, give it depth 2 kpc behind and a round spread
cx_, cy_ = to_disk((gx - hx) * scale, (hy - gy) * scale)
Z = np.where(iscomp, -2.0 + rng.normal(0, 0.8, NP), Z)
col = rgb[np.clip(py.round().astype(int), 0, N - 1), np.clip(px.round().astype(int), 0, N - 1)]
wt = w.ravel()[idx] / w.max()
stars = np.column_stack([X, Y, Z, col, wt]).astype('<f4')
stars.tofile('out_m51/stars.bin')

# ---- star-forming regions: compact knots bluer than their surroundings ----
blue_x = ndi.gaussian_filter(B_ - R_ * 0.9, 1.2) - ndi.gaussian_filter(B_ - R_ * 0.9, 8)
bright = ndi.gaussian_filter(lum, 1.2) - ndi.gaussian_filter(lum, 8)
score = np.where(gal & ~comp & (rdisk > 1.2) & ~pointy, blue_x * np.clip(bright, 0, None), 0)
peaks = (score == ndi.maximum_filter(score, 9)) & (score > np.percentile(score[gal], 99.3))
ky, kx = np.nonzero(peaks)
order = np.argsort(-score[ky, kx])[:140]
ky, kx = ky[order], kx[order]
KX, KY = to_disk((gx - kx) * scale, (ky - gy) * scale)
knots = [dict(x=round(float(a), 3), y=round(float(b), 3), s=round(float(c / score[ky[0], kx[0]]), 3)) for a, b, c in zip(KX, KY, score[ky, kx])]

# ---- where procedural supernovae may happen ----
young = np.where(gal & ~comp, np.clip(ndi.gaussian_filter(B_ - 0.8 * R_, 2), 0, None) * np.clip(lum, 0, None), 0).ravel()
old = np.where(gal, np.clip(ndi.gaussian_filter(np.clip(norm['i'], 0, None), 2), 0, None), 0).ravel()
def sites(wt, n):
    wt = wt / wt.sum(); j = rng.choice(wt.size, n, p=wt)
    sy, sx = np.unravel_index(j, (N, N)); sx = sx + rng.random(n) - 0.5; sy = sy + rng.random(n) - 0.5
    a, b = to_disk((gx - sx) * scale, (sy - gy) * scale)
    isc = comp[np.clip(sy.round().astype(int), 0, N - 1), np.clip(sx.round().astype(int), 0, N - 1)]
    z = np.where(isc, -2.0 + rng.normal(0, 0.6, n), rng.laplace(0, 0.15, n))
    return np.round(np.column_stack([a, b, z]), 3).tolist()
cc_sites, ia_sites = sites(young, 3000), sites(old, 3000)

# ---- the real transients ----
SN = [('SN_1994I', 'SN 1994I', 'Ic', '1994-04-02', 12.91, 'Core collapse of a star stripped of both its hydrogen and helium envelopes.', 'https://en.wikipedia.org/wiki/SN_1994I'),
      ('SN_2005cs', 'SN 2005cs', 'II-P', '2005-06', 14.5, 'Core collapse of a red supergiant of about 7–13 solar masses; its progenitor star was found in earlier Hubble images.', 'https://en.wikipedia.org/wiki/SN_2005cs'),
      ('SN_2011dh', 'SN 2011dh', 'IIb', '2011-05-31', 12.1, 'Core collapse of a yellow supergiant that had lost most of its hydrogen envelope; a candidate progenitor was found in Hubble images.', 'https://en.wikipedia.org/wiki/SN_2011dh'),
      ('AT_2019abn', 'AT 2019abn', 'LRN', '2019-01-22', None, 'Not a supernova: a "supernova impostor", later identified as a luminous red nova, probably two stars merging.', 'https://en.wikipedia.org/wiki/Whirlpool_Galaxy')]
observed = []
for key, name, typ, date, peak, what, url in SN:
    p = ned(key)
    e, n = sky_offset(p['ra'], p['dec']); e0, n0 = sky_offset(C5194['ra'], C5194['dec'])
    x, y = to_disk(e - e0, n - n0)
    observed.append(dict(name=name, type=typ, date=date, peakMag=peak, what=what, wiki=url, ra=p['ra'], dec=p['dec'], posRef=p['ref'],
                         x=round(float(x), 3), y=round(float(y), 3), z=0.0))
    print(f'{name:11s} {typ:5s} {date}  disk ({x:6.2f}, {y:6.2f}) kpc, R = {np.hypot(x, y):5.2f} kpc   pos {p["ref"]}')

meta = dict(
    name='M51', distMpc=dist_mpc, distModulus=mod_med, distSource='NED-D median of published redshift-independent distances',
    kpcPerArcsec=KPC_PER_ARCSEC, inclination=22.0, positionAngle=173.0, orientationRef='Colombo et al. 2014, ApJ 784, 3 (PAWS)',
    centre=C5194, companion=dict(**C5195, x=round(float(cx_), 3), y=round(float(cy_), 3), z=-2.0),
    nStars=NP, stride=7, knots=knots, ccSites=cc_sites, iaSites=ia_sites, observed=observed,
    provenance=dict(
        photo='OBSERVED: DSS2 red/blue/IR plates via NASA SkyView',
        layout='INFERRED: the photo deprojected with i = 22°, PA = 173° (Colombo et al. 2014)',
        thickness='ARTISTIC: disk scale height 0.3 kpc and bulge assumed; a photograph has no depth',
        companionDepth='ARTISTIC: NGC 5195 placed 2 kpc behind the disk plane',
        knots='INFERRED: compact knots bluer than their surroundings, taken as young star-forming regions (colour only)',
        sites='PROCEDURAL: core-collapse sites follow young (blue) light, Type Ia sites follow old (red/IR) light'),
    credit='Photo: DSS2 via NASA SkyView. Positions and distances: NASA/IPAC Extragalactic Database (NED). Orientation: Colombo et al. 2014. Supernova details: Wikipedia.')
json.dump(meta, open('out_m51/meta.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(f'distance {dist_mpc} Mpc (NED-D median), {KPC_PER_ARCSEC * 1000:.1f} pc/arcsec; stars {NP}, knots {len(knots)}, companion at ({cx_:.2f}, {cy_:.2f}) kpc')
print('stars.bin', os.path.getsize('out_m51/stars.bin') // 1024, 'KB; meta', os.path.getsize('out_m51/meta.json') // 1024, 'KB')
