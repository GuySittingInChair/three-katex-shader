import { marked } from 'marked';
import { sketches } from './registry.js';
import { getEditableSource } from './sourceStore.js';

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

export async function loadWikiPage(slug) {
  const load = loaders.get(slug || 'README');
  return load ? load() : null;
}

const headingId = (text) =>
  text.toLowerCase().trim().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\- ]/gu, '').replace(/ /g, '-');

// Markdown -> HTML with the wiki's relative links pointed at the site:
// other pages -> /wiki/..., a sketch's source file -> that sketch's page.
// The wiki is written by us, not visitors, so its HTML is trusted.
export function renderWiki(md, slug) {
  const dir = slug.includes('/') ? slug.slice(0, slug.lastIndexOf('/') + 1) : '';
  const html = marked.parse(md);
  const holder = document.createElement('div');
  holder.innerHTML = html;
  for (const h of holder.querySelectorAll('h1, h2, h3, h4')) h.id ||= headingId(h.textContent);
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
  { page: 'glow', label: 'Glow', re: /\bcreateGlow\b|\bctx\.pipeline\b|\bbloom\w*/gi,
    blurb: 'Makes bright things bleed light into their surroundings, like a lamp in fog.' },
  { page: 'instancing', label: 'Instancing', re: /\bInstancedMesh\b|\bsetMatrixAt\b|\bsetColorAt\b|\binstanceMatrix\b/g,
    blurb: 'Draws thousands of copies of one shape in a single go, each with its own position.' },
  { page: 'render-targets', label: 'Render targets', re: /\bWebGLRenderTarget\b|\bsetRenderTarget\b/g,
    blurb: 'Draws a picture off-screen so it can be reused, like a scratch pad.' },
  { page: 'lights', label: 'Lights', re: /\bTHREE\.\w*Light\b/g,
    blurb: 'A lamp in the 3D scene. Without one, lit materials look black.' },
  { page: 'lines-and-points', label: 'Lines and points', re: /\bTHREE\.(?:Line|LineSegments|LineLoop|Points|PointsMaterial|LineBasicMaterial)\b|\bcreate(?:FatLines|Dots)\b/g,
    blurb: 'Thin strokes and dots instead of solid surfaces: trails, threads, stars.' },
  { page: 'mesh-geometry-material', label: 'Mesh, geometry, material', re: /\bTHREE\.(?:\w+Geometry|\w+Material|Mesh|BufferAttribute|Float32BufferAttribute)\b/g,
    blurb: 'A 3D object is a shape (geometry) plus a skin (material), put together as a mesh.' },
  { page: 'scene-and-camera', label: 'Scene and camera', re: /\bctx\.scene\b|\bTHREE\.(?:Scene|PerspectiveCamera|OrthographicCamera|Group|Fog\w*)\b/g,
    blurb: 'The scene is the stage everything is put on; the camera is where you watch from.' },
  { page: 'camera-and-controls', label: 'Camera and controls', re: /\bctx\.camera\b|\bcamera\.(?:position|lookAt|fov|up)\b|\bcontrols\b/g,
    blurb: 'Where the camera sits and points, and how dragging and scrolling move it.' },
  { page: 'textures', label: 'Textures', re: /\btexture2D\b|\btexture\(|\bsampler2D\b|\bTHREE\.(?:DataTexture|CanvasTexture|TextureLoader|\w+Filter)\b/g,
    blurb: 'A picture (or a grid of numbers stored as one) that a shader can look things up in.' },
  { page: 'uniforms', label: 'Uniforms', re: /\buniforms?\b|\bu(?:Time|Resolution|Mouse)\b/g,
    blurb: 'Values sent from JavaScript into a shader: the same for every pixel, changed each frame.' },
  { page: 'shaders', label: 'Shaders', re: /\b(?:fragmentShader|vertexShader|gl_FragColor|gl_FragCoord|gl_Position|ShaderMaterial)\b|\bvoid main\b/g,
    blurb: 'A tiny program the graphics card runs once for every pixel, all at the same time.' },
  { page: 'cosine-palette', label: 'Cosine palette', re: /\bpalette\(|6\.2831\d*/g,
    blurb: 'A rainbow made from three cosine waves, one each for red, green and blue.' },
  { page: 'colour-scales', label: 'Colour scales', re: /\b(?:inferno|viridis|magma|plasma|turbo)\w*\b/gi,
    blurb: 'A colour ramp designed so that bigger numbers always look brighter.' },
  { page: 'noise', label: 'Noise', re: /\b(?:s?noise|fbm|simplex|perlin|curl)\w*\(/gi,
    blurb: 'Smooth randomness: hills and clouds, not TV static.' },
  { page: 'randomness', label: 'Randomness and seeds', re: /\bMath\.random\b|\bhash\w*\(|\brand(?:om)?\w*\(|\bseed\w*\b|\bmulberry\w*/g,
    blurb: 'Dice rolls in code. A seed makes the same rolls come out every time.' },
  { page: 'colour-blending-and-gain', label: 'Blending and gain', re: /\bmix\(|\bTHREE\.\w*Blending\b|\bblending\b|\btoneMapping\w*/g,
    blurb: 'Mixing two colours, and turning brightness up or down.' },
  { page: 'rgb', label: 'RGB colour', re: /\bTHREE\.Color\b|\bset(?:RGB|HSL|Hex)\b|\b0x[0-9a-fA-F]{6}\b|'#[0-9a-fA-F]{3,6}'/g,
    blurb: 'Every colour on screen is a mix of red, green and blue light.' },
  { page: 'glsl-basics', label: 'Shader language basics', re: /\b(?:vec[234]|mat[234]|float|smoothstep|fract|clamp|step|length|normalize|precision)\b/g,
    blurb: "The shader language's building blocks: numbers, arrows (vectors) and a few handy functions." },
  { page: 'motion-and-latex', label: 'Motion and the live equation', re: /^\s*(?:motion|latex)\s*[:(]|\bhl\(/g,
    blurb: 'motion(t) works out the moving numbers; latex writes them into the equation on screen.' },
  { page: 'params', label: 'Params (the sliders)', re: /\b(?:ctx\.)?params\b/g,
    blurb: 'The sliders in the Params panel, and how code reads their values.' },
  { page: 'frame-loop', label: 'The frame loop', re: /^\s*(?:async\s+)?(?:setup|update|dispose)\s*\(|\bctx\.(?:delta|time)\b|\brequestAnimationFrame\b/g,
    blurb: 'setup runs once, update runs about 60 times a second, dispose tidies up.' },
  { page: 'sketch-format', label: 'Sketch format', re: /^\s{2}(?:name|description|tags|category|mode|controls|wheelZoom|actions)\s*:|\bexport default\b/g,
    blurb: 'The fields every sketch file fills in: its name, its mode, its sliders and so on.' },
  { page: 'js-promises-and-fetch', label: 'Fetching data', re: /\b(?:fetch|await|async|then|Promise)\b/g,
    blurb: 'Asking for a file over the internet, and waiting for the answer without freezing.' },
  { page: 'js-decisions-and-loops', label: 'Decisions and loops', re: /\b(?:if|else|for|while|switch|break|continue)\b/g,
    blurb: '"If this, do that", and "do this again for every item".' },
  { page: 'js-arrays-and-objects', label: 'Lists and objects', re: /\.(?:push|map|filter|forEach|reduce|length|fill)\b|\bnew (?:Float32Array|Uint8Array|Uint16Array|Int32Array|Array)\b/g,
    blurb: 'Lists of things, and bundles of named values.' },
  { page: 'js-functions', label: 'Functions', re: /\bfunction\b|=>|\breturn\b/g,
    blurb: 'A named recipe: give it ingredients, it hands back a result.' },
  { page: 'js-values-and-variables', label: 'Values and names', re: /\b(?:const|let|var)\b/g,
    blurb: 'Giving a value a name so you can use it later.' },
].map((c) => ({ ...c, title: c.label }));

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
