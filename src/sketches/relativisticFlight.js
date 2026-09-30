import * as THREE from 'three';
import { phaseOf, smooth } from '../lib/motion.js';

// Flying through a starfield near the speed of light. Stars don't move; you
// do, at speed β straight ahead (−z, where the camera looks). Two effects of special relativity,
// both done per star on the GPU:
//
// Aberration: a star at angle θ from straight ahead appears at θ' with
//     cos θ' = (cos θ + β) / (1 + β cos θ)
// so the sky crowds forward (at β = 0.97, 92% of all stars sit within 45°
// of straight ahead, against 15% at rest; checked numerically).
//
// Doppler: light arriving from θ' is shifted by
//     D = 1 / (γ (1 − β cos θ'))
// bluer and brighter ahead (D = √((1+β)/(1−β)) = 8.1 at β = 0.97), redder
// and dimmer behind. Each star's colour temperature is multiplied by D and
// turned into a colour with a blackbody fit; brightness goes up as D³
// (tone-mapped, so it never blows out to white). The latitude/longitude grid
// is aberrated the same way, so you can see the sky squeeze.
//
// Loop (20 s): accelerate to β = 0.97, cruise, slow back to rest.

const PERIOD = 20;
const TOP = 0.97;
const STARS = 5000;
const R = 40;

const COMMON = `
  uniform float uBeta;
  // Aberrate a direction toward −z (straight ahead); returns the new direction and D in w.
  vec4 aberrate(vec3 n) {
    float c = -n.z;
    float cp = (c + uBeta) / (1.0 + uBeta * c);
    float sp = sqrt(max(1.0 - cp * cp, 0.0));
    vec2 around = length(n.xy) > 1e-6 ? normalize(n.xy) : vec2(1.0, 0.0);
    float gamma = 1.0 / sqrt(1.0 - uBeta * uBeta);
    float D = 1.0 / (gamma * (1.0 - uBeta * cp));
    return vec4(around * sp, -cp, D);
  }
  // Blackbody colour for a temperature in kelvin (a smooth fit, 1000–40000 K).
  vec3 blackbody(float T) {
    T = clamp(T, 1000.0, 40000.0) / 100.0;
    float r = T <= 66.0 ? 1.0 : clamp(1.2929 * pow(T - 60.0, -0.1332), 0.0, 1.0);
    float g = T <= 66.0 ? clamp(0.3901 * log(T) - 0.6318, 0.0, 1.0) : clamp(1.1299 * pow(T - 60.0, -0.0755), 0.0, 1.0);
    float b = T >= 66.0 ? 1.0 : (T <= 19.0 ? 0.0 : clamp(0.5432 * log(T - 10.0) - 1.1963, 0.0, 1.0));
    return vec3(r, g, b);
  }
`;

const STAR_VERT = `
  ${COMMON}
  uniform float uScale;
  attribute float aTemp;
  attribute float aMag;
  varying vec3 vColor;
  void main() {
    vec4 a = aberrate(normalize(position));
    float bright = aMag * pow(a.w, 3.0);
    bright = bright / (1.0 + bright); // tone-map
    vColor = blackbody(aTemp * a.w) * (0.25 + 0.95 * bright);
    vec4 mv = modelViewMatrix * vec4(a.xyz * ${R.toFixed(1)}, 1.0);
    gl_PointSize = uScale * (1.2 + 3.2 * bright);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = `
  varying vec3 vColor;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor * (1.0 - d * 0.6), 1.0);
  }
`;
const GRID_VERT = `
  ${COMMON}
  varying float vD;
  void main() {
    vec4 a = aberrate(normalize(position));
    vD = a.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(a.xyz * ${(R * 1.02).toFixed(1)}, 1.0);
  }
`;
const GRID_FRAG = `
  varying float vD;
  void main() {
    float t = clamp(log(vD) / log(8.0) * 0.5 + 0.5, 0.0, 1.0); // red behind → blue ahead
    gl_FragColor = vec4(mix(vec3(0.35, 0.12, 0.1), vec3(0.12, 0.22, 0.42), t) * 0.8, 1.0);
  }
`;

export default {
  name: 'Relativistic Flight',
  description:
    'Fly through a starfield at up to 97% of light speed. The stars crowd into a ring ahead (aberration), turn ' +
    'blue ahead and red behind (Doppler) and brighten in the direction of travel. The sky grid squeezes with them. ' +
    'β, γ and the Doppler factor straight ahead are shown live. Drag to look around; look behind you too.',
  tags: ['relativity', 'aberration', 'doppler', 'minkowski'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const beta = TOP * (p < 0.4 ? smooth(p / 0.4) : p < 0.65 ? 1 : 1 - smooth((p - 0.65) / 0.35));
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    return { beta, gamma, ahead: Math.sqrt((1 + beta) / (1 - beta)) };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    "\\cos\\theta' &= \\frac{\\cos\\theta + \\beta}{1 + \\beta\\cos\\theta},\\quad D = \\frac{1}{\\gamma\\,(1 - \\beta\\cos\\theta')} \\\\" +
    `\\beta &= ${hl(m.beta, 3)},\\quad \\gamma = ${hl(m.gamma, 2)},\\quad D_{\\text{ahead}} = ${hl(m.ahead, 2)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    starSize: { value: 1, min: 0.5, max: 2.5 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 0.01);
    ctx.camera.fov = 90;
    ctx.camera.updateProjectionMatrix(); // it looks along −z, the direction of travel

    let seed = 2718;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const pos = new Float32Array(STARS * 3);
    const temp = new Float32Array(STARS);
    const mag = new Float32Array(STARS);
    for (let i = 0; i < STARS; i++) {
      const z = 2 * rand() - 1;
      const a = 2 * Math.PI * rand();
      const s = Math.sqrt(1 - z * z);
      pos.set([s * Math.cos(a), s * Math.sin(a), z], i * 3);
      temp[i] = 3000 + 9000 * rand() ** 2; // mostly cool stars, some hot
      mag[i] = 0.08 + 0.9 * rand() ** 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aTemp', new THREE.BufferAttribute(temp, 1));
    geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    const uniforms = { uBeta: { value: 0 }, uScale: { value: 1 } };
    const starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms });
    const stars = new THREE.Points(geo, starMat);
    stars.frustumCulled = false;

    // Lines of latitude and longitude every 15°, as short segments so they bend.
    const seg = [];
    const dir = (th, ph) => [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    const STEP = Math.PI / 12;
    for (let th = STEP; th < Math.PI - 1e-6; th += STEP) {
      for (let k = 0; k < 96; k++) seg.push(...dir(th, (k * 2 * Math.PI) / 96), ...dir(th, ((k + 1) * 2 * Math.PI) / 96));
    }
    for (let ph = 0; ph < 2 * Math.PI - 1e-6; ph += STEP) {
      for (let k = 0; k < 96; k++) seg.push(...dir((k * Math.PI) / 96, ph), ...dir(((k + 1) * Math.PI) / 96, ph));
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
    const gridMat = new THREE.ShaderMaterial({ vertexShader: GRID_VERT, fragmentShader: GRID_FRAG, uniforms });
    const grid = new THREE.LineSegments(gridGeo, gridMat);
    grid.frustumCulled = false;

    ctx.scene.add(grid, stars);
    return { geo, starMat, gridGeo, gridMat, uniforms };
  },

  update(ctx, state) {
    state.uniforms.uBeta.value = ctx.motion.beta;
    state.uniforms.uScale.value = ctx.params.starSize * Math.min(2, ctx.renderer.getPixelRatio());
  },

  dispose(ctx, state) {
    state.geo.dispose();
    state.starMat.dispose();
    state.gridGeo.dispose();
    state.gridMat.dispose();
  },
};
