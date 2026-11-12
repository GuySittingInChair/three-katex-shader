import * as THREE from 'three';

// Close-ups: things far too small to see at the scale of a galaxy, drawn magnified (billions to hundreds of
// trillions of times) at their place in it, inside a ring that says so. One plays at a time.
//   kilonova — two neutron stars spiral in and merge. The inspiral follows the gravitational-wave chirp for a
//              circular orbit (Peters 1964): separation ∝ (t_c − t)^{1/4}, so orbital phase
//              φ = ω₀ t_c (8/5) [1 − (1 − t/t_c)^{5/8}]. Then a flash, short jets, and the kilonova's two clouds seen
//              in GW170817: fast blue debris towards the poles, slower red debris round the waist.
//   tde      — a star on a parabolic orbit passes inside the black hole's tidal radius and is torn into a stream.
//              The debris is then moved with Newtonian gravity (leapfrog, in the browser): half is bound and falls
//              back, half escapes. Glow comes from debris reaching the disk, so the fading rate (∝ t^−5/3 in theory)
//              comes out of the orbits rather than being drawn in.
//   agn      — the unified picture of an active nucleus: hot disk, thick dusty torus, two jets.
//   xrb      — a high-mass X-ray binary: a blue supergiant losing gas onto a compact companion's disk, and the
//              candidate planet's orbit far outside (not to scale).
// Sizes, colours and timings are ARTISTIC except where the notes above say otherwise.

const MAX = 6000;
const VERT = /* glsl */ `
  attribute vec3 aCol;
  attribute float aSize;
  uniform float uPx;
  varying vec3 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vCol = aCol;
    gl_PointSize = aSize <= 0.0 ? 0.0 : min(64.0, uPx * aSize / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  void main() { vec2 q = gl_PointCoord - 0.5; float r2 = dot(q, q) * 4.0; if (r2 > 1.0) discard; gl_FragColor = vec4(vCol * exp(-r2 * 2.8), 1.0); }`;

const TAU = Math.PI * 2;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function createCloseups() {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uPx: { value: 100 } }, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 7;
  // the black hole's shadow: a dark disc that blocks what's behind it
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false, transparent: true, opacity: 0 }));
  hole.renderOrder = 8;
  // the magnifier ring
  const ringGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * TAU), Math.sin((i / 96) * TAU), 0)));
  const ringMat = new THREE.LineDashedMaterial({ color: 0x9fc6ff, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0, depthTest: false });
  const ring = new THREE.Line(ringGeo, ringMat); ring.computeLineDistances(); ring.renderOrder = 6;
  const group = new THREE.Group();
  group.add(pts, hole, ring);
  group.visible = false;
  let n = 0;
  const put = (x, y, z, r, g, b, s) => { if (n >= MAX) return; pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; col[n * 3] = r; col[n * 3 + 1] = g; col[n * 3 + 2] = b; size[n] = s; n++; };
  let cur = null;      // { kind, t0, dur, loop, state }

  // ---------------- kilonova ----------------
  const kilonova = {
    dur: 17,
    init(seed) {
      const R = rng(seed), ej = [];
      for (let i = 0; i < 2200; i++) {
        const z = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - z * z);
        const polar = Math.abs(z) > 0.55;                      // blue, lanthanide-poor, fast; red, lanthanide-rich, slow
        const v = polar ? 0.32 + 0.12 * R() : 0.12 + 0.08 * R();
        ej.push({ d: [s * Math.cos(a), s * Math.sin(a), z], v, polar, j: R() });
      }
      const jets = Array.from({ length: 400 }, () => ({ side: R() < 0.5 ? -1 : 1, ang: R() * 0.07, a: R() * TAU, v: 2.2 + R() * 1.2, delay: R() * 0.25 }));
      return { ej, jets, trail: [] };
    },
    draw(t, st) {
      const TC = 8, a0 = 0.42, w0 = TAU * 0.45;
      if (t < TC) {
        const k = 1 - t / TC, a = a0 * Math.pow(Math.max(k, 1e-6), 0.25);
        const phi = w0 * TC * 1.6 * (1 - Math.pow(Math.max(k, 0), 0.625));
        const p1 = [Math.cos(phi) * a, Math.sin(phi) * a, 0], p2 = [-p1[0], -p1[1], 0];
        st.trail.push([p1, p2]); if (st.trail.length > 70) st.trail.shift();
        st.trail.forEach(([q1, q2], i) => { const f = (i / st.trail.length) ** 2 * 0.5; put(...q1, 0.4 * f, 0.6 * f, f, 0.05); put(...q2, 0.4 * f, 0.6 * f, f, 0.05); });
        put(...p1, 0.9, 0.95, 1, 0.16); put(...p2, 0.9, 0.95, 1, 0.16);
        // gravitational waves: ripples spreading out in the orbital plane, closer together as the orbit speeds up (ARTISTIC)
        for (let r = 0; r < 9; r++) {
          const emit = t - r * 0.45 * Math.pow(Math.max(k, 0.02), 0.375), rad = (t - emit) * 0.9 + a;
          if (emit < 0) continue;
          const alpha = 0.22 * (1 - r / 9);
          for (let q = 0; q < 90; q++) { const th = (q / 90) * TAU + phi * 2; put(Math.cos(th) * rad, Math.sin(th) * rad, 0, 0.3 * alpha, 0.5 * alpha, alpha, 0.04); }
        }
        return 0.2 + 0.6 * (1 - k);
      }
      const u = t - TC;
      // merger flash, then the remnant's glow
      const flash = Math.exp(-u * 2.2);
      put(0, 0, 0, 1, 0.95, 0.9, 0.3 + 1.6 * flash);
      // jets: a short gamma-ray burst (GW170817's came 1.7 s after the merger) — narrow, along the orbit's axis
      if (u < 2.2) for (const j of st.jets) {
        const tt = u - j.delay; if (tt < 0) continue;
        const r = j.v * tt, rr = r * Math.tan(j.ang);
        const f = Math.exp(-u * 1.6);
        put(Math.cos(j.a) * rr, Math.sin(j.a) * rr, j.side * r, 0.7 * f, 0.85 * f, f, 0.05);
      }
      // the kilonova: blue fades in about a day, red lasts about a week (scaled)
      for (const e of st.ej) {
        const r = e.v * u * (1 - 0.03 * u);
        const fade = e.polar ? Math.exp(-u * 0.55) : Math.exp(-u * 0.22);
        const c = e.polar ? [0.45, 0.65, 1.0] : [1.0, 0.35, 0.18];
        const k2 = fade * (0.6 + 0.4 * e.j) * Math.min(1, u * 3);
        put(e.d[0] * r, e.d[1] * r, e.d[2] * r, c[0] * k2, c[1] * k2, c[2] * k2, 0.035);
      }
      return Math.max(0.15, flash);
    },
  };

  // ---------------- tidal disruption ----------------
  const GM = 1, RP = 0.22, RS = 0.06;
  const tde = {
    dur: 22,
    init(seed) {
      const R = rng(seed);
      // the star's orbit: parabolic, pericentre RP; start far out on the incoming side
      // Barker's equation: t = sqrt(2 RP³/GM)(D + D³/3), D = tan(f/2), with t = 0 at pericentre
      const T0 = -5.5, star = [], deb = [];
      const cube = (x) => Math.sign(x) * Math.abs(x) ** (1 / 3);
      const orbit = (t) => {
        const A = t / Math.sqrt((2 * RP ** 3) / GM) * 1.5, B = cube(A + Math.sqrt(A * A + 1));
        const D = B - 1 / B, f = 2 * Math.atan(D), r = (2 * RP) / (1 + Math.cos(f));
        return [r * Math.cos(f), r * Math.sin(f)];
      };
      for (let i = 0; i < 1600; i++) {
        const g = () => (R() + R() + R() - 1.5) * 0.7;
        star.push([g() * 0.045, g() * 0.045, g() * 0.03]);
      }
      return { T0, orbit, star, deb, broken: false, captured: 0, rate: 0, R };
    },
    draw(t, st, dt) {
      const tt = t + st.T0;                                   // time from pericentre
      hole.material.opacity = 1;
      // photon ring (ARTISTIC)
      for (let q = 0; q < 120; q++) { const a = (q / 120) * TAU; put(Math.cos(a) * RS * 1.5, Math.sin(a) * RS * 1.5, 0, 0.9, 0.6, 0.3, 0.03); }
      if (!st.broken) {
        const [x, y] = st.orbit(tt);
        const r = Math.hypot(x, y);
        // stretched along the orbit as it nears the tidal radius
        const ux = x / r, uy = y / r, stretch = 1 + 6 * Math.max(0, 0.6 - r) ** 2;
        for (const p of st.star) {
          const a = p[0] * stretch, b = p[1] / Math.sqrt(stretch);
          put(x + ux * a - uy * b, y + uy * a + ux * b, p[2], 1, 0.9, 0.7, 0.03);
        }
        if (tt >= -0.05) {
          // torn apart at pericentre: each bit keeps the star's velocity plus its own small spread in energy,
          // so about half is bound (falls back on long ellipses) and half escapes
          const [x2, y2] = st.orbit(tt + 0.01);
          const vx = (x2 - x) / 0.01, vy = (y2 - y) / 0.01;
          for (const p of st.star) {
            const a = p[0] * stretch * 3, b = p[1];
            const px = x + ux * a - uy * b, py = y + uy * a + ux * b, k = 1 + a * 2.2;
            st.deb.push({ x: px, y: py, z: p[2], vx: vx * k, vy: vy * k, vz: 0, disk: false, ph: st.R() * TAU, rd: 0 });
          }
          st.broken = true;
        }
      } else {
        // Newtonian leapfrog for the debris, a few substeps per frame
        const steps = 6, h = Math.min(0.05, dt) / steps;
        let caught = 0;
        for (const d of st.deb) {
          if (d.disk) { d.ph += (h * steps) / Math.pow(d.rd, 1.5); continue; }
          for (let s = 0; s < steps; s++) {
            let r = Math.hypot(d.x, d.y, d.z), acc = -GM / (r * r * r);
            d.vx += acc * d.x * h; d.vy += acc * d.y * h; d.vz += acc * d.z * h;
            d.x += d.vx * h; d.y += d.vy * h; d.z += d.vz * h;
            r = Math.hypot(d.x, d.y, d.z);
            // bound debris that swung out and comes back round collides with the stream and settles into a disk
            // (at about twice the pericentre, the circularisation radius)
            if (r > 0.6) d.out = true;
            if (d.out && r < RP * 1.5) { d.disk = true; d.rd = RP * (1.1 + 1.1 * st.R()); d.ph = Math.atan2(d.y, d.x); caught++; break; }
          }
        }
        // the flare: how fast debris is arriving, smoothed
        st.captured += caught;
        st.rate += (caught / Math.max(dt, 1e-3) - st.rate) * Math.min(1, dt * 1.5);
        for (const d of st.deb) {
          if (d.disk) { const k = 0.9; put(Math.cos(d.ph) * d.rd, Math.sin(d.ph) * d.rd, 0, k, 0.75 * k, 0.5 * k, 0.03); }
          else { const r = Math.hypot(d.x, d.y); if (r < 6) put(d.x, d.y, d.z, 0.9, 0.55, 0.35, 0.025); }
        }
        const glow = Math.min(1.6, st.rate / 35);              // ~50 bits a second arrive at the peak
        put(0, 0, 0, 1, 0.85, 0.6, 0.15 + 0.9 * glow);
        return glow;
      }
      return 0.1;
    },
  };

  // ---------------- active nucleus (loops) ----------------
  const agn = {
    dur: Infinity,
    init(seed) {
      const R = rng(seed);
      return {
        disk: Array.from({ length: 1500 }, () => ({ r: 0.08 + 0.32 * R() ** 1.5, a: R() * TAU, z: (R() - 0.5) * 0.01 })),
        torus: Array.from({ length: 1800 }, () => { const a = R() * TAU, b = R() * TAU, rr = 0.16 * Math.sqrt(R()); return { a, b, rr }; }),
        jet: Array.from({ length: 700 }, () => ({ s: R() < 0.5 ? -1 : 1, ph: R(), a: R() * TAU, w: R() })),
      };
    },
    draw(t, st) {
      hole.material.opacity = 1;
      for (const d of st.disk) {
        const a = d.a + t * 0.25 / Math.pow(d.r, 1.5) * 0.1, heat = Math.min(1, 0.12 / d.r);
        put(Math.cos(a) * d.r, Math.sin(a) * d.r, d.z, 0.55 * heat, 0.5 * (0.55 + 0.35 * heat), 0.5 * (0.25 + 0.6 * heat * heat), 0.025);
      }
      for (const d of st.torus) {
        const R0 = 0.72, x = (R0 + d.rr * Math.cos(d.b)) * Math.cos(d.a + t * 0.02), y = (R0 + d.rr * Math.cos(d.b)) * Math.sin(d.a + t * 0.02), z = d.rr * Math.sin(d.b) * 1.6;
        put(x, y, z, 0.13, 0.06, 0.03, 0.06);              // dust: dim (it hides the light, it doesn't make it)
      }
      for (const j of st.jet) {
        const s = (j.ph + t * 0.35) % 1, r = s * 2.4, w = 0.015 + r * 0.05;
        const f = (1 - s) * 0.8;
        put(Math.cos(j.a) * w * j.w, Math.sin(j.a) * w * j.w, j.s * (0.05 + r), 0.45 * f, 0.65 * f, f, 0.04);
      }
      return 0.6;
    },
  };

  // ---------------- X-ray binary (loops) ----------------
  const xrb = {
    dur: Infinity,
    init(seed) {
      const R = rng(seed);
      return {
        star: Array.from({ length: 1200 }, () => { const z = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - z * z), r = 0.3 * Math.cbrt(R()); return [s * Math.cos(a) * r, s * Math.sin(a) * r, z * r]; }),
        disk: Array.from({ length: 700 }, () => ({ r: 0.03 + 0.12 * R(), a: R() * TAU })),
        stream: Array.from({ length: 300 }, () => ({ ph: R(), j: R() - 0.5 })),
      };
    },
    draw(t, st) {
      const W = 0.25, rot = t * W;                         // the pair turns together (slowed / sped up: ARTISTIC)
      const c = Math.cos(rot), s = Math.sin(rot), X = (x, y) => [x * c - y * s, x * s + y * c];
      const sx = -0.35, cx = 0.75;                         // giant and compact object, about their centre of mass
      for (const p of st.star) { const [x, y] = X(sx + p[0], p[1]); put(x, y, p[2], 0.25, 0.32, 0.48, 0.045); }
      for (const d of st.disk) {
        const a = d.a + t * 1.2 / Math.pow(d.r / 0.1, 1.5), heat = Math.min(1, 0.05 / d.r);
        const [x, y] = X(cx + Math.cos(a) * d.r, Math.sin(a) * d.r);
        put(x, y, 0, 0.8 + 0.2 * heat, 0.8 + 0.2 * heat, 1, 0.025);
      }
      // the stream from the giant's near side, curving (it lags the turning pair) onto the disk
      for (const q of st.stream) {
        const u = (q.ph + t * 0.4) % 1, x0 = sx + 0.28, x = x0 + (cx - 0.1 - x0) * u, y = -0.12 * Math.sin(Math.PI * u) + q.j * 0.02;
        const [px, py] = X(x, y);
        put(px, py, 0, 0.5, 0.65, 1, 0.025);
      }
      put(...X(cx, 0), 0, 1, 1, 1, 0.1);
      // the candidate planet's orbit, far outside (really ~45 AU against < 3 AU for the pair: not to scale)
      const P = 2.2;
      for (let q = 0; q < 120; q += 2) { const a = (q / 120) * TAU; put(Math.cos(a) * P, Math.sin(a) * P, 0, 0.25, 0.3, 0.35, 0.02); }
      const pa = t * 0.05;
      put(Math.cos(pa) * P, Math.sin(pa) * P, 0, 0.85, 0.75, 0.6, 0.06);
      return 0.5;
    },
  };

  const KINDS = { kilonova, tde, agn, xrb };
  return {
    group,
    get current() { return cur; },
    /** how much of the screen the close-up should own (0..1): the galaxy's stars dim while one plays */
    get focus() { return cur ? 1 : 0; },
    /** start a close-up; scale = scene size of one close-up unit; quaternion orients its plane */
    play(kind, { now, position, scale, quaternion, seed = 1, event = null }) {
      const K = KINDS[kind];
      cur = { kind, t0: now, dur: K.dur, state: K.init(seed), event };
      group.position.copy(position); group.scale.setScalar(scale);
      if (quaternion) group.quaternion.copy(quaternion); else group.quaternion.identity();
      group.visible = true;
    },
    stop() { cur = null; group.visible = false; },
    /** returns the current glow (0..~1.6) or -1 when nothing is playing */
    update(now, dt, pxPerUnit, camera) {
      n = 0;
      hole.material.opacity = 0;
      if (!cur) { group.visible = false; return -1; }
      const t = now - cur.t0;
      if (t > cur.dur) { this.stop(); return -1; }
      const glow = KINDS[cur.kind].draw(t, cur.state, dt);
      for (let i = n; i < MAX; i++) size[i] = 0;
      geo.attributes.position.needsUpdate = true; geo.attributes.aCol.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
      geo.setDrawRange(0, n);
      mat.uniforms.uPx.value = pxPerUnit * group.scale.x;
      // the shadow faces the camera; the magnifier ring too
      hole.scale.setScalar(RS); ring.scale.setScalar(cur.kind === 'xrb' ? 2.6 : cur.kind === 'agn' ? 1.3 : 1.25);
      group.updateWorldMatrix(true, false);
      const inv = group.getWorldQuaternion(new THREE.Quaternion()).invert();   // includes the galaxy's own tilt
      hole.quaternion.copy(inv).multiply(camera.getWorldQuaternion(new THREE.Quaternion()));
      ring.quaternion.copy(hole.quaternion);
      const fadeIn = Math.min(1, t / 0.8), fadeOut = Number.isFinite(cur.dur) ? Math.min(1, (cur.dur - t) / 1.2) : 1;
      ringMat.opacity = 0.55 * fadeIn * fadeOut;
      mat.uniforms.uPx.value *= 1;
      // fade everything at the end
      if (fadeOut < 1) for (let i = 0; i < n * 3; i++) col[i] *= fadeOut;
      return glow;
    },
    dispose() { geo.dispose(); mat.dispose(); hole.geometry.dispose(); hole.material.dispose(); ringGeo.dispose(); ringMat.dispose(); },
  };
}
