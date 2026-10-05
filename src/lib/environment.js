import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Real-looking places to put a sketch in: a sky with a sun, ground, grass,
// shadows and reflections, or a lab bench, plus the film-style camera
// processing that makes them read as real (HDR light, ACES tone mapping,
// sRGB output, a little vignette and grain).
//
//     const env = createEnvironment(ctx, { preset: 'meadow', sun: [8, 200] });
//     env.setSun(elevationDeg, azimuthDeg);    // any time; the sky follows
//     env.update(ctx);                         // every frame (wind in the grass)
//     env.dispose();                           // in the sketch's dispose()
//
// Pass `fov` (degrees, as framed on a wide screen) and the camera widens on
// tall screens so a phone in portrait sees the same scene.
//
// Presets: 'meadow' (sky, grass), 'dusk' (meadow after sunset), 'lab'
// (indoor bench under ceiling lights). Objects you add should use
// MeshStandardMaterial / MeshPhysicalMaterial and set castShadow /
// receiveShadow; scene.environment gives them reflections for free.
//
// How it hooks in: it sets ctx.pipeline, which SketchRunner uses instead of
// rendering the scene straight into the sketch's target. The scene is drawn
// into a high-dynamic-range buffer (with 4× anti-aliasing), then a final
// pass maps that light onto the screen like film does.

const PRESETS = {
  meadow: {
    sky: true, sun: [14, 210], turbidity: 4, rayleigh: 1.4, exposure: 0.55,
    ground: 'grass', grass: true, fog: 0.012, sunIntensity: 3.2, hemi: 0.6,
  },
  dusk: {
    sky: true, sun: [-3.5, 250], turbidity: 6, rayleigh: 2.6, exposure: 1.8,
    ground: 'grass', grass: true, fog: 0.03, sunIntensity: 0.0, hemi: 0.2,
  },
  lab: {
    sky: false, exposure: 1.0, ground: 'bench', grass: false, fog: 0,
    sunIntensity: 2.4, hemi: 0.35, sun: [62, 140],
  },
};

const POST_FRAG = `
  uniform sampler2D tScene;
  uniform float uExposure;
  uniform float uVignette;
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  // ACES filmic curve, Stephen Hill's fit (the one three.js uses).
  vec3 rrtOdt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 c) {
    const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    return clamp(OUT * rrtOdt(IN * c), 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec3 c = texture2D(tScene, vUv).rgb * uExposure / 0.6;
    c = aces(c);
    vec2 q = vUv - 0.5;
    q.x *= uResolution.x / uResolution.y;
    c *= 1.0 - uVignette * smoothstep(0.35, 1.1, length(q));
    c = toSrgb(c);
    c += (hash(vUv * uResolution + fract(uTime) * 91.0) - 0.5) / 255.0 * 1.5;   // dither: no banding
    gl_FragColor = vec4(c, 1.0);
  }
`;

const POST_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

// A canvas texture of value noise, coloured between two colours. Used for the
// ground and the bench so they aren't flat.
function noiseTexture(size, colorA, colorB, scales, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  // Tileable value noise: lattice values wrap around the edge.
  const layers = scales.map((cells) => {
    const v = new Float32Array(cells * cells).map(() => Math.random());
    return { cells, v };
  });
  const sample = ({ cells, v }, x, y) => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (i, j) => v[((j % cells) * cells) + (i % cells)];
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bot = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bot * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let w = 0;
      layers.forEach((layer, k) => {
        const amp = 1 / (k + 1);
        n += amp * sample(layer, x, y);
        w += amp;
      });
      n /= w;
      const i = 4 * (y * size + x);
      img.data[i] = 255 * (a.r + (b.r - a.r) * n);
      img.data[i + 1] = 255 * (a.g + (b.g - a.g) * n);
      img.data[i + 2] = 255 * (a.b + (b.b - a.b) * n);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  return tex;
}

// Instanced grass: tapered, bent blades that sway in a travelling gust,
// lit and shadowed like everything else (the sway is added to the standard
// material's vertex shader).
function createGrass({ count, radius, height, clearRadius = 0 }) {
  const SEG = 4;
  const geo = new THREE.BufferGeometry();
  const pos = [];
  const idx = [];
  for (let s = 0; s <= SEG; s++) {
    const v = s / SEG;
    const w = 0.035 * (1 - v);
    pos.push(-w, v, 0, w, v, 0);
    if (s < SEG) {
      const k = 2 * s;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  const uniforms = { uWind: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float gust = sin(root.x * 0.35 + root.z * 0.2 - uWind * 1.7) * 0.5 + 0.5;
        float bend = position.y * position.y * (0.25 + 0.55 * gust + 0.08 * sin(uWind * 5.0 + root.x * 3.0));
        transformed.z += bend;
        transformed.y -= 0.3 * bend * bend;`
      );
    // Blades are thin: light them from both sides with an up-facing normal,
    // which reads as a field instead of flickering cards.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      'vec3 objectNormal = vec3(0.0, 1.0, 0.25);'
    );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Uniform over a disc, denser near the middle where the camera looks.
    const r = clearRadius + (radius - clearRadius) * Math.random() ** 0.8;
    const a = Math.random() * Math.PI * 2;
    p.set(r * Math.cos(a), 0, r * Math.sin(a));
    e.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
    q.setFromEuler(e);
    const h = height * (0.55 + 0.9 * Math.random());
    s.set(1 + Math.random(), h, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    col.setHSL(0.2 + 0.08 * Math.random(), 0.45 + 0.2 * Math.random(), 0.16 + 0.12 * Math.random());
    mesh.setColorAt(i, col);
  }
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function createEnvironment(ctx, options = {}) {
  const opts = { ...PRESETS[options.preset || 'meadow'], ...options };
  const { scene, renderer } = ctx;
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;

  // --- Lights ---
  const sun = new THREE.DirectionalLight(0xfff2dd, opts.sunIntensity);
  const shadowR = opts.shadowRadius ?? 8;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -shadowR, right: shadowR, top: shadowR, bottom: -shadowR, near: 0.5, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a3020, opts.hemi);
  scene.add(hemi);

  if (opts.fog) scene.fog = new THREE.FogExp2(0x8899aa, opts.fog);

  // --- Sky (or a room) for the background and for reflections ---
  let sky = null;
  let skyScene = null;
  if (opts.sky) {
    sky = new Sky();
    sky.scale.setScalar(900);
    const u = sky.material.uniforms;
    u.turbidity.value = opts.turbidity;
    u.rayleigh.value = opts.rayleigh;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    scene.add(sky);
    skyScene = new THREE.Scene();
  } else {
    envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.background = new THREE.Color(0x15171b);
  }

  const sunDir = new THREE.Vector3();
  let bakedAt = null;
  // A second copy of the sky, alone in its own scene, for baking reflections
  // and probing colours. Its uniforms share the main sky's values.
  let skyProbe = null;
  if (sky) {
    skyProbe = new Sky();
    skyProbe.scale.setScalar(900);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'sunPosition', 'up']) {
      skyProbe.material.uniforms[k] = sky.material.uniforms[k];
    }
    skyScene.add(skyProbe);
  }

  function bakeSky() {
    // Bake the sky into an environment map so metal and glass reflect it.
    // Only when the sun has moved noticeably: baking takes a few ms.
    envTarget?.dispose();
    envTarget = pmrem.fromScene(skyScene, 0);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = Math.max(0.05, Math.min(1, 0.25 + sunDir.y * 3));
    probedAt = null;
  }

  // Fog the ground into the sky's real colour at the horizon behind it, so
  // there's no seam where the ground ends. The horizon's colour depends on
  // direction (bright towards the sunset), so it's measured where the camera
  // is looking, and again whenever the camera turns more than ~25°.
  const probe = new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType });
  const probeCam = new THREE.PerspectiveCamera(3, 1, 1, 2000);   // narrow: just the horizon
  const probePixels = new Float32Array(4 * 16);
  let probedAt = null;
  function sampleHorizon(azimuth) {
    const sum = [0, 0, 0];
    const prev = renderer.getRenderTarget();
    try {
      for (const off of [-0.3, 0, 0.3]) {
        probeCam.lookAt(Math.cos(azimuth + off), 0.03, Math.sin(azimuth + off));
        renderer.setRenderTarget(probe);
        renderer.render(skyScene, probeCam);
        renderer.readRenderTargetPixels(probe, 0, 0, 4, 4, probePixels);
        for (let i = 0; i < 16; i++) for (let c = 0; c < 3; c++) sum[c] += probePixels[4 * i + c] / 48;
      }
      scene.fog.color.setRGB(sum[0], sum[1], sum[2]);
    } catch {
      // Float read-back unsupported: keep the previous fog colour.
    }
    renderer.setRenderTarget(prev);
    probedAt = azimuth;
  }
  const look = new THREE.Vector3();
  function followCamera(camera) {
    if (!sky || !scene.fog) return;
    camera.getWorldDirection(look);
    const az = Math.atan2(look.z, look.x);
    if (probedAt === null || Math.abs(Math.atan2(Math.sin(az - probedAt), Math.cos(az - probedAt))) > 0.45) sampleHorizon(az);
  }

  function setSun(elevationDeg, azimuthDeg) {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    sunDir.setFromSphericalCoords(1, phi, theta);
    sun.position.copy(sunDir).multiplyScalar(30);
    sun.target.position.set(0, 0, 0);
    // Below the horizon the "sun" light fades out; the sky keeps glowing.
    const up = THREE.MathUtils.clamp(elevationDeg / 6, 0, 1);
    sun.intensity = opts.sunIntensity * up;
    sun.color.setHSL(0.08, 0.6 * (1 - Math.min(1, elevationDeg / 40)) + 0.15, 0.6 + 0.3 * up);
    if (sky) {
      sky.material.uniforms.sunPosition.value.copy(sunDir);
      if (bakedAt === null || bakedAt.angleTo(sunDir) > 0.035) {
        bakeSky();
        bakedAt = sunDir.clone();
      }
    }
  }

  // --- Ground ---
  let ground = null;
  if (opts.ground === 'grass') {
    const map = keep(noiseTexture(256, 0x2c3a17, 0x5d5a2a, [4, 16, 64], 40));
    ground = new THREE.Mesh(
      new THREE.CircleGeometry(300, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map, roughness: 0.95 })
    );
  } else if (opts.ground === 'bench') {
    // Black epoxy-resin lab bench top, with a tiled wall behind it.
    const map = keep(noiseTexture(256, 0x111214, 0x22252a, [8, 32, 128], 3));
    ground = new THREE.Mesh(
      new THREE.BoxGeometry(30, 0.6, 6).translate(0, -0.3, 0),
      new THREE.MeshPhysicalMaterial({ map, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 })
    );
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const tg = tile.getContext('2d');
    tg.fillStyle = '#7f8a8c';
    tg.fillRect(0, 0, 128, 128);
    tg.fillStyle = '#d9dedc';
    tg.fillRect(3, 3, 122, 58);
    tg.fillRect(-61, 67, 122, 58);
    tg.fillRect(67, 67, 122, 58);
    const wallMap = keep(new THREE.CanvasTexture(tile));
    wallMap.colorSpace = THREE.SRGBColorSpace;
    wallMap.wrapS = wallMap.wrapT = THREE.RepeatWrapping;
    wallMap.repeat.set(20, 5);
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 7).translate(0, 3.5, -3),
      new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.35 })
    );
    wall.receiveShadow = true;
    scene.add(wall);
  }
  if (ground) {
    ground.receiveShadow = true;
    scene.add(ground);
  }

  let grass = null;
  if (opts.grass) {
    const phone = window.matchMedia('(pointer: coarse)').matches;
    grass = createGrass({
      count: options.grassCount ?? (phone ? 9000 : 26000),
      radius: options.grassRadius ?? 16,
      height: options.grassHeight ?? 0.35,
      clearRadius: options.grassClear ?? 0,
    });
    scene.add(grass.mesh);
  }

  setSun(...opts.sun);

  // --- Film pipeline ---
  const hdr = new THREE.WebGLRenderTarget(ctx.size.width, ctx.size.height, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const post = {
    tScene: { value: hdr.texture },
    uExposure: { value: opts.exposure },
    uVignette: { value: options.vignette ?? 0.35 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(ctx.size.width, ctx.size.height) },
  };
  const postMat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: post, depthTest: false, depthWrite: false });
  const postScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  quad.frustumCulled = false;
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Keep the horizontal view of a 1.4:1 screen on anything narrower.
  function fitCamera(w, h) {
    if (!options.fov || !ctx.camera.isPerspectiveCamera) return;
    const aspect = w / h;
    const half = THREE.MathUtils.degToRad(options.fov / 2);
    const vfov = aspect >= 1.4 ? options.fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) * 1.4 / aspect));
    ctx.camera.fov = Math.min(vfov, 80);
    ctx.camera.updateProjectionMatrix();
  }
  fitCamera(ctx.size.width, ctx.size.height);

  ctx.pipeline = {
    render(r, sceneToDraw, camera, target) {
      r.setRenderTarget(hdr);
      r.clear();
      r.render(sceneToDraw, camera);
      r.setRenderTarget(target);
      r.clear();
      r.render(postScene, postCam);
    },
    setSize(w, h) {
      hdr.setSize(w, h);
      post.uResolution.value.set(w, h);
      fitCamera(w, h);
    },
  };

  return {
    sun,
    hemi,
    sky,
    ground,
    grass: grass?.mesh ?? null,
    setSun,
    get sunDirection() {
      return sunDir;
    },
    set exposure(v) {
      post.uExposure.value = v;
    },
    get exposure() {
      return post.uExposure.value;
    },
    update(c) {
      post.uTime.value = c.time;
      followCamera(c.camera);
      if (grass) grass.uniforms.uWind.value = c.time;
    },
    dispose() {
      delete ctx.pipeline;
      hdr.dispose();
      postMat.dispose();
      quad.geometry.dispose();
      envTarget?.dispose();
      pmrem.dispose();
      probe.dispose();
      skyProbe?.geometry.dispose();
      skyProbe?.material.dispose();
      scene.environment = null;
      scene.fog = null;
      for (const d of disposables) d.dispose();
    },
  };
}
