import { marked } from 'marked';
import { sketches } from './registry.js';
import { getEditableSource } from './sourceStore.js';
import wikiMeta from 'virtual:wiki-meta';

// The beginner wiki (docs/wiki), served on the site at /wiki/<page>, and the
// table that makes lines in the code panel clickable: each concept names the
// wiki page that explains it and a pattern that finds it in a line of code.
// Pages load on demand, so the 300 KB of Markdown stays out of the main bundle.

const pageLoaders = import.meta.glob('../../docs/wiki/**/*.md', { query: '?raw', import: 'default' });

// '../../docs/wiki/sketches/gameOfLife.md' -> 'sketches/gameOfLife'
const pathToSlug = (path) => path.replace(/^.*\/docs\/wiki\//, '').replace(/\.md$/, '');
const loaders = new Map(Object.entries(pageLoaders).map(([path, load]) => [pathToSlug(path), load]));

export const wikiUrl = (slug) => (slug === 'README' ? '/wiki' : `/wiki/${slug}`);
export const hasWikiPage = (slug) => loaders.has(slug);
export const walkthroughSlug = (sketchId) => (loaders.has(`sketches/${sketchId}`) ? `sketches/${sketchId}` : null);

// { slug: { title, summary, tags, added, updated } }, read at build time.
export { wikiMeta };
export const pageSummary = (slug) => wikiMeta[slug]?.summary || '';

// The page's Markdown, without its `---` header (summary and tags).
export async function loadWikiPage(slug) {
  const load = loaders.get(slug || 'README');
  return load ? stripHeader(await load()) : null;
}
export const stripHeader = (md) => md.replace(/^---\n[\s\S]*?\n---\n+/, '');

const headingId = (text) =>
  text.toLowerCase().trim().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\- ]/gu, '').replace(/ /g, '-');

// "binary file (`.bin`)" -> "binary-file", "Bézier curve" -> "bezier-curve".
// tests/wiki.test.mjs uses the same rule.
export const glossaryId = (term) =>
  term.replace(/\(.*?\)/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Markdown -> HTML with the wiki's relative links pointed at the site:
// other pages -> /wiki/..., a sketch's source file -> that sketch's page.
// The wiki is written by us, not visitors, so its HTML is trusted.
export function renderWiki(md, slug) {
  const dir = slug.includes('/') ? slug.slice(0, slug.lastIndexOf('/') + 1) : '';
  const html = marked.parse(md);
  const holder = document.createElement('div');
  holder.innerHTML = html;
  for (const h of holder.querySelectorAll('h1, h2, h3, h4')) h.id ||= headingId(h.textContent);
  // Glossary entries ("- **golden angle**: …") get ids, so "Words on this page"
  // links land on the word itself (glossary.md#golden-angle).
  if (slug === 'glossary') {
    for (const li of holder.querySelectorAll('li')) {
      const term = li.firstElementChild?.tagName === 'STRONG' ? li.firstElementChild.textContent : null;
      if (term) li.id = glossaryId(term);
    }
  }
  for (const a of holder.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/^[a-z]+:/i.test(href) || href.startsWith('#') || href.startsWith('/')) {
      if (/^https?:/i.test(href)) a.target = '_blank';
      continue;
    }
    const [path, hash] = href.split('#');
    const resolved = resolvePath(dir, path);
    const sketch = /^(?:\.\.\/)*src\/sketches\/([\w-]+)\.js$/.exec(resolved);
    if (sketch) {
      a.href = `/s/${sketch[1]}`;
      a.setAttribute('data-link', '');
    } else if (resolved.endsWith('.md')) {
      a.href = wikiUrl(resolved.replace(/\.md$/, '')) + (hash ? `#${hash}` : '');
      a.setAttribute('data-link', '');
    }
  }
  // `docs/wiki/x.md` written in code spans becomes a link too.
  for (const code of holder.querySelectorAll('code')) {
    const m = /^docs\/wiki\/([\w/-]+)\.md$/.exec(code.textContent);
    if (m && hasWikiPage(m[1]) && !code.closest('a, pre')) {
      const a = document.createElement('a');
      a.href = wikiUrl(m[1]);
      a.setAttribute('data-link', '');
      code.replaceWith(a);
      a.append(code);
    }
  }
  return holder.innerHTML;
}

function resolvePath(dir, rel) {
  const parts = (dir + rel).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.length && out[out.length - 1] !== '..' ? out.pop() : out.push(p);
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

// --- Clickable code ---------------------------------------------------------
// Order matters only for overlaps: earlier concepts win a tie at the same spot.
export const CODE_CONCEPTS = [
  { page: 'glow', label: 'Glow', re: /\bcreateGlow\b|\bctx\.pipeline\b|\bbloom\w*/gi },
  { page: 'instancing', label: 'Instancing', re: /\bInstancedMesh\b|\bsetMatrixAt\b|\bsetColorAt\b|\binstanceMatrix\b/g },
  { page: 'render-targets', label: 'Render targets', re: /\bWebGLRenderTarget\b|\bsetRenderTarget\b/g },
  { page: 'lights', label: 'Lights', re: /\bTHREE\.\w*Light\b/g },
  { page: 'lines-and-points', label: 'Lines and points', re: /\bTHREE\.(?:Line|LineSegments|LineLoop|Points|PointsMaterial|LineBasicMaterial)\b|\bcreate(?:FatLines|Dots)\b/g },
  { page: 'mesh-geometry-material', label: 'Mesh, geometry, material', re: /\bTHREE\.(?:\w+Geometry|\w+Material|Mesh|BufferAttribute|Float32BufferAttribute)\b/g },
  { page: 'scene-and-camera', label: 'Scene and camera', re: /\bctx\.scene\b|\bTHREE\.(?:Scene|PerspectiveCamera|OrthographicCamera|Group|Fog\w*)\b/g },
  { page: 'camera-and-controls', label: 'Camera and controls', re: /\bctx\.camera\b|\bcamera\.(?:position|lookAt|fov|up)\b|\bcontrols\b/g },
  { page: 'textures', label: 'Textures', re: /\btexture2D\b|\btexture\(|\bsampler2D\b|\bTHREE\.(?:DataTexture|CanvasTexture|TextureLoader|\w+Filter)\b/g },
  { page: 'uniforms', label: 'Uniforms', re: /\buniforms?\b|\bu(?:Time|Resolution|Mouse)\b/g },
  { page: 'shaders', label: 'Shaders', re: /\b(?:fragmentShader|vertexShader|gl_FragColor|gl_FragCoord|gl_Position|ShaderMaterial)\b|\bvoid main\b/g },
  { page: 'cosine-palette', label: 'Cosine palette', re: /\bpalette\(|6\.2831\d*/g },
  { page: 'colour-scales', label: 'Colour scales', re: /\b(?:inferno|viridis|magma|plasma|turbo)\w*\b/gi },
  { page: 'noise', label: 'Noise', re: /\b(?:s?noise|fbm|simplex|perlin|curl)\w*\(/gi },
  { page: 'randomness', label: 'Randomness and seeds', re: /\bMath\.random\b|\bhash\w*\(|\brand(?:om)?\w*\(|\bseed\w*\b|\bmulberry\w*/g },
  { page: 'colour-blending-and-gain', label: 'Blending and gain', re: /\bmix\(|\bTHREE\.\w*Blending\b|\bblending\b|\btoneMapping\w*/g },
  { page: 'rgb', label: 'RGB colour', re: /\bTHREE\.Color\b|\bset(?:RGB|HSL|Hex)\b|\b0x[0-9a-fA-F]{6}\b|'#[0-9a-fA-F]{3,6}'/g },
  { page: 'glsl-basics', label: 'Shader language basics', re: /\b(?:vec[234]|mat[234]|float|smoothstep|fract|clamp|step|length|normalize|precision)\b/g },
  { page: 'motion-and-latex', label: 'Motion and the live equation', re: /^\s*(?:motion|latex)\s*[:(]|\bhl\(/g },
  { page: 'params', label: 'Params (the sliders)', re: /\b(?:ctx\.)?params\b/g },
  { page: 'frame-loop', label: 'The frame loop', re: /^\s*(?:async\s+)?(?:setup|update|dispose)\s*\(|\bctx\.(?:delta|time)\b|\brequestAnimationFrame\b/g },
  { page: 'sketch-format', label: 'Sketch format', re: /^\s{2}(?:name|description|tags|category|mode|controls|wheelZoom|actions)\s*:|\bexport default\b/g },
  { page: 'js-promises-and-fetch', label: 'Fetching data', re: /\b(?:fetch|await|async|then|Promise)\b/g },
  { page: 'js-decisions-and-loops', label: 'Decisions and loops', re: /\b(?:if|else|for|while|switch|break|continue)\b/g },
  { page: 'js-arrays-and-objects', label: 'Lists and objects', re: /\.(?:push|map|filter|forEach|reduce|length|fill)\b|\bnew (?:Float32Array|Uint8Array|Uint16Array|Int32Array|Array)\b/g },
  { page: 'js-functions', label: 'Functions', re: /\bfunction\b|=>|\breturn\b/g },
  { page: 'js-values-and-variables', label: 'Values and names', re: /\b(?:const|let|var)\b/g },
].map((c) => ({ ...c, title: c.label, blurb: pageSummary(c.page) })); // blurb: the page's own summary line

const conceptByPage = new Map(CODE_CONCEPTS.map((c) => [c.page, c]));
export const conceptFor = (page) => conceptByPage.get(page);

// Where a line's comment starts (its length if it has none). Rough, but
// good enough for display: a // after a colon or quote is a URL or a string.
export function commentStart(line) {
  const m = /(?<![:'"`\\])\/\/|^\s*\*|^\s*\/\*/.exec(line);
  return m ? m.index : line.length;
}

// The clickable stretches of one line: [{start, end, concept}], non-overlapping.
// A `// see docs/wiki/x.md` comment is a link to that page.
export function lineTerms(line) {
  const found = [];
  for (const see of line.matchAll(/docs\/wiki\/([\w/-]+)\.md/g)) {
    if (hasWikiPage(see[1])) found.push({ start: see.index, end: see.index + see[0].length, page: see[1], see: true });
  }
  // Words inside a comment (// ...) are prose, not code: leave them plain.
  const codeEnd = commentStart(line);
  CODE_CONCEPTS.forEach((concept, rank) => {
    concept.re.lastIndex = 0;
    for (const m of line.matchAll(concept.re)) {
      if (!m[0].length || m.index >= codeEnd) continue;
      found.push({ start: m.index, end: m.index + m[0].length, concept, rank, text: m[0].trim() });
    }
  });
  found.sort((a, b) => a.start - b.start || (a.see ? -1 : b.see ? 1 : a.rank - b.rank));
  const kept = [];
  let end = 0;
  for (const f of found) {
    if (f.start < end) continue;
    kept.push(f);
    end = f.end;
  }
  return kept;
}

// Other sketches that use the same thing: lines containing the same text
// (e.g. `setMatrixAt`), else any line matching the concept. One line per sketch.
export function similarLines(term, excludeId, limit = 8) {
  const needle = term.text && term.text.length > 2 ? term.text : null;
  const re = needle ? null : new RegExp(term.concept.re.source, term.concept.re.flags.replace('g', ''));
  const hits = [];
  let total = 0;
  for (const s of sketches) {
    if (s.id === excludeId || s.community) continue;
    const lines = getEditableSource(s.id).split('\n');
    const i = lines.findIndex((l) => (needle ? l.includes(needle) : re.test(l)) && l.trim().length > 4);
    if (i === -1) continue;
    total++;
    hits.push({ id: s.id, name: s.name, line: i + 1, text: lines[i].trim() });
  }
  // Spread the picks across the list so it isn't always the alphabetically first few.
  const step = Math.max(1, Math.floor(hits.length / limit));
  return { total, picks: hits.filter((_, k) => k % step === 0).slice(0, limit) };
}
