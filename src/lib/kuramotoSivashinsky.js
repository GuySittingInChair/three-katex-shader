// Kuramoto–Sivashinsky solvers, pseudo-spectral with ETDRK4 (Cox & Matthews
// 2002, in the stable form of Kassam & Trefethen 2005): the stiff linear
// part is integrated exactly, the nonlinear part to fourth order. Periodic.
//
//   1D:  u_t = −u u_x − u_xx − u_xxxx          createKS1D(N, L, h)
//   2D:  u_t = −∇²u − ∇⁴u − ½|∇u|²             createKS2D(N, L, h)
//
// In Fourier space both are v_t = (k² − k⁴) v + N(v): modes with 0 < k < 1
// grow, shorter ones are damped hard.
//
// Two details that matter (each caused a blow-up before it was fixed):
// the Nyquist mode keeps its damping (only its derivative is zeroed), and
// the field is kept exactly real after every step. Otherwise round-off
// grows an imaginary part that nothing saturates.

export function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const n2 = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = n2;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// 2D FFT in place on Nx × Ny arrays (row-major, rows of length Nx).
const bufs = new Map();
const bufFor = (n) => {
  if (!bufs.has(n)) bufs.set(n, { re: new Float64Array(n), im: new Float64Array(n) });
  return bufs.get(n);
};
export function fft2(re, im, Nx, inverse, Ny = Nx) {
  let { re: r, im: m } = bufFor(Nx);
  for (let y = 0; y < Ny; y++) {
    for (let x = 0; x < Nx; x++) { r[x] = re[y * Nx + x]; m[x] = im[y * Nx + x]; }
    fft(r, m, inverse);
    for (let x = 0; x < Nx; x++) { re[y * Nx + x] = r[x]; im[y * Nx + x] = m[x]; }
  }
  ({ re: r, im: m } = bufFor(Ny));
  for (let x = 0; x < Nx; x++) {
    for (let y = 0; y < Ny; y++) { r[y] = re[y * Nx + x]; m[y] = im[y * Nx + x]; }
    fft(r, m, inverse);
    for (let y = 0; y < Ny; y++) { re[y * Nx + x] = r[y]; im[y * Nx + x] = m[y]; }
  }
}

// ETDRK4 coefficients for linear rates lam[i], by the contour-integral
// trick (M points on a half circle of radius 1 round each h·lam).
function etdCoefficients(lam, h) {
  const n = lam.length;
  const E = new Float64Array(n);
  const E2 = new Float64Array(n);
  const Q = new Float64Array(n);
  const f1 = new Float64Array(n);
  const f2 = new Float64Array(n);
  const f3 = new Float64Array(n);
  const M = 32;
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    E[i] = Math.exp(h * lam[i]);
    E2[i] = Math.exp((h * lam[i]) / 2);
    const key = lam[i];
    if (!cache.has(key)) {
      let q = 0, a = 0, b = 0, c = 0;
      for (let j = 1; j <= M; j++) {
        const th = (Math.PI * (j - 0.5)) / M;
        const zr = h * lam[i] + Math.cos(th);
        const zi = Math.sin(th);
        const ex = Math.exp(zr);
        const er = ex * Math.cos(zi);
        const ei = ex * Math.sin(zi);
        const e2 = Math.exp(zr / 2);
        const e2r = e2 * Math.cos(zi / 2);
        const e2i = e2 * Math.sin(zi / 2);
        const mul = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
        const divRe = (ar, ai, br, bi) => (ar * br + ai * bi) / (br * br + bi * bi);
        const z2 = mul(zr, zi, zr, zi);
        const z3 = mul(z2[0], z2[1], zr, zi);
        q += divRe(e2r - 1, e2i, zr, zi);
        let t = mul(er, ei, 4 - 3 * zr + z2[0], -3 * zi + z2[1]);
        a += divRe(-4 - zr + t[0], -zi + t[1], z3[0], z3[1]);
        t = mul(er, ei, zr - 2, zi);
        b += divRe(2 + zr + t[0], zi + t[1], z3[0], z3[1]);
        t = mul(er, ei, 4 - zr, -zi);
        c += divRe(-4 - 3 * zr - z2[0] + t[0], -3 * zi - z2[1] + t[1], z3[0], z3[1]);
      }
      cache.set(key, [(h * q) / M, (h * a) / M, (h * b) / M, (h * c) / M]);
    }
    [Q[i], f1[i], f2[i], f3[i]] = cache.get(key);
  }
  return { E, E2, Q, f1, f2, f3 };
}

// The shared ETDRK4 step, given a function computing N(v) into (outR, outI).
function makeStepper(n, co, nonlinear, makeReal) {
  const buf = () => new Float64Array(n);
  const [Nr, Ni, ar, ai, Nar, Nai, br, bi, Nbr, Nbi, cr, ci, Ncr, Nci] = Array.from({ length: 14 }, buf);
  const { E, E2, Q, f1, f2, f3 } = co;
  return (vr, vi) => {
    nonlinear(vr, vi, Nr, Ni);
    for (let i = 0; i < n; i++) { ar[i] = E2[i] * vr[i] + Q[i] * Nr[i]; ai[i] = E2[i] * vi[i] + Q[i] * Ni[i]; }
    nonlinear(ar, ai, Nar, Nai);
    for (let i = 0; i < n; i++) { br[i] = E2[i] * vr[i] + Q[i] * Nar[i]; bi[i] = E2[i] * vi[i] + Q[i] * Nai[i]; }
    nonlinear(br, bi, Nbr, Nbi);
    for (let i = 0; i < n; i++) {
      cr[i] = E2[i] * ar[i] + Q[i] * (2 * Nbr[i] - Nr[i]);
      ci[i] = E2[i] * ai[i] + Q[i] * (2 * Nbi[i] - Ni[i]);
    }
    nonlinear(cr, ci, Ncr, Nci);
    for (let i = 0; i < n; i++) {
      vr[i] = E[i] * vr[i] + Nr[i] * f1[i] + 2 * (Nar[i] + Nbr[i]) * f2[i] + Ncr[i] * f3[i];
      vi[i] = E[i] * vi[i] + Ni[i] * f1[i] + 2 * (Nai[i] + Nbi[i]) * f2[i] + Nci[i] * f3[i];
    }
    makeReal(vr, vi);
  };
}

export function createKS1D(N, L, h) {
  const kLin = Float64Array.from({ length: N }, (_, i) => ((2 * Math.PI) / L) * (i <= N / 2 ? i : i - N));
  const k = Float64Array.from(kLin, (kk, i) => (i === N / 2 ? 0 : kk));
  const co = etdCoefficients(Float64Array.from(kLin, (kk) => kk * kk - kk ** 4), h);
  const ur = new Float64Array(N);
  const ui = new Float64Array(N);
  // N(v) = −(ik/2) F(u²)
  const nonlinear = (vr, vi, outR, outI) => {
    ur.set(vr);
    ui.set(vi);
    fft(ur, ui, true);
    for (let i = 0; i < N; i++) { ur[i] *= ur[i]; ui[i] = 0; }
    fft(ur, ui, false);
    for (let i = 0; i < N; i++) { outR[i] = 0.5 * k[i] * ui[i]; outI[i] = -0.5 * k[i] * ur[i]; }
  };
  const makeReal = (vr, vi) => {
    vi[0] = 0;
    vi[N / 2] = 0;
    for (let i = 1; i < N / 2; i++) {
      const r = 0.5 * (vr[i] + vr[N - i]);
      const m = 0.5 * (vi[i] - vi[N - i]);
      vr[i] = r; vr[N - i] = r; vi[i] = m; vi[N - i] = -m;
    }
  };
  const vr = new Float64Array(N);
  const vi = new Float64Array(N);
  const step = makeStepper(N, co, nonlinear, makeReal);
  const out = new Float64Array(N);
  const tmp = new Float64Array(N);
  return {
    N, L, h,
    set(u) {
      vr.set(u);
      vi.fill(0);
      fft(vr, vi, false);
    },
    step() { step(vr, vi); },
    // Current u(x) (a view that's overwritten by the next call).
    u() {
      out.set(vr);
      tmp.set(vi);
      fft(out, tmp, true);
      return out;
    },
  };
}

// N and L may be numbers (a square) or [Nx, Ny] and [Lx, Ly] (a rectangle,
// e.g. to wrap round a torus without stretching the cells).
export function createKS2D(N, L, h) {
  const [Nx, Ny] = Array.isArray(N) ? N : [N, N];
  const [Lx, Ly] = Array.isArray(L) ? L : [L, L];
  const n = Nx * Ny;
  const kOf = (i, M, len) => ((2 * Math.PI) / len) * (i <= M / 2 ? i : i - M);
  const kx = new Float64Array(n);
  const ky = new Float64Array(n);
  const lam = new Float64Array(n);
  for (let y = 0; y < Ny; y++) for (let x = 0; x < Nx; x++) {
    const i = y * Nx + x;
    const a = kOf(x, Nx, Lx);
    const b = kOf(y, Ny, Ly);
    lam[i] = a * a + b * b - (a * a + b * b) ** 2;
    kx[i] = x === Nx / 2 ? 0 : a;
    ky[i] = y === Ny / 2 ? 0 : b;
  }
  const co = etdCoefficients(lam, h);
  const gxr = new Float64Array(n), gxi = new Float64Array(n), gyr = new Float64Array(n), gyi = new Float64Array(n);
  // N(v) = −½ F(|∇u|²), with ∇u = F⁻¹(i k v)
  const nonlinear = (vr, vi, outR, outI) => {
    for (let i = 0; i < n; i++) {
      gxr[i] = -kx[i] * vi[i]; gxi[i] = kx[i] * vr[i];
      gyr[i] = -ky[i] * vi[i]; gyi[i] = ky[i] * vr[i];
    }
    fft2(gxr, gxi, Nx, true, Ny);
    fft2(gyr, gyi, Nx, true, Ny);
    for (let i = 0; i < n; i++) {
      outR[i] = -0.5 * (gxr[i] * gxr[i] + gyr[i] * gyr[i]);
      outI[i] = 0;
    }
    fft2(outR, outI, Nx, false, Ny);
  };
  const tr = new Float64Array(n);
  const ti = new Float64Array(n);
  const makeReal = (vr, vi) => {
    tr.set(vr);
    ti.set(vi);
    fft2(tr, ti, Nx, true, Ny);
    ti.fill(0);
    fft2(tr, ti, Nx, false, Ny);
    vr.set(tr);
    vi.set(ti);
  };
  const vr = new Float64Array(n);
  const vi = new Float64Array(n);
  const step = makeStepper(n, co, nonlinear, makeReal);
  const out = new Float64Array(n);
  const tmp = new Float64Array(n);
  return {
    N, L, h, Nx, Ny, Lx, Ly,
    set(u) {
      vr.set(u);
      vi.fill(0);
      fft2(vr, vi, Nx, false, Ny);
    },
    step() { step(vr, vi); },
    u() {
      out.set(vr);
      tmp.set(vi);
      fft2(out, tmp, Nx, true, Ny);
      return out;
    },
    // Peak of the curvature spectrum (k⁴|v|², summed over shells of |k|):
    // the size of the cells. (u itself is dominated by the longest waves.)
    spectrumPeak() {
      const dk = (2 * Math.PI) / Math.max(Lx, Ly);
      const shells = new Float64Array(Math.max(Nx, Ny));
      for (let i = 0; i < n; i++) {
        const kk = Math.hypot(kx[i], ky[i]);
        const s = Math.round(kk / dk);
        if (s > 0 && s < shells.length) shells[s] += kk ** 4 * (vr[i] * vr[i] + vi[i] * vi[i]);
      }
      let best = 1;
      for (let s = 1; s < shells.length; s++) if (shells[s] > shells[best]) best = s;
      return best * dk;
    },
    mean() { return vr[0] / n; },
    // ⟨|∇u|²⟩, exactly, from the spectrum (Parseval).
    meanGrad2() {
      let g = 0;
      for (let i = 0; i < n; i++) g += (kx[i] * kx[i] + ky[i] * ky[i]) * (vr[i] * vr[i] + vi[i] * vi[i]);
      return g / (n * n);
    },
  };
}
