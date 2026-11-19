#!/usr/bin/env node
// Wiki critic loop: a local AI plays a confused beginner, its questions go to
// Claude, and the rewrite goes to another AI for review.
//
//   wikicritic <page>          1. local critic reads the page → questions for Claude
//   wikicritic all             1. read every wiki page; ranked list in out/ALL.md
//   wikicritic paste           1. same, on whatever text is on the clipboard
//   wikicritic review <page>   2. after Claude's rewrite → a review prompt for any AI
//   wikicritic review <page> --local   …and also run a second local AI as reviewer
//
// <page> is a wiki slug (sketches/kuramotoSivashinsky, glossary, README) or a
// file path. Results land in tools/wiki-review/out/ and the copy-paste part
// is put on the clipboard. Needs Ollama (localhost:11434).

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(HERE, 'out');
const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434';
const CRITIC_MODEL = process.env.CRITIC_MODEL || 'qwen3:14b';
const REVIEW_MODEL = process.env.REVIEW_MODEL || 'qwen3:14b'; // qwen3:32b is better but ~1.6 words/s on this GPU

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--'));
const mode = pos[0] === 'review' ? 'review' : pos[0] === 'all' ? 'all' : 'critic';
const target = mode === 'review' ? pos[1] : pos[0];

function usage() {
  console.log(`Usage:
  wikicritic <page>                 a beginner AI reads the page and asks questions (for Claude)
  wikicritic all                    read every wiki page (about 1.5 hours); worst first in tools/wiki-review/out/ALL.md
  wikicritic paste                  same, for text you copied (e.g. one of Claude's replies)
  wikicritic review <page>          make a copy-paste prompt asking another AI to review the rewrite
  wikicritic review <page> --local  …and also have a second local AI review it
<page> examples: sketches/kuramotoSivashinsky, sketches/kuramotoSivashinsky-fix, glossary, shaders`);
  process.exit(1);
}
if (!target && mode !== 'all') usage();

// ---------- reading the page ----------
function load(t) {
  if (t === 'paste') {
    const text = execFileSync('wl-paste', ['--no-newline'], { encoding: 'utf8' });
    if (!text.trim()) throw new Error('The clipboard is empty. Copy some text first.');
    return { name: `pasted-${stamp()}`, label: 'text you pasted', text };
  }
  const tries = [t, join(ROOT, t), join(ROOT, 'docs/wiki', t), join(ROOT, 'docs/wiki', `${t}.md`)];
  const file = tries.find((p) => existsSync(p) && statSync(p).isFile());
  if (!file) throw new Error(`Can't find a wiki page called "${t}". Try e.g. sketches/kuramotoSivashinsky`);
  const rel = file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file;
  const slug = rel.replace(/^docs\/wiki\//, '').replace(/\.md$/, '');
  return { name: slug.replace(/\//g, '__'), label: rel, slug, text: readFileSync(file, 'utf8') };
}

function stamp() {
  const d = new Date();
  return d.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

// Strip markdown so quotes can be checked against what a reader sees.
const plain = (s) => s.replace(/[`*_>#[\]]/g, '').replace(/\(([^)]*\.md[^)]*)\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// ---------- talking to Ollama ----------
async function fakeChatLive() {
  try {
    const r = await fetch('http://localhost:8790/live', { signal: AbortSignal.timeout(1500) });
    if (r.status === 404) return true; // an old fake chat without /live: assume live
    const body = await r.text();
    return /"live"\s*:\s*true|^true$/.test(body.trim());
  } catch {
    return false; // nothing listening
  }
}

// Streams the answer, so a slow model (the 32B one runs partly on the CPU)
// never hits fetch's 5-minute wait for the first byte; prints a dot per ~40 words.
// Thinking is on by default: slower (a few minutes a page) but it reads more carefully.
// Set QUICK=1 for the old fast mode.
const DEEP = !process.env.QUICK;
async function ask(model, system, user, schema, { ctx = 12288 } = {}) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      think: DEEP,
      format: schema,
      keep_alive: mode === 'all' ? '2m' : 0, // give the GPU back when done
      options: { temperature: DEEP ? 0.6 : 0.4, num_ctx: ctx, num_predict: DEEP ? 7000 : 1500 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Ollama said ${r.status}: ${await r.text()}`);
  let text = '', buf = '', n = 0;
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(`Ollama: ${j.error}`);
      text += j.message?.content || '';
      if (j.done && j.done_reason === 'length') throw new Error('the AI ran out of room before finishing its answer');
      if (++n % 50 === 0) process.stdout.write('.');
    }
  }
  if (n >= 50) process.stdout.write('\n');
  return JSON.parse(text);
}

const READER = `You are Sam: a curious, intelligent adult with NO programming, maths or physics background.
You are reading a page from a beginner wiki that is meant to explain a website of animated maths sketches to someone exactly like you.
Be honest and specific. You are not polite for the sake of it: if a sentence lost you, say so. If a word was never explained, say so.
Do not pretend to understand. Do not invent problems either: if a part was clear, leave it alone.`;

// Field order matters: the model fills them top to bottom, so the problems
// come first and the "explain it back" check comes after, on its own.
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    problems: {
      type: 'array',
      maxItems: 15,
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string', description: 'The exact words from the page (copy them, 5-25 words) where you got lost.' },
          kind: { type: 'string', enum: ['unexplained word', 'too many steps at once', 'analogy does not help', 'I cannot picture it', 'seems wrong or contradicts itself', 'why does this matter', 'other'] },
          what_lost_me: { type: 'string' },
          my_question: { type: 'string', description: 'The question you would ask the writer, in your own words.' },
        },
        required: ['quote', 'kind', 'what_lost_me', 'my_question'],
      },
    },
    explain_it_back: { type: 'string' },
    clarity_score: { type: 'integer', minimum: 1, maximum: 10 },
    best_part: { type: 'string' },
  },
  required: ['problems', 'explain_it_back', 'clarity_score', 'best_part'],
};

const CRITIC_TASK = `Read the page as Sam, then answer in JSON with these fields, in this order:
- problems: every place you got lost (up to 15). Go through the page from top to bottom, paragraph by
  paragraph, and include each code line it quotes. For each: quote = the exact words copied from the page;
  kind; what_lost_me; my_question = what you would ask the writer. Every complaint goes here, nowhere else.
- explain_it_back: 2-3 sentences, as if telling a friend what you learned from the page. NOT complaints:
  your best attempt at the actual content, even if you are unsure.
- clarity_score: 1-10, how well you followed it.
- best_part: the one part that worked best for you, and why.`;

// A quote counts if (nearly) all its words are on the page; small models paraphrase.
function checkQuote(q, pageText) {
  const p = plain(pageText);
  const qq = plain(q);
  if (p.includes(qq)) return 'exact';
  const words = qq.split(' ').filter((w) => w.length > 2);
  const hits = words.filter((w) => p.includes(w)).length;
  return words.length && hits / words.length >= 0.8 ? 'close' : 'invented';
}

function copy(text) {
  try { execFileSync('wl-copy', [], { input: text, stdio: ['pipe', 'ignore', 'ignore'], timeout: 5000 }); return true; } catch { return false; }
}

// ---------- fact check ----------
// The beginner can't tell a wrong statement from a right one. This second pass
// hands the AI the source files the page talks about and asks which claims
// they contradict or don't back up.
const FACT_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string', description: 'The exact words from the PAGE that make the claim.' },
          problem: { type: 'string', description: 'What is wrong or unsupported.' },
          code_says: { type: 'string', description: 'The exact code line(s) that show it, copied from the source.' },
        },
        required: ['quote', 'problem', 'code_says'],
      },
    },
  },
  required: ['issues'],
};

function sourcesFor(text) {
  const paths = [...new Set([...text.matchAll(/src\/(?:sketches|lib|core|ui)\/[\w.-]+\.js/g)].map((m) => m[0]))];
  const out = [];
  let budget = 30000; // characters, so it fits the AI's memory alongside the page
  for (const p of paths) {
    const f = join(ROOT, p);
    if (!existsSync(f) || budget <= 0) continue;
    const body = readFileSync(f, 'utf8').slice(0, Math.min(budget, 16000));
    budget -= body.length;
    out.push(`----- FILE ${p} -----\n${body}`);
  }
  return out.join('\n\n');
}

async function factCheck(page) {
  const src = sourcesFor(page.text);
  if (!src) return [];
  const res = await ask(CRITIC_MODEL,
    'You are a meticulous fact-checker for a beginner wiki about a code project. You compare what a page says about the code against the real source files.',
    `Check the PAGE against the SOURCE files. Report only claims that the source contradicts or does not support: wrong numbers, wrong names, a quoted line that isn't in the source, a description of what a line does that doesn't match, a "change X and Y happens" claim that the code wouldn't do. Simplified wording for beginners is fine; only report things that are actually wrong. If everything checks out, return an empty list.

----- PAGE -----
${page.text}

${src}`, FACT_SCHEMA, { ctx: 16384 });
  return (res.issues || []).filter((x) => checkQuote(x.quote, page.text) !== 'invented');
}

// ---------- step 1: critic ----------
async function critic(page, quiet = false) {
  console.log(`📖 ${CRITIC_MODEL} is reading ${page.label} as a beginner…`);
  const t0 = Date.now();
  const res = await ask(CRITIC_MODEL, READER,
    `${CRITIC_TASK}\n\n----- PAGE START -----\n${page.text}\n----- PAGE END -----`,
    CRITIC_SCHEMA);
  let facts = [];
  if (page.slug) {
    process.stdout.write('   🔍 fact-checking against the code… ');
    try { facts = await factCheck(page); console.log(`${facts.length} possible errors`); }
    catch (e) { console.log(`skipped (${e.message})`); }
  }
  const kept = [];
  let dropped = 0;
  for (const p of res.problems || []) {
    const v = checkQuote(p.quote, page.text);
    if (v === 'invented') { dropped++; continue; }
    if (kept.some((k) => plain(k.quote) === plain(p.quote))) continue; // said twice
    kept.push({ ...p, exact: v === 'exact' });
  }
  console.log(`   done in ${((Date.now() - t0) / 1000).toFixed(0)} s: clarity ${res.clarity_score}/10, ${kept.length} problems` +
    (dropped ? ` (${dropped} more ignored: they quoted words that aren't on the page)` : ''));

  const qs = kept.map((p, i) =>
    `${i + 1}. **"${p.quote.trim()}"**${p.exact ? '' : ' (roughly)'}\n   - Problem: ${p.kind}. ${p.what_lost_me.trim()}\n   - Question: ${p.my_question.trim()}`).join('\n\n');

  const forClaude = `A local beginner-reader AI (${CRITIC_MODEL}, playing someone with no programming, maths or physics background) read ${page.slug ? `the wiki page \`docs/wiki/${page.slug}.md\`` : 'the text below'} and got lost in these places. Please rewrite it so these questions are answered on the page itself, following the wiki rules in CLAUDE.md. Where a question rests on a misreading, fix the sentence that caused the misreading rather than ignoring it. When you're done, tell me what you changed for each numbered point, in plain words.

**How clear it was, out of 10:** ${res.clarity_score}

**The reader explains the page back** (check this: if it's wrong, the page misleads):
> ${res.explain_it_back.trim()}

**Where they got lost:**

${qs || '(nothing: the reader followed it all)'}

**What worked best for them** (keep this): ${res.best_part.trim()}
${facts.length ? `\n**Possible factual errors** (a fact-checking AI compared the page with the code; check each one against the code yourself, it can be wrong):\n\n${facts.map((f, i) => `${i + 1}. "${f.quote.trim()}"\n   - ${f.problem.trim()}\n   - Code: \`${f.code_says.trim().replace(/`/g, "'")}\``).join('\n\n')}\n` : ''}
${page.slug ? '' : `\n----- THE TEXT -----\n${page.text}\n`}`;

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${page.name}.critic.json`), JSON.stringify({ page: page.label, model: CRITIC_MODEL, deep: DEEP, ...res, problems: kept, facts, before: page.text }, null, 2));
  const file = join(OUT, `${page.name}.1-for-claude.md`);
  writeFileSync(file, forClaude);
  if (quiet) return { score: res.clarity_score, count: kept.length, facts: facts.length, file };
  console.log(`\n${forClaude}\n`);
  console.log(`📋 ${copy(forClaude) ? 'Copied to your clipboard. Paste it to Claude.' : 'Copy the text above and paste it to Claude.'}`);
  console.log(`   Also saved as ${file.slice(ROOT.length + 1)}`);
  if (page.slug) console.log(`   After Claude rewrites the page, run:  wikicritic review ${page.slug}`);
}

// ---------- step 2: review ----------
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['better', 'about the same', 'worse'] },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer', description: 'The number of the beginner\'s question (1, 2, 3…), not of the review task.' },
          answered: { type: 'string', enum: ['yes', 'partly', 'no'] },
          comment: { type: 'string' },
        },
        required: ['number', 'answered', 'comment'],
      },
    },
    new_problems: { type: 'array', items: { type: 'string' } },
    errors: { type: 'array', items: { type: 'string' }, description: 'Anything factually wrong or misleading.' },
  },
  required: ['verdict', 'points', 'new_problems', 'errors'],
};

function reviewPrompt(page, crit) {
  const qs = crit.problems.map((p, i) => `${i + 1}. "${p.quote.trim()}": ${p.my_question.trim()}`).join('\n');
  return `I'm not a programmer and have no maths or physics background. An AI (Claude) writes a beginner wiki explaining my website of animated maths sketches. Another AI read the old version of one page as a beginner and asked the questions below. Claude then rewrote the page.

Please review the rewrite, for someone like me:
1. For each numbered question: is it now answered on the page? Say yes, partly or no, and why.
2. Is anything still confusing, or newly confusing? Quote the exact words.
3. Is anything factually wrong or misleading? Be specific.
4. Overall: better, about the same, or worse than before? One paragraph.

Reply in plain English. Keep it short and concrete; I'll paste your answer back to Claude.

## The beginner's questions about the OLD version
${qs || '(none)'}

## The OLD version
${crit.before}

## The NEW version
${page.text}`;
}

async function review(page) {
  const critFile = join(OUT, `${page.name}.critic.json`);
  if (!existsSync(critFile)) throw new Error(`No critic notes for ${page.label} yet. Run first:  wikicritic ${page.slug || target}`);
  const crit = JSON.parse(readFileSync(critFile, 'utf8'));
  if (crit.before === page.text) console.log('⚠️  The page hasn\'t changed since the critic read it. Has Claude rewritten it yet?\n');
  const prompt = reviewPrompt(page, crit);
  const file = join(OUT, `${page.name}.2-for-reviewer.md`);
  writeFileSync(file, prompt);
  console.log(`📋 ${copy(prompt) ? 'A review request is on your clipboard.' : 'Copy the review request from the file below.'}`);
  console.log(`   Paste it into another AI (ChatGPT, Gemini, a new Claude chat…), then paste its answer back to Claude.`);
  console.log(`   Saved as ${file.slice(ROOT.length + 1)}`);

  if (flags.has('--local')) {
    console.log(`\n🔎 ${REVIEW_MODEL} is reviewing it locally, as a strict editor (about a minute)…`);
    const t0 = Date.now();
    const res = await ask(REVIEW_MODEL,
      'You are a careful editor of beginner science writing. You judge whether a rewrite answers a beginner\'s questions, and you catch mistakes. Be concrete and brief.',
      prompt, REVIEW_SCHEMA);
    const md = `## Local review by ${REVIEW_MODEL} (${((Date.now() - t0) / 1000).toFixed(0)} s)

**Overall:** ${res.verdict}

${res.points.filter((p) => p.number >= 1 && p.number <= crit.problems.length).map((p) => `- Question ${p.number}: **${p.answered}**. ${p.comment}`).join('\n')}

**Still or newly confusing:**
${res.new_problems.length ? res.new_problems.map((x) => `- ${x}`).join('\n') : '- nothing'}

**Possible errors:**
${res.errors.length ? res.errors.map((x) => `- ${x}`).join('\n') : '- none found'}
`;
    const lf = join(OUT, `${page.name}.3-local-review.md`);
    writeFileSync(lf, `A second local AI reviewed Claude's rewrite of \`docs/wiki/${page.slug}.md\`. Please act on anything that's right, and tell me which points you disagree with and why.\n\n${md}`);
    console.log(`\n${md}`);
    console.log(`   Saved as ${lf.slice(ROOT.length + 1)} (ready to paste to Claude)`);
  }
}

// ---------- all pages ----------
// Reads every page in turn, skipping ones already read and unchanged since
// (add --fresh to redo them). Pauses while fake chat is live. After each page
// it rewrites out/ALL.md, worst first, so a half-finished run is still useful.
function wikiPages(dir = join(ROOT, 'docs/wiki')) {
  const out = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) out.push(...wikiPages(p));
    else if (f.name.endsWith('.md') && !['_survey.md', 'glossary.md'].includes(f.name)) out.push(p);
  }
  return out.sort();
}

function writeIndex(pages) {
  const rows = [];
  for (const f of pages) {
    const page = load(f);
    const cf = join(OUT, `${page.name}.critic.json`);
    if (!existsSync(cf)) continue;
    const c = JSON.parse(readFileSync(cf, 'utf8'));
    rows.push({ slug: page.slug, score: c.clarity_score, n: c.problems.length, f: (c.facts || []).length, stale: c.before !== page.text, name: page.name });
  }
  rows.sort((a, b) => a.score - b.score || b.n - a.n);
  const md = `# Wiki critic: every page, least clear first

${rows.length} of ${pages.length} pages read by ${CRITIC_MODEL} playing a beginner. Updated ${new Date().toLocaleString('en-GB')}.
To fix: tell Claude "fix the wiki" (it works down this list), or paste one page's \`*.1-for-claude.md\` to Claude.
"changed since" means the page was edited after it was read.

| Clarity | Problems | Possible errors | Page | |
|---:|---:|---:|---|---|
${rows.map((r) => `| ${r.score}/10 | ${r.n} | ${r.f} | ${r.slug} | ${r.stale ? 'changed since' : ''} |`).join('\n')}
`;
  writeFileSync(join(OUT, 'ALL.md'), md);
}

async function all() {
  const pages = wikiPages();
  mkdirSync(OUT, { recursive: true });
  let done = 0, skipped = 0, failed = 0;
  const t0 = Date.now();
  for (const [i, f] of pages.entries()) {
    const page = load(f);
    const cf = join(OUT, `${page.name}.critic.json`);
    if (!flags.has('--fresh') && existsSync(cf)) {
      const old = JSON.parse(readFileSync(cf, 'utf8'));
      if (old.before === page.text && (old.deep || !DEEP)) { skipped++; continue; }
    }
    while (!flags.has('--force') && await fakeChatLive()) {
      console.log(`⏸  ${new Date().toLocaleTimeString('en-GB')} fake chat is live; waiting so it keeps the GPU…`);
      await new Promise((r) => setTimeout(r, 120000));
    }
    process.stdout.write(`[${i + 1}/${pages.length}] `);
    try {
      await critic(page, true);
      done++;
    } catch (e) {
      failed++;
      console.log(`   ✗ ${e.message}`);
    }
    writeIndex(pages);
  }
  writeIndex(pages);
  console.log(`\n✅ Finished in ${((Date.now() - t0) / 60000).toFixed(0)} min: ${done} read, ${skipped} already up to date, ${failed} failed.`);
  console.log(`   Ranked list: ${join(OUT, 'ALL.md').slice(ROOT.length + 1)}. Tell Claude "fix the wiki".`);
}

// ---------- go ----------
try {
  if (mode === 'all') {
    await all(); // waits for fake chat itself
    process.exit(0);
  }
  if (await fakeChatLive() && !flags.has('--force')) {
    console.log('Fake chat looks live, and this would take the GPU from it. Run again when you\'re off stream (or add --force).');
    process.exit(2);
  }
  const page = load(target);
  if (mode === 'review') await review(page);
  else await critic(page);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
