import * as THREE from 'three';

// Materials for the prisoners. three.js has no subsurface scattering, so skin
// gets the usual real-time stand-ins, patched into MeshPhysicalMaterial:
//   - wrapped diffuse per colour channel: light reaches past the terminator
//     further in red than in blue (red scatters ~3.5 mm in skin, blue ~1 mm),
//     which gives the warm shadow edge that separates skin from plastic;
//   - back-lit translucency where the surface is thin (ears, nose, fingers):
//     light coming from behind the head bleeds through, reddened;
//   - pores and fine wrinkles as a bump from 3D noise on the rest-pose
//     position (so they stick to the skin while it moves), faded out when a
//     pore gets smaller than a pixel;
//   - two specular lobes: the skin itself (rough) and an oily film (clearcoat);
//     sheen for peach fuzz.
// Every material also takes the shared filth uniform: brown creeping down from
// the top of the head as a prisoner gets hit by more of it.

const NOISE = /* glsl */ `
float gHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// Worley-ish pores: distance to the nearest jittered cell centre.
float gPores(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); float d = 1.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(x, y, z); vec3 o = vec3(gHash(i + g), gHash(i + g + 17.1), gHash(i + g + 31.7));
    d = min(d, length(g + o - f));
  }
  return d;
}
`;

const FILTH_PARS = /* glsl */ `
uniform float uFilth;
uniform float uTop;
varying vec3 vRest;
${NOISE}
// 0 = clean, 1 = covered. Starts at the top of the head and runs down,
// in drips: noisy edge, longer streaks where the noise says so.
float filthMask(){
  if (uFilth <= 0.001) return 0.0;
  float edge = uTop - uFilth * 1.9;
  float drip = gNoise(vec3(vRest.x * 9.0, 0.0, vRest.z * 9.0)) * 0.5 + gNoise(vRest * 3.0) * 0.35;
  return smoothstep(edge - 0.05, edge + 0.05, vRest.y + drip * 0.45 * min(1.0, uFilth * 2.0));
}
`;

function filthBody(strength = 1) {
  return /* glsl */ `
  {
    float fm = filthMask() * ${strength.toFixed(2)};
    vec3 brown = mix(vec3(0.16, 0.085, 0.035), vec3(0.32, 0.19, 0.07), gNoise(vRest * 14.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, brown, fm * 0.92);
  }
`;
}

function filthRough() {
  return /* glsl */ `
  roughnessFactor = mix(roughnessFactor, 0.28, filthMask() * 0.8); // it's wet
`;
}

// Shared uniforms object per character, so one number dirties all of them.
export function createFilth(top) {
  return { uFilth: { value: 0 }, uTop: { value: top } };
}

function withRest(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
}

function addFilth(shader, filth, strength) {
  Object.assign(shader.uniforms, filth);
  withRest(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FILTH_PARS}`)
    .replace('#include <map_fragment>', `#include <map_fragment>\n${filthBody(strength)}`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${filthRough()}`);
}

export function skinMaterial(map, filth, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.52,
    clearcoat: 0.12,
    clearcoatRoughness: 0.38,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0.55, 0.36, 0.3),
    specularIntensity: 0.5,
  });
  const u = {
    uWrap: { value: new THREE.Vector3(0.55, 0.24, 0.14) },
    uTrans: { value: opts.translucency ?? 0.6 },
    uPore: { value: opts.pores ?? 1.0 },
    uPoreScale: { value: opts.poreScale ?? 700 },
    uTone: { value: opts.tone ?? new THREE.Color(1, 1, 1) },
    uHead: { value: opts.head ?? new THREE.Vector3(0, 1.6, 0) },
    uStubble: { value: opts.stubble ?? new THREE.Color(0.08, 0.06, 0.05) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    addFilth(shader, filth, 1);
    // Direct light: wrapped, reddened diffuse plus translucency.
    const physical = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      /* glsl */ `{
        float ndl = dot( geometryNormal, directLight.direction );
        vec3 wrapped = clamp( ( vec3( ndl ) + uWrap ) / ( 1.0 + uWrap ), 0.0, 1.0 );
        wrapped *= wrapped * ( 3.0 - 2.0 * wrapped ) * 0.35 + 0.65 * wrapped; // softer roll-off
        reflectedLight.directDiffuse += directLight.color * wrapped * BRDF_Lambert( material.diffuseColor );
        // Light from behind, through thin skin.
        vec3 Lt = normalize( directLight.direction + geometryNormal * 0.35 );
        float back = pow( saturate( dot( geometryViewDir, -Lt ) ), 5.0 ) * uTrans * skinThin;
        reflectedLight.directDiffuse += directLight.color * back * vec3( 1.0, 0.32, 0.18 ) * material.diffuseColor * 2.0;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uWrap; uniform float uTrans; uniform float uPore; uniform float uPoreScale; uniform vec3 uTone; uniform vec3 uHead; uniform vec3 uStubble; float skinThin = 0.0;`)
      // Skin tone, then a shaved scalp: stubble above a hairline that runs
      // from the forehead (high) round to the nape (low), relative to the
      // head joint at the base of the skull.
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        diffuseColor.rgb *= uTone;
        {
          vec3 d = vRest - uHead;
          float line = mix(0.0, 0.135, smoothstep(-0.03, 0.08, d.z)) - 0.02 * smoothstep(0.03, 0.07, abs(d.x)) * smoothstep(0.02, -0.04, d.z);
          float scalp = smoothstep(line - 0.006, line + 0.012, d.y) * step(abs(d.x), 0.11);
          float dots = smoothstep(0.55, 0.85, gNoise(vRest * 1800.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.72, uStubble, dots * 0.8), scalp * 0.9);
        }`,
      )
      .replace('#include <lights_physical_pars_fragment>', physical)
      // Pores and fine lines: a bump on the shading normal from the height field h(rest position).
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          vec3 q = vRest * uPoreScale;
          float pore = smoothstep(0.0, 0.42, gPores(q));
          float lines = gNoise(vRest * vec3(40.0, 260.0, 40.0));
          float h = pore * 0.7 + lines * 0.3;
          vec2 dh = vec2(dFdx(h), dFdy(h));
          // Fade before pores alias (several per pixel): fwidth of the cell coordinate.
          float fade = 1.0 - smoothstep(0.12, 0.4, length(fwidth(q)));
          vec3 dpx = dFdx(-vViewPosition); vec3 dpy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpy, normal); vec3 r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          normal = normalize(abs(det) * normal - grad * uPore * 0.0035 * fade);
          // Thin parts: where the surface curves fast (ears, nose, fingers).
          skinThin = clamp(length(fwidth(normal)) / max(length(fwidth(vViewPosition)), 1e-5) * 0.012, 0.0, 1.0);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'gulag-skin';
  return m;
}

// The work suit becomes a padded camp jacket and trousers: desaturated,
// pushed towards grey-green wadding, rough cotton with fuzz.
export function clothMaterial(src, filth, tint = new THREE.Color(0.36, 0.37, 0.33)) {
  const m = new THREE.MeshPhysicalMaterial({
    map: src.map,
    normalMap: src.normalMap,
    roughness: 0.95,
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0.5, 0.5, 0.48),
  });
  const u = { uTint: { value: tint } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    addFilth(shader, filth, 1);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          // Quilting: the stitched horizontal channels of a telogreika.
          float quilt = 0.85 + 0.15 * smoothstep(0.1, 0.5, abs(fract(vRest.y * 16.0) - 0.5));
          diffuseColor.rgb = uTint * (0.35 + 0.6 * l) * quilt * (0.85 + 0.3 * gNoise(vRest * 30.0));
        }`,
      );
  };
  m.customProgramCacheKey = () => 'gulag-cloth';
  return m;
}

// Anything else on a prisoner (shoes, hair, eyes, brows): the glTF material,
// rebuilt as physical with sane alpha, plus filth.
export function plainMaterial(src, filth, kind) {
  const m = new THREE.MeshPhysicalMaterial({
    map: src.map,
    normalMap: src.normalMap,
    roughness: kind === 'eyes' ? 0.08 : kind === 'shoes' ? 0.7 : kind === 'teeth' || kind === 'tongue' ? 0.3 : 0.6,
    clearcoat: kind === 'eyes' ? 1 : 0,
    clearcoatRoughness: 0.03,
    sheen: kind === 'hair' ? 0.4 : 0,
    sheenColor: new THREE.Color(0.4, 0.35, 0.3),
  });
  if (kind === 'eyes' || kind === 'teeth' || kind === 'tongue') m.side = THREE.DoubleSide;
  // The eye's cornea shell samples a fully transparent corner of the texture.
  if (kind === 'eyes') m.alphaTest = 0.5;
  if (kind === 'brows') m.alphaTest = 0.3;
  if (kind === 'hair' || kind === 'brows' || kind === 'lashes') {
    m.alphaTest = kind === 'hair' ? 0.45 : 0.12;
    m.side = THREE.DoubleSide;
    m.alphaToCoverage = true;
  }
  m.onBeforeCompile = (shader) => {
    addFilth(shader, filth, kind === 'eyes' ? 0.3 : 1);
    // MakeHuman brows are pure black: keep their alpha, give them the stubble's colour.
    if (kind === 'brows') shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = vec3(0.07, 0.05, 0.04);');
  };
  m.customProgramCacheKey = () => `gulag-plain-${kind}`;
  return m;
}

export { NOISE };
