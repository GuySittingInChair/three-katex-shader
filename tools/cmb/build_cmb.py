"""The cosmic microwave background from Planck (2015 release, Commander component-separated map,
HEALPix nside 1024, 10' beam, Galactic coordinates), via IRSA.
Power spectrum: the cross-spectrum of the two half-mission maps (their noise is independent, so it
cancels), outside the Commander confidence mask (apodised), corrected for the sky fraction, the 10'
beam and the pixel window. Compared with Planck's published 2018 TT spectrum.
Outputs (out_cmb/): sky.png (equirectangular, 2048x1024, Galactic; R = full map, G = l<=20 only,
B = the first peak's band l 150-300; each 0..255 = -400..+400 uK, -250..+250, -150..+150), meta.json."""
import json, os
import numpy as np, healpy as hp
from astropy.io import fits
from PIL import Image
os.makedirs('out_cmb', exist_ok=True)
F = 'cmb/COM_CMB_IQU-commander_1024_R2.02_%s.fits'
def read(name, col):
    h = fits.open(F % name)[1]
    m = np.asarray(h.data[col], dtype=np.float64).ravel()
    return hp.reorder(m, n2r=True)
full = read('full', 'I_STOKES') * 1e6                       # uK
cols = fits.open(F % 'full')[1].columns.names
print('columns', cols)
mask = read('full', 'TMASK') if 'TMASK' in cols else None
NS = 1024
if mask is None:
    # no mask column: cut the Galactic plane |b| < 20 and the brightest residuals
    th, ph = hp.pix2ang(NS, np.arange(hp.nside2npix(NS)))
    mask = (np.abs(90 - np.degrees(th)) > 20).astype(float)
mask = (mask > 0.5).astype(float)
fsky0 = mask.mean()
# apodise: smooth the binary mask with a 2-degree beam and keep the inner part
am = hp.smoothing(mask, fwhm=np.radians(2.0)); am = np.clip((am - 0.5) * 2, 0, 1) * mask
w2 = np.mean(am ** 2)
print('sky kept %.1f%%, apodised w2 %.3f' % (100 * fsky0, w2))
h1, h2 = read('halfmission-1', 'I_STOKES') * 1e6, read('halfmission-2', 'I_STOKES') * 1e6
LMAX = 1500
def prep(m):
    m = m * am
    return hp.remove_dipole(m, gal_cut=0, verbose=False) if False else m - np.sum(m) / np.sum(am) * am
c12 = hp.anafast(prep(h1), prep(h2), lmax=LMAX)
cfull = hp.anafast(prep(full), lmax=LMAX)
ell = np.arange(LMAX + 1)
bl = hp.gauss_beam(np.radians(10 / 60), lmax=LMAX); pl = hp.pixwin(NS)[:LMAX + 1]
win = (bl * pl) ** 2
Cl = c12 / w2 / win; Clfull = cfull / w2 / win
Dl = ell * (ell + 1) * Cl / (2 * np.pi); Dlfull = ell * (ell + 1) * Clfull / (2 * np.pi)
# bins: single l to 30, then 20-wide
edges = list(range(2, 30)) + list(range(30, LMAX - 19, 20))
B = []
for a, b in zip(edges[:-1], edges[1:]):
    s = slice(a, b); l = ell[s]
    d = Dl[s].mean()
    # cosmic variance + finite sky: sigma(C_l) = C_l sqrt(2/((2l+1) fsky)), averaged over the bin
    e = np.sqrt(np.sum((Dl[s] * np.sqrt(2 / ((2 * l + 1) * w2))) ** 2)) / len(l)
    B.append((float(l.mean()), float(d), float(e), float(Dlfull[s].mean())))
B = np.array(B)
P = np.loadtxt('cmb/COM_PowerSpect_CMB-TT-full_R3.01.txt')
# peaks: smooth the l-by-l spectrum with a 40-wide window, take local maxima above l = 100
k = np.ones(41) / 41; sm = np.convolve(Dl, k, mode='same')
peaks = []
for a, b in ((150, 330), (440, 640), (700, 900)):
    j = a + int(np.argmax(sm[a:b])); peaks.append((int(j), float(sm[j])))
# the published points are l by l too: smooth them the same way before reading off their peaks
Dp = np.interp(ell, P[:, 0], P[:, 1]); smp = np.convolve(Dp, k, mode='same')
ppub = []
for a, b in ((150, 330), (440, 640), (700, 900)):
    j = a + int(np.argmax(smp[a:b])); ppub.append((int(j), float(smp[j])))
print('peaks measured', peaks); print('peaks published', ppub)
# ratio to the published spectrum over 30 < l < 1200
s = (B[:, 0] > 30) & (B[:, 0] < 1200)
ref = np.interp(B[s, 0], P[:, 0], P[:, 1])
print('measured / published, 30<l<1200: %.3f +- %.3f' % (np.mean(B[s, 1] / ref), np.std(B[s, 1] / ref) / np.sqrt(s.sum())))
rms = float(np.sqrt(np.mean((full[mask > 0] - full[mask > 0].mean()) ** 2)))
print('rms outside mask %.1f uK' % rms)
# ---- images ----
def band(m, l0, l1):
    alm = hp.map2alm(m, lmax=min(l1, 1500))
    f = np.zeros(min(l1, 1500) + 1); f[l0:l1 + 1] = 1
    return hp.alm2map(hp.almxfl(alm, f), NS, verbose=False) if False else hp.alm2map(hp.almxfl(alm, f), NS)
# fill the masked plane for display with the full map (its centre is still foreground-cleaned)
low = band(full, 2, 20); peak = band(full, 150, 300)
W, H = 2048, 1024
lon = np.linspace(180, -180, W, endpoint=False) - 180 / W * -1          # Galactic longitude, l increasing to the left
lat = np.linspace(90, -90, H, endpoint=False) - 90 / H
LON, LAT = np.meshgrid(lon, lat)
pix = hp.ang2pix(NS, LON, LAT, lonlat=True)
q = lambda m, r: np.clip((m[pix] / r + 1) / 2 * 255, 0, 255).astype(np.uint8)
img = np.stack([q(full, 400), q(low, 250), q(peak, 150)], -1)
Image.fromarray(img).save('out_cmb/sky.png', optimize=True)
mimg = (mask[pix] * 255).astype(np.uint8)
pass  # (mask preview not shipped)
meta = dict(nside=NS, beamArcmin=10, fsky=float(fsky0), w2=float(w2), rms=rms, T0=2.7255,
            bins=dict(l=B[:, 0].round(1).tolist(), D=B[:, 1].round(1).tolist(), e=B[:, 2].round(1).tolist(), Dauto=B[:, 3].round(1).tolist()),
            published=dict(l=P[1::3, 0].tolist(), D=P[1::3, 1].round(1).tolist()), peaks=peaks, peaksPublished=ppub,
            ranges=dict(full=400, low=250, peak=150, lowBand=[2, 20], peakBand=[150, 300]),
            credit='ESA/Planck Collaboration (2015 Commander CMB map; 2018 TT power spectrum), via NASA/IPAC IRSA')
json.dump(meta, open('out_cmb/meta.json', 'w'), separators=(',', ':'))
for f in sorted(os.listdir('out_cmb')): print(f, os.path.getsize('out_cmb/' + f) // 1024, 'KB')
