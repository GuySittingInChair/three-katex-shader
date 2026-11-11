"""Voyager's Grand Tour, from JPL Horizons (ssd.jpl.nasa.gov): heliocentric ecliptic state vectors of Voyager 1 (-31),
Voyager 2 (-32), Earth, and the Jupiter, Saturn, Uranus and Neptune system barycentres, daily, 1977 to 2027; and
planet-centred vectors every 2 minutes for a day either side of each flyby.
Derived:
  heliocentric speed v and the Sun's escape speed there, sqrt(2 GM_sun / r);
  each flyby: closest approach (km and planet radii), hyperbolic excess speed v_inf = sqrt(v^2 - 2 GM_p / r) on the way
  in and out (equal: in the planet's frame the flyby only turns the velocity), the turn angle 2 asin(1/e) with
  e = 1 + r_p v_inf^2 / GM_p, and the heliocentric speed 30 days before and after.
Outputs (out_voy/): voy.bin (float32), meta.json."""
import json, os, glob
import numpy as np
os.makedirs('out_voy', exist_ok=True)
AUKM, DAY = 1.495978707e8, 86400.0
GMS = 1.32712440018e11
GMP = {'599': 1.26686534e8, '699': 3.7931187e7, '799': 5.793939e6, '899': 6.836529e6}
RP = {'599': 71492, '699': 60268, '799': 25559, '899': 24764}
NAMES = {'599': 'Jupiter', '699': 'Saturn', '799': 'Uranus', '899': 'Neptune'}
def load(f):
    t = open(f).read(); b = t[t.index('$$SOE') + 5:t.index('$$EOE')]
    rows = [l.split(',') for l in b.strip().split('\n')]
    return np.array([float(r[0]) for r in rows]), [r[1].strip()[5:16] for r in rows], np.array([[float(x) for x in r[2:8]] for r in rows])
craft = {k: load(f'voy/v{k}.txt') for k in ('-31', '-32')}
bodies = {k: load(f'voy/v{k}.txt') for k in ('399', '5', '6', '7', '8')}
JD0 = bodies['399'][0][0]
JD1 = craft['-31'][0][-1]
print('days', JD0, JD1)

def at(k, jd):
    src = craft.get(k) or bodies.get(k)
    j, _, a = src
    i = int(round(jd - j[0]))
    return a[min(max(i, 0), len(a) - 1)]
def speed(a):
    return np.linalg.norm(a[..., 3:6], axis=-1) * AUKM / DAY
flybys = []
for f in sorted(glob.glob('voy/enc*.txt')):
    c, p = os.path.basename(f)[3:-4].split('_')
    jd, ds, a = load(f)
    r = np.linalg.norm(a[:, :3], axis=1); v = np.linalg.norm(a[:, 3:], axis=1); i = r.argmin()
    vinf = np.sqrt(v ** 2 - 2 * GMP[p] / r)
    e = 1 + r[i] * vinf[0] ** 2 / GMP[p]
    turn = np.degrees(2 * np.arcsin(1 / e))
    t = jd[i]
    before, after = at(c, t - 30), at(c, t + 30)
    vb, va = float(speed(before)), float(speed(after))
    # escape speed at the planet's distance
    rr = np.linalg.norm(at(c, t)[:3]) * AUKM
    fb = dict(craft=c, planet=NAMES[p], jd=float(t), date=ds[i], rmin=float(r[i]), rRp=float(r[i] / RP[p]), vmax=float(v[i]),
              vinfIn=float(vinf[0]), vinfOut=float(vinf[-1]), turn=float(turn), vBefore=vb, vAfter=va, vesc=float(np.sqrt(2 * GMS / rr)), rAU=float(rr / AUKM))
    # Sun-frame vectors 30 days out (for the vector picture): planet velocity and craft velocity, km/s, in the ecliptic
    pk = {'599': '5', '699': '6', '799': '7', '899': '8'}[p]
    for tag, dt in (('in', -30), ('out', 30)):
        fb['vc_' + tag] = (at(c, t + dt)[3:6] * AUKM / DAY).round(3).tolist()
        fb['vp_' + tag] = (at(pk, t + dt)[3:6] * AUKM / DAY).round(3).tolist()
    flybys.append(fb)
    print('%s %-7s %s  %8.0f km = %5.2f Rp  v_inf in %.2f out %.2f  turn %5.1f deg  helio %.1f -> %.1f km/s (escape %.1f)'
          % ('V1' if c == '-31' else 'V2', NAMES[p], ds[i], r[i], r[i] / RP[p], vinf[0], vinf[-1], turn, vb, va, fb['vesc']))

# per-day tables: positions (AU) of the two craft and five bodies, and craft speeds
n = int(JD1 - JD0) + 1
out = np.full((n, 7, 3), np.nan, dtype=np.float64)
spd = np.full((n, 2), np.nan)
for j, k in enumerate(('-31', '-32', '399', '5', '6', '7', '8')):
    jd, _, a = craft.get(k) or bodies[k]
    idx = np.round(jd - JD0).astype(int); ok = (idx >= 0) & (idx < n)
    out[idx[ok], j] = a[ok, :3]
    if j < 2: spd[idx[ok], j] = speed(a[ok])
# before launch: the craft sit with the Earth
for j in (0, 1):
    first = np.where(np.isfinite(out[:, j, 0]))[0][0]
    out[:first, j] = out[:first, 2]; spd[:first, j] = np.nan
spd = np.nan_to_num(spd, nan=0.0)
STEP = 2
rec = np.concatenate([out.reshape(n, 21), spd], 1).astype('<f4')[::STEP]
rec.tofile('out_voy/voy.bin')
r1 = np.linalg.norm(out[:, 0], axis=1); r2 = np.linalg.norm(out[:, 1], axis=1)
def day_of(s):
    y, m, d = map(int, s.split('-'))
    import datetime
    return (datetime.date(y, m, d) - datetime.date(1977, 8, 21)).days
hp = dict(v1=dict(date='2012-08-25', day=day_of('2012-08-25')), v2=dict(date='2018-11-05', day=day_of('2018-11-05')))
hp['v1']['r'] = float(r1[hp['v1']['day']]); hp['v2']['r'] = float(r2[hp['v2']['day']])
today = day_of('2026-11-10')
now = dict(day=today, r1=float(r1[today]), r2=float(r2[today]), v1=float(spd[today, 0]), v2=float(spd[today, 1]),
           light1=float(r1[today] * AUKM / 299792.458 / 3600), light2=float(r2[today] * AUKM / 299792.458 / 3600))
# when each became unbound: speed above the local escape speed
esc = np.sqrt(2 * GMS / (np.maximum(np.stack([r1, r2], 1), 1e-3) * AUKM))
unbound = [int(np.argmax((spd[:, j] > esc[:, j]) & (np.arange(n) > 30))) for j in (0, 1)]
print('heliopause: V1 %.1f AU, V2 %.1f AU' % (hp['v1']['r'], hp['v2']['r']))
print('2026-11-10: V1 %.1f AU %.2f km/s light %.1f h;  V2 %.1f AU %.2f km/s light %.1f h' % (now['r1'], now['v1'], now['light1'], now['r2'], now['v2'], now['light2']))
print('unbound from day', unbound, [str(np.datetime64('1977-08-21') + np.timedelta64(u, 'D')) for u in unbound])
meta = dict(n=int(len(rec)), step=STEP, stride=23, jd0=float(JD0), start='1977-08-21', flybys=flybys, heliopause=hp, now=now, unbound=unbound,
            launch=dict(v1='1977-09-05', v2='1977-08-20'),
            credit='JPL Horizons (NASA/JPL Solar System Dynamics), Voyager 1 & 2 trajectories')
json.dump(meta, open('out_voy/meta.json', 'w'), separators=(',', ':'), allow_nan=False)
print('voy.bin', os.path.getsize('out_voy/voy.bin') // 1024, 'KB')
