// Typed equations in x, y, z → a surface. parseEquation('z = x^2 - y^2')
// reads the kind of thing people type (implicit multiplication, x², sin x,
// |x|, π) into a syntax tree, and everything else is generated from that
// tree, never from the text: GLSL for the shader, LaTeX for the equation, a
// JS function for sampling. So nothing typed can reach the shader except
// through these whitelisted pieces.
//
//   const eq = parseEquation('x^2 + y^2 = z');   // throws EquationError on bad input
//   eq.f(x, y, z, t)        → lhs − rhs, a number (NaN outside the real domain)
//   eq.glsl('q', 'uTime')   → a GLSL float expression in q.x, q.y, q.z
//   eq.latex                → 'x^{2} + y^{2} = z'
//   eq.degree               → 2, or null if not a polynomial
//   eq.usesTime             → whether it contains t
//
// Variables: x, y, z, r (= √(x²+y²+z²)) and t (time in seconds).
// Constants: pi, e, phi, tau. Functions: sin cos tan asin acos atan sinh cosh
// tanh exp log/ln sqrt cbrt abs sign floor ceil, and min max mod (two
// arguments).

export class EquationError extends Error {}

const FUNCS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, sinh: 1, cosh: 1, tanh: 1,
  exp: 1, log: 1, ln: 1, sqrt: 1, cbrt: 1, abs: 1, sign: 1, floor: 1, ceil: 1,
  min: 2, max: 2, mod: 2,
};
const CONSTS = { pi: Math.PI, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2, e: Math.E };
const VARS = new Set(['x', 'y', 'z', 'r', 't']);
const WORDS = [...Object.keys(FUNCS), ...Object.keys(CONSTS)].sort((a, b) => b.length - a.length);

function normalise(text) {
  return text
    .replace(/\*\*/g, '^')
    .replace(/[·×∙]/g, '*')
    .replace(/[−–]/g, '-')
    .replace(/÷/g, '/')
    .replace(/π/g, ' pi ')
    .replace(/[φϕ]/g, ' phi ')
    .replace(/τ/g, ' tau ')
    .replace(/√/g, ' sqrt ')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4');
}

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new EquationError(`I can't read the number at "${src.slice(i, i + 6)}".`);
      out.push({ type: 'num', value: parseFloat(m[0]), at: i });
      i += m[0].length;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      // A run of letters: split into known words and one-letter variables,
      // so "xyz" is x·y·z and "2xsin(y)" works.
      const word = /^[a-z]+/i.exec(src.slice(i))[0].toLowerCase();
      let j = 0;
      while (j < word.length) {
        const rest = word.slice(j);
        const known = WORDS.find((w) => rest.startsWith(w));
        if (known) {
          out.push({ type: FUNCS[known] ? 'func' : 'const', value: known, at: i + j });
          j += known.length;
        } else if (VARS.has(rest[0])) {
          out.push({ type: 'var', value: rest[0], at: i + j });
          j += 1;
        } else {
          throw new EquationError(`I don't know "${word}". Use x, y, z, r, t, numbers, and functions like sin or sqrt.`);
        }
      }
      i += word.length;
      continue;
    }
    if ('+-*/^(),=|'.includes(c)) {
      out.push({ type: c, at: i });
      i++;
      continue;
    }
    throw new EquationError(`I don't know what "${c}" means here.`);
  }
  return out;
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const take = (type) => {
    const t = tokens[pos];
    if (!t || t.type !== type) {
      throw new EquationError(t ? `Expected "${type}" but found "${t.value ?? t.type}".` : `The equation ends too soon: expected "${type}".`);
    }
    pos++;
    return t;
  };
  const startsPrimary = (t) => t && ['num', 'var', 'const', 'func', '('].includes(t.type);

  function expr() {
    let node = term();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = tokens[pos++].type;
      node = { op: op === '+' ? 'add' : 'sub', a: node, b: term() };
    }
    return node;
  }
  function term() {
    let node = unary();
    for (;;) {
      const t = peek();
      if (t && (t.type === '*' || t.type === '/')) {
        pos++;
        node = { op: t.type === '*' ? 'mul' : 'div', a: node, b: unary() };
      } else if (startsPrimary(t)) {
        node = { op: 'mul', a: node, b: power(), implicit: true };   // 2x, x(y+1), xy
      } else return node;
    }
  }
  function unary() {
    const t = peek();
    if (t && t.type === '-') { pos++; return { op: 'neg', a: unary() }; }
    if (t && t.type === '+') { pos++; return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (peek() && peek().type === '^') {
      pos++;
      return { op: 'pow', a: base, b: unary() };     // right-associative; −x^2 = −(x^2)
    }
    return base;
  }
  function primary() {
    const t = peek();
    if (!t) throw new EquationError('The equation ends too soon.');
    if (t.type === 'num') { pos++; return { op: 'num', value: t.value }; }
    if (t.type === 'var') { pos++; return { op: 'var', name: t.value }; }
    if (t.type === 'const') { pos++; return { op: 'const', name: t.value }; }
    if (t.type === '(') {
      pos++;
      const inner = expr();
      take(')');
      return inner;
    }
    if (t.type === '|') {
      pos++;
      const inner = expr();
      take('|');
      return { op: 'call', fn: 'abs', args: [inner] };
    }
    if (t.type === 'func') {
      pos++;
      const fn = t.value === 'ln' ? 'log' : t.value;
      // sin^2(x) means (sin x)^2.
      let outerPow = null;
      if (peek() && peek().type === '^') {
        pos++;
        outerPow = primary();
      }
      let args;
      if (peek() && peek().type === '(') {
        pos++;
        args = [expr()];
        while (peek() && peek().type === ',') {
          pos++;
          args.push(expr());
        }
        take(')');
      } else {
        args = [power()];                                // sin x, sqrt 2
      }
      if (args.length !== FUNCS[t.value]) {
        throw new EquationError(`${t.value} takes ${FUNCS[t.value]} argument${FUNCS[t.value] > 1 ? 's' : ''}.`);
      }
      const call = { op: 'call', fn, args };
      return outerPow ? { op: 'pow', a: call, b: outerPow } : call;
    }
    throw new EquationError(`Unexpected "${t.type}".`);
  }

  if (!tokens.length) throw new EquationError('Type an equation, like z = x^2 - y^2.');
  const lhs = expr();
  let rhs = null;
  if (peek() && peek().type === '=') {
    pos++;
    rhs = expr();
  }
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw new EquationError(`I got lost at "${t.value ?? t.type}".`);
  }
  return { lhs, rhs };
}

// --- Generating code from the tree ------------------------------------------
// A subtree with no variables in it, like (1/3) or 2pi, is a constant.
const isConst = (n) => n.op !== 'var' && ['a', 'b'].every((k) => !n[k] || isConst(n[k])) && (n.args || []).every(isConst);
const constValue = (n) => toJs(n)(0, 0, 0, 0);
const glslNum = (x) => {
  if (!Number.isFinite(x)) throw new EquationError('That number is too big for me.');
  const s = String(x);
  return /[.e]/.test(s) ? (s.includes('e') && !s.includes('.') ? s.replace('e', '.0e') : s) : `${s}.0`;
};

function toGlsl(n, q, time) {
  const g = (m) => toGlsl(m, q, time);
  switch (n.op) {
    case 'num': return glslNum(n.value);
    case 'const': return glslNum(CONSTS[n.name]);
    case 'var':
      if (n.name === 't') return time;
      if (n.name === 'r') return `length(${q})`;
      return `${q}.${n.name}`;
    case 'neg': return `(-${g(n.a)})`;
    case 'add': return `(${g(n.a)} + ${g(n.b)})`;
    case 'sub': return `(${g(n.a)} - ${g(n.b)})`;
    case 'mul': return `(${g(n.a)} * ${g(n.b)})`;
    case 'div': return `(${g(n.a)} / ${g(n.b)})`;
    case 'pow': {
      if (isConst(n.b)) {
        const e = constValue(n.b);
        // Whole powers by repeated multiplication: GLSL's pow() is undefined
        // for negative bases, but (−2)³ should be −8.
        if (Number.isInteger(e) && Math.abs(e) <= 16) return e >= 0 ? `ipow(${g(n.a)}, ${e})` : `(1.0 / ipow(${g(n.a)}, ${-e}))`;
        // Odd roots of negatives are real: x^(1/3) = −∛|x| for x < 0.
        for (let den = 3; den <= 9; den += 2) {
          const num = Math.round(e * den);
          if (Math.abs(e * den - num) < 1e-9) {
            const mag = `pow(abs(${g(n.a)}), ${glslNum(e)})`;
            return num % 2 === 0 ? mag : `(sign(${g(n.a)}) * ${mag})`;
          }
        }
      }
      return `pow(${g(n.a)}, ${g(n.b)})`;
    }
    case 'call': {
      const a = n.args.map(g);
      switch (n.fn) {
        case 'cbrt': return `(sign(${a[0]}) * pow(abs(${a[0]}), 1.0 / 3.0))`;
        case 'sinh': return `(0.5 * (exp(${a[0]}) - exp(-(${a[0]}))))`;
        case 'cosh': return `(0.5 * (exp(${a[0]}) + exp(-(${a[0]}))))`;
        case 'tanh': return `(1.0 - 2.0 / (exp(2.0 * (${a[0]})) + 1.0))`;
        default: return `${n.fn}(${a.join(', ')})`;
      }
    }
    default: throw new Error(`unknown node ${n.op}`);
  }
}

const JS_FN = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, log: Math.log, sqrt: Math.sqrt,
  cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, mod: (a, b) => a - b * Math.floor(a / b),
};

// A closure tree, not eval: (x, y, z, t) → number, matching the GLSL.
function toJs(n) {
  switch (n.op) {
    case 'num': { const v = n.value; return () => v; }
    case 'const': { const v = CONSTS[n.name]; return () => v; }
    case 'var':
      if (n.name === 'x') return (x) => x;
      if (n.name === 'y') return (x, y) => y;
      if (n.name === 'z') return (x, y, z) => z;
      if (n.name === 't') return (x, y, z, t) => t;
      return (x, y, z) => Math.hypot(x, y, z);
    case 'neg': { const a = toJs(n.a); return (...v) => -a(...v); }
    case 'add': { const a = toJs(n.a), b = toJs(n.b); return (...v) => a(...v) + b(...v); }
    case 'sub': { const a = toJs(n.a), b = toJs(n.b); return (...v) => a(...v) - b(...v); }
    case 'mul': { const a = toJs(n.a), b = toJs(n.b); return (...v) => a(...v) * b(...v); }
    case 'div': { const a = toJs(n.a), b = toJs(n.b); return (...v) => a(...v) / b(...v); }
    case 'pow': {
      const a = toJs(n.a), b = toJs(n.b);
      if (isConst(n.b)) {
        const e = constValue(n.b);
        if (!Number.isInteger(e)) {
          for (let den = 3; den <= 9; den += 2) {
            const num = Math.round(e * den);
            if (Math.abs(e * den - num) < 1e-9) {
              return (...v) => { const x = a(...v); const m = Math.abs(x) ** e; return num % 2 === 0 ? m : Math.sign(x) * m; };
            }
          }
        }
      }
      return (...v) => a(...v) ** b(...v);
    }
    case 'call': {
      const fn = JS_FN[n.fn];
      const args = n.args.map(toJs);
      return (...v) => fn(...args.map((a) => a(...v)));
    }
    default: throw new Error(`unknown node ${n.op}`);
  }
}

// LaTeX, with as few brackets as the precedence allows.
const PREC = { add: 1, sub: 1, neg: 2, mul: 3, div: 3, pow: 4 };
function toLatex(n, parentPrec = 0) {
  const wrap = (s, prec) => (prec < parentPrec ? `\\left(${s}\\right)` : s);
  switch (n.op) {
    case 'num': return String(Number(n.value.toPrecision(6)));
    case 'const': return { pi: '\\pi', tau: '\\tau', phi: '\\varphi', e: 'e' }[n.name];
    case 'var': return n.name;
    case 'neg': return wrap(`-${toLatex(n.a, 3)}`, 2);
    case 'add': return wrap(`${toLatex(n.a, 1)} + ${toLatex(n.b, 1)}`, 1);
    case 'sub': return wrap(`${toLatex(n.a, 1)} - ${toLatex(n.b, 2)}`, 1);
    case 'mul': {
      const a = toLatex(n.a, 3);
      const b = toLatex(n.b, 3);
      // 2x, xy, x\sin y; but 2 \cdot 3.
      let sep = /^[0-9]/.test(b) ? ' \\cdot ' : /[0-9]$/.test(a) || n.implicit ? '' : '\\,';
      if (sep === '' && /\\[a-zA-Z]+$/.test(a)) sep = ' ';      // \pi x, not \pix
      return wrap(`${a}${sep}${b}`, 3);
    }
    case 'div': return wrap(`\\frac{${toLatex(n.a)}}{${toLatex(n.b)}}`, 3);
    case 'pow': {
      const base = n.a.op === 'call' && n.a.fn !== 'abs' && n.a.fn !== 'sqrt' ? `\\left(${toLatex(n.a)}\\right)` : toLatex(n.a, 5);
      return wrap(`${base}^{${toLatex(n.b)}}`, 4);
    }
    case 'call': {
      const a = n.args.map((x) => toLatex(x));
      if (n.fn === 'sqrt') return `\\sqrt{${a[0]}}`;
      if (n.fn === 'cbrt') return `\\sqrt[3]{${a[0]}}`;
      if (n.fn === 'abs') return `\\left|${a[0]}\\right|`;
      if (n.fn === 'exp') return `e^{${a[0]}}`;
      const name = ['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'exp', 'min', 'max'].includes(n.fn)
        ? `\\${n.fn}`
        : n.fn === 'log' ? '\\ln' : `\\operatorname{${n.fn}}`;
      const simple = n.args.length === 1 && ['var', 'num', 'const'].includes(n.args[0].op);
      return simple ? `${name} ${a[0]}` : `${name}\\left(${a.join(', ')}\\right)`;
    }
    default: return '?';
  }
}

// Polynomial degree in x, y, z (t counts as a constant), or null.
function degreeOf(n) {
  switch (n.op) {
    case 'num': case 'const': return 0;
    case 'var': return n.name === 't' ? 0 : n.name === 'r' ? null : 1;
    case 'neg': return degreeOf(n.a);
    case 'add': case 'sub': {
      const a = degreeOf(n.a), b = degreeOf(n.b);
      return a === null || b === null ? null : Math.max(a, b);
    }
    case 'mul': {
      const a = degreeOf(n.a), b = degreeOf(n.b);
      return a === null || b === null ? null : a + b;
    }
    case 'div': return degreeOf(n.b) === 0 ? degreeOf(n.a) : null;
    case 'pow': {
      const a = degreeOf(n.a);
      if (a === null || !isConst(n.b)) return a === 0 && degreeOf(n.b) === 0 ? 0 : null;
      const e = constValue(n.b);
      return Number.isInteger(e) && e >= 0 ? a * e : a === 0 ? 0 : null;
    }
    case 'call': return n.args.every((x) => degreeOf(x) === 0) ? 0 : null;
    default: return null;
  }
}

const usesVar = (n, v) =>
  (n.op === 'var' && n.name === v) || ['a', 'b'].some((k) => n[k] && usesVar(n[k], v)) || (n.args || []).some((x) => usesVar(x, v));

export function parseEquation(text) {
  const src = normalise(String(text)).slice(0, 400);
  const { lhs, rhs } = parse(tokenize(src));
  const f = rhs ? { op: 'sub', a: lhs, b: rhs } : lhs;
  const js = toJs(f);
  const degree = rhs ? (degreeOf(lhs) === null || degreeOf(rhs) === null ? null : Math.max(degreeOf(lhs), degreeOf(rhs))) : degreeOf(lhs);
  return {
    text: String(text).trim(),
    tree: f,
    f: (x, y, z, t = 0) => js(x, y, z, t),
    glsl: (q, time) => toGlsl(f, q, time),
    latex: rhs ? `${toLatex(lhs)} = ${toLatex(rhs)}` : `${toLatex(lhs)} = 0`,
    degree,
    usesTime: usesVar(f, 't'),
    usesSpace: ['x', 'y', 'z', 'r'].some((v) => usesVar(f, v)),
  };
}

// GLSL helper the generated code relies on: whole powers of any sign.
export const IPOW_GLSL = `
  float ipow(float a, int n) {
    float r = 1.0;
    for (int i = 0; i < 16; i++) { if (i >= n) break; r *= a; }
    return r;
  }
`;

// --- Looking at the surface before drawing it ------------------------------
// Where is f = 0, how big is it, and what symmetries does it have? Found by
// sampling: a grid point is "near the surface" if one Newton step,
// |f| / |∇f|, lands within a grid cell. Tries a 6-unit box, then a 24-unit
// one, then a 1.2-unit one.
function scan(f, L, N = 26) {
  const h = (2 * L) / N;
  const n = N + 1;
  const v = new Float64Array(n * n * n);
  const at = (i, j, k) => v[(i * n + j) * n + k];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    v[(i * n + j) * n + k] = f(-L + i * h, -L + j * h, -L + k * h);
  }
  let count = 0;
  const pts = [];
  let maxR = 0;
  let minR = Infinity;
  let touches = false;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) for (let k = 1; k < N; k++) {
    const val = at(i, j, k);
    const gx = (at(i + 1, j, k) - at(i - 1, j, k)) / (2 * h);
    const gy = (at(i, j + 1, k) - at(i, j - 1, k)) / (2 * h);
    const gz = (at(i, j, k + 1) - at(i, j, k - 1)) / (2 * h);
    const d = Math.abs(val) / Math.hypot(gx, gy, gz);
    if (!(d < 0.9 * h)) continue;                 // also skips NaN
    // Snap onto the surface with a few Newton steps, p ← p − f∇f/|∇f|²,
    // so sizes are measured on the surface, not on the grid near it.
    let x = -L + i * h, y = -L + j * h, z = -L + k * h;
    for (let it = 0; it < 4; it++) {
      const e = 1e-4 * (1 + L);
      const fv = f(x, y, z);
      const ax = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e);
      const ay = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e);
      const az = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
      const g2 = ax * ax + ay * ay + az * az;
      if (!(g2 > 1e-20)) break;
      const step = Math.min(1, h / Math.sqrt((fv * fv) / g2 + 1e-30));   // never jump more than a cell
      x -= step * (fv * ax) / g2;
      y -= step * (fv * ay) / g2;
      z -= step * (fv * az) / g2;
    }
    const r = Math.hypot(x, y, z);
    if (pts.length < 20000) pts.push([x, y, z]);
    count++;
    maxR = Math.max(maxR, r);
    minR = Math.min(minR, r);
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > L - 2 * h) touches = true;
  }
  return { count, maxR, minR, touches, pts };
}

export function analyseSurface(eq) {
  const f = (x, y, z) => eq.f(x, y, z, 0);
  let found = null;
  for (const L of [3, 12, 0.6]) {
    const s = scan(f, L);
    if (s.count) { found = { ...s, L }; break; }
  }
  if (!found) return { empty: true };
  // Touching the edge of the box may just mean it's big or off-centre:
  // look in the bigger box before calling it infinite.
  if (found.touches && found.L < 12) {
    const s = scan(f, 12);
    if (s.count && !s.touches) found = { ...s, L: 12 };
  }
  // Bounded: look again, closer, for a tighter frame.
  if (!found.touches) {
    const L = found.maxR * 1.2;
    const s = scan(f, L);
    if (s.count && !s.touches) found = { ...s, L };
  }
  const bounded = !found.touches;
  // A bounded surface is framed on the centre of its bounding box; an
  // unbounded one on the origin. `show` is the radius to fit in view.
  let center = [0, 0, 0];
  let size = 0;
  let show = Math.max(Math.min(found.L, 2.2), found.minR * 1.6);
  if (bounded) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const p of found.pts) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
    center = lo.map((l, a) => (l + hi[a]) / 2);
    size = Math.max(...hi.map((h, a) => h - lo[a]));
    show = 1.08 * Math.max(...found.pts.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])));
  }

  // Symmetries of the zero set: f(Sp) = ±f(p) at random points near it.
  const rnd = mulberry(12345);
  const pts = Array.from({ length: 60 }, () => [0, 1, 2].map((a) => center[a] + (rnd() * 2 - 1) * show));
  const same = (map) => {
    let plus = true, minus = true;
    for (const [x, y, z] of pts) {
      const a = f(x, y, z);
      const b = f(...map(x, y, z));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const tol = 1e-7 * (1 + Math.abs(a));
      if (Math.abs(a - b) > tol) plus = false;
      if (Math.abs(a + b) > tol) minus = false;
    }
    return plus || minus;
  };
  const turn = (a) => (x, y, z) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
  const sym = {
    x: same((x, y, z) => [-x, y, z]),
    y: same((x, y, z) => [x, -y, z]),
    z: same((x, y, z) => [x, y, -z]),
    xy: same((x, y, z) => [y, x, z]),
    yz: same((x, y, z) => [x, z, y]),
    xz: same((x, y, z) => [z, y, x]),
    roundZ: same(turn(0.7)) && same(turn(2.1)),
  };
  sym.allSwaps = sym.xy && sym.yz && sym.xz;
  sym.sphere = sym.roundZ && same((x, y, z) => { const c = Math.cos(0.9), s = Math.sin(0.9); return [x, y * c - z * s, y * s + z * c]; });
  return { empty: false, bounded, show, center, size, sym };
}

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
