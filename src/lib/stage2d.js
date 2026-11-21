import * as THREE from 'three';

// A flat 2D drawing surface for sketches that are easiest to draw with the browser's canvas tools
// (networks, grids, particles, rays): draw with `stage.g` (a CanvasRenderingContext2D) every frame,
// and the stage shows it full-screen through a soft glow, so bright things shine.
// see docs/wiki/stage-2d.md
//
//   setup(ctx)          { const stage = createStage(ctx); return { stage }; }
//   update(ctx, state)  { const { g, area } = state.stage.begin(ctx); …draw…; state.stage.end(); }
//   dispose(ctx, state) { state.stage.dispose(); }
//
// `area` is the part of the screen kept clear of the equation (top right on wide screens, top on
// phones) and the toolbar: { x, y, w, h } in canvas pixels, y down.

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uPx;          // one canvas pixel, in texture units
  uniform float uGlow;
  varying vec2 vUv;
  vec3 bright(vec2 uv) { vec3 c = texture2D(uTex, uv).rgb; return max(c - 0.35, 0.0); }
  void main() {
    vec3 c = texture2D(uTex, vUv).rgb;
    // a cheap glow: the bright parts of the picture, blurred over three rings of 12 samples, each ring turned a
    // little, so sharp bright things (like text) blur instead of leaving ghost copies
    vec3 g = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988;
      vec2 d1 = vec2(cos(a), sin(a)), d2 = vec2(cos(a + 0.17), sin(a + 0.17)), d3 = vec2(cos(a + 0.35), sin(a + 0.35));
      g += bright(vUv + d1 * uPx * 3.0) * 0.45 + bright(vUv + d2 * uPx * 6.5) * 0.35 + bright(vUv + d3 * uPx * 10.0) * 0.2;
    }
    c += uGlow * g / 12.0 * 1.6;
    // a gentle vignette
    vec2 q = vUv - 0.5;
    c *= 1.0 - 0.35 * dot(q, q);
    gl_FragColor = vec4(c, 1.0);
  }`;

export function createStage(ctx, { glow = 0.8, background = '#04050a', maxSide = 2400 } = {}) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  ctx.camera = cam;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;          // the canvas colours go to the screen unchanged
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uTex: { value: tex }, uPx: { value: new THREE.Vector2(1, 1) }, uGlow: { value: glow } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  ctx.scene.add(quad);

  const stage = {
    cv, g, tex, mat,
    w: 0, h: 0, scale: 1,
    area: { x: 0, y: 0, w: 1, h: 1 },
    wide: true,
    // Call at the start of every frame: fits the canvas to the screen and clears it.
    begin(c) {
      const k = Math.min(1, maxSide / Math.max(c.size.width, c.size.height));
      const W = Math.max(2, Math.round(c.size.width * k)), H = Math.max(2, Math.round(c.size.height * k));
      if (W !== cv.width || H !== cv.height) {
        cv.width = W; cv.height = H;
        tex.dispose();               // the texture's size changed: three.js must make a new one
        mat.uniforms.uPx.value.set(1 / W, 1 / H);
      }
      stage.w = W; stage.h = H; stage.scale = k;
      stage.wide = W > 1.25 * H;
      // Clear of the equation: on wide screens the left half, on phones below the top third.
      stage.area = stage.wide
        ? { x: 0.04 * W, y: 0.1 * H, w: 0.48 * W, h: 0.78 * H }
        : { x: 0.04 * W, y: 0.34 * H, w: 0.92 * W, h: 0.54 * H };
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.fillStyle = background;
      g.fillRect(0, 0, W, H);
      return stage;
    },
    // A square inside the clear area, centred: { x, y, s }.
    square(pad = 0) {
      const a = stage.area, s = Math.min(a.w, a.h) - 2 * pad;
      return { x: a.x + (a.w - s) / 2, y: a.y + (a.h - s) / 2, s };
    },
    // Call at the end of every frame: sends the drawing to the screen.
    end() { tex.needsUpdate = true; },
    // Font size that reads the same on any screen.
    font(px, weight = '') { return `${weight} ${Math.round(px * Math.max(0.75, Math.min(1.4, stage.h / 800)))}px system-ui, sans-serif`; },
    dispose() { tex.dispose(); mat.dispose(); quad.geometry.dispose(); ctx.scene.remove(quad); },
  };
  return stage;
}

// A seeded random number generator (mulberry32), so a sketch can replay the same run.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A colour from a number 0..1 along a smooth glowing palette (cosine palette, see docs/wiki/cosine-palette.md).
export function palette(t, a = [0.5, 0.5, 0.5], b = [0.5, 0.5, 0.5], c = [1, 1, 1], d = [0.0, 0.33, 0.67]) {
  const ch = (i) => Math.round(255 * Math.min(1, Math.max(0, a[i] + b[i] * Math.cos(6.2831853 * (c[i] * t + d[i])))));
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}
