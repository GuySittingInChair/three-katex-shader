"""The Messier catalogue, in depth.
Facts per object: Wikipedia, 'Messier object' list (distance in thousands of light-years with its range, type,
constellation, apparent magnitude, apparent size, position) and each object's article summary (CC BY-SA 4.0).
Pictures: Digitized Sky Survey 2 (blue, red and infrared photographic plates, 1980s-90s), via NASA SkyView, combined
here into natural colour: R = red, G = 0.35 red + 0.65 blue (so hydrogen glow stays red, not orange), B = blue, each band asinh-stretched between its sky level and its 99.8th
percentile, colour smoothed and brightness kept sharp (the plates are grainy in colour).
Derived: true size = distance x apparent major axis.
Outputs (out_messier/): meta.json, atlas.jpg (11 x 10 tiles of 192 px), img/mNNN.jpg (512 px, for the info card)."""
import json, os, re
import numpy as np
from astropy.io import fits
from scipy import ndimage as ndi
from PIL import Image
os.makedirs('out_messier/img', exist_ok=True)
D = 'messier/'
rows = json.load(open(D + 'messier_raw.json'))
summ = json.load(open(D + 'summaries.json'))
fov = {int(k): v for k, v in json.load(open(D + 'fov.json')).items()}

def major_arcmin(s):
    s = s.replace('′', "'").replace('″', '"')
    vals = [float(n) * (60 if u == '°' else 1 / 60 if u == '"' else 1) for n, u in re.findall(r'([\d.]+)\s*([°\'"])', s)]
    return max(vals) if vals else None

def group(t):
    t = t.lower()
    if 'galaxy' in t: return 'galaxy'
    if 'globular' in t: return 'globular'
    if 'planetary' in t: return 'planetary'
    if 'supernova' in t: return 'remnant'
    if 'nebula' in t or 'h ii' in t: return 'nebula'
    if 'open cluster' in t: return 'open'
    return 'other'

def stretch(a, lo, hi):
    return np.clip(np.arcsinh(np.clip(a - lo, 0, None) / (hi - lo) * 10) / np.arcsinh(10), 0, 1)

def balance(bands):
    """Stretch the plates together so stars come out white and real colour differences (red hydrogen glow, blue
    reflection nebulae, yellow galaxy cores) survive: each plate is scaled by its own sky level and the brightness of
    the stars in the outer part of the field (mostly sky and stars, not the object), then all share one asinh stretch."""
    yy, xx = np.mgrid[:512, :512]
    outer = np.hypot(yy - 255.5, xx - 255.5) > 200
    norm = []
    for a in bands:
        lo = np.percentile(a, 25)
        sc = np.percentile(a[outer], 99.7) - np.percentile(a[outer], 25)
        norm.append((a - lo) / max(sc, 1e-6))
    hi = np.percentile(np.max(norm, axis=0), 99.8)
    return [stretch(n, 0.0, max(hi, 1e-3)) for n in norm]

TILE, COLS = 192, 11
DSS1_ONLY = {16, 31, 37, 45, 97, 106, 108}
atlas = np.zeros((TILE * 10, TILE * COLS, 3), np.uint8)
out = []
for x in rows:
    m = x['m']
    if m in DSS1_ONLY:
        # these fields cross DSS2 plate joins (steps or glows in every band) or have trails: the older DSS1 (POSS-I)
        # plates cover them cleanly. Two colours only: R = red plate, B = blue plate, G = their mean.
        rr, bb = (fits.open(f'{D}dss1/m{m:03d}_{k}.fits')[0].data.astype(np.float32) for k in ('r', 'b'))
        c2 = balance([rr, bb])
        ch = [c2[0], 0.35 * c2[0] + 0.65 * c2[1], c2[1]]
        survey = 'DSS1 red + blue'
    else:
        survey = None
    bands = []
    for b in (('i', 'r', 'b') if survey is None else ()):
        f = f'{D}dss/m{m:03d}_{b}.fits'
        a = fits.open(f)[0].data if os.path.exists(f) else None
        a = a.astype(np.float32) if a is not None and a.ndim == 2 else None
        # a plate that only partly covers the field comes back with a flat block of zeros/minimum: treat it as missing
        if a is not None:
            # also flat, textureless patches (plate edges padded with a constant): 16 px blocks with no variation at all
            blk = a[:512 // 16 * 16, :512 // 16 * 16].reshape(32, 16, 32, 16).std(axis=(1, 3))
            if np.mean(a <= np.nanmin(a) + 1e-6) > 0.03 or np.mean(blk < 1e-3 * (np.percentile(a, 99) - np.percentile(a, 1) + 1e-6)) > 0.02: a = None
        bands.append(a)
    # some southern fields have no DSS2 Blue plate: those were fetched from DSS1 Blue (same file name, survey
    # recorded below); where neither exists the red plate stands in, so the colour there is IR vs red only
    if survey is None:
        hdr_b = fits.open(f'{D}dss/m{m:03d}_b.fits')[0].header
        blue = 'none' if bands[2] is None else ('DSS1' if 'Survey 1' in str(hdr_b.get('SURVEY', '')) else 'DSS2')
        survey = {'DSS2': 'DSS2 red + blue', 'DSS1': 'DSS2 red, DSS1 blue', 'none': 'DSS2 red only (no blue plate here)'}[blue]
        ref = next(a for a in (bands[1], bands[0], bands[2]) if a is not None)
        bands = [a if a is not None else ref for a in bands]
        ch = []
    if survey and survey.startswith('DSS2'):
        ch = balance([np.nan_to_num(a, nan=np.nanmedian(a)) for a in bands])
    # natural colour: red plate -> red (it records hydrogen's red glow), blue plate -> blue, green mostly from the blue plate.
    # (The infrared plate, where there is one, isn't used for colour: as green or red it turns nebulae cyan.)
    if len(ch) == 3 and survey and survey.startswith('DSS2'):
        ch = [ch[1], 0.35 * ch[1] + 0.65 * ch[2], ch[2]]   # (balance() kept the bands' order: IR, red, blue)
    rgb = np.stack(ch, -1)[::-1]                           # FITS y up -> image y down
    lum = rgb.mean(-1, keepdims=True)
    chroma = rgb / np.maximum(lum, 1e-3)
    chroma = np.stack([ndi.gaussian_filter(chroma[..., k], 2.0) for k in range(3)], -1)
    chroma = np.clip(1 + (chroma - 1) * 1.25, 0.2, 2.2)          # plates are balanced on the stars, so colour can be lifted
    rgb = np.clip(lum * chroma, 0, 1) ** 0.9
    img = Image.fromarray((rgb * 255).astype(np.uint8))
    img.save(f'out_messier/img/m{m:03d}.jpg', quality=80)
    t = np.asarray(img.resize((TILE, TILE), Image.LANCZOS))
    r0, c0 = divmod(m - 1, COLS)
    atlas[r0 * TILE:(r0 + 1) * TILE, c0 * TILE:(c0 + 1) * TILE] = t
    maj = major_arcmin(x['dims'])
    ly = x['kly'] * 1000
    size = ly * np.radians(maj / 60) if maj else None
    g = group(x['type'])
    s = summ[str(m)]
    out.append(dict(m=m, name=x['common'], ngc=x['ngc'], type=x['type'], group=g, dist=x['dist'], ly=ly, const=x['const'],
                    mag=float(re.sub(r'[^\d.]', '', x['mag']) or 'nan') if re.search(r'\d', x['mag']) else None,
                    dims=x['dims'], survey=survey, majArcmin=maj, sizeLy=size, ra=x['ra'], dec=x['dec'], fov=fov[m],
                    about=s['extract'].strip(), wiki=s['page'], wikiTitle=s['title']))
Image.fromarray(atlas).save('out_messier/atlas.jpg', quality=86)
meta = dict(n=len(out), tile=TILE, cols=COLS, objects=out,
            credit='Pictures: Digitized Sky Survey 2 (STScI; Palomar/UK Schmidt plates) via NASA SkyView. Facts and summaries: Wikipedia (CC BY-SA 4.0).')
json.dump(meta, open('out_messier/meta.json', 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(Counter(o['group'] for o in out))
print('sizes', [(o['m'], round(o['sizeLy'] or 0)) for o in out if o['m'] in (1, 13, 31, 42, 45, 57, 87)])
print('meta', os.path.getsize('out_messier/meta.json') // 1024, 'KB; atlas', os.path.getsize('out_messier/atlas.jpg') // 1024, 'KB; images',
      sum(os.path.getsize('out_messier/img/' + f) for f in os.listdir('out_messier/img')) // 1024, 'KB')
