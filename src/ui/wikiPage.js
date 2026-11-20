import { loadWikiPage, renderWiki, wikiUrl, wikiMeta } from '../core/wiki.js';
import { mountEmbeds, disposeEmbeds } from './sketchEmbed.js';
import { sketches } from '../core/registry.js';
import { attachWikiFeedback } from './wikiFeedback.js';
import { decorateWikiCode } from './wikiCode.js';

// /wiki and /wiki/<page>: the beginner wiki (docs/wiki), read on the site.
export function createWikiPage(el) {
  el.innerHTML = `
    <div class="page-inner wiki-inner">
      <header class="page-head">
        <a class="brand" href="/" data-link>aiship</a>
        <nav class="page-nav">
          <a href="/wiki" data-link>Wiki home</a>
          <a href="/wiki/glossary" data-link>Glossary</a>
          <a href="/sketches" data-link>Sketches</a>
          <a href="/astronomy" data-link>Astronomy</a>
        </nav>
      </header>
      <div class="wiki-open hidden"></div>
      <article class="wiki-doc explain-doc"></article>
    </div>`;
  const doc = el.querySelector('.wiki-doc');
  const openBar = el.querySelector('.wiki-open');
  let token = 0;
  let current = '';
  const feedback = attachWikiFeedback(doc, () => current);

  async function show(slug, hash) {
    const mine = ++token;
    const md = await loadWikiPage(slug);
    if (mine !== token) return;
    feedback.close();
    disposeEmbeds();
    current = slug || 'README';
    if (md == null) {
      doc.innerHTML = `<h1>Page not found</h1><p>There's no wiki page called <code></code>. <a href="/wiki" data-link>Back to the wiki home</a>.</p>`;
      doc.querySelector('code').textContent = slug;
      openBar.classList.add('hidden');
      document.title = 'Wiki · aiship';
      return;
    }
    doc.innerHTML = renderWiki(md, slug || 'README');
    decorateWikiCode(doc, slug || 'README');
    addContents(doc);
    addAppearsIn(doc, slug || 'README');
    mountEmbeds(doc);
    doc.appendChild(feedback.footer());
    const title = doc.querySelector('h1')?.textContent || 'Wiki';
    document.title = `${title} · aiship wiki`;

    // A sketch walkthrough gets a button to open the sketch itself.
    const id = /^sketches\/([\w-]+?)(?:-physics)?$/.exec(slug || '')?.[1];
    const sketch = id && sketches.find((s) => s.id === id);
    openBar.classList.toggle('hidden', !sketch);
    if (sketch) {
      openBar.innerHTML = `<a class="btn btn-primary" data-link></a>
        <span class="explain-hint">Tip: open the sketch, then press the code button to click through its lines.</span>`;
      const a = openBar.querySelector('a');
      a.href = `/s/${sketch.id}`;
      a.textContent = `▶ Open ${sketch.name}`;
    }
    const target = hash && doc.querySelector(`#${CSS.escape(hash)}`);
    if (target) {
      // In-app navigation doesn't trigger CSS :target, so mark it by hand.
      target.classList.add('wiki-target');
      target.scrollIntoView({ block: target.tagName === 'LI' ? 'center' : 'start' });
    }
    else el.scrollTop = 0;
  }

  return { show, url: wikiUrl };
}

// Long pages get an "On this page" list of their sections, under the title.
function addContents(doc) {
  const hs = [...doc.querySelectorAll('h2')];
  if (hs.length < 4) return;
  const nav = document.createElement('nav');
  nav.className = 'wiki-toc';
  nav.setAttribute('aria-label', 'On this page');
  nav.innerHTML = '<strong>On this page</strong><ol></ol>';
  for (const h of hs) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      h.scrollIntoView({ block: 'start' });
      history.replaceState(null, '', `#${h.id}`);
    });
    li.append(a);
    nav.querySelector('ol').append(li);
  }
  const h1 = doc.querySelector('h1');
  (h1 || doc.firstChild)?.after(nav);
}

// Topic pages list the walkthroughs that link to them, worked out when the site
// is built, so the list stays complete as walkthroughs are added.
function addAppearsIn(doc, slug) {
  if (slug.startsWith('sketches/') || slug.startsWith('code/') || slug.startsWith('_') || slug === 'README' || slug === 'glossary') return;
  const walks = (wikiMeta[slug]?.linkedFrom || []).filter((s) => s.startsWith('sketches/')).sort();
  if (!walks.length) return;
  const sec = document.createElement('section');
  sec.className = 'wiki-appears';
  sec.innerHTML = `<h2 id="appears-in">Appears in these walkthroughs</h2><ul></ul>`;
  for (const w of walks) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = wikiUrl(w);
    a.setAttribute('data-link', '');
    a.textContent = (wikiMeta[w]?.title || w).replace(/: in plain English$/, '');
    li.append(a);
    sec.querySelector('ul').append(li);
  }
  const related = [...doc.querySelectorAll('p')].find((p) => /^Related:/.test(p.textContent.trim()));
  if (related) related.before(sec);
  else doc.append(sec);
}
