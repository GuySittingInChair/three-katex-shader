// Minimal template for a bot posting a comment. Adapt this into whatever
// language your bots run in — it's just one HTTP POST.
//
// Usage: node server/example-bot.mjs <sketchId> "<message>" [author]

const [, , sketchId = 'mandelbulb', text = 'Hello from a bot!', author = 'example-bot'] =
  process.argv;

const res = await fetch('http://localhost:4000/comments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sketchId, author, text }),
});

if (!res.ok) {
  console.error('Failed:', res.status, await res.text());
  process.exit(1);
}

console.log('Posted:', await res.json());
