import * as THREE from 'three';

// The camp: a fenced yard of trampled snow at dusk, two long barracks, four
// watchtowers with sweeping searchlights, barbed wire, a slogan over the gate,
// snow falling, and a low cloud deck (the butts hang just under it).
// Units: metres. The yard is |x| < YARD.x, |z| < YARD.z.

export const YARD = { x: 17, z: 13 };
const DECK_Y = 34;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise on a wrapped grid, for canvas textures.
function noise2(n, seed) {
  const r = rng(seed);
  const g = new Float32Array(n * n).map(() => r());
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => g[((j % n) + n) % n * n + (((i % n) + n) % n)];
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function fbmCanvas(size, seed, octaves, base) {
  const nz = noise2(256, seed);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let f = base / size;
      for (let o = 0; o < octaves; o++) {
        v += amp * nz(x * f * (256 / base), y * f * (256 / base));
        amp *= 0.5;
        f *= 2;
      }
      h[y * size + x] = v;
    }
  }
  return h;
}

function normalTexture(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (i, j) => h[((j + size) % size) * size + ((i + size) % size)];
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const k = 4 * (y * size + x);
      data[k] = (0.5 - (0.5 * dx) / l) * 255;
      data[k + 1] = (0.5 - (0.5 * dy) / l) * 255;
      data[k + 2] = (0.5 + 0.5 / l) * 255;
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function canvasTexture(size, draw, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Weathered planks: vertical boards with grain, knots and gaps.
function plankTexture(seed) {
  const r = rng(seed);
  return canvasTexture(512, (g, n) => {
    const boards = 8;
    const w = n / boards;
    for (let b = 0; b < boards; b++) {
      const base = 38 + r() * 22;
      for (let y = 0; y < n; y += 2) {
        const v = base + Math.sin(y * 0.05 + b * 3 + r() * 0.3) * 6 + (r() - 0.5) * 10;
        g.fillStyle = `rgb(${v * 1.15 | 0},${v | 0},${v * 0.82 | 0})`;
        g.fillRect(b * w, y, w, 2);
      }
      g.fillStyle = 'rgba(10,8,6,0.85)';
      g.fillRect(b * w, 0, 2, n);
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        g.ellipse(b * w + r() * w, r() * n, 3 + r() * 4, 6 + r() * 6, 0, 0, Math.PI * 2);
        g.fillStyle = 'rgba(20,14,10,0.7)';
        g.fill();
      }
    }
  });
}

function bannerTexture() {
  return canvasTexture(1024, (g, n) => {
    g.fillStyle = '#7a1612';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#e8dcc8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 150px serif';
    g.fillText('ТРУД — ДЕЛО', n / 2, n * 0.33);
    g.fillText('ЧЕСТИ', n / 2, n * 0.66);
    // Weathering.
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * n, Math.random() * n, 2 + Math.random() * 6, 1 + Math.random() * 3);
    }
  });
}

export function createWorld(scene, renderer) {
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const colliders = []; // axis-aligned boxes {minX, maxX, minZ, maxZ}
  const updaters = [];

  // ---- light ----
  scene.fog = new THREE.FogExp2(0x7d8796, 0.016);
  const hemi = new THREE.HemisphereLight(0x8e9db8, 0xdfe3ea, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc49a, 2.1);
  sun.position.set(-30, 14, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // ---- sky dome: cold overcast above, a band of last light at the horizon ----
  const sky = new THREE.Mesh(
    keep(new THREE.SphereGeometry(400, 32, 16)),
    keep(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `varying vec3 vD; void main(){
        float h = vD.y;
        vec3 top = vec3(0.16, 0.19, 0.25);
        vec3 hor = vec3(0.50, 0.53, 0.58);
        vec3 glow = vec3(0.95, 0.62, 0.42);
        float sunSide = pow(max(0.0, dot(normalize(vec3(vD.x, 0.0, vD.z)), normalize(vec3(-30.0, 0.0, 18.0)))), 6.0);
        vec3 c = mix(hor, top, smoothstep(0.0, 0.5, h));
        c = mix(c, glow, sunSide * exp(-abs(h) * 14.0) * 0.8);
        c = mix(c, vec3(0.62, 0.64, 0.68), smoothstep(0.0, -0.1, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    })),
  );
  scene.add(sky);

  // Environment for reflections: the same sky, prefiltered.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  envScene.add(new THREE.HemisphereLight(0x8e9db8, 0xdfe3ea, 1));
  const env = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  keep(env);

  // ---- ground: snow, trampled to slush inside the yard ----
  const G = 180;
  const groundGeo = keep(new THREE.PlaneGeometry(G, G, 180, 180));
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position;
  const colors = new Float32Array(gp.count * 3);
  const nz = noise2(256, 7);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const inYard = Math.max(Math.abs(x) / (YARD.x + 1), Math.abs(z) / (YARD.z + 1));
    const drift = THREE.MathUtils.smoothstep(inYard, 1.05, 1.5);
    gp.setY(i, drift * (nz(x * 0.08, z * 0.08) * 1.6 + nz(x * 0.3 + 40, z * 0.3) * 0.3));
    // Trampled: grey-brown slush where people walk, worst in the middle and on paths.
    const path = Math.exp(-((x * x) / 60 + (z * z) / 40)) + 0.6 * Math.exp(-(z * z) / 3) * (inYard < 1 ? 1 : 0);
    const tr = THREE.MathUtils.clamp((path * 0.8 + nz(x * 0.4, z * 0.4) * 0.5 - 0.25) * (1 - drift), 0, 1);
    const snow = [0.86, 0.89, 0.93];
    const slush = [0.42, 0.4, 0.38];
    for (let c = 0; c < 3; c++) colors[3 * i + c] = snow[c] + (slush[c] - snow[c]) * tr;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const snowH = fbmCanvas(256, 3, 5, 16);
  const snowN = keep(normalTexture(snowH, 256, 6));
  snowN.repeat.set(G / 4, G / 4);
  const ground = new THREE.Mesh(groundGeo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, normalMap: snowN, normalScale: new THREE.Vector2(0.7, 0.7) })));
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- barracks ----
  const plank = keep(plankTexture(11));
  const wood = keep(new THREE.MeshStandardMaterial({ map: plank, color: 0xd8cfc4, roughness: 0.92 }));
  const snowRoof = keep(new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.75 }));
  const windowMat = keep(new THREE.MeshStandardMaterial({ color: 0x110c08, emissive: 0xffa34d, emissiveIntensity: 2.2 }));
  function barrack(cx, cz, len, wid) {
    const g = new THREE.Group();
    const wallH = 2.6;
    const box = keep(new THREE.BoxGeometry(len, wallH, wid));
    const walls = new THREE.Mesh(box, wood);
    plank.repeat.set(len / 2, 1);
    walls.position.y = wallH / 2;
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);
    // Gable roof: two slabs with snow on top.
    const roofW = wid / 2 + 0.5;
    const pitch = 0.5;
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(keep(new THREE.BoxGeometry(len + 0.8, 0.25, roofW / Math.cos(pitch))), snowRoof);
      slab.position.set(0, wallH + Math.tan(pitch) * roofW / 2, (s * roofW) / 2);
      slab.rotation.x = s * pitch;
      slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
    }
    const gable = new THREE.Shape([new THREE.Vector2(-wid / 2, 0), new THREE.Vector2(wid / 2, 0), new THREE.Vector2(0, Math.tan(pitch) * wid / 2)]);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(keep(new THREE.ShapeGeometry(gable)), wood);
      m.position.set((s * len) / 2, wallH, 0);
      m.rotation.y = s * Math.PI / 2;
      g.add(m);
    }
    // Lit windows along the yard side, a door in the middle.
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const w = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.9, 0.7)), windowMat);
      w.position.set(i * (len / 5.5), 1.7, wid / 2 + 0.01);
      g.add(w);
    }
    const door = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.1, 2.0)), keep(new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.9 })));
    door.position.set(0, 1.0, wid / 2 + 0.01);
    g.add(door);
    g.position.set(cx, 0, cz);
    scene.add(g);
    colliders.push({ minX: cx - len / 2 - 0.3, maxX: cx + len / 2 + 0.3, minZ: cz - wid / 2 - 0.3, maxZ: cz + wid / 2 + 0.3 });
  }
  barrack(-8.5, -9.5, 13, 5);
  barrack(8.5, -9.5, 13, 5);

  // ---- fence: posts, sagging barbed wire, concertina on top ----
  const postGeo = keep(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6));
  postGeo.translate(0, 1.6, 0);
  const posts = [];
  const FX = YARD.x + 1.2;
  const FZ = YARD.z + 1.2;
  const perim = [];
  for (let x = -FX; x <= FX + 1e-6; x += 2.4) perim.push([x, -FZ], [x, FZ]);
  for (let z = -FZ + 2.4; z < FZ - 1e-6; z += 2.4) perim.push([-FX, z], [FX, z]);
  const postMesh = new THREE.InstancedMesh(postGeo, wood, perim.length);
  const m4 = new THREE.Matrix4();
  perim.forEach(([x, z], i) => {
    m4.makeRotationZ((Math.sin(i * 12.9) * 0.05));
    m4.setPosition(x, 0, z);
    postMesh.setMatrixAt(i, m4);
    posts.push([x, z]);
  });
  postMesh.castShadow = true;
  scene.add(postMesh);
  const wirePts = [];
  const corners = [[-FX, -FZ], [FX, -FZ], [FX, FZ], [-FX, FZ], [-FX, -FZ]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[k + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.round(L / 2.4);
    for (let strand = 0; strand < 6; strand++) {
      const h = 0.4 + strand * 0.48;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 6; j++) {
          const t0 = (i + j / 6) / n;
          const t1 = (i + (j + 1) / 6) / n;
          const sag = (u) => -0.06 * Math.sin(Math.PI * ((u * n) % 1));
          wirePts.push(ax + (bx - ax) * t0, h + sag(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, h + sag(t1), az + (bz - az) * t1);
        }
      }
    }
    // Concertina coil along the top.
    const turns = Math.round(L * 2.2);
    for (let i = 0; i < turns * 16; i++) {
      const u0 = i / (turns * 16);
      const u1 = (i + 1) / (turns * 16);
      const p = (u) => {
        const a = u * turns * Math.PI * 2;
        const nx = -(bz - az) / L;
        const nzv = (bx - ax) / L;
        return [ax + (bx - ax) * u + nx * Math.cos(a) * 0.32, 3.35 + Math.sin(a) * 0.32, az + (bz - az) * u + nzv * Math.cos(a) * 0.32];
      };
      wirePts.push(...p(u0), ...p(u1));
    }
  }
  const wireGeo = keep(new THREE.BufferGeometry());
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  scene.add(new THREE.LineSegments(wireGeo, keep(new THREE.LineBasicMaterial({ color: 0x2b2a28 }))));

  // ---- gate and banner (south side) ----
  const bannerMat = keep(new THREE.MeshStandardMaterial({ map: keep(bannerTexture()), roughness: 0.85, side: THREE.DoubleSide }));
  const banner = new THREE.Mesh(keep(new THREE.PlaneGeometry(6, 1.6, 20, 1)), bannerMat);
  banner.position.set(0, 4.3, FZ + 0.05);
  banner.rotation.y = Math.PI;
  scene.add(banner);
  for (const s of [-1, 1]) {
    const gp2 = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 5.2, 0.3)), wood);
    gp2.position.set(s * 3.1, 2.6, FZ);
    gp2.castShadow = true;
    scene.add(gp2);
  }
  const bp = banner.geometry.attributes.position;
  const bx0 = Float32Array.from(bp.array);
  updaters.push((dt, t) => {
    for (let i = 0; i < bp.count; i++) bp.setZ(i, bx0[3 * i + 2] + Math.sin(t * 1.7 + bx0[3 * i] * 1.3) * 0.06 * (0.5 - bx0[3 * i + 1] / 1.6));
    bp.needsUpdate = true;
  });

  // ---- watchtowers with searchlights ----
  const beams = [];
  const beamMat = keep(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {},
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(vec3(1.0, 0.94, 0.8) * 0.09 * edge * pow(vY, 1.6), 1.0); }',
  }));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const tx = sx * (FX + 2.2);
    const tz = sz * (FZ + 2.2);
    const tower = new THREE.Group();
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const leg = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 7, 0.22)), wood);
      leg.position.set(lx * 0.9, 3.5, lz * 0.9);
      leg.castShadow = true;
      tower.add(leg);
    }
    const cabin = new THREE.Mesh(keep(new THREE.BoxGeometry(2.6, 1.4, 2.6)), wood);
    cabin.position.y = 7.6;
    cabin.castShadow = true;
    tower.add(cabin);
    const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(2.3, 1.1, 4)), snowRoof);
    cap.position.y = 8.85;
    cap.rotation.y = Math.PI / 4;
    tower.add(cap);
    tower.position.set(tx, 0, tz);
    scene.add(tower);
    // The light, and a visible beam (an open cone, brightest at the lamp).
    const spot = new THREE.SpotLight(0xfff1d6, 140, 60, 0.13, 0.5, 1.6);
    spot.position.set(tx, 8.4, tz);
    scene.add(spot);
    scene.add(spot.target);
    const coneLen = 34;
    const coneGeo = keep(new THREE.ConeGeometry(Math.tan(0.13) * coneLen, coneLen, 24, 1, true));
    coneGeo.translate(0, -coneLen / 2, 0);
    coneGeo.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(coneGeo, beamMat);
    cone.position.copy(spot.position);
    scene.add(cone);
    beams.push({ spot, cone, phase: Math.random() * 10, speed: 0.12 + Math.random() * 0.08 });
  }
  updaters.push((dt, t) => {
    for (const b of beams) {
      const a = t * b.speed + b.phase;
      const tx = Math.sin(a) * YARD.x * 0.8;
      const tz = Math.cos(a * 1.3) * YARD.z * 0.7;
      b.spot.target.position.set(tx, 0, tz);
      b.cone.lookAt(tx, 0, tz);
    }
  });

  // ---- cloud deck: fbm, dense, lit warm from the west on its underside ----
  const deckMat = keep(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uTime: { value: 0 }, uHoles: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, -1)) } },
    vertexShader: 'varying vec2 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uHoles[6]; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ v += a*n(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec2 p = vP * 0.035 + vec2(uTime * 0.01, uTime * 0.004);
        float d = fbm(p) + 0.5 * fbm(p * 2.7 + 9.0);
        // Thick round every butt: they come out of the cloud.
        float hug = 0.0;
        for (int i = 0; i < 6; i++) if (uHoles[i].z > 0.0) hug = max(hug, 1.0 - smoothstep(uHoles[i].z * 0.9, uHoles[i].z * 1.7, length(vP - uHoles[i].xy)));
        float a = clamp(smoothstep(0.55, 1.1, d) + hug, 0.0, 1.0);
        vec3 col = mix(vec3(0.30, 0.31, 0.36), vec3(0.62, 0.52, 0.48), smoothstep(0.7, 1.3, d));
        float far = smoothstep(120.0, 260.0, length(vP));
        gl_FragColor = vec4(col, a * 0.92 * (1.0 - far));
        #include <colorspace_fragment>
      }`,
  }));
  const deck = new THREE.Mesh(keep(new THREE.PlaneGeometry(600, 600)), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = DECK_Y;
  deck.renderOrder = 2;
  scene.add(deck);
  updaters.push((dt, t) => (deckMat.uniforms.uTime.value = t));

  // ---- snowfall, wrapped round the camera ----
  const FLAKES = 5000;
  const flakePos = new Float32Array(FLAKES * 3);
  const r = rng(5);
  for (let i = 0; i < FLAKES * 3; i++) flakePos[i] = r();
  const flakeGeo = keep(new THREE.BufferGeometry());
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
  const flakeMat = keep(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 300 } },
    vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uScale; varying float vA;
      void main(){
        vec3 box = vec3(40.0, 22.0, 40.0);
        vec3 p = position * box;
        p.y -= uTime * (1.0 + position.x * 0.6);
        p.x += sin(uTime * 0.7 + position.z * 30.0) * 0.6 + uTime * 0.8;
        p = mod(p - uCam + box * 0.5, box) + uCam - box * 0.5;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * (0.02 + 0.02 * position.y) / -mv.z;
        vA = smoothstep(40.0, 4.0, -mv.z);
      }`,
    fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), vA * 0.8 * (1.0 - d * 4.0)); }',
  }));
  const flakes = new THREE.Points(flakeGeo, flakeMat);
  flakes.frustumCulled = false;
  scene.add(flakes);

  return {
    colliders,
    deckY: DECK_Y,
    setHoles(list) {
      const u = deckMat.uniforms.uHoles.value;
      for (let i = 0; i < u.length; i++) {
        const h = list[i];
        if (h) u[i].set(h.x, h.z, h.r);
        else u[i].set(0, 0, -1);
      }
    },
    update(dt, t, camera, height) {
      for (const f of updaters) f(dt, t);
      flakeMat.uniforms.uTime.value = t;
      flakeMat.uniforms.uCam.value.copy(camera.position);
      flakeMat.uniforms.uScale.value = height;
      sun.target.position.set(camera.position.x * 0.3, 0, camera.position.z * 0.3);
    },
    dispose() {
      for (const d of disposables) d.dispose?.();
    },
  };
}

export { rng, noise2, canvasTexture };
