"""GW150914 from the public LIGO strain (GWOSC, 4 kHz, 32 s around the event, H1 and L1).
Whiten each detector by its own noise spectrum, band-pass 35-350 Hz, find the Hanford-Livingston delay,
then measure the chirp mass from how fast the frequency rises: f^(-8/3) falls linearly to the merger,
  f^(-8/3)(t) = (256/5) pi^(8/3) (G Mc / c^3)^(5/3) (tc - t).
Outputs (out_gw/): strain.bin, raw.bin, snr.bin, meta.json (see the end of this file)."""
import gzip, json
import numpy as np
from scipy import signal
FS = 4096; GPS0 = 1126259447; TEV = 1126259462.4204 - GPS0   # event time (geocentre), s into the files
def load(f): return np.loadtxt(gzip.open(f), comments='#')
H = load('gw/H-H1_GWOSC_4KHZ_R1-1126259447-32.txt.gz'); L = load('gw/L-L1_GWOSC_4KHZ_R1-1126259447-32.txt.gz')
t = np.arange(len(H)) / FS
def whiten(x):
    f, P = signal.welch(x, FS, nperseg=4 * FS, window=('tukey', 0.25))
    win = signal.windows.tukey(len(x), 0.1)
    X = np.fft.rfft(x * win); fr = np.fft.rfftfreq(len(x), 1 / FS)
    W = X / np.sqrt(np.interp(fr, f, P) / 2 * FS)       # unit variance white noise per sample
    return np.fft.irfft(W, len(x)), (f, P)
def bandpass(x, lo=35, hi=350):
    b, a = signal.butter(4, [lo, hi], btype='band', fs=FS)
    y = signal.filtfilt(b, a, x)
    for f0 in (60, 120, 180, 300, 331.9, 344.7):         # mains + violin-mode lines inside the band
        bn, an = signal.iirnotch(f0, 30, FS); y = signal.filtfilt(bn, an, y)
    return y
Hw, (fH, PH) = whiten(H); Lw, (fL, PL) = whiten(L)
Hb, Lb = bandpass(Hw), bandpass(Lw)
# noise level: robust sigma away from the event
quiet = (np.abs(t - TEV) > 2) & (t > 2) & (t < 30)
sH, sL = 1.4826 * np.median(np.abs(Hb[quiet])), 1.4826 * np.median(np.abs(Lb[quiet]))
Hb, Lb = Hb / sH, Lb / sL
# the delay: correlate H1 with sign-flipped L1 around the event (the arms are rotated ~90 deg between sites)
sel = (t > TEV - 0.15) & (t < TEV + 0.03)
lags = np.arange(-int(0.012 * FS), int(0.012 * FS) + 1)
cc = [np.dot(Hb[sel], -np.roll(Lb, k)[sel]) for k in lags]
# fine: parabola through the peak
k = int(np.argmax(cc)); y0, y1, y2 = cc[k - 1], cc[k], cc[k + 1]
lag = (lags[k] + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2)) / FS
rho = max(cc) / np.sqrt(np.dot(Hb[sel], Hb[sel]) * np.dot(Lb[sel], Lb[sel]))
print('L1 leads H1 by %.2f ms (roll %d), correlation %.2f' % (lag * 1e3, lags[k], rho))
# combined: H1 + shifted, flipped L1
Lal = -np.roll(Lb, lags[k]); C = (Hb + Lal) / 2
# ---- the chirp, cleaner: 30-250 Hz (the inspiral lies below 250 Hz), H1 + aligned L1 ----
def norm(x):
    return x / (1.4826 * np.median(np.abs(x[quiet])))
H2, L2 = norm(bandpass(Hw, 30, 250)), norm(bandpass(Lw, 30, 250))
C = (H2 - np.roll(L2, lags[k])) / 2
Ch = signal.hilbert(C)
# ---- frequency from zero crossings: each crossing is half a cycle after the last ----
win = (t > TEV - 0.25) & (t < TEV + 0.02)
zc = np.where(win[:-1] & (np.sign(C[:-1]) != np.sign(C[1:])))[0]
tz = t[zc] - C[zc] / (C[zc + 1] - C[zc]) / FS
amp = np.array([np.abs(C[(t > a) & (t < b)]).max() for a, b in zip(tz[:-1], tz[1:])])
tm, fz = (tz[1:] + tz[:-1]) / 2 - TEV, 0.5 / np.diff(tz)
ipk = int(np.argmax(amp)); tpk = tm[ipk]
# the clean run: walk back from the loudest half-cycle while every half-cycle stands out of the noise (> 1.8 sigma)
i0 = ipk
while i0 > 0 and amp[i0 - 1] > 1.8: i0 -= 1
use = np.zeros(len(tm), bool); use[i0:ipk + 1] = True
G, c, MSUN = 6.674e-11, 2.998e8, 1.989e30
K = (256 / 5) * np.pi ** (8 / 3)
def fit(X, Y):
    m_, b_ = np.polyfit(X, Y, 1); return m_, b_, (-m_ / K) ** 0.6 * c ** 3 / G / MSUN
X, Y = tm[use], fz[use] ** (-8 / 3)
m_, b_, Mc = fit(X, Y); tc = -b_ / m_
rng = np.random.default_rng(1); boot = []
for _ in range(4000):
    j = rng.integers(0, len(X), len(X))
    if np.ptp(X[j]) < 0.02: continue
    mm, bb, mc = fit(X[j], Y[j])
    if mm < 0: boot.append(mc)
lo, hi = np.percentile(boot, [16, 84])
z = 0.09
print('half-cycles used %d (%.4f..%.4f s), Mc det %.1f [%.1f, %.1f], source %.1f, tc %.4f' % (use.sum(), X[0], X[-1], Mc, lo, hi, Mc / (1 + z), tc))
fpeak = fz[ipk]; Mtot = Mc * 4 ** 0.6
w = np.pi * fpeak; R = (G * Mtot * MSUN / w ** 2) ** (1 / 3); Rs = 2 * G * Mtot * MSUN / c ** 2
print('peak %.0f Hz at %.4f s; equal masses M = %.0f Msun; orbit %.0f km; horizons %.0f km' % (fpeak, tpk, Mtot, R / 1e3, Rs / 1e3))
# ---- the search: slide a chirp template (this chirp mass, Newtonian, 25 Hz up to the peak) along all 32 s ----
N = len(t); fr = np.fft.rfftfreq(N, 1 / FS); twin = signal.windows.tukey(N, 0.1); band = (fr > 30) & (fr < 400)
tau = G * Mc * MSUN / c ** 3
T0 = 5 / 256 * (np.pi * 25) ** (-8 / 3) * tau ** (-5 / 3); T1 = 5 / 256 * (np.pi * fpeak) ** (-8 / 3) * tau ** (-5 / 3)
th = -np.arange(-T0, -T1, 1 / FS)
ff = (1 / np.pi) * (5 / (256 * th)) ** (3 / 8) * tau ** (-5 / 8); ph = -2 * (5 * tau) ** (-5 / 8) * th ** (5 / 8)
n = len(th); tap = np.minimum(1, np.arange(n) / (0.05 * FS)) * np.minimum(1, (n - 1 - np.arange(n)) / (0.004 * FS))
h1 = np.zeros(N); h2 = np.zeros(N); h1[:n] = ff ** (2 / 3) * np.cos(ph) * tap; h2[:n] = ff ** (2 / 3) * np.sin(ph) * tap
def snr(x, P):
    D = np.fft.rfft(x * twin); wt = band / np.interp(fr, *P)
    A1, A2 = np.fft.rfft(h1), np.fft.rfft(h2)
    r = np.hypot(np.fft.irfft(D * np.conj(A1) * wt, N), np.fft.irfft(D * np.conj(A2) * wt, N))
    r = np.roll(r, n)                                          # index = time the template ends
    far = (np.abs(t - TEV) > 1) & (t > 2) & (t < 30)
    return r / np.sqrt(np.median(r[far] ** 2) / (2 * np.log(2)))  # noise: |rho|^2 ~ chi^2 with 2 dof
rH, rL = snr(H, (fH, PH)), snr(L, (fL, PL))
iH = int(np.argmax(np.where(np.abs(t - TEV) < 0.05, rH, 0))); iL = int(np.argmax(np.where(np.abs(t - TEV) < 0.05, rL, 0)))
net = np.hypot(rH[iH], rL[iL]); far = (np.abs(t - TEV) > 1) & (t > 2) & (t < 30)
print('SNR H1 %.1f L1 %.1f network %.1f; loudest noise elsewhere H1 %.1f L1 %.1f' % (rH[iH], rL[iL], net, rH[far].max(), rL[far].max()))
# ---- outputs ----
o = (t > TEV - 0.5) & (t < TEV + 0.1)
rows = np.stack([t[o] - TEV, Hb[o], Lal[o], -Lb[o], C[o], Ch.imag[o]], -1).astype('<f4'); rows.tofile('out_gw/strain.bin')
o4 = (t > TEV - 2) & (t < TEV + 2)
signal.decimate(H[o4] * 1e21, 8).astype('<f4').tofile('out_gw/raw.bin')
B = 2048; sel = (t >= 1) & (t < 31)
pool = lambda r: r[sel][: (sel.sum() // B) * B].reshape(B, -1).max(1)
np.stack([pool(rH), pool(rL)], -1).astype('<f4').tofile('out_gw/snr.bin')
fg = np.geomspace(10, 1900, 240)
meta = dict(gps=GPS0 + TEV, fs=FS, strain=dict(t0=float(t[o][0] - TEV), n=int(o.sum()), cols=['H1 35-350 Hz', 'L1 shifted+flipped', 'L1 as recorded', 'H1+L1 30-250 Hz', 'its quadrature (Hilbert)']),
            raw=dict(t0=-2, fs=FS / 8, unit='1e-21'), snrBins=dict(t0=1 - TEV, t1=31 - TEV, n=B),
            lagMs=lag * 1e3, corr=rho, Mc=Mc, McLo=lo, McHi=hi, z=z, McSource=Mc / (1 + z), tc=tc, tpk=tpk, fpeak=fpeak, Mtot=Mtot, sepKm=R / 1e3, rsKm=Rs / 1e3,
            snrH=rH[iH], snrL=rL[iL], snrNet=net, noiseMax=max(rH[far].max(), rL[far].max()), template=dict(f0=25, f1=fpeak, cycles=float((ph[-1] - ph[0]) / (2 * np.pi))),
            track=dict(t=tm.round(5).tolist(), f=fz.round(2).tolist(), a=amp.round(2).tolist(), use=[int(u) for u in use]),
            asd=dict(f=fg.round(2).tolist(), H1=(np.sqrt(np.interp(fg, fH, PH)) * 1e23).round(4).tolist(), L1=(np.sqrt(np.interp(fg, fL, PL)) * 1e23).round(4).tolist()),
            published=dict(McSource=28.6, m1=35.6, m2=30.6, final=63.1, Erad=3.1, distMpc=440, delayMs=6.9, snr=24),
            credit='LIGO Scientific Collaboration and Virgo Collaboration; Gravitational Wave Open Science Center (gwosc.org)')
json.dump(meta, open('out_gw/meta.json', 'w'), separators=(',', ':'))
import os; [print(f, os.path.getsize('out_gw/' + f) // 1024, 'KB') for f in sorted(os.listdir('out_gw'))]
