import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Prisoner } from './prisoner.js';
import { createWorld, YARD } from './world.js';
import { createSky } from './sky.js';
import { createCorn, KERNEL_KCAL } from './corn.js';

// Corn Gulag. Giant butts drift under the clouds over a labour camp and drop
// logs with sweet corn in them; six prisoners fight over the kernels to stay
// fed. Eat to keep your kcal up, punch people to make them drop theirs, and
// get out of the way of what's falling. You die when you've run out of food
// and then out of health.
//
// The numbers on screen are real physics applied to absurd things (the site's
// running joke): fall time √(2h/g), impact speed √(2gh), kinetic energy ½mv²
// with m = ρ·πR²L, and calories that go as the cube of a kernel's size.

const DAY = 120; // s per camp day
const BURN = 2400 / DAY; // kcal/s: a day's ration per day
const START_KCAL = 1800;
const RHO = 1070; // kg/m³, stool
const BEST_KEY = 'aiship:corngulag';

const CAST = [
  { id: 'misha', name: 'Misha', age: 31, crime: 'Article 58-6, espionage: owned a seed catalogue from Iowa.', tint: [0.34, 0.36, 0.33], stubble: [0.12, 0.07, 0.04], speed: 1.08, strength: 1.0, aggression: 0.5, alert: 1.1 },
  { id: 'bogdan', name: 'Bogdan', age: 52, crime: 'Article 58-14, sabotage: ate the seed corn.', tint: [0.28, 0.29, 0.27], stubble: [0.25, 0.22, 0.2], speed: 0.95, strength: 1.35, aggression: 0.85, alert: 0.9 },
  { id: 'lev', name: 'Lev', age: 48, crime: 'Article 58-10, agitation: told a joke about the corn plan.', tint: [0.33, 0.33, 0.35], stubble: [0.1, 0.08, 0.06], speed: 1.0, strength: 0.9, aggression: 0.35, alert: 1.2 },
  { id: 'timur', name: 'Timur', age: 40, crime: 'Article 58-7, wrecking: harvested two days early.', tint: [0.3, 0.32, 0.3], stubble: [0.05, 0.04, 0.04], speed: 1.05, strength: 1.1, aggression: 0.6, alert: 1.0 },
  { id: 'arkady', name: 'Arkady', age: 63, crime: 'Article 58-10: described a cob as "a bit much".', tint: [0.36, 0.35, 0.33], stubble: [0.4, 0.38, 0.36], speed: 0.9, strength: 0.85, aggression: 0.3, alert: 0.8, tone: [0.86, 0.8, 0.76] },
  { id: 'pyotr', name: 'Pyotr', age: 71, crime: 'Article 58-10: said the corn was small.', tint: [0.31, 0.3, 0.29], stubble: [0.6, 0.58, 0.56], speed: 0.82, strength: 0.75, aggression: 0.2, alert: 0.7 },
];

const CSS = `
.cg{position:relative;width:100%;aspect-ratio:16/9;max-height:calc(100vh - 140px);min-height:420px;background:#0d0f13;border-radius:14px;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none;font:14px/1.35 var(--font, system-ui)}
.cg:fullscreen{max-height:none;border-radius:0}
@media (max-width:640px){.cg{aspect-ratio:auto;height:78svh;max-height:none;min-height:0}}
.cg canvas{display:block;width:100%;height:100%}
.cg-hud{position:absolute;inset:0;pointer-events:none;color:#f4f1ea;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.cg-me{position:absolute;left:12px;top:10px;width:min(260px,44%)}
.cg-me b{font-size:15px}
.cg-bar{position:relative;height:14px;margin-top:5px;background:rgba(0,0,0,.45);border-radius:7px;overflow:hidden}
.cg-bar i{position:absolute;inset:0 auto 0 0;width:50%;border-radius:7px;transition:width .2s}
.cg-bar.kcal i{background:linear-gradient(90deg,#c98a1d,#ffd166)}
.cg-bar.hp i{background:linear-gradient(90deg,#a8322b,#ff6b5b)}
.cg-bar span{position:absolute;left:8px;top:-1px;font-size:11px;font-weight:600}
.cg-pocket{margin-top:6px;font-size:13px}
.cg-day{position:absolute;right:12px;top:10px;text-align:right;font-size:13px}
.cg-event{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);max-width:min(640px,92%);text-align:center;padding:7px 12px;border-radius:10px;background:rgba(10,8,6,.62);font-size:13.5px;opacity:0;transition:opacity .3s}
.cg-event.on{opacity:1}
.cg-warn{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-weight:800;font-size:22px;letter-spacing:.06em;color:#ffcf8a;opacity:0;transition:opacity .15s}
.cg-warn.on{opacity:1}
.cg-tools{position:absolute;right:10px;bottom:10px;display:flex;gap:6px;pointer-events:auto}
.cg-tools button{appearance:none;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.4);color:#eee;border-radius:8px;padding:5px 9px;font:inherit;font-size:12px;cursor:pointer}
.cg-over{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,9,12,.72);backdrop-filter:blur(3px);pointer-events:auto;overflow:auto}
.cg-over.hidden{display:none}
.cg-card{max-width:720px;width:92%;padding:18px 20px;color:#f1eee8}
.cg-card h2{margin:0 0 6px;font-size:26px;letter-spacing:.02em}
.cg-card p{margin:6px 0;color:rgba(241,238,232,.82)}
.cg-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin:12px 0}
.cg-pick button{appearance:none;text-align:left;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#eee;border-radius:10px;padding:8px 10px;font:inherit;cursor:pointer}
.cg-pick button.on{border-color:#ffd166;background:rgba(255,209,102,.12)}
.cg-pick small{display:block;color:rgba(238,238,238,.7);font-size:12px;margin-top:3px}
.cg-go{appearance:none;border:0;background:#ffd166;color:#111;font:700 16px/1 var(--font, system-ui);padding:11px 22px;border-radius:10px;cursor:pointer}
.cg-go:disabled{opacity:.5;cursor:wait}
.cg-keys{font-size:12.5px;color:rgba(241,238,232,.7)}
.cg-touch{position:absolute;inset:0;pointer-events:none}
.cg-stick{position:absolute;left:18px;bottom:18px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);pointer-events:auto}
.cg-stick i{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:rgba(255,255,255,.25)}
.cg-btns{position:absolute;right:16px;bottom:56px;display:grid;grid-template-columns:repeat(2,64px);gap:10px;pointer-events:auto}
.cg-btns button{appearance:none;width:64px;height:64px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.4);color:#fff;font:700 12px/1 var(--font, system-ui)}
.cg-btns button:active{background:rgba(255,209,102,.4)}
`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const fmt = (x, d = 0) => x.toFixed(d);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---- sound: all synthesised ----
function createAudio() {
  let ac = null;
  let master = null;
  let muted = false;
  let wind = null;
  const ensure = () => {
    if (ac) return ac;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ac.destination);
    // Wind: brown-ish noise through a slowly swept band-pass.
    const buf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.6;
    const g = ac.createGain();
    g.gain.value = 0.25;
    src.connect(bp).connect(g).connect(master);
    src.start();
    wind = bp;
    return ac;
  };
  const noise = (dur) => {
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource();
    s.buffer = b;
    return s;
  };
  const env = (node, t, a, peak, dur) => {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    node.connect(g).connect(master);
    return g;
  };
  return {
    start: ensure,
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.6;
      return muted;
    },
    tick(t) {
      if (wind) wind.frequency.value = 300 + 200 * Math.sin(t * 0.13) + 80 * Math.sin(t * 0.71);
    },
    // A falling whistle, pitch dropping over the fall time; louder when close.
    whistle(dur, vol) {
      if (!ac) return;
      const t = ac.currentTime;
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(1500, t);
      o.frequency.exponentialRampToValueAtTime(350, t + dur);
      env(o, t, 0.05, 0.12 * vol, dur + 0.05);
      o.start(t);
      o.stop(t + dur + 0.1);
    },
    splat(vol) {
      if (!ac) return;
      const t = ac.currentTime;
      const n = noise(0.6);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
      env(n.connect(lp), t, 0.005, 0.9 * vol, 0.55);
      n.start(t);
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
      env(o, t, 0.005, 0.8 * vol, 0.35);
      o.start(t);
      o.stop(t + 0.4);
    },
    punch(vol) {
      if (!ac) return;
      const t = ac.currentTime;
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
      env(o, t, 0.002, 0.7 * vol, 0.16);
      o.start(t);
      o.stop(t + 0.2);
      const n = noise(0.08);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1500;
      env(n.connect(hp), t, 0.001, 0.25 * vol, 0.06);
      n.start(t);
    },
    crunch(vol) {
      if (!ac) return;
      const t0 = ac.currentTime;
      for (let i = 0; i < 4; i++) {
        const t = t0 + i * 0.17 + Math.random() * 0.04;
        const n = noise(0.07);
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2200 + Math.random() * 1500;
        bp.Q.value = 1.5;
        env(n.connect(bp), t, 0.002, 0.5 * vol, 0.06);
        n.start(t);
      }
    },
    dispose() {
      ac?.close();
    },
  };
}

export function createCornGulag(container) {
  container.textContent = '';
  const style = el('style');
  style.textContent = CSS;
  const root = el('div', 'cg');
  container.append(style, root);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.25 : 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  root.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 600);
  camera.position.set(0, 3, 10);

  // ---- HUD ----
  const hud = el('div', 'cg-hud');
  const me = el('div', 'cg-me');
  const meName = el('b');
  const kcalBar = el('div', 'cg-bar kcal');
  const kcalFill = el('i');
  const kcalText = el('span');
  kcalBar.append(kcalFill, kcalText);
  const hpBar = el('div', 'cg-bar hp');
  const hpFill = el('i');
  const hpText = el('span');
  hpBar.append(hpFill, hpText);
  const pocketEl = el('div', 'cg-pocket');
  me.append(meName, kcalBar, hpBar, pocketEl);
  const dayEl = el('div', 'cg-day');
  const eventEl = el('div', 'cg-event');
  const warnEl = el('div', 'cg-warn', 'INCOMING');
  const tools = el('div', 'cg-tools');
  const muteBtn = el('button', null, 'Sound: on');
  const fsBtn = el('button', null, 'Full screen');
  tools.append(muteBtn, fsBtn);
  hud.append(me, dayEl, warnEl, eventEl, tools);
  root.append(hud);

  // Touch controls.
  const touch = el('div', 'cg-touch');
  const stick = el('div', 'cg-stick');
  const knob = el('i');
  stick.append(knob);
  const btns = el('div', 'cg-btns');
  const bPunch = el('button', null, 'PUNCH');
  const bGrab = el('button', null, 'GRAB');
  const bEat = el('button', null, 'EAT');
  const bRun = el('button', null, 'RUN');
  btns.append(bGrab, bEat, bPunch, bRun);
  touch.append(stick, btns);
  touch.style.display = coarse ? '' : 'none';
  root.append(touch);

  // Overlay (loading, choosing, game over).
  const over = el('div', 'cg-over');
  const card = el('div', 'cg-card');
  over.append(card);
  root.append(over);

  let destroyed = false;
  let event = { text: '', until: 0 };
  function say(text, secs = 4) {
    event = { text, until: time + secs };
    eventEl.textContent = text;
    eventEl.classList.add('on');
  }

  const audio = createAudio();
  muteBtn.onclick = () => (muteBtn.textContent = audio.toggle() ? 'Sound: off' : 'Sound: on');
  fsBtn.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.());

  // ---- world ----
  const world = createWorld(scene, renderer);
  const corn = createCorn(scene);
  let people = [];
  let player = null;
  let time = 0;
  let playing = false;
  let stats = null;

  const sky = createSky(scene, world, corn, {
    onRelease(log) {
      if (!player) return;
      const h = log.pos.y - log.L / 2;
      const tf = Math.sqrt((2 * h) / 9.81);
      const d = Math.hypot(log.ground.x - player.p.pos.x, log.ground.z - player.p.pos.z);
      audio.whistle(tf, Math.max(0.15, 1 - d / 25));
      if (d < 6) say(`Incoming: t = √(2h/g) = √(2·${fmt(h, 0)}/9.81) = ${fmt(tf, 1)} s. Move.`, tf);
    },
    onLand(log) {
      const h = log.butt.group.position.y - 3;
      const v = Math.sqrt(2 * 9.81 * h);
      const m = RHO * Math.PI * log.R * log.R * log.L * 0.8;
      const E = 0.5 * m * v * v;
      if (player) {
        const d = Math.hypot(log.pos.x - player.p.pos.x, log.pos.z - player.p.pos.z);
        audio.splat(Math.max(0.1, 1 - d / 30));
      }
      for (const who of people) {
        if (!who.alive) continue;
        const d = sky.logDistance(log, who.p.pos.x, who.p.pos.z);
        if (d < 0.35) {
          who.stun = Math.max(who.stun, 2.4);
          who.p.filth.uFilth.value = Math.min(1, who.p.filth.uFilth.value + 0.55);
          who.hp -= 15;
          who.action = null;
          dropAll(who, 0.5);
          if (who === player) {
            stats.hits++;
            say(`Direct hit. v = √(2gh) = ${fmt(v, 0)} m/s, m = ρπR²L = ${fmt(m / 1000, 1)} t, ½mv² = ${fmt(E / 1000, 0)} kJ. You are fine, somehow.`, 6);
          }
        } else if (d < 2.2) {
          who.p.filth.uFilth.value = Math.min(1, who.p.filth.uFilth.value + 0.12);
        }
      }
    },
  });

  // ---- loading ----
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL || '/'}games/gulag/`;
  let loaded = 0;
  const gltfs = {};
  function showLoading() {
    card.innerHTML = `<h2>Corn Gulag</h2><p>Loading prisoners… ${loaded} of ${CAST.length}</p>`;
  }
  showLoading();
  const loading = Promise.all(
    CAST.map((c) =>
      loader.loadAsync(`${base}${c.id}.gltf`).then((g) => {
        gltfs[c.id] = g;
        loaded++;
        if (!destroyed && !playing) showLoading();
      }),
    ),
  );

  let chosen = 'misha';
  function best() {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY)) || null;
    } catch {
      return null;
    }
  }
  function showStart() {
    const b = best();
    card.innerHTML = '';
    card.append(
      el('h2', null, 'Corn Gulag'),
      el('p', null, 'Winter, a labour camp. Giant butts drift under the clouds and drop what they drop. There is sweet corn in it, and nothing else to eat. Pick up the kernels, eat them (about 3 in 10 are empty hulls: 0 kcal), and punch anyone holding more than you.'),
      el('p', null, 'You burn 2,400 kcal a day. Run out and you start to die.'),
    );
    const pick = el('div', 'cg-pick');
    for (const c of CAST) {
      const bt = el('button', c.id === chosen ? 'on' : '');
      bt.append(el('b', null, `${c.name}, ${c.age}`), el('small', null, c.crime));
      bt.onclick = () => {
        chosen = c.id;
        for (const x of pick.children) x.classList.remove('on');
        bt.classList.add('on');
      };
      pick.append(bt);
    }
    const go = el('button', 'cg-go', 'Begin sentence');
    go.onclick = () => {
      audio.start();
      start(chosen);
    };
    card.append(
      el('p', null, 'Who are you?'),
      pick,
      go,
      el('p', 'cg-keys', coarse ? 'Left stick: move. Buttons: grab, eat, punch, run. Drag the right side to look around.' : 'WASD / arrows: move · Shift: run · E: grab corn · Q: eat · Space or click: punch · drag: look · wheel: zoom'),
    );
    if (b) card.append(el('p', 'cg-keys', `Best: ${b.name} lasted ${clock(b.secs)} (day ${b.day}), ate ${b.ate} kernels.`));
    over.classList.remove('hidden');
  }
  loading.then(() => {
    if (!destroyed) showStart();
  });

  // ---- people ----
  function makePerson(c, isPlayer) {
    const p = new Prisoner({ scene: SkeletonUtils.clone(gltfs[c.id].scene) }, {
      name: c.name,
      tint: new THREE.Color(...c.tint),
      stubble: new THREE.Color(...c.stubble),
      tone: c.tone ? new THREE.Color(...c.tone) : undefined,
    });
    scene.add(p.group);
    return {
      p, c, isPlayer, alive: true, kcal: START_KCAL, hp: 100, pocket: [], stun: 0, ko: 0, action: null, punchCd: 0,
      want: new THREE.Vector3(), run: false, ai: { goal: new THREE.Vector3(), think: 0, grudge: null, grudgeT: 0, wander: new THREE.Vector3() },
      eaten: 0, hulls: 0,
    };
  }

  function start(id) {
    for (const who of people) {
      scene.remove(who.p.group);
      who.p.dispose();
    }
    people = [];
    const order = [CAST.find((c) => c.id === id), ...CAST.filter((c) => c.id !== id)];
    order.forEach((c, i) => {
      const who = makePerson(c, i === 0);
      const a = (i / order.length) * Math.PI * 2;
      who.p.place(Math.cos(a) * 5, Math.sin(a) * 4 + 1, -a);
      people.push(who);
    });
    player = people[0];
    meName.textContent = `${player.c.name}, ${player.c.age}`;
    for (const k of [...corn.kernels]) corn.take(k);
    if (!sky.butts.length) sky.addButt();
    time = 0;
    stats = { start: 0, hits: 0, ate: 0, hulls: 0 };
    playing = true;
    over.classList.add('hidden');
    say(`Day 1. ${player.c.crime.split(':')[0]}. Ten years. Find corn.`, 5);
  }

  function dropAll(who, chance = 1) {
    const keepers = [];
    for (const hull of who.pocket) {
      if (Math.random() < chance) {
        const at = who.p.pos.clone().setY(1.0);
        corn.toss(at, hull, who.p.forward(new THREE.Vector3()).multiplyScalar(-1));
      } else keepers.push(hull);
    }
    who.pocket = keepers;
  }

  // ---- input ----
  const keys = new Set();
  const press = { punch: false, grab: false, eat: false };
  const onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (!playing) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' ', 'e', 'q'].includes(k)) e.preventDefault();
    if (down) keys.add(k);
    else keys.delete(k);
    if (down && k === ' ') press.punch = true;
    if (down && k === 'e') press.grab = true;
    if (down && k === 'q') press.eat = true;
  };
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  let camYaw = Math.PI;
  let camPitch = 0.32;
  let camDist = 5.2;
  let drag = null;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    camYaw -= dx * 0.006;
    camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.004, -0.1, 1.2);
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && drag.moved < 6 && !coarse && playing) press.punch = true;
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camDist = THREE.MathUtils.clamp(camDist * (1 + Math.sign(e.deltaY) * 0.1), 2.2, 12);
  }, { passive: false });

  const stickV = new THREE.Vector2();
  let stickId = null;
  let runHeld = false;
  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stick.addEventListener('pointermove', (e) => e.pointerId === stickId && moveStick(e));
  const endStick = () => {
    stickId = null;
    stickV.set(0, 0);
    knob.style.transform = '';
  };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  function moveStick(e) {
    const r = stick.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    const y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    stickV.set(x, y);
    if (stickV.length() > 1) stickV.normalize();
    knob.style.transform = `translate(${stickV.x * 35}px, ${stickV.y * 35}px)`;
  }
  bPunch.onpointerdown = () => (press.punch = true);
  bGrab.onpointerdown = () => (press.grab = true);
  bEat.onpointerdown = () => (press.eat = true);
  bRun.onpointerdown = () => (runHeld = !runHeld, bRun.style.background = runHeld ? 'rgba(255,209,102,.4)' : '');

  // ---- actions ----
  const _v = new THREE.Vector3();
  function begin(who, type, target) {
    if (who.action || who.stun > 0 || who.ko > 0 || !who.alive) return false;
    if (type === 'eat' && !who.pocket.length) return false;
    if (type === 'punch' && who.punchCd > 0) return false;
    if (type === 'dig') {
      if (!target || target.state === 'gone') return false;
      target.claim = who;
    }
    who.action = { type, t: 0, target, done: false, dur: { dig: 0.8, eat: 1.6, punch: 0.45 }[type] };
    if (type === 'punch') who.punchCd = 0.75;
    return true;
  }

  function nearestKernel(who, range) {
    return corn.nearest(who.p.pos, range, (k) => k.claim && k.claim !== who && k.claim.action?.target === k);
  }

  function runAction(who, dt) {
    const a = who.action;
    const P = who.p.pose;
    a.t += dt;
    const k = a.t / a.dur;
    if (a.type === 'dig') {
      const kern = a.target;
      if (kern.state === 'gone' || (kern.state === 'held' && kern.claim !== who)) {
        who.action = null;
        return;
      }
      P.crouch = Math.sin(Math.min(1, k * 1.1) * Math.PI) * 0.9;
      const hand = who.p.handPos('r', _v);
      P.hands.r = new THREE.Vector3().copy(hand).lerp(kern.p, Math.min(1, k * 2.2));
      P.fist.r = k > 0.45 ? 0.7 : 0;
      P.look = kern.p.clone();
      if (k > 0.45) corn.hold(kern, who.p.handPos('r', _v));
      if (k >= 1) {
        corn.take(kern);
        who.pocket.push(kern.hull);
        who.action = null;
      }
    } else if (a.type === 'eat') {
      const head = who.p.headPos(_v);
      const mouth = head.clone().addScaledVector(who.p.forward(new THREE.Vector3()), 0.12).add(new THREE.Vector3(0, 0.03, 0));
      P.hands.r = k < 0.85 ? mouth : null;
      P.fist.r = 0.8;
      const chew = k > 0.35 ? Math.abs(Math.sin(a.t * 11)) * 0.35 : 0.25;
      who.p.setFace('jawOpen', chew);
      who.p.setFace('noseSneerLeft', 0.8);
      who.p.setFace('noseSneerRight', 0.8);
      who.p.setFace('cheekSquintLeft', 0.5);
      who.p.setFace('cheekSquintRight', 0.5);
      if (!a.done && k > 0.35) {
        a.done = true;
        a.hull = who.pocket.pop();
        if (who === player) audio.crunch(1);
      }
      if (k >= 1) {
        who.action = null;
        who.p.setFace('jawOpen', 0);
        if (a.hull === undefined) return;
        if (a.hull) {
          who.hulls++;
          if (who === player) say('Hull. Cellulose: glucose joined β(1→4), and no human enzyme cuts that bond. 0 kcal.', 5);
        } else {
          who.kcal = Math.min(START_KCAL + 600, who.kcal + KERNEL_KCAL);
          who.eaten++;
          if (who === player) say(`+${KERNEL_KCAL} kcal. A kernel ${16}× the size holds 16³ ≈ 4,100× the food. This one has been through someone.`, 4);
        }
      }
    } else if (a.type === 'punch') {
      const fwd = who.p.forward(new THREE.Vector3());
      const shoulder = who.p.bones.upperarm_r.getWorldPosition(new THREE.Vector3());
      const ext = Math.sin(Math.min(1, k / 0.45) * Math.PI * 0.5) * (k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
      P.hands.r = shoulder.clone().addScaledVector(fwd, 0.2 + 0.5 * ext).add(new THREE.Vector3(0, -0.05, 0));
      P.hands.l = shoulder.clone().addScaledVector(fwd, 0.15).add(new THREE.Vector3(0, -0.12, 0)).addScaledVector(who.p.right(new THREE.Vector3()), 0.32);
      P.fist.r = P.fist.l = 1;
      who.p.setFace('browDownLeft', 1);
      who.p.setFace('browDownRight', 1);
      who.p.setFace('mouthStretchLeft', 0.6);
      who.p.setFace('mouthStretchRight', 0.6);
      if (!a.done && k > 0.4) {
        a.done = true;
        let victim = null;
        let bd = 1.35;
        for (const o of people) {
          if (o === who || !o.alive || o.ko > 0) continue;
          const d = _v.copy(o.p.pos).sub(who.p.pos);
          const dist = d.length();
          if (dist < bd && d.normalize().dot(fwd) > 0.45) {
            bd = dist;
            victim = o;
          }
        }
        if (victim) hit(who, victim, fwd);
      }
      if (k >= 1) who.action = null;
    }
  }

  function hit(who, victim, dir) {
    const dmg = 7 * who.c.strength * (0.8 + Math.random() * 0.4);
    victim.hp -= dmg;
    victim.stun = Math.max(victim.stun, 0.55);
    victim.action = null;
    victim.p.vel.addScaledVector(dir, 2.2);
    victim.ai.grudge = who;
    victim.ai.grudgeT = 3;
    victim.knock = 0.35;
    if (victim.pocket.length) dropAll(victim, 0.4);
    const near = player ? Math.max(0.15, 1 - who.p.pos.distanceTo(player.p.pos) / 20) : 0.5;
    audio.punch(near);
    if (victim === player) say(`${who.c.name} hit you (${fmt(dmg, 0)}).`, 2);
    if (who === player) say(`You hit ${victim.c.name}.${victim.pocket.length ? '' : ' Their pockets are empty now.'}`, 2);
    if (victim.hp <= 0) {
      victim.ko = 6;
      dropAll(victim, 1);
      if (victim === player) say(`Knocked out by ${who.c.name}. Everything in your pockets is on the snow.`, 5);
    }
  }

  // ---- AI ----
  function think(who, dt) {
    const ai = who.ai;
    const c = who.c;
    const pos = who.p.pos;
    who.want.set(0, 0, 0);
    who.run = false;
    ai.grudgeT -= dt;
    if (ai.grudgeT <= 0) ai.grudge = null;
    // 1. Something is falling on me: get out from under it.
    for (const log of sky.logs) {
      if (log.state === 'landed') continue;
      const h = Math.max(0, log.pos.y - log.L / 2);
      const tLeft = log.state === 'fall' ? Math.sqrt((2 * h) / 9.81) : 3;
      const d = Math.hypot(pos.x - log.ground.x, pos.z - log.ground.z);
      if (d < log.L / 2 + 1.6 && tLeft < 1.6 * c.alert + (log.state === 'extrude' ? 1 : 0)) {
        who.want.set(pos.x - log.ground.x, 0, pos.z - log.ground.z).normalize();
        if (who.want.lengthSq() === 0) who.want.set(1, 0, 0);
        who.run = true;
        who.p.pose.look = log.pos.clone();
        return;
      }
    }
    // 2. Hungry and holding something: eat it.
    if (who.pocket.length && (who.kcal < START_KCAL - 200 || who.pocket.length > 2)) {
      begin(who, 'eat');
      return;
    }
    // 3. A grudge, or someone close with full pockets: punch.
    let foe = ai.grudge && ai.grudge.alive && ai.grudge.ko <= 0 && ai.grudge.p.pos.distanceTo(pos) < 4 ? ai.grudge : null;
    if (!foe) {
      for (const o of people) {
        if (o === who || !o.alive || o.ko > 0) continue;
        const d = o.p.pos.distanceTo(pos);
        // Worth a fight: someone with corn on them, or digging up corn right in front of you.
        const tempting = o.pocket.length > 0 || (o.action?.type === 'dig' && d < 1.6);
        if (tempting && d < 2.5 && Math.random() < c.aggression * dt * (o.action?.type === 'dig' ? 1.5 : 0.8)) {
          foe = o;
          ai.grudge = o;
          ai.grudgeT = 4;
          break;
        }
      }
    }
    if (foe) {
      const d = foe.p.pos.distanceTo(pos);
      who.p.pose.look = foe.p.headPos(new THREE.Vector3());
      if (d < 1.1) {
        who.p.yaw = Math.atan2(foe.p.pos.x - pos.x, foe.p.pos.z - pos.z);
        begin(who, 'punch');
      } else {
        who.want.subVectors(foe.p.pos, pos).setY(0).normalize();
        who.run = d < 6;
      }
      return;
    }
    // 4. Corn.
    const k = nearestKernel(who, 40);
    if (k) {
      const d = Math.hypot(k.p.x - pos.x, k.p.z - pos.z);
      who.p.pose.look = k.p.clone();
      if (d < 0.75) {
        who.p.yaw = Math.atan2(k.p.x - pos.x, k.p.z - pos.z);
        begin(who, 'dig', k);
      } else {
        who.want.set(k.p.x - pos.x, 0, k.p.z - pos.z).normalize();
        who.run = d < 14 || who.kcal < 700;
      }
      return;
    }
    // 5. Nothing to do: drift about, watch the sky.
    ai.think -= dt;
    if (ai.think <= 0) {
      ai.think = 3 + Math.random() * 4;
      ai.wander.set((Math.random() - 0.5) * YARD.x * 1.4, 0, (Math.random() - 0.3) * YARD.z * 1.2);
    }
    if (ai.wander.distanceTo(pos) > 1) who.want.subVectors(ai.wander, pos).setY(0).normalize().multiplyScalar(0.5);
    const b = sky.butts[0];
    who.p.pose.look = b ? b.group.position.clone() : null;
  }

  // ---- movement and collisions ----
  function move(who, dt) {
    const p = who.p;
    const speed = (who.run ? 3.6 : 1.6) * who.c.speed * (who.kcal <= 0 ? 0.6 : 1);
    const target = _v.copy(who.want).multiplyScalar(speed);
    if (who.stun > 0 || who.ko > 0 || who.action?.type === 'eat' || who.action?.type === 'dig' || !who.alive) target.set(0, 0, 0);
    if (who.action?.type === 'punch') target.multiplyScalar(0.3);
    const acc = who.knock > 0 ? 3 : 10;
    p.vel.x += (target.x - p.vel.x) * Math.min(1, dt * acc);
    p.vel.z += (target.z - p.vel.z) * Math.min(1, dt * acc);
    p.pos.addScaledVector(p.vel, dt);
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > 0.3 && who.knock <= 0 && who.action?.type !== 'punch') {
      const yaw = Math.atan2(p.vel.x, p.vel.z);
      let d = yaw - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * Math.min(1, dt * 8);
    }
    // Yard, buildings, logs, each other.
    p.pos.x = THREE.MathUtils.clamp(p.pos.x, -YARD.x, YARD.x);
    p.pos.z = THREE.MathUtils.clamp(p.pos.z, -YARD.z, YARD.z);
    for (const c of world.colliders) {
      if (p.pos.x > c.minX && p.pos.x < c.maxX && p.pos.z > c.minZ && p.pos.z < c.maxZ) {
        const dx = Math.min(p.pos.x - c.minX, c.maxX - p.pos.x);
        const dz = Math.min(p.pos.z - c.minZ, c.maxZ - p.pos.z);
        if (dx < dz) p.pos.x = p.pos.x - c.minX < c.maxX - p.pos.x ? c.minX : c.maxX;
        else p.pos.z = p.pos.z - c.minZ < c.maxZ - p.pos.z ? c.minZ : c.maxZ;
      }
    }
    for (const log of sky.logs) {
      if (log.state !== 'landed') continue;
      const d = sky.logDistance(log, p.pos.x, p.pos.z);
      if (d < 0.25) {
        // Push out along the perpendicular from the axis.
        const ax = log.a.x;
        const az = log.a.z;
        const bx = log.b.x - ax;
        const bz = log.b.z - az;
        const t = THREE.MathUtils.clamp(((p.pos.x - ax) * bx + (p.pos.z - az) * bz) / (bx * bx + bz * bz || 1), 0, 1);
        const nx = p.pos.x - ax - bx * t;
        const nz = p.pos.z - az - bz * t;
        const nl = Math.hypot(nx, nz) || 1;
        p.pos.x += (nx / nl) * (0.25 - d);
        p.pos.z += (nz / nl) * (0.25 - d);
      }
    }
  }

  function separate() {
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i].p.pos;
        const b = people[j].p.pos;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = people[i].ko > 0 || people[j].ko > 0 || !people[i].alive || !people[j].alive ? 0 : 0.55;
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    }
  }

  // ---- the frame ----
  function playerControl(dt) {
    const who = player;
    who.want.set(0, 0, 0);
    let fx = 0;
    let fz = 0;
    if (keys.has('w') || keys.has('arrowup')) fz += 1;
    if (keys.has('s') || keys.has('arrowdown')) fz -= 1;
    if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
    if (keys.has('d') || keys.has('arrowright')) fx += 1;
    if (stickV.lengthSq() > 0.01) {
      fx = stickV.x;
      fz = -stickV.y;
    }
    // Relative to the camera: forward is where the camera looks.
    const cf = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const cr = new THREE.Vector3(-cf.z, 0, cf.x);
    who.want.addScaledVector(cf, fz).addScaledVector(cr, fx);
    if (who.want.lengthSq() > 1) who.want.normalize();
    who.run = keys.has('shift') || runHeld;
    if (press.grab) {
      const k = nearestKernel(who, 1.3);
      if (k) {
        who.p.yaw = Math.atan2(k.p.x - who.p.pos.x, k.p.z - who.p.pos.z);
        begin(who, 'dig', k);
      } else say('No corn within reach.', 1.5);
    }
    if (press.eat) {
      if (!begin(who, 'eat')) say(who.pocket.length ? 'Busy.' : 'Your pockets are empty.', 1.5);
    }
    if (press.punch) begin(who, 'punch');
    press.punch = press.grab = press.eat = false;
    // Look where the camera looks, unless something is falling on you.
    who.p.pose.look = who.p.headPos(new THREE.Vector3()).addScaledVector(cf, 6);
  }

  function updatePerson(who, dt) {
    const P = who.p.pose;
    P.hands.l = P.hands.r = null;
    P.fist.l = P.fist.r = 0.25;
    P.crouch = 0;
    P.flinch = 0;
    for (const n of ['browDownLeft', 'browDownRight', 'mouthStretchLeft', 'mouthStretchRight', 'noseSneerLeft', 'noseSneerRight', 'cheekSquintLeft', 'cheekSquintRight']) who.p.setFace(n, 0);
    who.punchCd -= dt;
    who.knock = Math.max(0, (who.knock ?? 0) - dt);
    if (who.alive) {
      who.kcal = Math.max(0, who.kcal - BURN * dt * (who.run ? 1.6 : 1));
      if (who.kcal <= 0) who.hp -= 2.5 * dt;
      else who.hp = Math.min(100, who.hp + 0.8 * dt);
      if (who.hp <= 0 && who.kcal <= 0) {
        who.alive = false;
        dropAll(who, 1);
        if (who !== player) say(`${who.c.name} has died. ${who.eaten} kernels eaten, ${who.hulls} of them hulls.`, 4);
      }
    }
    if (!who.alive) {
      P.ko = Math.min(1, P.ko + dt * 1.5);
      who.want.set(0, 0, 0);
      move(who, dt);
      return;
    }
    if (who.ko > 0) {
      who.ko -= dt;
      P.ko = Math.min(1, P.ko + dt * 3);
      if (who.ko <= 0) who.hp = 45;
    } else P.ko = Math.max(0, P.ko - dt * 2);
    if (who.stun > 0) {
      who.stun -= dt;
      P.flinch = 1;
      who.p.setFace('eyeBlinkLeft', 0.8);
      who.p.setFace('eyeBlinkRight', 0.8);
      who.p.setFace('jawOpen', 0.5);
    } else {
      who.p.setFace('eyeBlinkLeft', 0);
      who.p.setFace('eyeBlinkRight', 0);
    }
    if (who.ko <= 0 && who.stun <= 0) {
      if (who.isPlayer) playerControl(dt);
      else if (!who.action) think(who, dt);
      if (who.action) runAction(who, dt);
    }
    // Faces that come from the situation.
    const filth = who.p.filth.uFilth.value;
    let danger = 0;
    for (const log of sky.logs) {
      if (log.state === 'landed') continue;
      const d = Math.hypot(who.p.pos.x - log.ground.x, who.p.pos.z - log.ground.z);
      danger = Math.max(danger, THREE.MathUtils.clamp(1 - d / 8, 0, 1));
    }
    who.p.setFace('eyeWideLeft', danger);
    who.p.setFace('eyeWideRight', danger);
    who.p.setFace('browInnerUp', Math.max(danger, who.kcal < 500 ? 0.7 : 0));
    who.p.setFace('mouthFrownLeft', Math.max(filth * 0.8, who.hp < 40 ? 0.6 : 0));
    who.p.setFace('mouthFrownRight', Math.max(filth * 0.8, who.hp < 40 ? 0.6 : 0));
    if (!who.action) {
      who.p.setFace('jawOpen', who.stun > 0 ? 0.5 : danger * 0.35);
      who.p.setFace('noseSneerLeft', filth * 0.6);
      who.p.setFace('noseSneerRight', filth * 0.6);
    }
    P.lean = who.kcal <= 0 ? 0.25 : 0;
    move(who, dt);
  }

  function updateCamera(dt) {
    if (!player) return;
    const head = player.p.headPos(new THREE.Vector3());
    const focus = new THREE.Vector3(player.p.pos.x, Math.max(0.6, head.y - 0.15), player.p.pos.z);
    const want = new THREE.Vector3(
      focus.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      focus.y + Math.sin(camPitch) * camDist,
      focus.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist,
    );
    want.y = Math.max(0.35, want.y);
    camera.position.lerp(want, Math.min(1, dt * 6));
    camera.lookAt(focus);
  }

  function updateHud() {
    if (!player) return;
    const k = player.kcal;
    kcalFill.style.width = `${Math.min(100, (k / (START_KCAL + 600)) * 100)}%`;
    kcalText.textContent = `${fmt(k)} kcal${k <= 0 ? ': starving' : ''}`;
    hpFill.style.width = `${Math.max(0, player.hp)}%`;
    hpText.textContent = `health ${fmt(Math.max(0, player.hp))}`;
    pocketEl.textContent = `Corn in pockets: ${player.pocket.length}`;
    const day = Math.floor(time / DAY) + 1;
    const alive = people.filter((p) => p.alive).length;
    dayEl.innerHTML = `Day ${day} · roll call in ${clock(DAY - (time % DAY))}<br>${alive} of ${people.length} alive`;
    let incoming = false;
    for (const log of sky.logs) {
      if (log.state === 'landed') continue;
      if (Math.hypot(log.ground.x - player.p.pos.x, log.ground.z - player.p.pos.z) < log.L / 2 + 1.2) incoming = true;
    }
    warnEl.classList.toggle('on', incoming && Math.floor(time * 6) % 2 === 0);
    if (event.text && time > event.until) {
      eventEl.classList.remove('on');
      event.text = '';
    }
  }

  function gameOver() {
    playing = false;
    const day = Math.floor(time / DAY) + 1;
    const b = best();
    const mine = { name: player.c.name, secs: time, day, ate: player.eaten };
    const record = !b || time > b.secs;
    if (record) {
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(mine));
      } catch {
        /* not remembered */
      }
    }
    card.innerHTML = '';
    const again = el('button', 'cg-go', 'Again');
    again.onclick = () => showStart();
    card.append(
      el('h2', null, `${player.c.name} died on day ${day}.`),
      el('p', null, `Lasted ${clock(time)}. Ate ${player.eaten + player.hulls} kernels, ${player.hulls} of them empty hulls. Landed on ${stats.hits} time${stats.hits === 1 ? '' : 's'}.`),
      el('p', null, record ? 'A camp record.' : `The record is ${b.name}: ${clock(b.secs)}.`),
      again,
    );
    over.classList.remove('hidden');
  }

  let lastDay = 1;
  function step(dt) {
    time += dt;
    const day = Math.floor(time / DAY) + 1;
    if (day !== lastDay) {
      lastDay = day;
      const alive = people.filter((p) => p.alive).length;
      say(`Roll call, day ${day}: ${alive} present. The butts are getting bolder.`, 5);
      if (sky.butts.length < Math.min(5, 1 + day)) sky.addButt();
    }
    const targets = people.filter((p) => p.alive).map((p) => p.p.pos);
    sky.update(dt, time, { targets, rate: 1 + (day - 1) * 0.35, yard: YARD });
    for (const who of people) updatePerson(who, dt);
    separate();
    corn.update(dt);
    corn.flush();
    for (const who of people) who.p.animate(dt, time);
    if (player && !player.alive && playing) gameOver();
  }

  // Before a game starts the camp still runs (butts drift, snow falls), with the camera circling.
  let raf = 0;
  let last = performance.now();
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (playing) {
      step(dt);
      updateCamera(dt);
      updateHud();
    } else {
      time += dt;
      if (!sky.butts.length) sky.addButt();
      sky.update(dt, time, { targets: [], rate: 0.3, yard: YARD });
      corn.update(dt);
      if (player) {
        for (const who of people) who.p.animate(dt, time);
        updateCamera(dt);
      } else {
        camera.position.set(Math.sin(time * 0.05) * 16, 6, Math.cos(time * 0.05) * 16);
        camera.lookAt(0, 4, 0);
      }
    }
    audio.tick(time);
    world.update(dt, time, camera, h * renderer.getPixelRatio());
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // Dev hook for headless checks.
  if (import.meta.env.DEV) window.__gulag = { get people() { return people; }, get player() { return player; }, sky, corn, start, step, camera, get time() { return time; } };

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      for (const who of people) who.p.dispose();
      sky.dispose();
      corn.dispose();
      world.dispose();
      audio.dispose();
      renderer.dispose();
      container.textContent = '';
    },
  };
}
