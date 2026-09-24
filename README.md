# three-katex-shader

Animated math sketches in the browser. Each sketch is a mathematically defined
transformation playing on a loop (Hopf fibrations, minimal surfaces, fractals,
reaction–diffusion, splines, …), with its equation shown live in KaTeX, using the same
numbers the animation is using on that frame.

Built with [three.js](https://threejs.org/), [KaTeX](https://katex.org/) and
[Vite](https://vitejs.dev/).

## Using it

| Key | Does |
|---|---|
| ← / → (or P / N) | previous / next sketch |
| E | **Explain** panel: every symbol in the current equation, what it means and how to type it, plus a walkthrough of the sketch |
| H | cycle view: everything → equation only → clean |
| F | fullscreen |
| R | record video |
| B, 1–8 | play the built-in sound instrument (open 🎹 Sound first) |

The toolbar also has the code editor (edit any sketch live), sliders, and an AI helper
that runs on your own computer (see [AI panel](#ai-panel-ollama)).

New to the math or the code? Start with **[docs/guide.md](docs/guide.md)**. It's a
field guide to the symbols, LaTeX, JavaScript loops, shaders and the math behind the
sketches. It's also what the Explain panel shows.

## Running it locally

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
git clone <this repository's URL>
cd three-katex-shader
npm install
npm run dev          # the app, at http://localhost:5173
npm run dev:all      # the app plus the local server the AI panel uses
```

When running locally, sketches you create or edit in the code panel are saved as real
files in `src/sketches/`, so you can commit them.

## AI panel (Ollama)

The AI panel uses [Ollama](https://ollama.com/), which runs a language model on **your
own computer**. Nothing is sent to a cloud service.

1. Install Ollama and download the model:

   ```sh
   ollama pull qwen3:8b
   ```

2. **Running locally** (`npm run dev:all`): that's all you need.

3. **On the hosted site**, your browser talks to Ollama directly, so Ollama has to be told
   to accept requests from that site. Set `OLLAMA_ORIGINS` to the site's address (for
   example `https://sketches.example.com`) and restart Ollama:

   - **Linux** (installed as a service):

     ```sh
     sudo systemctl edit ollama.service
     # add these two lines, save, then:
     #   [Service]
     #   Environment="OLLAMA_ORIGINS=https://sketches.example.com"
     sudo systemctl daemon-reload && sudo systemctl restart ollama
     ```

   - **macOS**: `launchctl setenv OLLAMA_ORIGINS "https://sketches.example.com"`, then quit
     and reopen the Ollama app.
   - **Windows**: add a user environment variable `OLLAMA_ORIGINS` with the site's address,
     then quit Ollama from the system tray and start it again.

   If your browser asks whether the site may access devices on your local network, allow
   it. That's how the page reaches Ollama on your computer.

## Project layout

```
src/sketches/   one file per sketch (the part to read and write)
src/lib/        shared math and geometry helpers (motion.js: lerp, smooth, phaseOf, …)
src/core/       app engine: sketch runner, LaTeX, audio, recording
src/ui/         the panels
docs/guide.md   the learning guide, also shown in the Explain panel
server/         local-only Ollama proxy (and an old local comments API used by server/example-bot.mjs)
supabase/       database schema and access rules for sign-in, comments, notes, shared sketches
```

## Contributing

- **Explanations:** add symbols, fix explanations or write a sketch walkthrough in
  `docs/guide.md`. Section 9 shows the format for a walkthrough; a new table row in
  sections 3–4 shows up in the Explain panel automatically.
- **Sketches:** copy an existing sketch in `src/sketches/`. A sketch should be a
  transformation defined by an equation (`motion(t)`), with its `latex` showing the live
  values. The guide covers the anatomy of a sketch.

Open a pull request with your change.

## Deploying

The app builds to plain static files:

```sh
npm run build        # output in dist/
```

On Vercel, import the repository as a new project and keep the detected **Vite**
settings. Every push to the main branch redeploys. On the hosted site, the AI panel talks to
the visitor's own Ollama (see above).

## Community features (Supabase)

Signing in with GitHub lets visitors:

- **comment** on any sketch (💬 Comments),
- **add notes** to a sketch's explanation (📖 Explain → Community notes),
- **share sketches** from the code editor (⇪ Share).

Notes and shared sketches are **reviewed before anyone else sees them**. A shared sketch is
JavaScript that runs in every viewer's browser, so the admin reads it first in the
🛡 Review panel, which only the admin can see. Until it's approved, a sketch only
runs for the person who shared it.

The data lives in [Supabase](https://supabase.com/). The access rules are in
[`supabase/migrations/0001_community.sql`](supabase/migrations/0001_community.sql).
To run your own copy with your own database:

1. Create a Supabase project and run that SQL file in its SQL Editor. First change the
   GitHub user id in `handle_new_user()` to your own (`gh api user --jq .id`), so that you
   become the admin.
2. Create a GitHub OAuth app whose callback URL is
   `https://<your-project>.supabase.co/auth/v1/callback`, and enable the GitHub provider
   in Supabase with its client id and secret.
3. In Supabase → Authentication → URL Configuration, set your site's address and add
   `http://localhost:5173/**` as a redirect URL.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (in `.env.local`, or in
   Vercel's environment variables). Without them the app uses this project's database.

## License

[MIT](LICENSE)
