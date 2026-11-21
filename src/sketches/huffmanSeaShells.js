import { TAU } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// She Sells Sea Shells, Compressed. Two classic ways to make a message smaller, on one tongue-twister.
// Act 1, Huffman coding (David Huffman, 1952, as a student). Count each letter; then, again and again, join the two
// rarest groups under a new branch, until one tree holds them all. Each letter's code is its route from the top
// (left = 0, right = 1): common letters end up near the top with short codes. No code is the start of another, so
// the bits can be read back without gaps. The best any letter-by-letter code can do is Shannon's entropy,
//     H = −Σ p log₂ p   bits per letter,
// and Huffman comes within a whisker. Worked out in Node for this sentence: 37 letters (11 different), H = 3.01 bits
// a letter, Huffman 3.08 (114 bits in all), plain 8-bit text 296 bits.
// Act 2, LZ77 (Lempel and Ziv, 1977), the idea inside zip files and PNGs: when a chunk of 3 or more letters has
// appeared before, write "go back d, copy n" instead. 37 letters become 23 tokens.
// see docs/wiki/sketches/huffmanSeaShells.md

const TEXT = 'she sells sea shells by the sea shore';
const ACT1 = 22, ACT2 = 16, LOOP = ACT1 + ACT2;

// Huffman tree, built once (ties broken by creation order, so it is always the same tree).
const HUFF = (() => {
  const freq = {};
  for (const c of TEXT) freq[c] = (freq[c] || 0) + 1;
  const nodes = Object.entries(freq).map(([c, w], i) => ({ c, w, id: i }));
  let id = nodes.length;
  const queue = nodes.slice(), merges = [];
  while (queue.length > 1) {
    queue.sort((p, q) => p.w - q.w || p.id - q.id);
    const l = queue.shift(), r = queue.shift(), n = { w: l.w + r.w, l, r, id: id++ };
    merges.push(n);
    queue.push(n);
  }
  const root = queue[0], codes = {};
  let leafX = 0;
  (function walk(n, path, depth) {
    n.depth = depth;
    if (n.c !== undefined) { codes[n.c] = path || '0'; n.x = leafX++; return; }
    walk(n.l, path + '0', depth + 1); walk(n.r, path + '1', depth + 1);
    n.x = (n.l.x + n.r.x) / 2;
  })(root, '', 0);
  const N = TEXT.length, H = -Object.values(freq).reduce((s, w) => s + (w / N) * Math.log2(w / N), 0);
  const bits = [...TEXT].reduce((s, c) => s + codes[c].length, 0);
  return { freq, nodes, merges, root, codes, leaves: leafX, H, bits, maxDepth: Math.max(...Object.values(codes).map((c) => c.length)) };
})();

// LZ77, greedy: at each point, the longest earlier match of 3 or more letters, else the letter itself.
const LZ = (() => {
  const out = [];
  let i = 0;
  while (i < TEXT.length) {
    let bl = 0, bo = 0;
    for (let j = 0; j < i; j++) {
      let l = 0;
      while (i + l < TEXT.length && TEXT[j + l] === TEXT[i + l]) l++;
      if (l > bl) { bl = l; bo = i - j; }
    }
    if (bl >= 3) { out.push({ at: i, back: bo, len: bl }); i += bl; } else { out.push({ at: i, ch: TEXT[i] }); i++; }
  }
  return out;
})();

const show = (c) => (c === ' ' ? '␣' : c);
// the longest copy, for the caption (greedy LZ77 copies "he se", not the word "sea": chunks needn't be words)
const LONGEST = LZ.reduce((b, t) => (t.len && (!b || t.len > b.len) ? t : b), null);

export default {
  name: 'She Sells Sea Shells, Compressed',
  description:
    'A tongue-twister squeezed two ways. Huffman coding builds a tree that gives common letters short codes and rare ' +
    'ones long codes, coming within 2% of the best possible; LZ77, the trick inside zip files, spots repeated chunks and ' +
    'writes "go back, copy" instead. 296 bits of plain text become 114.',
  tags: ['algorithms', 'compression', 'huffman coding', 'lz77', 'information theory', 'entropy', 'humor'],
  category: 'Algorithms',
  mode: '3d',

  motion(t) {
    const u = t % LOOP;
    return u < ACT1 ? { act: 0, tAct: u } : { act: 1, tAct: u - ACT1 };
  },

  latex: (params, hl, m) => {
    if (m.act === 0) {
      return (
        '\\begin{aligned}' +
        'H &= -\\sum p \\log_2 p = ' + hl(HUFF.H, 2) + '\\ \\text{bits a letter} \\\\' +
        `\\text{Huffman} &= ${hl(HUFF.bits / TEXT.length, 2)}\\ \\text{bits a letter},\\ ${HUFF.bits}\\ \\text{bits} \\\\` +
        `\\text{plain text} &= 8\\ \\text{bits a letter},\\ ${TEXT.length * 8}\\ \\text{bits} \\\\` +
        `& ${caption('Common letters get short codes. "s" is 01. "b" is 10100. Sorry, b.')}` +
        '\\end{aligned}'
      );
    }
    return (
      '\\begin{aligned}' +
      '&\\text{seen it before? write } (d, n) = \\text{go back } d,\\ \\text{copy } n \\\\' +
      `&${TEXT.length}\\ \\text{letters} \\to ${LZ.length}\\ \\text{tokens} \\\\` +
      `& ${caption(`"${TEXT.substr(LONGEST.at, LONGEST.len)}" again? Go back ${LONGEST.back}, copy ${LONGEST.len}. It doesn't care about words.`)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 0.6 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area;
    const mono = (px) => `${Math.round(px * Math.max(0.75, Math.min(1.4, state.stage.h / 800)))}px ui-monospace, monospace`;
    if (m.act === 0) {
      // the tree assembles merge by merge (0–11 s), then the message is encoded letter by letter (11–21 s)
      const merged = Math.min(HUFF.merges.length, Math.floor((m.tAct / 11) * (HUFF.merges.length + 1)));
      const live = new Set(HUFF.merges.slice(0, merged));
      const lw = a.w / (HUFF.leaves + 1), lh = (a.h * 0.55) / (HUFF.maxDepth + 1);
      const X = (n) => a.x + (n.x + 1) * lw, Y = (n) => a.y + 20 + n.depth * lh;
      g.lineWidth = 1.6;
      for (const n of HUFF.merges) {
        if (!live.has(n)) continue;
        for (const [ch, bit] of [[n.l, '0'], [n.r, '1']]) {
          g.strokeStyle = 'rgba(150,190,255,0.8)';
          g.beginPath(); g.moveTo(X(n), Y(n)); g.lineTo(X(ch), Y(ch)); g.stroke();
          g.fillStyle = 'rgba(255,210,120,0.85)'; g.font = mono(11); g.textAlign = 'center';
          g.fillText(bit, (X(n) + X(ch)) / 2 + (bit === '0' ? -7 : 7), (Y(n) + Y(ch)) / 2);
        }
        g.fillStyle = 'rgb(120,160,255)'; g.beginPath(); g.arc(X(n), Y(n), 9, 0, TAU); g.fill();
        g.fillStyle = 'white'; g.font = mono(10); g.fillText(String(n.w), X(n), Y(n) + 3.5);
      }
      for (const n of HUFF.nodes) {
        g.fillStyle = 'rgb(255,215,120)'; g.beginPath(); g.arc(X(n), Y(n), 11, 0, TAU); g.fill();
        g.fillStyle = 'rgb(20,20,30)'; g.font = mono(13); g.textAlign = 'center'; g.fillText(show(n.c), X(n), Y(n) + 4.5);
        g.fillStyle = 'rgba(220,225,240,0.8)'; g.font = mono(10); g.fillText(`×${n.w}`, X(n), Y(n) + 24);
        if (merged === HUFF.merges.length) { g.fillStyle = 'rgba(255,215,120,0.9)'; g.fillText(HUFF.codes[n.c], X(n), Y(n) + 36); }
      }
      // encoding the message
      const shown = m.tAct < 11 ? 0 : Math.min(TEXT.length, Math.floor(((m.tAct - 11) / 9) * TEXT.length));
      const ty = a.y + a.h * 0.8;
      g.textAlign = 'left'; g.font = mono(14);
      let x = a.x;
      for (let i = 0; i < TEXT.length; i++) {
        g.fillStyle = i < shown ? 'rgb(255,215,120)' : 'rgba(200,205,220,0.5)';
        g.fillText(TEXT[i], x, ty); x += g.measureText('m').width;
      }
      const stream = [...TEXT.slice(0, shown)].map((c) => HUFF.codes[c]).join('');
      g.font = mono(11); g.fillStyle = 'rgba(150,200,255,0.9)';
      const perLine = Math.max(20, Math.floor(a.w / g.measureText('0').width) - 2);
      for (let q = 0; q * perLine < stream.length; q++) g.fillText(stream.slice(q * perLine, (q + 1) * perLine), a.x, ty + 20 + q * 15);
    } else {
      // LZ77: tokens appear one by one; a back-reference draws an arc to where it copies from
      const n = Math.min(LZ.length, Math.floor((m.tAct / (ACT2 - 3)) * LZ.length) + 1);
      g.font = mono(20); g.textAlign = 'left';
      const cw = Math.min(g.measureText('m').width, a.w / (TEXT.length + 1));
      g.font = `${Math.round(cw * 1.6)}px ui-monospace, monospace`;
      const ty = a.y + a.h * 0.42, X = (i) => a.x + i * cw;
      const upto = n < LZ.length ? LZ[n].at : TEXT.length;
      for (let i = 0; i < TEXT.length; i++) { g.fillStyle = i < upto ? 'rgb(230,235,250)' : 'rgba(140,150,170,0.4)'; g.fillText(TEXT[i], X(i), ty); }
      const cur = LZ[n - 1];
      LZ.slice(0, n).forEach((tk) => {
        if (tk.len) {
          const latest = tk === cur;
          g.strokeStyle = latest ? 'rgb(255,200,90)' : 'rgba(255,200,90,0.35)'; g.lineWidth = latest ? 2.2 : 1.2;
          const x0 = X(tk.at - tk.back + tk.len / 2), x1 = X(tk.at + tk.len / 2);
          g.beginPath(); g.moveTo(x0, ty - cw * 1.4); g.quadraticCurveTo((x0 + x1) / 2, ty - cw * 1.4 - (x1 - x0) * 0.35, x1, ty - cw * 1.4); g.stroke();
          g.fillStyle = latest ? 'rgba(255,200,90,0.25)' : 'rgba(255,200,90,0.1)';
          g.fillRect(X(tk.at), ty - cw * 1.25, tk.len * cw, cw * 1.6);
        }
      });
      // the token stream underneath
      g.font = mono(13);
      let x = a.x, y = ty + cw * 2.2;
      LZ.slice(0, n).forEach((tk) => {
        const s = tk.len ? `(${tk.back},${tk.len})` : show(tk.ch);
        const w = g.measureText(s + ' ').width;
        if (x + w > a.x + a.w) { x = a.x; y += 20; }
        g.fillStyle = tk.len ? 'rgb(255,200,90)' : 'rgba(220,225,240,0.85)';
        g.fillText(s, x, y); x += w;
      });
    }
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
