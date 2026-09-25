import { sketches } from '../core/registry.js';

// TikTok-style vertical feed for touch screens. One canvas draws the current
// sketch; this is a stack of transparent, full-screen snap points over it, one
// per sketch. When a snap point settles in view, that sketch becomes current.
// A tap (not a swipe) calls onTap, which toggles the controls.
export function createFeed(el, manager, { onTap }) {
  let ids = [];
  let desired = manager.getCurrent().id;
  let syncing = false; // scrolling ourselves to match the manager
  let swipePending = false; // a swipe asked for `desired`; not there yet

  const observer = new IntersectionObserver(
    (entries) => {
      if (syncing) return;
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          desired = entry.target.dataset.id;
          if (manager.getCurrent().id !== desired) {
            swipePending = true;
            manager.goToId(desired);
          }
        }
      }
    },
    { root: el, threshold: [0.6] }
  );

  function scrollTo(id) {
    const i = ids.indexOf(id);
    if (i === -1) return;
    syncing = true;
    el.scrollTo({ top: i * el.clientHeight, behavior: 'instant' });
    requestAnimationFrame(() => requestAnimationFrame(() => (syncing = false)));
  }

  function build() {
    observer.disconnect();
    el.textContent = '';
    ids = sketches.map((s) => s.id);
    for (const id of ids) {
      const item = document.createElement('section');
      item.className = 'feed-item';
      item.dataset.id = id;
      el.append(item);
      observer.observe(item);
    }
    scrollTo(manager.getCurrent().id);
  }

  // A swipe that lands mid-crossfade is ignored by the manager; catch up once
  // it settles. A change from elsewhere (picker, keys) moves the feed along.
  manager.onChange((sketch) => {
    if (swipePending && sketch.id !== desired && ids.includes(desired)) {
      manager.goToId(desired);
      return;
    }
    swipePending = false;
    desired = sketch.id;
    if (ids[Math.round(el.scrollTop / el.clientHeight)] !== sketch.id) scrollTo(sketch.id);
  });

  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.classList.contains('feed-item')) onTap();
  });
  window.addEventListener('resize', () => scrollTo(manager.getCurrent().id));

  build();
  return {
    refresh() {
      const current = manager.getCurrent().id;
      if (ids.length === sketches.length && ids.every((id, i) => id === sketches[i].id)) return;
      build();
      scrollTo(current);
    },
    // After the feed becomes visible again (it can't scroll while hidden).
    sync: () => scrollTo(manager.getCurrent().id),
  };
}
