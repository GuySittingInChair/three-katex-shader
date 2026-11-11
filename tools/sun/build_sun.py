"""The sunspot cycle from two public records.
  RGO/USAF/NOAA sunspot groups (solarscience.msfc.nasa.gov/greenwch, files gYYYY.txt, 1874-2016): every
  group seen each day, with its Carrington longitude, latitude and area (millionths of a hemisphere;
  x1.4 after 1976 for the change of observer, as in the archive's own derived files).
  SILSO monthly mean total sunspot number V2.0 (Royal Observatory of Belgium), 1749 to now.
Outputs (out_sun/): spots.bin (u16 rotation index, i16 latitude x100, u16 Carrington longitude x100,
u16 area) one record per group per Carrington rotation; ssn.bin (float32 year, smoothed, monthly);
meta.json (cycles, periodogram, Sporer's law)."""
import glob, json, os
import numpy as np
os.makedirs('out_sun', exist_ok=True)
rows = []
for f in sorted(glob.glob('sun/g/g*.txt')):
    for ln in open(f):
        # fixed width at the front (year, month and day can run together), then fields counted from the end
        if len(ln) < 40: continue
        r = ln[12:].split()
        if len(r) < 8 or r[0] == '0': continue
        try: y, mo, dd = int(ln[0:4]), int(ln[4:6]), float(ln[6:12])
        except ValueError: continue
        rows.append((y, mo, dd, int(''.join(ch for ch in r[0] if ch.isdigit()) or 0) * 10 + (ord(r[0][-1]) % 10 if not r[0][-1].isdigit() else 0), float(r[-6]), float(r[-3]), float(r[-2])))
a = np.array(rows)
y, mo, dd, grp, area, lon, lat = a.T
# Julian day, then Carrington rotation number (CR 1 began 1853 Nov 9)
def jd(y, m, d):
    yy, mm = np.where(m <= 2, y - 1, y), np.where(m <= 2, m + 12, m)
    A = np.floor(yy / 100); B = 2 - A + np.floor(A / 4)
    return np.floor(365.25 * (yy + 4716)) + np.floor(30.6001 * (mm + 1)) + d + B - 1524.5
J = jd(y, mo, dd)
CR = np.floor(1 + (J - 2398167.4) / 27.2753).astype(int)
area = np.where(y >= 1977, area * 1.4, area)
year = 2000 + (J - 2451545.0) / 365.25
print('group-days', len(a), 'years', year.min().round(2), year.max().round(2), 'rotations', CR.min(), CR.max())
# one record per group per rotation: the area-weighted position, the largest area
key = CR * 10_000_000 + grp.astype(np.int64)
order = np.argsort(key, kind='stable'); key, CRs = key[order], CR[order]
u, start = np.unique(key, return_index=True)
ends = np.append(start[1:], len(key))
recs = []
for s0, s1 in zip(start, ends):
    sl = order[s0:s1]; w = area[sl] + 1
    # longitudes wrap: average on the circle
    L = np.degrees(np.arctan2((w * np.sin(np.radians(lon[sl]))).sum(), (w * np.cos(np.radians(lon[sl]))).sum())) % 360
    recs.append((CRs[s0] - CR.min(), np.average(lat[sl], weights=w), L, area[sl].max()))
R = np.array(recs)
spots = np.zeros(len(R), dtype=[('r', '<u2'), ('lat', '<i2'), ('lon', '<u2'), ('a', '<u2')])
spots['r'] = R[:, 0]; spots['lat'] = np.round(R[:, 1] * 100); spots['lon'] = np.round(R[:, 2] * 100) % 36000; spots['a'] = np.clip(np.round(R[:, 3]), 0, 65535)
spots.tofile('out_sun/spots.bin')
nrot = int(CR.max() - CR.min() + 1)
rot_year = [float(2000 + ((2398167.4 + (c - 1) * 27.2753) - 2451545.0) / 365.25) for c in range(CR.min(), CR.max() + 2)]
print('group-rotations', len(R))
# ---- SILSO ----
s = np.genfromtxt('sun/SN_m_tot_V2.0.csv', delimiter=';')
ty, ssn = s[:, 2], s[:, 3]
ok = ssn >= 0; ty, ssn = ty[ok], ssn[ok]
# the standard 13-month smoothing (half weight at the ends)
w = np.r_[0.5, np.ones(11), 0.5] / 12
sm = np.convolve(ssn, w, mode='same'); sm[:6] = np.nan; sm[-6:] = np.nan
np.stack([ty, ssn, sm], -1).astype('<f4').tofile('out_sun/ssn.bin')
# minima: lowest smoothed value between successive ~11-year stretches
mins = []
i = 6
valid = np.where(np.isfinite(sm))[0]
from scipy.signal import find_peaks
pk, _ = find_peaks(-np.nan_to_num(sm, nan=1e9), distance=12 * 7)
mins = [float(ty[k]) for k in pk if np.isfinite(sm[k])]
maxk, _ = find_peaks(np.nan_to_num(sm, nan=-1), distance=12 * 7, prominence=20)
maxs = [(float(ty[k]), float(sm[k])) for k in maxk]
lens = np.diff(mins)
print('minima', np.round(mins, 1)); print('cycle lengths', np.round(lens, 1), 'mean %.2f sd %.2f' % (lens.mean(), lens.std()))
print('maxima', [(round(a, 1), round(b)) for a, b in maxs])
# periodogram of the monthly record
x = ssn - ssn.mean(); T = ty
periods = np.linspace(5, 30, 1001); P = []
for Pd in periods:
    c, s_ = np.cos(2 * np.pi * T / Pd), np.sin(2 * np.pi * T / Pd)
    P.append((x @ c) ** 2 + (x @ s_) ** 2)
P = np.array(P) / max(P); Pbest = periods[np.argmax(P)]
print('periodogram peak %.2f yr' % Pbest)
# Sporer's law: area-weighted |latitude| against time since the cycle's minimum, all cycles in the group record
gmins = [m for m in mins if 1870 < m < 2020]
ph, la, wa = [], [], []
for m0, m1 in zip(gmins[:-1], gmins[1:]):
    s_ = (year >= m0 - 1.5) & (year < m1 + 1.5)
    # new-cycle spots are at high latitude; the old cycle's low-latitude spots overlap the minimum: keep each
    # spot with the cycle whose expected latitude it is closer to
    t = year[s_] - m0
    keep = ~((t < 1.5) & (np.abs(lat[s_]) < 12)) & ~((t > (m1 - m0) - 1.5) & (np.abs(lat[s_]) > 20))
    ph += list(t[keep]); la += list(np.abs(lat[s_][keep])); wa += list(area[s_][keep])
ph, la, wa = map(np.array, (ph, la, wa))
bins = np.arange(-1, 13, 0.5); sp = []
for b0 in bins:
    q = (ph >= b0) & (ph < b0 + 0.5)
    if wa[q].sum() > 0: sp.append((float(b0 + 0.25), float(np.average(la[q], weights=wa[q]))))
c1 = np.polyfit([p for p, _ in sp if 0 < p < 11], [l for p, l in sp if 0 < p < 11], 1)
print('Sporer: mean latitude %.1f at minimum, %.2f deg/yr' % (c1[1], c1[0]))
# butterfly: area by rotation and sine latitude (50 strips), for the HUD diagram
NB = 50
bf = np.zeros((nrot, NB), np.float32)
ib = np.clip(((np.sin(np.radians(R[:, 1])) + 1) / 2 * NB).astype(int), 0, NB - 1)
np.add.at(bf, (R[:, 0].astype(int), ib), R[:, 3])
bf8 = np.clip(np.sqrt(bf / 3000) * 255, 0, 255).astype(np.uint8)
bf8.tofile('out_sun/butterfly.bin')
meta = dict(nrot=nrot, cr0=int(CR.min()), rotYear=rot_year, nspots=int(len(R)), groupDays=int(len(a)), butterfly=dict(rows=nrot, cols=NB, scale='sqrt(area/3000)*255, sine-latitude strips'),
            ssn=dict(n=int(len(ty)), first=float(ty[0]), last=float(ty[-1])), minima=mins, maxima=maxs, cycleLengths=lens.tolist(), meanLength=float(lens.mean()), sdLength=float(lens.std()),
            periodogram=dict(p=periods[::5].round(3).tolist(), power=P[::5].round(4).tolist(), best=float(Pbest)), sporer=dict(points=sp, slope=float(c1[0]), lat0=float(c1[1])),
            credit='Sunspot groups: Royal Greenwich Observatory, USAF/NOAA, compiled by NASA MSFC (D. Hathaway). Sunspot number: WDC-SILSO, Royal Observatory of Belgium, Brussels.')
json.dump(meta, open('out_sun/meta.json', 'w'), separators=(',', ':'))
for f in sorted(os.listdir('out_sun')): print(f, os.path.getsize('out_sun/' + f) // 1024, 'KB')
