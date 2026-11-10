"""Build the Sky Zoom sketch's data: one stack of images and star lists, all centred on one galaxy in the
JADES deep field and all in the same gnomonic (TAN) projection, so they line up as the view zooms.

Inputs (sky/): gaia_wide.csv (G < 8.5 within 62 deg), gaia_mid.csv (G < 12 within 15 deg), from the Gaia
DR3 archive; dss_{4,1,q}_{b,r,i}.fits, DSS2 Blue/Red/IR from NASA SkyView, 1024 px, 4 deg / 1 deg /
0.25 deg; and the JADES colour image from build_deepfield.py (jades/rgb8.npy, 3200 px, 0.03"/px).
Outputs (out_zoom/): stars.bin (float32 xi, eta, G, bp_rp; radians on the tangent plane), level images,
meta.json.
"""
import json, os
import numpy as np
from PIL import Image
from astropy.io import fits

os.makedirs('out_zoom', exist_ok=True)
RA0, DEC0 = 53.1661861, -27.7875755          # JADES 207... (deep-field index 13), z ~ 1.08
r0, d0 = np.deg2rad(RA0), np.deg2rad(DEC0)

def tan_plane(ra, dec):
    a, d = np.deg2rad(ra), np.deg2rad(dec)
    cc = np.sin(d0) * np.sin(d) + np.cos(d0) * np.cos(d) * np.cos(a - r0)
    xi = np.cos(d) * np.sin(a - r0) / cc
    eta = (np.cos(d0) * np.sin(d) - np.sin(d0) * np.cos(d) * np.cos(a - r0)) / cc
    return xi, eta, cc

# ---------- stars ----------
rows = []
for f, gmax in (('sky/gaia_wide.csv', 8.5), ('sky/gaia_mid.csv', 12), ('sky/gaia_near.csv', 16)):
    a = np.genfromtxt(f, delimiter=',', skip_header=1, filling_values=np.nan)
    rows.append(a)
s = np.concatenate(rows)
s = s[np.unique(np.round(s[:, :2], 6), axis=0, return_index=True)[1]]   # the two lists overlap
xi, eta, cc = tan_plane(s[:, 0], s[:, 1])
keep = cc > 0.2
st = np.stack([xi, eta, s[:, 2], np.nan_to_num(s[:, 3], nan=0.8)], -1)[keep].astype('<f4')
st = st[np.argsort(st[:, 2])]
st.tofile('out_zoom/stars.bin')
print('stars', len(st))

# ---------- DSS2 colour levels ----------
from scipy import ndimage as ndi
def stretch(a, lo, hi):
    return np.clip((np.arcsinh((a - lo) / (hi - lo) * 8) / np.arcsinh(8)), 0, 1)
levels = []
# (the 4-degree DSS level is a patchwork of plates; Gaia stars to G = 16.5 cover that scale instead)
for key, size in (('1', 1.0), ('q', 0.25)):
    bands = []
    for b in ('i', 'r', 'b'):
        h = fits.open(f'sky/dss_{key}_{b}.fits')[0]
        a = h.data.astype(np.float32)
        a = a - ndi.median_filter(ndi.zoom(a, 1 / 8, order=1), size=9).repeat(8, 0).repeat(8, 1)[:a.shape[0], :a.shape[1]]
        lo, hi = np.percentile(a, 35), np.percentile(a, 99.85)
        bands.append(stretch(a, lo, hi))
    rgb = np.stack(bands, -1)[::-1]                                      # FITS y up → image y down
    # keep brightness sharp, smooth the colour (photographic plates are noisy in colour)
    lum = rgb.mean(-1, keepdims=True)
    chroma = rgb / np.maximum(lum, 1e-3)
    chroma = np.stack([ndi.gaussian_filter(chroma[..., k], 2.5) for k in range(3)], -1)
    rgb = np.clip(lum * chroma, 0, 1)
    Image.fromarray((rgb ** 0.95 * 255).astype(np.uint8)).save(f'out_zoom/dss_{key}.jpg', quality=88)
    levels.append(dict(file=f'dss_{key}.jpg', size=np.deg2rad(size), cx=0.0, cy=0.0, source='DSS2 (photographic, 1980s–90s) via NASA SkyView'))

# ---------- JADES levels ----------
rgb8 = np.load('jades/rgb8.npy')                                       # y down, crop of 3200 px
PIX = np.deg2rad(0.0299947 / 3600)
cxi, ceta, _ = tan_plane(53.16244139, -27.79139054)                   # centre of the 3200 px crop
Image.fromarray(rgb8).resize((2048, 2048), Image.LANCZOS).save('out_zoom/jades_96.jpg', quality=88)
levels.append(dict(file='jades_96.jpg', size=3200 * PIX, cx=float(cxi), cy=float(ceta), source='JWST NIRCam, JADES'))
# the galaxy itself, at Webb's full resolution: 640 px = 19.2"
tx, ty = 1198, 1158                                                    # its centre in the crop (x right, y down)
N = 640
crop = rgb8[ty - N // 2: ty + N // 2, tx - N // 2: tx + N // 2]
Image.fromarray(np.ascontiguousarray(crop)).save('out_zoom/jades_19.jpg', quality=92)
# centre of that crop relative to the target: crop centres on the galaxy's stamp centre, ~0 offset
levels.append(dict(file='jades_19.jpg', size=N * PIX, cx=float(cxi + (-(tx - 1599.5) * PIX)), cy=float(ceta + (-(ty - 1599.5) * PIX)), source='JWST NIRCam, JADES (full resolution)'))
for L in levels: print(L['file'], 'size', L['size'], 'centre', L['cx'], L['cy'])

meta = dict(
    target=dict(ra=RA0, dec=DEC0, z=1.08, zlo=1.048, zhi=1.131, name='JADES DR2 deep-field galaxy, photometric z'),
    stars=dict(count=int(len(st)), fields=['xi', 'eta', 'G', 'bp_rp']),
    levels=levels,
    credit='Stars: ESA/Gaia/DPAC. Wide images: Digitized Sky Survey 2 (STScI, AAO/UKSTU), via NASA SkyView. '
           'Deep field: NASA, ESA, CSA, STScI, JADES Collaboration.',
)
json.dump(meta, open('out_zoom/meta.json', 'w'), indent=0)
for fn in sorted(os.listdir('out_zoom')): print(fn, os.path.getsize(f'out_zoom/{fn}') // 1024, 'KB')
