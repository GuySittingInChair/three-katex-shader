import { TAU, phaseOf } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// Pseudo-Kleinian fractal (Knighty, 2011, after Jos Leys' 3D Kleinian pictures), flown through from inside.
//
// A Kleinian group in 3D is a discrete group of Möbius maps of space: compositions of reflections in planes
// and inversions in spheres. Take the six faces of a box |x_j| = C_j and one sphere |p|² = S. Reflecting in
// opposite faces x = ±C composes to a translation by 4C, so the group contains a whole lattice of boxes, and
// its limit set (where orbits pile up) is an infinite, periodic lace. To find a point's place in it, fold it:
//
//     p ↦ p − 4C ⌊p/4C⌉               (the lattice: jump to the home cell)
//     repeat:  p ↦ 2 clamp(p, −C, C) − p      (reflect into the box)
//              p ↦ p · max(S/|p|², 1)        (invert in the sphere if inside it)
//
// and measure the folded point against a seed (a disc z = 0 plus its axis): DE = d_seed(p)/∏k. It is
// "pseudo" because "invert if inside" is a fold, not a proof that p reached the group's fundamental domain;
// the picture is a limit-set look-alike that is exactly symmetric under the group. Checked in Node: the
// lattice jump plus one fold gives the same point as 200 repeated box folds (to 3 × 10⁻¹⁵); the inversion is
// conformal (its Jacobian is (S/r²)·(a reflection), checked by finite differences to 3 × 10⁻¹⁰), so the
// running factor ∏k is exact; and the DE's Lipschitz constant near the surface measures 1.65, so rays step
// 0.55·DE.
//
// The flight: the camera moves one lattice period 4C_x along the corridor y = C_y, z = C_z in each loop, so
// the loop is seamless (the group makes the end look exactly like the start). That corridor is the clearest
// line through the lattice (searched over a grid of parallel lines: clearance 0.64 for every S in
// [0.9, 1.1]). The camera weaves ±0.18 around it and still keeps DE ≥ 0.57 (checked at 2000 points along the
// actual path). The sphere's S breathes in that range, so the vaults swell and thin as you pass. The DE at the camera is computed live in JavaScript
// with the same formula.
//
// Rendering, for density: orbit traps light up as emissive filaments, glow accumulates along every ray (how
// near it passed to the lace), fog brightens into coloured haze with depth, a headlamp and ambient occlusion
// carve out the vaults.

const C = [0.92436, 0.90756, 0.92436];
const SEED_R = 0.92784;
const PERIOD = 40;
const PALETTES = ['Cathedral', 'Abyss', 'Ember'];

function deAt(q, S, N = 8) {
  const p = [...q];
  let f = 1;
  for (let j = 0; j < 3; j++) { const L = 4 * C[j]; p[j] -= L * Math.round(p[j] / L); }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 3; j++) p[j] = 2 * Math.max(-C[j], Math.min(C[j], p[j])) - p[j];
    const k = Math.max(S / (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]), 1);
    p[0] *= k; p[1] *= k; p[2] *= k; f *= k;
  }
  const rxy = Math.hypot(p[0], p[1]);
  return { d: Math.max(rxy - SEED_R, Math.abs(rxy * p[2]) / Math.hypot(...p)) / f };
}

function camAt(t) {
  const u = phaseOf(t, PERIOD);
  const w = TAU * u;
  return {
    u,
    pos: [4 * C[0] * u, C[1] + 0.18 * Math.sin(w), C[2] + 0.18 * Math.sin(2 * w)],
    yaw: 0.35 * Math.sin(w + 0.6),
    pitch: 0.18 * Math.sin(2 * w + 1.1),
    S: 1 + 0.1 * Math.sin(w),
  };
}

export default {
  name: 'Pseudo-Kleinian',
  description:
    'Fly through the limit set of a 3D Kleinian group: reflections in the faces of a box and inversion in a ' +
    'sphere fold space into an infinite cathedral of lace. Knighty\'s pseudo-Kleinian fractal, rendered from ' +
    'inside with glowing orbit-trap filaments and volumetric haze. The loop is seamless because the group ' +
    'makes the end of the corridor identical to its start.',
  tags: ['fractal', 'kleinian', 'mobius', 'raymarch', '3d', 'modern', 'glow'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const c = camAt(t);
    return { ...c, de: deAt(c.pos, c.S).d };
  },

  latex: (params, hl, m) => {
    const line =
      m.de < 0.62
        ? 'Squeezing between pillars. The DE swears there is room.'
        : 'One sphere, six mirrors, no architect.';
    return (
      '\\begin{aligned}' +
      'p &\\mapsto p - 4C\\,\\lfloor p/4C \\rceil \\quad\\text{(the lattice)} \\\\' +
      'p &\\mapsto 2\\,\\mathrm{clamp}(p,-C,C) - p,\\qquad p \\mapsto p\\,\\max\\!\\big(\\tfrac{S}{|p|^2}, 1\\big) \\\\' +
      `S &= ${hl(m.S, 3)},\\quad C = (${C.map((x) => x.toFixed(3)).join(',\\,')}) \\\\` +
      `\\text{DE(camera)} &= \\tfrac{d_{\\text{seed}}(p)}{\\prod k} = ${hl(m.de, 3)} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    palette: { value: 0, min: 0, max: PALETTES.length - 1, step: 1, options: PALETTES },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uTime, uPalette, uS, uYaw, uPitch;
    uniform vec3 uCam;
    varying vec2 vUv;

    const vec3 CS = vec3(0.92436, 0.90756, 0.92436);
    vec4 gTrap;

    float de(vec3 p) {
      p -= 4.0 * CS * floor(p / (4.0 * CS) + 0.5);
      float f = 1.0;
      vec4 trap = vec4(1e9);
      for (int i = 0; i < 8; i++) {
        p = 2.0 * clamp(p, -CS, CS) - p;
        float r2 = dot(p, p);
        float k = max(uS / r2, 1.0);
        p *= k;
        f *= k;
        trap = min(trap, vec4(abs(p), r2));
      }
      gTrap = trap;
      float rxy = length(p.xy);
      return max(rxy - 0.92784, abs(rxy * p.z) / length(p)) / f;
    }

    vec3 normalAt(vec3 p, float e) {
      const vec2 k = vec2(1.0, -1.0);
      return normalize(k.xyy * de(p + k.xyy * e) + k.yyx * de(p + k.yyx * e) + k.yxy * de(p + k.yxy * e) + k.xxx * de(p + k.xxx * e));
    }

    float ao(vec3 p, vec3 n) {
      float occ = 0.0, w = 1.0;
      for (int i = 1; i <= 5; i++) {
        float h = 0.012 * float(i * i);
        occ += w * (h - de(p + n * h));
        w *= 0.7;
      }
      return clamp(1.0 - 4.0 * occ, 0.0, 1.0);
    }

    vec3 pal(float x, int k) {
      if (k == 1) return 0.5 + 0.5 * cos(6.2831 * (x + vec3(0.55, 0.6, 0.7)));
      if (k == 2) return 0.5 + 0.5 * cos(6.2831 * (x * 0.6 + vec3(0.0, 0.12, 0.25)));
      return 0.5 + 0.5 * cos(6.2831 * (x + vec3(0.0, 0.33, 0.67)));
    }

    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      float aspect = uResolution.x / uResolution.y;
      uv.x *= aspect;
      float zoom = aspect < 1.0 ? 1.1 * aspect + 0.3 : 1.2;
      int k = int(uPalette + 0.5);

      vec3 ro = uCam;
      vec3 fw = normalize(vec3(cos(uYaw) * cos(uPitch), sin(uPitch), sin(uYaw) * cos(uPitch)));
      vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(rt, fw);
      vec3 rd = normalize(fw * zoom + rt * uv.x + up * uv.y);

      float t = 0.02, hit = -1.0;
      vec3 glow = vec3(0.0);
      for (int i = 0; i < 120; i++) {
        vec3 p = ro + rd * t;
        float d = de(p);
        // Light the haze by how near the ray passes to the lace, coloured by where it is in the orbit.
        glow += pal(0.15 * log(gTrap.w + 1e-4) + 0.02 * t, k) * exp(-d * 140.0) * 0.008 / (1.0 + 0.3 * t * t);
        if (d < 0.0012 * t) { hit = t; break; }
        t += d * 0.55;
        if (t > 9.0) break;
      }

      vec3 fogCol = k == 2 ? vec3(0.012, 0.004, 0.002) : (k == 1 ? vec3(0.0, 0.004, 0.012) : vec3(0.006, 0.003, 0.012));
      vec3 col = fogCol;
      if (hit > 0.0) {
        vec3 p = ro + rd * hit;
        de(p);
        vec4 tr = gTrap;
        vec3 n = normalAt(p, 0.0006 * hit);
        float occ = ao(p, n);
        // Hue walks with depth, so each wall of rings down the corridor gets its own colour.
        vec3 base = pal(0.1 * log(tr.w + 1e-4) + 0.3 * tr.y + 0.6 + 0.11 * hit, k) * 0.85 + 0.05;
        vec3 l = normalize(ro + up * 0.3 - p);
        float dif = max(dot(n, l), 0.0);
        float lamp = 2.2 / (1.0 + hit * hit * 1.6);
        float spec = pow(max(dot(reflect(rd, n), l), 0.0), 32.0);
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        col = base * (dif * lamp + 0.04 * occ) * occ + spec * lamp * 0.4 * occ + base * rim * 0.9 * lamp * occ;
        // Emissive filaments where the orbit skimmed the box's planes.
        float vein = exp(-min(tr.x, tr.z) * 40.0);
        col += pal(0.08 * hit + 0.3 * tr.y, k) * vein * 1.2 * occ / (1.0 + 0.07 * hit * hit);
        float fog = 1.0 - exp(-hit * 0.28);
        col = mix(col, fogCol, fog);
      }
      col += glow;

      col = aces(col * 1.2);
      col = pow(col, vec3(1.0 / 2.2));
      vec2 q = vUv - 0.5;
      col *= 1.0 - 0.5 * dot(q, q);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uPalette: { value: 0 }, uS: { value: 1 }, uYaw: { value: 0 }, uPitch: { value: 0 },
      uCam: { value: [0, C[1], C[2]] },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uPalette.value = ctx.params.palette;
    u.uS.value = m.S;
    u.uYaw.value = m.yaw;
    u.uPitch.value = m.pitch;
    u.uCam.value = m.pos;
  },
};
