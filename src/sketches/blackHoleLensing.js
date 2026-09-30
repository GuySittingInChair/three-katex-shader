import { TAU, phaseOf } from '../lib/motion.js';

// A black hole bending light, traced per pixel. Units where G = c = M = 1.
// Light around a (non-spinning, Schwarzschild) black hole moves in a plane,
// and with u = 1/r its path obeys
//
//     d²u/dφ² + u = 3u²
//
// (the 3u² is general relativity; without it light goes straight). Each pixel
// sends a ray back from the camera and steps this equation (RK4) until the
// ray falls inside r = 2 (black), escapes (the starfield in the direction it
// leaves), or crosses the thin disk of hot gas between r = 6 and 16.
// Light passing closer than b = 3√3 ≈ 5.2 is captured (checked numerically:
// b = 5.18 falls in, 5.21 escapes), which sets the size of the dark shadow.
// Light from behind the hole is bent over the top and under the bottom, so
// the far side of the disk appears as the arch; the side of the disk moving
// toward you is Doppler-boosted, brighter and bluer, and light climbing out
// of the well is reddened, g = √(1 − 3/r) / (1 − v·n).
//
// Loop (24 s): the camera, 18 units out, rises from 3° above the disk (the
// edge-on view from Interstellar) to 35° and back. The gas swirls on its own.

const PERIOD = 24;

export default {
  name: 'Black Hole Lensing',
  description:
    'Light traced around a black hole with general relativity, per pixel on the GPU. Rays closer than 3√3 ' +
    'masses fall in (the shadow); the far side of the glowing disk is bent over the top into an arch; the side ' +
    'coming toward you is Doppler-boosted. The viewing angle is shown live.',
  tags: ['general relativity', 'black hole', 'ray tracing', 'lensing'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const deg = 3 + 32 * (0.5 - 0.5 * Math.cos(TAU * p));
    return { deg, elev: (deg * Math.PI) / 180 };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\frac{d^2u}{d\\varphi^2} + u &= 3Mu^2,\\quad u = \\frac1r \\\\' +
    'b_{\\text{shadow}} &= 3\\sqrt3\\,M \\approx 5.2M,\\quad \\text{photon orbit } r = 3M \\\\' +
    `\\text{camera } r &= ${hl(params.distance, 0)}M,\\ ${hl(m.deg, 0)}^\\circ \\text{ above the disk}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    distance: { value: 18, min: 10, max: 30 },
    quality: { value: 260, min: 120, max: 400, step: 10 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uElev;
    uniform float uDist;
    uniform float uSteps;
    varying vec2 vUv;

    const float DISK_IN = 6.0;
    const float DISK_OUT = 16.0;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.11, 0.23, 0.37));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    vec3 sky(vec3 d) {
      vec3 q = d * 160.0;
      vec3 cell = floor(q);
      float h = hash(cell);
      float star = step(0.982, h) * smoothstep(0.55, 0.0, length(fract(q) - 0.5));
      vec3 tint = mix(vec3(1.0, 0.82, 0.62), vec3(0.72, 0.82, 1.0), hash(cell + 7.0));
      float band = exp(-pow(d.y * 2.6 - 0.5 * d.x, 2.0)) * 0.06;
      return star * tint * (0.5 + 0.5 * hash(cell + 3.0)) + band * vec3(0.55, 0.5, 0.7);
    }

    vec3 disk(float r, vec3 p, vec3 rayDir) {
      float heat = pow(DISK_IN / r, 0.75);
      vec3 color = mix(vec3(0.85, 0.3, 0.07), vec3(1.0, 0.86, 0.62), heat);
      float v = sqrt(1.0 / r);                               // Keplerian orbital speed
      vec3 vDir = normalize(vec3(-p.z, 0.0, p.x));
      float g = sqrt(max(1.0 - 3.0 / r, 0.01)) / (1.0 - v * dot(vDir, -rayDir));
      float angle = atan(p.z, p.x);
      float swirl = 0.7 + 0.3 * sin(9.0 * angle + 5.0 * log(r) - uTime * 1.6 * pow(r / DISK_IN, -1.5));
      float edges = smoothstep(DISK_IN - 0.4, DISK_IN + 0.9, r) * smoothstep(DISK_OUT, DISK_OUT - 4.0, r);
      float I = heat * heat * pow(g, 3.0) * swirl * edges * 2.2;
      I = I / (1.0 + I);                                     // tone-map: never blows out
      return color * mix(vec3(1.0, 0.85, 0.75), vec3(0.85, 0.95, 1.15), clamp(g - 0.6, 0.0, 1.0)) * I;
    }

    float accel(float u) { return 3.0 * u * u - u; }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      vec3 cam = uDist * vec3(0.0, sin(uElev), cos(uElev));
      vec3 fwd = normalize(-cam);
      vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(right, fwd);
      vec3 d = normalize(fwd + (uv.x * right + uv.y * up) * 0.95);

      // The ray's plane: e1 points out from the hole through the camera,
      // e2 is the ray's sideways direction within that plane.
      vec3 e1 = normalize(cam);
      vec3 side = d - dot(d, e1) * e1;
      float st = length(side);
      if (st < 1e-6) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      vec3 e2 = side / st;

      float u = 1.0 / uDist;
      float du = -u * dot(d, e1) / st;
      float phi = 0.0;
      float h = 0.04;
      vec3 prev = cam;
      vec3 col = sky(d);
      bool done = false;
      for (int i = 0; i < 400; i++) {
        if (float(i) >= uSteps) break;
        float k1u = du;              float k1v = accel(u);
        float k2u = du + 0.5*h*k1v;  float k2v = accel(u + 0.5*h*k1u);
        float k3u = du + 0.5*h*k2v;  float k3v = accel(u + 0.5*h*k2u);
        float k4u = du + h*k3v;      float k4v = accel(u + h*k3u);
        u += h / 6.0 * (k1u + 2.0*k2u + 2.0*k3u + k4u);
        du += h / 6.0 * (k1v + 2.0*k2v + 2.0*k3v + k4v);
        phi += h;
        vec3 radial = cos(phi) * e1 + sin(phi) * e2;
        if (u > 0.5) { col = vec3(0.0); done = true; break; }          // inside r = 2M
        if (u <= 0.0) { col = sky(radial); done = true; break; }        // escaped to infinity
        vec3 p = radial / u;
        if (prev.y * p.y < 0.0) {                                       // crossed the disk's plane
          vec3 hit = mix(prev, p, prev.y / (prev.y - p.y));
          float r = length(hit);
          if (r > DISK_IN - 0.5 && r < DISK_OUT) { col = disk(r, hit, normalize(p - prev)); done = true; break; }
        }
        prev = p;
      }
      if (!done) col = sky(normalize(prev));
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return { uElev: { value: 0.1 }, uDist: { value: 18 }, uSteps: { value: 260 } };
  },

  update(ctx, state) {
    const u = state.uniforms;
    u.uElev.value = ctx.motion.elev;
    u.uDist.value = ctx.params.distance;
    u.uSteps.value = ctx.params.quality;
  },
};
