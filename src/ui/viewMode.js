// "Hide everything" viewing modes, driven by a data attribute on <body> that
// the stylesheet keys off (see `body[data-view=…]` in style.css):
//
//   full      every control and overlay shown
//   equation  controls hidden, the equation overlay stays — a clean frame with the maths
//   clean     nothing but the canvas
//
// In the two hidden modes the mouse cursor also fades after a moment of
// stillness, so it never sits in the picture.

const VIEWS = ['full', 'equation', 'clean'];
const IDLE_MS = 2200;

const MESSAGES = {
  full: 'Controls shown',
  equation: 'Equation only  ·  H: hide everything  ·  Esc: show controls',
  clean: 'Controls hidden  ·  H: show controls  ·  F: fullscreen  ·  R: record',
};

export function createToast() {
  const el = document.createElement('div');
  el.id = 'toast';
  document.body.appendChild(el);
  let timer = 0;
  return function show(text, ms = 2600) {
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('visible'), ms);
  };
}

export function createViewMode({ toast }) {
  let index = 0;
  let idleTimer = 0;

  function wake() {
    delete document.body.dataset.idle;
    clearTimeout(idleTimer);
    if (VIEWS[index] !== 'full') {
      idleTimer = setTimeout(() => { document.body.dataset.idle = '1'; }, IDLE_MS);
    }
  }

  function set(name, announce = true) {
    const next = VIEWS.indexOf(name);
    if (next === -1) return;
    index = next;
    document.body.dataset.view = name;
    wake();
    if (announce) toast(MESSAGES[name]);
  }

  window.addEventListener('mousemove', wake);
  window.addEventListener('mousedown', wake);
  document.body.dataset.view = 'full';

  return {
    get view() { return VIEWS[index]; },
    set,
    cycle() { set(VIEWS[(index + 1) % VIEWS.length]); },
    showAll() { set('full'); },
    toggleFullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    },
  };
}
