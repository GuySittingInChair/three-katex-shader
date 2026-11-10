"""Build the Deep Field sketch's data from JADES DR2 (GOODS-S deep) and JADES DR4 NIRSpec.

Inputs (jades/): f115w/f200w/f444w.npy and seg.npy (3200x3200 crop at mosaic x0=6113, y0=16843,
FITS orientation, y up), catalog.fits (JADES DR2 photometry v2.0), specz.fits (DR4 NIRSpec v1.2).
Outputs (out/): atlas.jpg (every object cut out along its segmentation outline, premultiplied on
black so it can be drawn additively), sky.jpg (what is left: sky noise and faint halos), and
galaxies.bin + meta.json (one record per object).

Image orientation: north up, east left (the mosaic's native orientation). Pixel 0.03".
"""
import json, os
import numpy as np
from PIL import Image
from astropy.io import fits
from scipy import ndimage as ndi

X0, Y0, N = 6113, 16843, 3200
PIX_ARCSEC = 0.0299947
SKY = 2048            # sky image size
ATLAS = 4096          # atlas width (height trimmed to what is used)
CAP = 112             # longest stamp side in the atlas (bigger galaxies are downsampled)
os.makedirs('out', exist_ok=True)

# ---------- colour image (same stretch as the preview) ----------
r, g, b = (np.load(f'jades/{k}.npy') for k in ('f444w', 'f200w', 'f115w'))
valid = (r != 0) & (g != 0) & (b != 0)
valid = ndi.binary_erosion(valid, iterations=6)          # soft edge where a filter has no data
r, g, b = r * 1.0, g * 1.0, b * 1.35
I = (r + g + b) / 3
Q, S = 9.0, 0.035
with np.errstate(invalid='ignore', divide='ignore'):
    f = np.where(I > 0, np.arcsinh(Q * I / S) / Q / I, 0)
rgb = np.clip(np.stack([r * f, g * f, b * f], -1) - 0.004, 0, None)
m = rgb.max(-1, keepdims=True)
rgb = np.where(m > 1, rgb / np.maximum(m, 1e-9), rgb)
rgb = np.clip(rgb, 0, 1) ** (1 / 1.15)
rgb *= ndi.gaussian_filter(valid.astype(np.float32), 4)[..., None]

seg = np.load('jades/seg.npy')

# ---------- catalog ----------
cat = fits.open('jades/catalog.fits', memmap=True)
SZ, PZ, KR = cat['SIZE'].data, cat['PHOTOZ'].data, cat['KRON'].data
ids_in = np.unique(seg); ids_in = ids_in[ids_in > 0]
sel = np.isin(SZ['ID'], ids_in)
ID = SZ['ID'][sel].astype(np.int64)
RA, DEC = SZ['RA'][sel], SZ['DEC'][sel]
zph, zlo, zhi = PZ['EAZY_z_a'][sel], PZ['EAZY_l68'][sel], PZ['EAZY_u68'][sel]
flux = np.nan_to_num(KR['F200W_KRON'][sel])                # nJy
gini, fwhm = SZ['GINI'][sel], SZ['FWHM'][sel]

# spectroscopic redshifts (grade A/B), matched within 0.25"
sp = fits.open('jades/specz.fits')['Obs_info'].data
good = (sp['z_Spec'] > 0) & np.isin(sp['z_Spec_flag'], ['A', 'B'])
sra, sdec, sz = sp['RA_TARG'][good], sp['DEC_TARG'][good], sp['z_Spec'][good]
zsp = np.full(len(ID), -1.0)
cosd = np.cos(np.deg2rad(DEC.mean()))
for i in range(len(ID)):
    d = np.hypot((sra - RA[i]) * cosd, sdec - DEC[i]) * 3600
    j = np.argmin(d)
    if d[j] < 0.25: zsp[i] = sz[j]

# foreground stars in our galaxy: point-like and bright (they wear Webb's six-point spikes)
star = ((gini > 0.93) & (flux > 3000)) | ((zph < 0.03) & (flux > 300))
z = np.where(zsp > 0, zsp, zph)
z = np.where(star, 0, z)
ok = np.isfinite(z) & (z >= 0)
print('objects', len(ID), 'spec-z', (zsp > 0).sum(), 'stars', star.sum(), 'dropped', (~ok).sum())

# ---------- stamps ----------
slices = ndi.find_objects(seg)
stamps = []
cover = np.zeros((N, N), np.float32)
for i in np.where(ok)[0]:
    sl = slices[ID[i] - 1] if ID[i] - 1 < len(slices) else None
    if sl is None: continue
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    h, w = y1 - y0, x1 - x0
    pad = int(max(3, 0.25 * max(h, w))) + (int(0.6 * max(h, w)) if star[i] else 0)
    y0, y1, x0, x1 = max(0, y0 - pad), min(N, y1 + pad), max(0, x0 - pad), min(N, x1 + pad)
    mine = seg[y0:y1, x0:x1] == ID[i]
    other = (seg[y0:y1, x0:x1] > 0) & ~mine
    if star[i]:
        # a star takes its diffraction spikes with it: every pixel near it that is clearly lit
        lum = rgb[y0:y1, x0:x1].mean(-1)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        near = np.hypot(yy - cy, xx - cx) < 0.5 * min(y1 - y0, x1 - x0)
        a = np.clip((ndi.gaussian_filter(lum, 1.0) - 0.06) / 0.08, 0, 1) * near * ~other
        a = np.maximum(a, ndi.gaussian_filter(ndi.binary_dilation(mine, iterations=3).astype(np.float32), 1.2))
    else:
        a = ndi.binary_dilation(mine, iterations=3) & ~other
        a = ndi.gaussian_filter(a.astype(np.float32), 1.2)
    a = np.where(mine, 1.0, a)
    # fade to nothing over the last few pixels of the box, so no card has a hard square edge
    hh, ww = a.shape
    ey = np.minimum(np.arange(hh), np.arange(hh)[::-1])[:, None]
    ex = np.minimum(np.arange(ww), np.arange(ww)[::-1])[None, :]
    a = a * np.clip(np.minimum(ey, ex) / 4.0, 0, 1)
    cover[y0:y1, x0:x1] = np.maximum(cover[y0:y1, x0:x1], a)
    stamps.append(dict(i=int(i), box=(x0, y0, x1, y1), a=a))

# leftover sky: the image minus everything cut out
sky = rgb * (1 - cover)[..., None]
Image.fromarray((sky[::-1] * 255).astype(np.uint8)).resize((SKY, SKY), Image.LANCZOS).save('out/sky.jpg', quality=88)

# ---------- pack the atlas (shelf packing, tallest first) ----------
for s in stamps:
    x0, y0, x1, y1 = s['box']; w, h = x1 - x0, y1 - y0
    k = min(1.0, CAP / max(w, h))
    s['k'] = k; s['pw'], s['ph'] = max(2, round(w * k)), max(2, round(h * k))
stamps.sort(key=lambda s: -s['ph'])
atlas = np.zeros((ATLAS, ATLAS, 3), np.float32)
x = y = shelf = 0
for s in stamps:
    if x + s['pw'] + 1 > ATLAS: x, y, shelf = 0, y + shelf + 1, 0
    if y + s['ph'] > ATLAS: raise SystemExit('atlas full')
    x0, y0, x1, y1 = s['box']
    tile = rgb[y0:y1, x0:x1] * s['a'][..., None]
    tile = tile[::-1]                                       # y down in images
    if s['k'] < 1:
        tile = np.asarray(Image.fromarray((tile * 255).astype(np.uint8)).resize((s['pw'], s['ph']), Image.LANCZOS)) / 255
    atlas[y:y + s['ph'], x:x + s['pw']] = tile[:s['ph'], :s['pw']]
    s['uv'] = (x, y)
    x += s['pw'] + 1; shelf = max(shelf, s['ph'])
print('atlas used to row', y + shelf, 'of', ATLAS)
AH = 1 << int(np.ceil(np.log2(y + shelf)))
atlas = atlas[:AH]
Image.fromarray((atlas * 255).astype(np.uint8)).save('out/atlas.jpg', quality=88)

# ---------- records ----------
# per object (float32 x 12): cx, cy (image px, y down, 0..N), w, h (image px), u, v, uw, vh (atlas px),
# z, zlo, zhi, flags (1 spec-z, 2 star) ; plus flux and catalog id in meta order
F = 12
rec = np.zeros((len(stamps), F), np.float32)
order = sorted(stamps, key=lambda s: -flux[s['i']])
extra = []
for k, s in enumerate(order):
    i = s['i']; x0, y0, x1, y1 = s['box']
    rec[k] = [(x0 + x1) / 2, N - (y0 + y1) / 2, x1 - x0, y1 - y0, *s['uv'], s['pw'], s['ph'],
              z[i], zlo[i] if zsp[i] <= 0 and not star[i] else z[i], zhi[i] if zsp[i] <= 0 and not star[i] else z[i],
              (1 if zsp[i] > 0 else 0) + (2 if star[i] else 0)]
    extra.append([int(ID[i]), round(float(flux[i]), 1)])
rec.tofile('out/galaxies.bin')
meta = dict(
    source='JADES DR2 GOODS-S deep NIRCam (F444W/F200W/F115W as R/G/B), photometric redshifts EAZY; '
           'spectroscopic redshifts JADES DR4 NIRSpec (grade A/B)',
    credit='NASA, ESA, CSA, STScI, JADES Collaboration',
    size=N, pixArcsec=PIX_ARCSEC, fields=['cx', 'cy', 'w', 'h', 'u', 'v', 'uw', 'vh', 'z', 'zlo', 'zhi', 'flags'],
    count=len(order), atlas=[ATLAS, AH], sky=SKY,
    centre=dict(ra=float(RA.mean()), dec=float(DEC.mean())),
    ids=[e[0] for e in extra], flux=[e[1] for e in extra],
)
json.dump(meta, open('out/meta.json', 'w'), separators=(',', ':'))
for fn in os.listdir('out'): print(fn, os.path.getsize(f'out/{fn}') // 1024, 'KB')
