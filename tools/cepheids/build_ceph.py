"""Classical Cepheids from Gaia DR3 (vari_cepheid, Ripepi et al. 2023; astrometry Lindegren et al. 2021).
Fundamental-mode classical Cepheids (DCEP, FUNDAMENTAL). Wesenheit magnitude W = G - 1.90 (BP - RP), from the
intensity-averaged magnitudes: it cancels dust reddening for the standard extinction law.
LMC: within 8 deg of (80.89, -69.76). Fit W = a + b log10 P with 3-sigma clipping.
Milky Way: away from both Clouds, RUWE < 1.4, parallax corrected with the Lindegren et al. (2021) zero point,
parallax known to 5% (corrected parallax / error > 20). Absolute W: M = W + 5 log10(parallax / 1 mas) - 10.
Zero point with the LMC slope, robust (3 x MAD) clipping. LMC distance modulus mu = a_LMC - a_MW.
Metallicity: Cepheids poorer in metals are fainter by gamma per dex; the LMC is 0.41 dex poorer than the
Milky-Way sample (Romaniello et al. 2022). Shown both without and with gamma = -0.3 mag/dex (published -0.2 to -0.4).
Light-curve shape: Gaia's G-band Fourier fit, cosine series, R21, R31, phi21, phi31; amplitude from peak_to_peak_g.
Outputs (out_ceph/): ceph.bin (float32 x10 per star), meta.json."""
import csv, json, os, warnings
import numpy as np
warnings.filterwarnings('ignore')
from zero_point import zpt
zpt.load_tables()
os.makedirs('out_ceph', exist_ok=True)
rows = list(csv.DictReader(open('ceph/vcep.csv')))
four = {x['source_id']: x for x in csv.DictReader(open('ceph/four.csv'))}
astro = {x['source_id']: x for x in csv.DictReader(open('ceph/mwastro.csv'))}
num = lambda x: float(x) if x else np.nan
col = lambda k, rs=rows: np.array([num(x[k]) for x in rs])
ra, dec, l, b, P, G, BP, RP, amp = (col(k) for k in 'ra dec l b pf int_average_g int_average_bp int_average_rp peak_to_peak_g'.split())
typ = np.array([x['typ'] for x in rows]); mode = np.array([x['mode'] for x in rows]); sid = [x['source_id'] for x in rows]
W = G - 1.90 * (BP - RP)
F = np.array([[num(four.get(s, {}).get(k, '')) for k in ('r21_g', 'r31_g', 'phi21_g', 'phi31_g', 'epoch_g')] for s in sid])
dc = (typ == 'DCEP') & (mode == 'FUNDAMENTAL') & np.isfinite(P) & np.isfinite(W)
print('Cepheids', len(rows), 'classical fundamental-mode', dc.sum())

def sep(a, d, a0, d0):
    a, d, a0, d0 = map(np.radians, (a, d, a0, d0))
    return np.degrees(np.arccos(np.clip(np.sin(d) * np.sin(d0) + np.cos(d) * np.cos(d0) * np.cos(a - a0), -1, 1)))
LMC0, SMC0 = (80.89, -69.76), (13.19, -72.83)
lmc = dc & (sep(ra, dec, *LMC0) < 8)
x, y = np.log10(P[lmc]), W[lmc]
keep = np.ones(len(x), bool)
for _ in range(6):
    bL, aL = np.polyfit(x[keep], y[keep], 1)
    res = y - (aL + bL * x); keep = np.abs(res) < 3 * res[keep].std()
sdL = res[keep].std()
print('LMC: %d, kept %d: W = %.3f %+.3f log P, scatter %.3f mag' % (lmc.sum(), keep.sum(), aL, bL, sdL))
lmcIdx = np.where(lmc)[0][keep]

# Milky Way
mwc = dc & (sep(ra, dec, *LMC0) > 12) & (sep(ra, dec, *SMC0) > 8)
cand = [i for i in np.where(mwc)[0] if sid[i] in astro]
A = [astro[sid[i]] for i in cand]; cand = np.array(cand)
g, nu, pc, el, sol, plx, ep, ru = (col(k, A) for k in 'phot_g_mean_mag nu_eff_used_in_astrometry pseudocolour ecl_lat astrometric_params_solved parallax parallax_error ruwe'.split())
zp = zpt.get_zpt(g, nu, pc, el, sol.astype(int), _warnings=False)
pcor = plx - zp
good = (ru < 1.4) & np.isfinite(zp) & (pcor / ep > 20) & (g > 6)
mi = cand[good]; pm = pcor[good]
M = W[mi] + 5 * np.log10(pm) - 10
r0 = M - bL * np.log10(P[mi])
k = np.ones(len(r0), bool)
for _ in range(6):
    a0 = np.median(r0[k]); k = np.abs(r0 - a0) < 3 * 1.4826 * np.median(np.abs(r0 - a0))
aMW = r0[k].mean(); sdMW = r0[k].std(); eaMW = sdMW / np.sqrt(k.sum())
slopeMW = np.polyfit(np.log10(P[mi][k]), M[k], 1)[0]
mu = aL - aMW; gamma, dFe = -0.3, -0.41
muZ = mu - gamma * dFe   # metal-poor LMC Cepheids are fainter by gamma*dFe, so they are less far than they look
kpc = lambda m: 10 ** (m / 5 + 1) / 1000
print('MW: %d candidates, %d with 5%% parallaxes, kept %d; a = %.3f +- %.3f, scatter %.3f; own slope %.2f; median L21 zp %.4f mas'
      % (len(cand), good.sum(), k.sum(), aMW, eaMW, sdMW, slopeMW, np.nanmedian(zp)))
print('LMC mu = %.3f (%.1f kpc); with metallicity term %.3f (%.1f kpc); eclipsing binaries 18.477 (49.6 kpc)' % (mu, kpc(mu), muZ, kpc(muZ)))
mwIdx = mi[k]; mwPlx = pm[k]

# per-star records: position, log P, magnitude (apparent W for LMC, absolute W for MW), amplitude, shape, phase
def tangent(a, d, a0, d0):
    a, d, a0, d0 = map(np.radians, (a, d, a0, d0))
    c = np.sin(d0) * np.sin(d) + np.cos(d0) * np.cos(d) * np.cos(a - a0)
    return np.degrees(np.cos(d) * np.sin(a - a0) / c), np.degrees((np.cos(d0) * np.sin(d) - np.sin(d0) * np.cos(d) * np.cos(a - a0)) / c)
def shape(i):
    r21, r31, p21, p31, ep0 = F[i]
    return [r21 if np.isfinite(r21) else 0.4, r31 if np.isfinite(r31) else 0.2, p21 if np.isfinite(p21) else 4.4, p31 if np.isfinite(p31) else 2.6, ep0 if np.isfinite(ep0) else 0.0]
recs = []
for i in lmcIdx:
    tx, ty = tangent(ra[i], dec[i], *LMC0)
    s = shape(i)
    recs.append([-tx, ty, 0, np.log10(P[i]), W[i], amp[i] if np.isfinite(amp[i]) else 0.5, *s[:4], (s[4] / P[i]) % 1])
for i, p in zip(mwIdx, mwPlx):
    d = 1 / p  # kpc
    lr, br = np.radians(l[i]), np.radians(b[i])
    s = shape(i)
    recs.append([d * np.cos(br) * np.cos(lr), d * np.cos(br) * np.sin(lr), d * np.sin(br), np.log10(P[i]), W[i] + 5 * np.log10(p) - 10,
                 amp[i] if np.isfinite(amp[i]) else 0.5, *s[:4], (s[4] / P[i]) % 1])
rec = np.array(recs, dtype='<f4')
rec.tofile('out_ceph/ceph.bin')
dist = 1 / mwPlx
meta = dict(nLMC=int(len(lmcIdx)), nMW=int(len(mwIdx)), stride=11, total=int(len(rows)), classical=int(dc.sum()),
            lmc=dict(a=aL, b=bL, sd=sdL, all=int(lmc.sum())), mw=dict(a=aMW, ea=eaMW, sd=sdMW, slope=slopeMW, cand=int(len(cand)), good=int(good.sum()),
            dmax=float(dist.max()), dmed=float(np.median(dist)), zp=float(np.nanmedian(zp))),
            mu=mu, kpc=kpc(mu), muZ=muZ, kpcZ=kpc(muZ), gamma=gamma, dFe=dFe, muEB=18.477, kpcEB=49.59,
            pRange=[float(P[lmcIdx].min()), float(P[lmcIdx].max())],
            credit='Gaia DR3 (Gaia Collaboration 2023; Cepheids: Ripepi et al. 2023; parallax zero point: Lindegren et al. 2021), ESA/Gaia/DPAC')
json.dump(meta, open('out_ceph/meta.json', 'w'), separators=(',', ':'), allow_nan=False)
print('records', len(rec), 'ceph.bin', os.path.getsize('out_ceph/ceph.bin') // 1024, 'KB')
print('MW distances: median %.2f kpc, max %.2f kpc' % (np.median(dist), dist.max()))
