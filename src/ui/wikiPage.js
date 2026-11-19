import { loadWikiPage, renderWiki, wikiUrl } from '../core/wiki.js';
import { sketches } from '../core/registry.js';

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
        </nav>
      </header>
      <div class="wiki-open hidden"></div>
      <article class="wiki-doc explain-doc"></article>
    </div>`;
  const doc = el.querySelector('.wiki-doc');
  const openBar = el.querySelector('.wiki-open');
  let token = 0;

  async function show(slug, hash) {
    const mine = ++token;
    const md = await loadWikiPage(slug);
    if (mine !== token) return;
    if (md == null) {
      doc.innerHTML = `<h1>Page not found</h1><p>There's no wiki page called <code></code>. <a href="/wiki" data-link>Back to the wiki home</a>.</p>`;
      doc.querySelector('code').textContent = slug;
      openBar.classList.add('hidden');
      document.title = 'Wiki · aiship';
      return;
    }
    doc.innerHTML = renderWiki(md, slug || 'README');
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
    if (target) target.scrollIntoView();
    else el.scrollTop = 0;
  }

  return { show, url: wikiUrl };
}
