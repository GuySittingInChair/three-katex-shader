# What a sketch is

**In one sentence:** a sketch is one short animated picture on the site, written as a single file in
`src/sketches/`.

**Picture it:** think of a flip-book. Each page is drawn a tiny bit differently from the last, and when
you flick through quickly you see movement. A sketch is a recipe for drawing those pages. The computer
follows the recipe about 60 times a second, so the picture moves smoothly.

**Why it matters:** everything you see on aiship.lol is a sketch. There are 166 of them. Once you know
the shape of one sketch file, you can find your way around all of them, because they all follow the same
pattern.

**Where you'll see it:** every file in `src/sketches/`. The file name, without `.js`, is the sketch's
address on the site. `src/sketches/boidsFlock.js` lives at `aiship.lol/s/boidsFlock`.

**What a sketch file holds:** each file describes one thing. It has three kinds of writing mixed together:

- **JavaScript**, the main language of the file. It decides what happens and when: where things go,
  how fast they move, what the sliders do.
- **GLSL**, a second, smaller language for *shaders*. It runs on the graphics chip and decides the
  colour of each dot on the screen. You will spot it inside long blocks of text between backticks
  (`` ` ``), usually named `fragmentShader`, `VERT` or `FRAG`. See [shaders.md](shaders.md).
- **LaTeX**, a way of writing math so it can be shown as a neat equation. It is the equation you see on
  screen. It is full of backslashes like `\\sin` and `\\theta`. See the planned equations page, and
  `docs/guide.md` section 4 for now.

**The two kinds of sketch:** every sketch says which `mode` it uses.

- `mode: 'shader'`: one flat picture that fills the screen. A shader works out the colour of every
  pixel (every tiny dot on the screen). 87 sketches work like this, such as Bifurcation Diagram.
- `mode: '3d'`: a little 3D world with objects, a camera, and often lights. You can usually drag to look
  around it. 79 sketches work like this, such as Boids Flock.

**What it looks like in the code:** here are the first lines of `src/sketches/gradientPlane.js`, the
shortest sketch in the project.

```js
export default {
  name: 'Gradient Plane',
  description: 'Time-driven cosine palette across UV space.',
  category: 'Shaders',
  mode: 'shader',
```

- `export default {` starts the sketch. Everything between this curly bracket and the matching one at
  the end of the file is the sketch's description of itself.
- `name:` is the title shown on the site.
- `description:` is the sentence shown under the title.
- `category:` decides which shelf of the gallery it sits on.
- `mode: 'shader'` says this is a flat, full-screen picture.

**Try this:** in `gradientPlane.js`, change `name: 'Gradient Plane'` to `name: 'My Rainbow'`. Save,
and the title on screen changes. Nothing else moves. It is the safest possible first edit. Follow
[changing-a-sketch-safely.md](changing-a-sketch-safely.md) to see it on your computer.

**Related:** [frame-loop.md](frame-loop.md) · [how-the-files-fit.md](how-the-files-fit.md) ·
[sketch-format.md](sketch-format.md)
