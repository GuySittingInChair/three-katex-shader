"""Stars around the Sun: every star brighter than V = 6.5 in Hipparcos, and every star with an IAU name.
OBSERVED: position, V magnitude, B−V colour, spectral type (Hipparcos, ESA 1997: public.hipparcos in the Gaia archive);
          parallax (van Leeuwen 2007 re-reduction: public.hipparcos_newreduction); names (IAU WGSN, IAU-CSN list).
INFERRED (approximate, labelled on the page):
  distance d = 1000 / parallax (pc); flagged unreliable when the parallax error is over 20%;
  absolute magnitude M_V = V + 5 log10(parallax / 100 mas)  (no dust correction);
  temperature from B−V (Ballesteros 2012); bolometric correction BC(T) (Flower 1996, as corrected by Torres 2010);
  luminosity L/L☉ = 10^(−0.4 (M_V + BC − 4.74)); radius R/R☉ = sqrt(L) (5772 / T)²;
  for main-sequence stars (luminosity class V) only: mass ≈ L^(1/3.5) (a rough mass–luminosity law) and
  main-sequence lifetime ≈ 10 Gyr × M^−2.5; fate from mass (> 8 M☉: supernova) or, for giants, from the class.
Wikipedia summaries for the named stars (CC BY-SA 4.0), title checked.
Outputs (out_stars/): stars.bin (float32 × 8 per star), named.json."""
import csv, json, math, os, re, time, urllib.request, urllib.parse
import numpy as np
D = 'stars/'
os.makedirs(D + 'wiki', exist_ok=True); os.makedirs('out_stars', exist_ok=True)
UA = {'User-Agent': 'aiship-data-builder/1.0 (offline build of a public sketch)'}
CON = dict(And='Andromeda', Ant='Antlia', Aps='Apus', Aqr='Aquarius', Aql='Aquila', Ara='Ara', Ari='Aries', Aur='Auriga', Boo='Boötes', Cae='Caelum',
  Cam='Camelopardalis', Cnc='Cancer', CVn='Canes Venatici', CMa='Canis Major', CMi='Canis Minor', Cap='Capricornus', Car='Carina', Cas='Cassiopeia',
  Cen='Centaurus', Cep='Cepheus', Cet='Cetus', Cha='Chamaeleon', Cir='Circinus', Col='Columba', Com='Coma Berenices', CrA='Corona Australis',
  CrB='Corona Borealis', Crv='Corvus', Crt='Crater', Cru='Crux', Cyg='Cygnus', Del='Delphinus', Dor='Dorado', Dra='Draco', Equ='Equuleus',
  Eri='Eridanus', For='Fornax', Gem='Gemini', Gru='Grus', Her='Hercules', Hor='Horologium', Hya='Hydra', Hyi='Hydrus', Ind='Indus', Lac='Lacerta',
  Leo='Leo', LMi='Leo Minor', Lep='Lepus', Lib='Libra', Lup='Lupus', Lyn='Lynx', Lyr='Lyra', Men='Mensa', Mic='Microscopium', Mon='Monoceros',
  Mus='Musca', Nor='Norma', Oct='Octans', Oph='Ophiuchus', Ori='Orion', Pav='Pavo', Peg='Pegasus', Per='Perseus', Phe='Phoenix', Pic='Pictor',
  Psc='Pisces', PsA='Piscis Austrinus', Pup='Puppis', Pyx='Pyxis', Ret='Reticulum', Sge='Sagitta', Sgr='Sagittarius', Sco='Scorpius', Scl='Sculptor',
  Sct='Scutum', Ser='Serpens', Sex='Sextans', Tau='Taurus', Tel='Telescopium', Tri='Triangulum', TrA='Triangulum Australe', Tuc='Tucana',
  UMa='Ursa Major', UMi='Ursa Minor', Vel='Vela', Vir='Virgo', Vol='Volans', Vul='Vulpecula')

# ---- IAU names ----
names = {}
for line in open(D + 'IAU-CSN.txt', encoding='utf-8'):
    if line.startswith(('#', '$')) or not line.strip(): continue
    # fixed layout: name (cols 0-17), diacritics (18-35), then whitespace-separated fields
    ascii_name, dia = line[:18].strip(), line[18:36].strip()
    # designation has spaces ('HR 897'): take it by column; read the rest from the right, where the layout is fixed
    f = line.rstrip('\n').split()
    if f and f[-1] == '*': f = f[:-1]
    if len(f) < 12: continue
    desig, hip, con = line[36:49].strip(), f[-5], f[-10]
    if hip == '_' or not hip.isdigit(): continue
    names[int(hip)] = dict(name=dia or ascii_name, ascii=ascii_name, desig=desig, con=CON.get(con, con))
print('IAU names with a HIP number:', len(names))

def tap(q, out):
    if os.path.exists(out): return list(csv.DictReader(open(out)))
    data = urllib.request.urlopen(urllib.request.Request('https://gea.esac.esa.int/tap-server/tap/sync', data=urllib.parse.urlencode(dict(REQUEST='doQuery', LANG='ADQL', FORMAT='csv', MAXREC=20000, QUERY=q)).encode(), headers=UA), timeout=300).read()
    open(out, 'wb').write(data); return list(csv.DictReader(open(out)))
COLS = 'h.hip, h.ra, h.de, h.vmag, h.b_v, h.sptype, h.hd, n.plx, n.e_plx, n.b_v AS bv_new'
rows = {int(r['hip']): r for r in tap(f'SELECT {COLS} FROM public.hipparcos AS h JOIN public.hipparcos_newreduction AS n ON h.hip = n.hip WHERE h.vmag < 6.5', D + 'hip6.csv')}
missing = [h for h in names if h not in rows]
if missing:
    for r in tap(f"SELECT {COLS} FROM public.hipparcos AS h JOIN public.hipparcos_newreduction AS n ON h.hip = n.hip WHERE h.hip IN ({','.join(map(str, missing))})", D + 'hip_named_faint.csv'):
        rows[int(r['hip'])] = r
print('stars', len(rows), 'named found', sum(1 for h in names if h in rows))

# ---- physics ----
def bc(T):
    lt = math.log10(T)
    if lt < 3.70: c = [-0.190537291496456e+05, 0.155144866764412e+05, -0.421278819301717e+04, 0.381476328422343e+03]
    elif lt < 3.90: c = [-0.370510203809015e+05, 0.385672629965804e+05, -0.150651486316025e+05, 0.261724637119416e+04, -0.170623810323864e+03]
    else: c = [-0.118115450538963e+06, 0.137145973583929e+06, -0.636233812100225e+05, 0.147412923562646e+05, -0.170587278406872e+04, 0.788731721804990e+02]
    return sum(a * lt ** i for i, a in enumerate(c))
teff = lambda bv: 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
def lclass(sp):
    sp = sp or ''
    if sp.startswith(('D', 'WD')): return 'WD'
    if re.match(r'^[AF][0-9.]*m', sp): return 'V'      # metallic-line (Am/Fm) stars, like Sirius A, are on the main sequence
    # the luminosity class right after the spectral type: 'A0Vvar' -> V, 'M2Ib' -> Ib, 'K0III' -> III, 'M5.5Ve' -> V
    m = re.search(r'[OBAFGKMC][0-9.]*:?[/-]?[0-9.]*\s*(Iab|Ia|Ib|III|II|IV|V|I)(?![IV])', sp)
    return m.group(1) if m else None
def stats(r):
    v, bv, plx, eplx = float(r['vmag']), (r['bv_new'] or r['b_v']), float(r['plx'] or 0), float(r['e_plx'] or 99)
    out = dict(hip=int(r['hip']), ra=float(r['ra']), dec=float(r['de']), v=v, sp=(r['sptype'] or '').strip(), hd=r['hd'])
    out['bv'] = float(bv) if bv not in ('', None) else None
    if plx > 0:
        out.update(plx=plx, eplx=eplx, pc=1000 / plx, ly=3261.56 / plx, reliable=eplx / plx < 0.2)
        if out['bv'] is not None and -0.4 < out['bv'] < 2.2:
            T = teff(out['bv']); Mv = v + 5 * math.log10(plx / 100); L = 10 ** (-0.4 * (Mv + bc(T) - 4.74))
            out.update(T=T, Mv=Mv, L=L, R=math.sqrt(L) * (5772 / T) ** 2)
            lc = lclass(out['sp']); out['lc'] = lc
            if lc == 'V':
                M = L ** (1 / 3.5); out.update(M=M, life=10 * M ** -2.5)
    return out
stars = [stats(r) for r in rows.values()]
print('with distance', sum('ly' in s for s in stars), 'reliable', sum(s.get('reliable', False) for s in stars), 'with L', sum('L' in s for s in stars))
for h in (32349, 91262, 27989, 11767, 24436, 70890):
    s = next((x for x in stars if x['hip'] == h), None)
    if s: print(names.get(h, {}).get('name'), f"{s.get('ly', 0):.1f} ly  T {s.get('T', 0):.0f} K  L {s.get('L', 0):.3g}  R {s.get('R', 0):.3g}  class {s.get('lc')}  M {s.get('M')}")

# ---- binary: positions etc. for all ----
rec = []
for s in stars:
    if 'ly' not in s: continue
    rec.append([s['ra'], s['dec'], s['ly'], s['v'], math.log10(s['L']) if 'L' in s else -9, s.get('T', 0), s['hip'], (1 if s['hip'] in names else 0) + (2 if s['reliable'] else 0)])
np.array(rec, dtype='<f4').tofile('out_stars/stars.bin')

# ---- named: details + Wikipedia ----
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wikibatch import fetch_many
named_list = [s for s in stars if s['hip'] in names and 'ly' in s]
W = fetch_many([t for s in named_list for t in (f"{names[s['hip']]['ascii']} (star)", names[s['hip']]['ascii'])])
def wiki(name):
    for title in (f'{name} (star)', name):
        w = W.get(title)
        if w and w.get('extract') and not w.get('disambiguation') and re.search(r'\bstar\b|\bbinary\b|\bsystem\b', w['extract'], re.I):
            return dict(about=w['extract'], wikiUrl=w['url'], wikiTitle=w['title'])
    return {}
named = []
for s in stars:
    if s['hip'] not in names or 'ly' not in s: continue
    n = names[s['hip']]
    named.append(dict(**{k: v for k, v in s.items()}, **n, **wiki(n['ascii'])))
named.sort(key=lambda x: x['v'])
json.dump(dict(stars=named, n=len(rec), stride=8,
               source='Hipparcos (ESA 1997; parallaxes van Leeuwen 2007) via the Gaia archive; names: IAU WGSN; summaries: Wikipedia (CC BY-SA 4.0)'),
          open('out_stars/named.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('named', len(named), 'with Wikipedia', sum(1 for x in named if x.get('about')), 'stars.bin', os.path.getsize('out_stars/stars.bin') // 1024, 'KB')
