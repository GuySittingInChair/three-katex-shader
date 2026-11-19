// A Kuramoto–Sivashinsky solver that stays stable: pseudo-spectral and
// semi-implicit. see docs/wiki/sketches/kuramotoSivashinsky.md
//
//   h_t = −∇²h − ∇⁴h − ½|∇h|² + f(x)
//
// The field is kept as waves (its Fourier transform). For a wave of wavenumber
// k, the two linear terms are one number, L(k) = k² − k⁴, applied exactly as
// e^{L·dt} (stable however short the wave). The slope term and the forcing f
// are worked out in real space and stepped with fourth-order Runge–Kutta, with
// the shortest third of the waves dropped (the "2/3 rule") so the slope term
// can't feed energy into waves the grid can't hold.
//
// The old solver stepped everything explicitly on the grid; its shortest waves
// blew up, and a ±4 clamp held it together but froze the pattern.

// In-place radix-2 FFT of one line (length n, a power of two), with a stride.
function fft1(re, im, off, stride, n, inverse, rev, cosT, sinT) {
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const a = off + i * stride, b = off + j * stride;
      let t = re[a]; re[a] = re[b]; re[b] = t;
      t = im[a]; im[a] = im[b]; im[b] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cosT[k * step], s = inverse ? sinT[k * step] : -sinT[k * step];
        const a = off + (start + k) * stride, b = a + half * stride;
        const xr = re[b] * c - im[b] * s, xi = re[b] * s + im[b] * c;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

export function createKS(N) {
  const bits = Math.log2(N);
  if (!Number.isInteger(bits)) throw new Error('KS grid size must be a power of two');
  const rev = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cosT = new Float64Array(N), sinT = new Float64Array(N);
  for (let i = 0; i < N; i++) { cosT[i] = Math.cos((2 * Math.PI * i) / N); sinT[i] = Math.sin((2 * Math.PI * i) / N); }

  const size = N * N;
  const fft2 = (re, im, inverse) => {
    for (let y = 0; y < N; y++) fft1(re, im, y * N, 1, N, inverse, rev, cosT, sinT);
    for (let x = 0; x < N; x++) fft1(re, im, x, N, N, inverse, rev, cosT, sinT);
    if (inverse) for (let i = 0; i < size; i++) { re[i] /= size; im[i] /= size; }
  };

  // State: the field's waves.
  const hRe = new Float64Array(size), hIm = new Float64Array(size);
  const C = () => [new Float64Array(size), new Float64Array(size)];
  const [aRe, aIm] = C(), [bRe, bIm] = C();       // scratch for the slope term
  const [vRe, vIm] = C();                          // a trial field
  const ks = [C(), C(), C(), C()];                 // the four RK stages
  const h = new Float64Array(size);                // the field in real space, for display
  let kx = new Float64Array(N), keep = new Uint8Array(size), lin = new Float64Array(size);
  let E = new Float64Array(size), E2 = new Float64Array(size);
  let spacing = -1, lastDt = -1;

  function setGrid(dx, dt) {
    if (dx !== spacing) {
      spacing = dx;
      const L = N * dx; // the domain's width
      for (let i = 0; i < N; i++) kx[i] = ((2 * Math.PI) / L) * (i <= N / 2 ? i : i - N);
      const cut = (2 / 3) * (Math.PI / dx);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const k2 = kx[x] * kx[x] + kx[y] * kx[y];
          lin[y * N + x] = k2 - k2 * k2;
          keep[y * N + x] = Math.abs(kx[x]) < cut && Math.abs(kx[y]) < cut ? 1 : 0;
        }
      }
      lastDt = -1;
    }
    if (dt !== lastDt) {
      lastDt = dt;
      for (let i = 0; i < size; i++) { E[i] = Math.exp(dt * lin[i]); E2[i] = Math.exp(0.5 * dt * lin[i]); }
    }
  }

  function seed(amplitude = 0.1) {
    for (let i = 0; i < size; i++) { hRe[i] = (Math.random() - 0.5) * 2 * amplitude; hIm[i] = 0; }
    fft2(hRe, hIm, false);
    hRe[0] = hIm[0] = 0;
    keepReal();
  }

  // The field on screen is real numbers, so each wave must match its mirror
  // wave (k and −k are complex conjugates). Rounding breaks that by about
  // 1e-16; the screen and the slope term never see the broken part, but the
  // linear growth does, and unchecked it grows ×e every 4 time units and
  // swamps everything after about 300. So restore the match every step.
  function keepReal() {
    for (let y = 0; y < N; y++) {
      const my = (N - y) % N;
      for (let x = 0; x < N; x++) {
        const i = y * N + x, j = my * N + ((N - x) % N);
        if (j < i) continue;
        const r = 0.5 * (hRe[i] + hRe[j]), m = 0.5 * (hIm[i] - hIm[j]);
        hRe[i] = r; hIm[i] = m;
        hRe[j] = r; hIm[j] = -m;
      }
    }
  }

  // The explicit part, −½|∇h|² + drive·force, as waves, times dt, into out.
  function nonlinear(inRe, inIm, out, dt, force, drive) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const r = keep[i] ? inRe[i] : 0, m = keep[i] ? inIm[i] : 0;
        aRe[i] = -kx[x] * m; aIm[i] = kx[x] * r; // ∂h/∂x
        bRe[i] = -kx[y] * m; bIm[i] = kx[y] * r; // ∂h/∂y
      }
    }
    fft2(aRe, aIm, true);
    fft2(bRe, bIm, true);
    for (let i = 0; i < size; i++) {
      aRe[i] = -0.5 * (aRe[i] * aRe[i] + bRe[i] * bRe[i]) + (force ? drive * force[i] : 0);
      aIm[i] = 0;
    }
    fft2(aRe, aIm, false);
    const [oRe, oIm] = out;
    for (let i = 0; i < size; i++) {
      oRe[i] = keep[i] ? dt * aRe[i] : 0;
      oIm[i] = keep[i] ? dt * aIm[i] : 0;
    }
    oRe[0] = oIm[0] = 0; // the mean height has no effect on anything; keep it at zero
  }

  // One step of length dt: fourth-order Runge–Kutta with an integrating
  // factor. Each wave's own growth or decay, e^{L·dt}, is applied exactly;
  // RK4 handles the slope term, which (unlike Euler's method) it can step
  // without amplifying. `force`, if given, is added to h_t point by point
  // (scaled by `drive`), e.g. a Life board of 0s and 1s.
  function step(dt, dx, force = null, drive = 0) {
    setGrid(dx, dt);
    const [k1, k2, k3, k4] = ks;
    nonlinear(hRe, hIm, k1, dt, force, drive);
    for (let i = 0; i < size; i++) { vRe[i] = E2[i] * (hRe[i] + 0.5 * k1[0][i]); vIm[i] = E2[i] * (hIm[i] + 0.5 * k1[1][i]); }
    nonlinear(vRe, vIm, k2, dt, force, drive);
    for (let i = 0; i < size; i++) { vRe[i] = E2[i] * hRe[i] + 0.5 * k2[0][i]; vIm[i] = E2[i] * hIm[i] + 0.5 * k2[1][i]; }
    nonlinear(vRe, vIm, k3, dt, force, drive);
    for (let i = 0; i < size; i++) { vRe[i] = E[i] * hRe[i] + E2[i] * k3[0][i]; vIm[i] = E[i] * hIm[i] + E2[i] * k3[1][i]; }
    nonlinear(vRe, vIm, k4, dt, force, drive);
    for (let i = 0; i < size; i++) {
      hRe[i] = E[i] * hRe[i] + (E[i] * k1[0][i] + 2 * E2[i] * (k2[0][i] + k3[0][i]) + k4[0][i]) / 6;
      hIm[i] = E[i] * hIm[i] + (E[i] * k1[1][i] + 2 * E2[i] * (k2[1][i] + k3[1][i]) + k4[1][i]) / 6;
    }
    hRe[0] = hIm[0] = 0;
    keepReal();
  }

  // The field in real space (call once per frame, not per step).
  function field() {
    vRe.set(hRe); vIm.set(hIm);
    fft2(vRe, vIm, true);
    h.set(vRe);
    return h;
  }

  return { size: N, seed, step, field };
}
