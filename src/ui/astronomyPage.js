import guideSource from '../../docs/guide.md?raw';
import { sketches } from '../core/registry.js';
import { isPublished } from '../core/sketchSettings.js';
import { walkthroughSlug, wikiUrl, wikiMeta } from '../core/wiki.js';

// /astronomy: everything about space in one place. Nothing here is a fixed
// list: a sketch appears if its category is "Astronomy" or its tags include
// "astronomy"; a wiki page appears if its header has `tags: astronomy`, or
// if it is the walkthrough of one of those sketches. Tag new work and it
// shows up here by itself.

export const isAstronomy = (s) => s.category === 'Astronomy' || (s.tags || []).some((t) => t.toLowerCase() === 'astronomy');
const usesRealData = (s) => (s.tags || []).some((t) => t.toLowerCase() === 'real data');
// Sketches with an "annotated" section in the expert guide (docs/guide.md).
const hasGuideNotes = (id) => guideSource.includes(`File: \`src/sketches/${id}.js\``);

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function card(s) {
  const walk = walkthroughSlug(s.id);
  const extras = [
    walk ? `<a data-link href="${wikiUrl(walk)}">Plain-English walkthrough →</a>` : '',
    hasGuideNotes(s.id) ? '<span class="astro-note">Expert notes in its Explain panel</span>' : '',
  ].filter(Boolean).join('');
  return `<article class="astro-card">
      <a class="astro-card-main" data-link href="/s/${encodeURIComponent(s.id)}">
        <div class="sketch-thumb astro-thumb"><img loading="lazy" alt="" src="/thumbs/${encodeURIComponent(s.id)}.jpg"></div>
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.description || '')}</p>
      </a>
      ${extras ? `<div class="astro-card-links">${extras}</div>` : ''}
    </article>`;
}

export function createAstronomyPage(el) {
  function render() {
    const all = sketches.filter((s) => !s.community && isPublished(s) && isAstronomy(s));
    const data = all.filter(usesRealData);
    const physics = all.filter((s) => !usesRealData(s));
    const walkSlugs = all.map((s) => walkthroughSlug(s.id)).filter(Boolean);
    const tagged = Object.entries(wikiMeta)
      .filter(([slug, m]) => m.tags.includes('astronomy') && !walkSlugs.includes(slug))
      .map(([slug]) => slug);
    const wikiItems = [...walkSlugs, ...tagged]
      .map((slug) => `<li><a data-link href="${wikiUrl(slug)}">${esc(wikiMeta[slug]?.title || slug)}</a>
        <span>${esc(wikiMeta[slug]?.summary || '')}</span></li>`)
      .join('');

    el.innerHTML = `
      <div class="page-inner astro-inner">
        <header class="page-head">
          <a class="brand" href="/" data-link>aiship</a>
          <nav class="page-nav">
            <a href="/sketches" data-link>Sketches</a>
            <a href="/astronomy" data-link aria-current="page">Astronomy</a>
            <a href="/wiki" data-link>Wiki</a>
            <a href="/games" data-link>Games</a>
          </nav>
        </header>
        <h1 class="page-title">Astronomy</h1>
        <p class="page-lede">Real measurements from telescopes and spacecraft (Gaia, Webb, Planck, Kepler, LIGO,
          Voyager and more) turned into animations you can explore, and the physics behind orbits, black holes and
          exploding stars. ${all.length} sketches so far.</p>

        <section class="astro-hidden">
          <h2>Hidden inside Messier's Sky</h2>
          <p>The <a data-link href="/s/messierInDepth">Messier's Sky</a> explorer holds more than its name says.
            Open it and look for these buttons in its side panel:</p>
          <ul>
            <li><strong>✦ The Unknown Universe</strong> and <strong>✦ Tour the unknown</strong>: stranger objects
              most people have never heard of.</li>
            <li><strong>Arp's Peculiar Galaxies</strong>: pick a colliding pair, then
              <strong>⏳ The collision, past and future</strong> to run its fitted orbit backwards and forwards.</li>
            <li><strong>M51, the Whirlpool Galaxy</strong>: select it for <strong>Structure + explosions</strong>
              (its spiral arms, star-forming knots and supernovae) and <strong>⏳ Time machine</strong>.</li>
            <li><strong>→ Show motions</strong>: where each galaxy is heading, predicted from gravity.</li>
            <li><strong>⏳ The Local Group</strong>: the Milky Way, Andromeda, Triangulum and the Large Magellanic
              Cloud, run backwards and forwards in time from their measured motions.</li>
            <li><strong>☀ Stars around the Sun</strong>: about 8,800 of the brightest stars plus every star with an
              official name, each at its real distance. Click one for what is measured and what is worked out.</li>
          </ul>
        </section>

        <section>
          <h2>From real data</h2>
          <div class="astro-grid">${data.map(card).join('')}</div>
        </section>

        <section>
          <h2>Space physics</h2>
          <div class="astro-grid">${physics.map(card).join('')}</div>
        </section>

        <section>
          <h2>In the wiki</h2>
          ${wikiItems
            ? `<ul class="astro-wiki">${wikiItems}</ul>`
            : '<p class="explain-hint">No astronomy walkthroughs in the wiki yet. They are being written; each one will appear here when it is added.</p>'}
        </section>

        <section>
          <h2>Behind the scenes</h2>
          <p>How the galaxy explorer was built, where its data comes from and what is real versus modelled:
            <a href="https://github.com/GuySittingInChair/three-katex-shader/blob/main/docs/galaxy-engine.md"
              target="_blank" rel="noopener">the Deep Sky engine notes</a> (written for programmers).</p>
        </section>
      </div>`;
    // A missing thumbnail leaves the coloured tile instead of a broken image.
    el.querySelectorAll('.astro-thumb img').forEach((img) => img.addEventListener('error', () => img.remove()));
  }
  return {
    show() {
      render();
      el.scrollTop = 0;
      document.title = 'Astronomy · aiship';
    },
  };
}
