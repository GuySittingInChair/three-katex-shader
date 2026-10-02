import { NX, NY, ROBOTS, HEAD, TYPES, SNEEZES, SHOT_STEPS, METRES_PER_CELL, createRoom, stepRoom, damageOf, makeShot, randomWeather, sample, speedFor } from './sneezeSim.js';

// Sneeze Duel: you and a robot take turns sneezing at each other across a
// room, on a real Navier–Stokes fluid simulation (see sneezeSim.js). Each
// turn brings new weather (an up- or down-draft and the air's viscosity), so
// you have to read the air and aim. Hold to charge, release to sneeze; more
// power reaches further but wobbles more. Four sneezes with cooldowns, plus
// two tissues. First to 0 HP loses (both at once is a draw: Pepper burns).
//
// Wagers are in Snot Coins: play money, kept in this browser, worth nothing,
// can't be bought or cashed out.

const LEVELS = [
  { name: 'Sniffles', blurb: 'Sneezes wherever.', odds: 1.4, record: 1 },
  { name: 'Hay Fever', blurb: 'Reads the draft.', odds: 2.2, record: 3 },
  { name: 'Patient Zero', blurb: 'Solves Navier–Stokes before every sneeze.', odds: 3.5, record: 5 },
];
const WAGERS = [0, 10, 25, 50, 'all'];
const COINS_KEY = 'aiship:snotcoins';
const START_COINS = 100;
const BAILOUT = 20;
const CALL_COST = 5;
const CALL_PAYS = 15;
const CALL_AT = 20;
const STEPS_PER_FRAME = 3;
const CHARGE_SECONDS = 1.1;

function loadCoins() {
  try {
    const v = Number(localStorage.getItem(COINS_KEY));
    return Number.isFinite(v) && localStorage.getItem(COINS_KEY) !== null ? v : START_COINS;
  } catch {
    return START_COINS;
  }
}
function saveCoins(v) {
  try {
    localStorage.setItem(COINS_KEY, String(v));
  } catch {
    /* not remembered */
  }
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSneezeDuel(container, { recordResult, getUser, promptSignIn } = {}) {
  container.textContent = '';
  const root = el('div', 'duel');
  container.append(root);

  // ---- layout ----
  const top = el('div', 'duel-top');
  const hpBars = [0, 1].map((i) => {
    const box = el('div', `duel-hp duel-hp-${i}`);
    const name = el('div', 'duel-hp-name', i === 0 ? 'You' : LEVELS[1].name);
    const bar = el('div', 'duel-hp-bar');
    const fill = el('div', 'duel-hp-fill');
    const num = el('div', 'duel-hp-num', '100');
    const extra = el('div', 'duel-hp-extra');
    bar.append(fill);
    box.append(name, bar, num, extra);
    return { box, name, fill, num, extra };
  });
  const coinsEl = el('div', 'duel-coins');
  top.append(hpBars[0].box, coinsEl, hpBars[1].box);

  const canvas = el('canvas', 'duel-canvas');
  const weatherEl = el('div', 'duel-weather');
  const status = el('p', 'game-status duel-status');
  status.setAttribute('aria-live', 'polite');

  const controls = el('div', 'duel-controls');
  const typeRow = el('div', 'duel-types');
  const typeButtons = {};
  for (const key of [...SNEEZES, 'tissue']) {
    const b = el('button', 'chip duel-type');
    b.type = 'button';
    b.title = TYPES[key].blurb;
    b.append(el('span', '', TYPES[key].name), el('span', 'duel-badge'));
    b.addEventListener('click', () => {
      if (b.disabled) return;
      chosen = key;
      renderControls();
    });
    typeRow.append(b);
    typeButtons[key] = b;
  }
  const typeBlurb = el('p', 'duel-blurb');
  const aimRow = el('label', 'duel-aim');
  const aimInput = el('input');
  aimInput.type = 'range';
  aimInput.min = '-30';
  aimInput.max = '30';
  aimInput.step = '1';
  aimInput.value = '0';
  const aimVal = el('span', 'duel-aim-val', '0°');
  aimRow.append(el('span', '', 'Aim'), aimInput, aimVal);
  aimInput.addEventListener('input', () => {
    aim = Number(aimInput.value);
    aimVal.textContent = `${aim > 0 ? '+' : ''}${aim}°`;
  });
  const callRow = el('label', 'duel-call');
  const callBox = el('input');
  callBox.type = 'checkbox';
  callRow.append(callBox, el('span', '', `Call your shot: bet ${CALL_COST} coins this does ${CALL_AT}+ damage (pays ${CALL_PAYS})`));
  const fireRow = el('div', 'duel-fire');
  const meter = el('div', 'duel-meter');
  const meterFill = el('div', 'duel-meter-fill');
  meter.append(meterFill);
  const fireBtn = el('button', 'btn btn-primary duel-fire-btn', 'Hold to sneeze');
  fireBtn.type = 'button';
  fireRow.append(meter, fireBtn);
  controls.append(typeRow, typeBlurb, aimRow, callRow, fireRow);

  const betting = el('div', 'duel-betting');
  const levelRow = el('div', 'duel-levels');
  const levelButtons = LEVELS.map((L, i) => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.textContent = `${L.name} · pays ${L.odds}×`;
    b.title = L.blurb;
    b.addEventListener('click', () => {
      level = i;
      renderBetting();
    });
    levelRow.append(b);
    return b;
  });
  const wagerRow = el('div', 'duel-wagers');
  const wagerButtons = WAGERS.map((w) => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.textContent = w === 'all' ? 'All in' : w === 0 ? 'No bet' : `${w}`;
    b.addEventListener('click', () => {
      wager = w;
      renderBetting();
    });
    wagerRow.append(b);
    return b;
  });
  const startBtn = el('button', 'btn btn-primary', 'Start the duel');
  startBtn.type = 'button';
  const bailBtn = el('button', 'btn btn-ghost hidden', `Broke? Borrow ${BAILOUT} from the Snot Bank`);
  bailBtn.type = 'button';
  const fine = el('p', 'duel-fine', 'Snot Coins are play money kept in this browser: worth nothing, can’t be bought or cashed out.');
  betting.append(el('h2', '', 'Pick an opponent and a wager'), levelRow, wagerRow, startBtn, bailBtn, fine);

  const footer = el('div', 'duel-footer');
  const newBtn = el('button', 'btn btn-ghost', 'New duel');
  newBtn.type = 'button';
  const recordEl = el('p', 'duel-record');
  footer.append(newBtn, recordEl);

  root.append(top, canvas, weatherEl, status, betting, controls, footer);

  // ---- state ----
  let coins = loadCoins();
  let level = 1;
  let wager = 10;
  let staked = 0;
  let phase = 'betting'; // betting | aim | charging | flying | thinking | over
  let hp = [100, 100];
  let cooldown = [{}, {}];
  let tissues = [2, 2];
  let shield = [false, false];
  let lastHit = [0, 0];
  let turn = 0;
  let turns = 0;
  let chosen = 'classic';
  let aim = 0;
  let weather = randomWeather();
  let room = createRoom(weather);
  let shot = null;
  let charge = 0;
  let chargeStart = 0;
  let calledAtPress = false;
  let face = ['idle', 'idle'];
  let faceSince = [0, 0];
  let popups = [];
  let session = 0;
  let destroyed = false;
  const field = new Float32Array(NX * NY * 2);
  const worker = new Worker(new URL('./sneezeAi.worker.js', import.meta.url), { type: 'module' });
  let reqId = 0;

  const setFace = (i, f) => {
    if (face[i] !== f) {
      face[i] = f;
      faceSince[i] = performance.now();
    }
  };
  const setStatus = (t) => (status.textContent = t);
  const setCoins = (v) => {
    coins = Math.max(0, Math.round(v));
    saveCoins(coins);
    coinsEl.textContent = `🪙 ${coins} Snot Coins`;
  };

  // ---- rendering ----
  const off = document.createElement('canvas');
  off.width = NX;
  off.height = NY;
  const offCtx = off.getContext('2d');
  const img = offCtx.createImageData(NX, NY);
  const ctx = canvas.getContext('2d');

  function resize() {
    // Wide, but short enough that the controls fit on screen with it.
    const w = Math.max(240, Math.min(root.clientWidth, window.innerHeight * 0.84));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${w / 2}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round((w / 2) * dpr);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  window.addEventListener('resize', resize);
  resize();

  function drawField() {
    sample(room, field);
    const d = img.data;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const s = (j * NX + i) * 2;
        const o = ((NY - 1 - j) * NX + i) * 4; // row 0 at the bottom
        const dye = Math.min(1, field[s] * 1.3);
        // Faint pink/blue for the spin (vorticity), so the slime itself stays readable.
        const w = Math.max(-1, Math.min(1, field[s + 1] * 6)) * (1 - dye);
        let r = 10 + dye * (0.55 * 255 - 10);
        let g = 12 + dye * (0.85 * 255 - 12);
        let b = 20 + dye * (0.3 * 255 - 20);
        if (w > 0) {
          r += w * 30;
          b += w * 15;
        } else {
          b -= w * 35;
          g -= w * 10;
        }
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
  }

  // Grid cell (x right, y up) → canvas pixels.
  const S = () => canvas.width / NX;
  const px = (x) => x * S();
  const py = (y) => canvas.height - y * S();

  function drawRobot(i, now) {
    const r = ROBOTS[i];
    const s = S();
    const f = face[i];
    const since = (now - faceSince[i]) / 1000;
    let dx = 0;
    let tilt = 0;
    if (f === 'hit') dx = 0.6 * Math.sin(since * 45) * Math.exp(-since * 2.5);
    if (f === 'ah') tilt = -0.18 * r.face;
    if (f === 'sneeze') tilt = 0.12 * r.face;
    if (f === 'ko') tilt = 0.5 * r.face;
    ctx.save();
    ctx.translate(px(r.x + dx), py(r.y));
    ctx.rotate(tilt);
    ctx.scale(r.face, 1); // draw facing +x
    const hw = (HEAD.x + 0.5) * s;
    const hh = (HEAD.y + 0.5) * s;
    // Antenna.
    ctx.strokeStyle = '#99a3b3';
    ctx.lineWidth = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(0, -hh - s * 2.2);
    ctx.stroke();
    ctx.fillStyle = f === 'ko' ? '#555' : '#ef4d40';
    ctx.beginPath();
    ctx.arc(0, -hh - s * 2.6, s * 0.9, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    const green = f === 'hit' || f === 'ko' ? 1 : 0;
    const grad = ctx.createLinearGradient(0, -hh, 0, hh);
    grad.addColorStop(0, green ? '#cfe8b4' : '#dfe4ec');
    grad.addColorStop(1, green ? '#7f9a63' : '#8a93a3');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, s * 1.6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,34,44,0.8)';
    ctx.lineWidth = s * 0.25;
    ctx.stroke();
    const ink = '#1a141a';
    const ex = hw * 0.45;
    const ey = -hh * 0.3;
    ctx.lineCap = 'round';
    // Eye.
    if (f === 'hit') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = s * 0.55;
      ctx.beginPath();
      ctx.moveTo(ex + s, ey - s);
      ctx.lineTo(ex - s * 0.8, ey);
      ctx.lineTo(ex + s, ey + s);
      ctx.stroke();
    } else if (f === 'ko') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = s * 0.55;
      ctx.beginPath();
      ctx.moveTo(ex - s, ey - s);
      ctx.lineTo(ex + s, ey + s);
      ctx.moveTo(ex + s, ey - s);
      ctx.lineTo(ex - s, ey + s);
      ctx.stroke();
    } else {
      const open = f === 'ah' ? 0.25 : f === 'nervous' ? 1.5 : 1;
      ctx.fillStyle = '#5ff3ff';
      ctx.beginPath();
      ctx.roundRect(ex - s * 1.1 * (f === 'nervous' ? 1.3 : 1), ey - s * open, s * 2.2 * (f === 'nervous' ? 1.3 : 1), s * 2 * open, s * 0.4);
      ctx.fill();
      if (f === 'nervous') {
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(ex - s * 0.3, ey, s * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Mouth.
    const mx = hw * 0.62;
    const my = s * 1.2; // where the sneeze comes out: a cell below the middle
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = s * 0.45;
    ctx.beginPath();
    if (f === 'sneeze' || f === 'ah') {
      const o = f === 'sneeze' ? 1.6 : 0.8;
      ctx.ellipse(mx + s * 0.6, my, s * 0.9, s * o, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (f === 'nervous') {
      ctx.arc(mx, my, s * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f === 'hit' || f === 'ko') {
      for (let k = 0; k <= 10; k++) {
        const x = mx - s * 2 + (k * s * 3.6) / 10;
        const y = my + Math.sin(k * 1.6 + since * 8) * s * 0.4;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#f07b8c';
      ctx.beginPath();
      ctx.ellipse(mx + s * 0.3, my + s * 1.1, s * 0.7, s * 1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (f === 'win') {
      ctx.arc(mx - s * 0.3, my - s * 0.8, s * 1.4, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else {
      ctx.moveTo(mx - s * 1.5, my);
      ctx.lineTo(mx + s * 1.3, my);
      ctx.stroke();
    }
    // A tissue held up.
    if (shield[i] && f !== 'ko') {
      ctx.fillStyle = 'rgba(250,250,245,0.92)';
      ctx.beginPath();
      ctx.roundRect(hw + s * 0.6, -hh * 0.9, s * 1.6, hh * 1.8, s * 0.5);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDraft(now) {
    if (!weather.draft) return;
    const s = S();
    const mid = NX / 2;
    const dir = weather.draft > 0 ? 1 : -1;
    ctx.strokeStyle = `rgba(160,190,255,${0.12 + 0.3 * Math.abs(weather.draft)})`;
    ctx.lineWidth = s * 0.35;
    const shift = ((now / 1000) * 6 * Math.abs(weather.draft)) % 6;
    for (let x = mid - 12; x <= mid + 12; x += 6) {
      for (let y = -6; y < NY + 6; y += 6) {
        const yy = y + dir * shift;
        ctx.beginPath();
        ctx.moveTo(px(x - 1), py(yy - dir));
        ctx.lineTo(px(x), py(yy));
        ctx.lineTo(px(x + 1), py(yy - dir));
        ctx.stroke();
      }
    }
  }

  function drawAim() {
    if (phase !== 'aim' && phase !== 'charging') return;
    if (chosen === 'tissue') return;
    const r = ROBOTS[0];
    const s = S();
    const a = (aim * Math.PI) / 180;
    const len = 14 + 18 * (phase === 'charging' ? charge : 0.5);
    ctx.setLineDash([s, s]);
    ctx.strokeStyle = 'rgba(255,209,102,0.85)';
    ctx.lineWidth = s * 0.35;
    ctx.beginPath();
    ctx.moveTo(px(r.x + HEAD.x + 2), py(r.y - 1));
    ctx.lineTo(px(r.x + HEAD.x + 2 + len * Math.cos(a)), py(r.y - 1 + len * Math.sin(a)));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw(now) {
    drawField();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    drawDraft(now);
    drawAim();
    drawRobot(0, now);
    drawRobot(1, now);
    const s = S();
    popups = popups.filter((p) => now - p.t0 < 1600);
    for (const p of popups) {
      const k = (now - p.t0) / 1600;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.color;
      ctx.font = `700 ${Math.round(s * 4)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.text, px(ROBOTS[p.who].x), py(ROBOTS[p.who].y + HEAD.y + 6 + k * 6));
      ctx.globalAlpha = 1;
    }
  }

  // ---- the turn loop ----
  function nervousCheck() {
    if (!shot) return;
    const tg = 1 - shot.shooter;
    const r = ROBOTS[tg];
    const front = r.x + r.face * (HEAD.x + 1);
    sample(room, field);
    let near = 0;
    for (let c = 2; c < 14; c++) {
      const i = front + r.face * c;
      for (let j = r.y - HEAD.y - 2; j <= r.y + HEAD.y + 2; j++) near = Math.max(near, field[((j - 1) * NX + (i - 1)) * 2] || 0);
    }
    if (near > 0.15 && face[tg] === 'idle') setFace(tg, 'nervous');
  }

  let raf = 0;
  let flyingDone = null;
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (phase === 'charging') {
      const t = (now - chargeStart) / 1000 / CHARGE_SECONDS;
      charge = 1 - Math.abs(1 - (t % 2)); // up and down: let go at the top
      meterFill.style.width = `${Math.round(charge * 100)}%`;
    }
    if (phase === 'flying' && shot) {
      for (let k = 0; k < STEPS_PER_FRAME && room.steps < SHOT_STEPS; k++) stepRoom(room, shot);
      if (room.steps > 60 && face[shot.shooter] === 'sneeze') setFace(shot.shooter, 'idle');
      nervousCheck();
      if (room.steps >= SHOT_STEPS && flyingDone) {
        const done = flyingDone;
        flyingDone = null;
        done();
      }
    }
    draw(now);
  }
  raf = requestAnimationFrame(frame);

  function available(i, key) {
    if (key === 'tissue') return tissues[i] > 0 && !shield[i];
    return !(cooldown[i][key] > 0);
  }

  function renderControls() {
    const mine = phase === 'aim' && turn === 0;
    controls.classList.toggle('hidden', phase === 'betting' || phase === 'over');
    for (const [key, b] of Object.entries(typeButtons)) {
      const ok = available(0, key);
      b.disabled = !mine || !ok;
      b.classList.toggle('active', chosen === key);
      const badge = b.querySelector('.duel-badge');
      badge.textContent = key === 'tissue' ? ` ×${tissues[0]}` : cooldown[0][key] > 0 ? ` (${cooldown[0][key]})` : '';
    }
    typeBlurb.textContent = TYPES[chosen].blurb;
    aimInput.disabled = !mine || chosen === 'tissue';
    callBox.disabled = !mine || chosen === 'tissue' || coins < CALL_COST;
    if (callBox.disabled) callBox.checked = false;
    fireBtn.disabled = !(mine || phase === 'charging');
    fireBtn.textContent = chosen === 'tissue' ? 'Hold up a tissue' : phase === 'charging' ? 'Release to sneeze!' : 'Hold to sneeze';
    meter.classList.toggle('hidden', chosen === 'tissue');
  }

  function renderHud() {
    for (const i of [0, 1]) {
      const h = Math.max(0, hp[i]);
      hpBars[i].fill.style.width = `${h}%`;
      hpBars[i].fill.classList.toggle('low', h <= 30);
      hpBars[i].num.textContent = String(h);
      hpBars[i].extra.textContent = `tissues ×${tissues[i]}${shield[i] ? ' · tissue up' : ''}`;
    }
    hpBars[1].name.textContent = LEVELS[level].name;
    const up = weather.draft > 0.05 ? 'updraft' : weather.draft < -0.05 ? 'downdraft' : 'still air';
    weatherEl.textContent = `Air this turn: ${up}${Math.abs(weather.draft) > 0.05 ? ` (${Math.round(Math.abs(weather.draft) * 100)}%)` : ''} · viscosity ${weather.visc}× air`;
  }

  function renderBetting() {
    betting.classList.toggle('hidden', phase !== 'betting');
    levelButtons.forEach((b, i) => b.classList.toggle('active', i === level));
    wagerButtons.forEach((b, k) => {
      const w = WAGERS[k];
      b.classList.toggle('active', w === wager);
      b.disabled = w !== 'all' && w > coins;
    });
    if (wager !== 'all' && wager > coins) wager = 0;
    const stake = wager === 'all' ? coins : wager;
    startBtn.textContent = stake > 0 ? `Bet ${stake} at ${LEVELS[level].odds}× and duel` : 'Duel for fun';
    bailBtn.classList.toggle('hidden', coins >= CALL_COST);
    hpBars[1].name.textContent = LEVELS[level].name;
  }

  function newWeather() {
    weather = randomWeather();
    room = createRoom(weather);
    shot = null;
    renderHud();
  }

  function startTurn() {
    if (destroyed) return;
    for (const k of Object.keys(cooldown[turn])) if (cooldown[turn][k] > 0) cooldown[turn][k]--;
    newWeather();
    if (turn === 0) {
      phase = 'aim';
      if (!available(0, chosen)) chosen = 'classic';
      setFace(0, 'idle');
      setFace(1, 'idle');
      setStatus('Your turn. Read the air, pick a sneeze, aim, then hold the button and let go when the meter peaks.');
      renderControls();
    } else {
      aiTurn();
    }
  }

  // The AI chooses a sneeze (or a tissue) and an aim, by level.
  async function aiTurn() {
    const mine = session;
    phase = 'thinking';
    renderControls();
    setFace(0, 'idle');
    const L = level;
    // Tissue if it's hurting and the last hit was big.
    if (available(1, 'tissue') && hp[1] <= 40 && lastHit[1] >= 18 && (L > 0 || Math.random() < 0.3)) {
      await sleep(700);
      if (mine !== session) return;
      return resolveTissue(1);
    }
    const pick = ['cold', 'triple', 'classic'].find((k) => available(1, k)) || 'classic';
    let type = L === 0 ? SNEEZES.filter((k) => available(1, k))[Math.floor(Math.random() * SNEEZES.filter((k) => available(1, k)).length)] : pick;
    if (L > 0 && available(1, 'pepper') && hp[1] > 25 && Math.random() < 0.25) type = 'pepper';
    let angle;
    let power;
    if (L === 0) {
      angle = Math.round((Math.random() * 2 - 1) * 14);
      power = 0.5 + Math.random() * 0.45;
      setStatus(`${LEVELS[L].name} is winding up…`);
      await sleep(900);
    } else if (L === 1) {
      angle = Math.round(-weather.draft * 8 + (Math.random() * 2 - 1) * 4);
      power = 0.72 + (Math.random() * 2 - 1) * 0.08;
      setStatus(`${LEVELS[L].name} squints at the draft…`);
      await sleep(1100);
    } else {
      setStatus(`${LEVELS[L].name} is solving the Navier–Stokes equations for 6 possible sneezes…`);
      const id = ++reqId;
      const plan = await new Promise((resolve) => {
        const onMsg = ({ data }) => {
          if (data.id !== id) return;
          if (!data.done) {
            if (mine === session) setStatus(`${LEVELS[L].name} is solving Navier–Stokes: trying sneeze ${data.progress}/${data.total}, aimed ${data.angle > 0 ? '+' : ''}${data.angle}°…`);
            return;
          }
          worker.removeEventListener('message', onMsg);
          resolve(data);
        };
        worker.addEventListener('message', onMsg);
        worker.postMessage({ id, weather, shooter: 1, type });
      });
      angle = plan.angle;
      power = plan.power;
    }
    if (mine !== session) return;
    // Mirror: the AI faces left, so its "up" aim is the same sign in the room.
    await fire(1, type, angle, Math.max(0.2, Math.min(1, power)), false);
  }

  async function resolveTissue(i) {
    tissues[i]--;
    shield[i] = true;
    setStatus(i === 0 ? 'You hold up a tissue. The next sneeze at you is 70% blocked.' : `${LEVELS[level].name} holds up a tissue.`);
    renderHud();
    await sleep(900);
    endTurn();
  }

  async function fire(i, type, angle, power, called) {
    const mine = session;
    if (type === 'tissue') return resolveTissue(i);
    setFace(i, 'ah');
    phase = 'flying-wait';
    renderControls();
    await sleep(650);
    if (mine !== session) return;
    setFace(i, 'sneeze');
    shot = makeShot(i, type, angle, power);
    const t = TYPES[type];
    if (t.puffs) cooldown[i][type] = t.cooldown + (t.cooldown ? 1 : 0); // ticks down at the start of the sneezer's turn
    phase = 'flying';
    setStatus(`${i === 0 ? 'You' : LEVELS[level].name}: ${t.name} at ${Math.round(speedFor(power) * t.U)} m/s${Math.abs(shot.wobble) >= 1 ? `, wobbling ${shot.wobble > 0 ? '+' : ''}${Math.round(shot.wobble)}°` : ''}… CHOO!`);
    await new Promise((resolve) => (flyingDone = resolve));
    if (mine !== session) return;
    // Damage.
    let dmg = damageOf(room, shot);
    const target = 1 - i;
    let note = '';
    if (dmg > 0 && shield[target]) {
      const blocked = Math.round(dmg * 0.7);
      dmg -= blocked;
      note = ` (the tissue blocked ${blocked})`;
    }
    if (dmg > 0 || shield[target]) shield[target] = false;
    hp[target] -= dmg;
    lastHit[target] = dmg;
    if (t.self) {
      hp[i] -= t.self;
      popups.push({ who: i, text: `−${t.self} 🌶️`, color: '#ff9f6b', t0: performance.now() });
    }
    if (dmg > 0) {
      setFace(target, 'hit');
      popups.push({ who: target, text: `−${dmg}`, color: '#b8ff7a', t0: performance.now() });
    } else {
      setFace(target, 'win');
    }
    const miss = room.hit > 0 ? ' It barely grazed the face.' : ` It never reached the face, ${Math.round((ROBOTS[1].x - ROBOTS[0].x - 2 * HEAD.x - 2) * METRES_PER_CELL * 100)} cm away.`;
    let msg = dmg > 0 ? `${i === 0 ? 'You hit' : `${LEVELS[level].name} hits you`} for ${dmg}${note}.` : `Missed!${miss}`;
    if (called) {
      if (dmg >= CALL_AT) {
        setCoins(coins + CALL_PAYS);
        msg += ` Called it: +${CALL_PAYS} coins.`;
      } else msg += ` The called shot loses ${CALL_COST} coins.`;
    }
    setStatus(msg);
    renderHud();
    await sleep(1500);
    if (mine !== session) return;
    endTurn();
  }

  function endTurn() {
    turns++;
    if (hp[0] <= 0 || hp[1] <= 0) return finish();
    turn = 1 - turn;
    startTurn();
  }

  async function finish() {
    phase = 'over';
    renderControls();
    const youOut = hp[0] <= 0;
    const itOut = hp[1] <= 0;
    const outcome = youOut && itOut ? 'draw' : itOut ? 'win' : 'loss';
    setFace(0, youOut ? 'ko' : 'win');
    setFace(1, itOut ? 'ko' : 'win');
    let msg;
    if (outcome === 'win') {
      const payout = Math.round(staked * LEVELS[level].odds);
      setCoins(coins + payout);
      msg = `You win!${staked ? ` Your ${staked} coins pay ${payout}.` : ''}`;
    } else if (outcome === 'draw') {
      setCoins(coins + staked);
      msg = `Both robots are down. A draw${staked ? `; your ${staked} coins come back` : ''}.`;
    } else {
      msg = `${LEVELS[level].name} wins.${staked ? ` You lose ${staked} coins.` : ''}`;
    }
    staked = 0;
    setStatus(`${msg} Start a new duel when you're ready.`);
    if (recordResult && getUser?.()) {
      try {
        await recordResult({ game: 'sneeze-duel', level: LEVELS[level].record, outcome, moves: Math.min(200, turns) });
        recordEl.textContent = 'Result saved to your record.';
      } catch {
        recordEl.textContent = '';
      }
    }
  }

  function toBetting() {
    session++;
    phase = 'betting';
    hp = [100, 100];
    cooldown = [{}, {}];
    tissues = [2, 2];
    shield = [false, false];
    lastHit = [0, 0];
    turns = 0;
    turn = 0;
    chosen = 'classic';
    setFace(0, 'idle');
    setFace(1, 'idle');
    flyingDone = null;
    newWeather();
    setCoins(coins);
    setStatus('Sneeze Duel. Two robots, one room, the Navier–Stokes equations, and Snot Coins.');
    recordEl.textContent = getUser?.() ? '' : 'Log in to save results to your record and the leaderboard.';
    renderBetting();
    renderControls();
  }

  startBtn.addEventListener('click', () => {
    const stake = wager === 'all' ? coins : wager;
    staked = Math.min(stake, coins);
    setCoins(coins - staked);
    phase = 'aim';
    renderBetting();
    startTurn();
  });
  bailBtn.addEventListener('click', () => {
    setCoins(coins + BAILOUT);
    renderBetting();
  });
  newBtn.addEventListener('click', () => {
    if (phase !== 'betting' && phase !== 'over' && staked) {
      // Walking out of a duel forfeits the stake.
      setStatus(`You walked out; the ${staked} coins stay on the table.`);
      staked = 0;
    }
    toBetting();
  });
  recordEl.addEventListener('click', () => {
    if (!getUser?.()) promptSignIn?.('login');
  });

  // Hold to charge, release to sneeze (mouse, touch, or the space bar).
  function press(e) {
    if (phase !== 'aim' || turn !== 0) return;
    e?.preventDefault?.();
    if (chosen === 'tissue') {
      phase = 'thinking';
      renderControls();
      resolveTissue(0);
      return;
    }
    // Read the called-shot box now: re-rendering the controls below disables it.
    calledAtPress = callBox.checked && coins >= CALL_COST;
    phase = 'charging';
    chargeStart = performance.now();
    setFace(0, 'ah');
    renderControls();
  }
  function release(e) {
    if (phase !== 'charging') return;
    e?.preventDefault?.();
    const called = calledAtPress;
    calledAtPress = false;
    if (called) setCoins(coins - CALL_COST);
    callBox.checked = false;
    fire(0, chosen, aim, Math.max(0.05, charge), called);
  }
  fireBtn.addEventListener('pointerdown', press);
  fireBtn.addEventListener('pointerup', release);
  fireBtn.addEventListener('pointerleave', release);
  fireBtn.addEventListener('pointercancel', release);
  const onKey = (e) => {
    if (e.code !== 'Space' || e.target.closest?.('input, textarea, select')) return;
    if (e.type === 'keydown' && !e.repeat) press(e);
    if (e.type === 'keyup') release(e);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  toBetting();

  return {
    destroy() {
      destroyed = true;
      session++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      worker.terminate();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    },
  };
}
