import { TAU, phaseOf } from '../lib/motion.js';

// A robot speeds up to 98% of light speed with its headlight and tail light
// on. Seen from above, in the frame of the road. Both lamps shine a 30°
// cone (half-angle) in the robot's own frame; on the road, every ray is
// aberrated toward the direction of travel,
//
//     cos θ′ = (cos θ + β) / (1 + β cos θ)
//
// and Doppler-shifted by D = 1 / (γ (1 − β cos θ′)). Light received per
// unit solid angle scales as D⁴ (the searchlight effect), and wavelengths
// scale as 1/D.
//
// So the headlight's beam narrows (half-angle 3.1° at β = 0.98, from tan θ′ =
// sin 30° / (γ (cos 30° + β))), gets 9,800 times brighter dead ahead, and
// turns blue. The tail light is the funny one: its backward cone gets thrown
// forward until it opens out to ±41° from straight ahead, and dims, and its
// 640 nm red light stretches to 6.4 μm, far into the infrared, so you
// couldn't see it anyway (shown as a faint dashed outline once it's
// invisible). All angles and factors checked numerically, both ways round.
//
// The glow shows the beam pattern: how much light goes out in each
// direction (fading with distance), not a snapshot of light in flight.
// Loop (20 s): β from 0 to 0.98 and back.

const PERIOD = 20;
const TOP = 0.98;
const HALF = Math.PI / 6;

// Rest-frame angle θ (from straight ahead) → road-frame angle θ′.
const aberrate = (th, b) => Math.acos((Math.cos(th) + b) / (1 + b * Math.cos(th)));

export default {
  name: 'Relativistic Robot Headlight',
  description:
    'A robot drives at up to 98% of light speed with its lights on. Aberration squeezes the headlight into a ' +
    'needle 9,800 times brighter and bluer; the tail light gets flung forward around the robot and shifts into ' +
    'the infrared. Beam angles, the D⁴ boost and the tail light’s wavelength are live.',
  tags: ['relativity', 'aberration', 'doppler', 'relativistic beaming', 'robots'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const beta = TOP * (0.5 - 0.5 * Math.cos(TAU * phaseOf(t, PERIOD)));
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    const ahead = Math.sqrt((1 + beta) / (1 - beta));
    return {
      beta,
      gamma,
      head: (aberrate(HALF, beta) * 180) / Math.PI,
      tail: (aberrate(Math.PI - HALF, beta) * 180) / Math.PI,
      boost: ahead ** 4,
      tailNm: 640 * ahead, // 1/D behind = D ahead
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    "\\cos\\theta' &= \\frac{\\cos\\theta + \\beta}{1 + \\beta\\cos\\theta},\\quad D = \\frac{1}{\\gamma(1-\\beta\\cos\\theta')},\\quad \\frac{dP}{d\\Omega'} \\propto D^4 \\\\" +
    `\\beta &= ${hl(m.beta, 3)},\\quad \\gamma = ${hl(m.gamma, 2)},\\quad \\text{headlight } \\pm${hl(m.head, 1)}^\\circ,\\ D^4_{\\text{ahead}} = ${hl(m.boost, 0)} \\\\` +
    `\\text{tail light} &\\text{ from } \\pm${hl(m.tail, 0)}^\\circ \\text{ back},\\quad \\lambda = ${hl(m.tailNm, 0)}\\,\\text{nm}` +
    (m.tailNm > 750 ? '\\ (\\text{infrared: invisible})' : '') +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uBeta;
    varying vec2 vUv;

    const float HALF = 0.5235988;

    vec3 blackbody(float T) {
      T = clamp(T, 1000.0, 40000.0) / 100.0;
      float r = T <= 66.0 ? 1.0 : clamp(1.2929 * pow(T - 60.0, -0.1332), 0.0, 1.0);
      float g = T <= 66.0 ? clamp(0.3901 * log(T) - 0.6318, 0.0, 1.0) : clamp(1.1299 * pow(T - 60.0, -0.0755), 0.0, 1.0);
      float b = T >= 66.0 ? 1.0 : (T <= 19.0 ? 0.0 : clamp(0.5432 * log(T - 10.0) - 1.1963, 0.0, 1.0));
      return vec3(r, g, b);
    }
    // Rough colour of monochromatic light, 380–750 nm; black outside.
    vec3 spectral(float nm) {
      vec3 c = vec3(0.0);
      if (nm >= 380.0 && nm < 440.0) c = vec3((440.0 - nm) / 60.0, 0.0, 1.0);
      else if (nm < 490.0 && nm >= 440.0) c = vec3(0.0, (nm - 440.0) / 50.0, 1.0);
      else if (nm < 510.0 && nm >= 490.0) c = vec3(0.0, 1.0, (510.0 - nm) / 20.0);
      else if (nm < 580.0 && nm >= 510.0) c = vec3((nm - 510.0) / 70.0, 1.0, 0.0);
      else if (nm < 645.0 && nm >= 580.0) c = vec3(1.0, (645.0 - nm) / 65.0, 0.0);
      else if (nm <= 750.0 && nm >= 645.0) c = vec3(1.0, 0.0, 0.0);
      float edge = nm < 420.0 ? 0.3 + 0.7 * (nm - 380.0) / 40.0 : nm > 700.0 ? 0.3 + 0.7 * (750.0 - nm) / 50.0 : 1.0;
      return c * clamp(edge, 0.0, 1.0);
    }
    float box(vec2 p, vec2 h, float r) {
      vec2 d = abs(p) - h + r;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }

    // The beam from a lamp at 'at' aiming along 'aim' (0 ahead, π behind): for this
    // pixel's direction, returns (how far inside the cone, distance) and sets D.
    vec2 beam(vec2 x, vec2 at, float aim, float beta, out float D) {
      vec2 d = x - at;
      float r = length(d);
      float cp = d.x / max(r, 1e-5);                       // cos θ′, θ′ from straight ahead
      float c = (cp - beta) / (1.0 - beta * cp);            // back to the robot's frame
      float th = acos(clamp(c, -1.0, 1.0));
      float off = abs(th - aim);                            // angle from the lamp's axis, robot frame
      float gamma = inversesqrt(1.0 - beta * beta);
      D = 1.0 / (gamma * (1.0 - beta * cp));
      return vec2(smoothstep(HALF + 0.03, HALF - 0.03, off), r);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 0.9 * uResolution.y / uResolution.x);
      vec2 x = uv * 6.0 * fit + vec2(1.6, 0.0);           // the robot sits left of centre
      float px = 6.0 * fit / uResolution.y;
      vec3 col = vec3(0.012, 0.013, 0.018);
      // A faint grid on the road (static: we ride along with the robot, so this is just for scale).
      vec2 gq = abs(fract(x * 0.5) - 0.5) / 0.5;
      col += vec3(0.03, 0.035, 0.045) * smoothstep(0.04, 0.0, min(gq.x, gq.y));

      float D;
      // Headlight: white, 6500 K in the robot's frame.
      vec2 hb = beam(x, vec2(0.48, 0.0), 0.0, uBeta, D);
      float I = hb.x * pow(D, 4.0) / (1.0 + 0.6 * hb.y * hb.y) * 0.5;
      vec3 head = blackbody(6500.0 * D) * I;
      col += head / (1.0 + max(max(head.r, head.g), head.b));

      // Tail light: 640 nm red in the robot's frame.
      vec2 tb = beam(x, vec2(-0.48, 0.0), 3.14159265, uBeta, D);
      float nm = 640.0 / D;
      float It = tb.x * pow(D, 4.0) / (1.0 + 0.6 * tb.y * tb.y) * 0.5;
      vec3 tail = spectral(nm) * It;
      col += tail / (1.0 + max(max(tail.r, tail.g), tail.b));
      // Once it's invisible, outline where the (infrared) beam goes.
      if (nm > 750.0) {
        float edge = smoothstep(0.0, 0.25, tb.x) * smoothstep(1.0, 0.75, tb.x);
        float dash = step(0.5, fract(tb.y * 2.5));
        col += vec3(0.35, 0.15, 0.3) * edge * dash * 0.6 / (1.0 + 0.15 * tb.y);
      }

      // The robot, seen from above, facing right.
      float body = box(x, vec2(0.5, 0.32), 0.14);
      col = mix(col, vec3(0.62, 0.67, 0.75), smoothstep(px, -px, body));
      col = mix(col, vec3(0.25, 0.28, 0.35), smoothstep(2.0 * px, 0.0, abs(body)));
      float eyes = min(length(x - vec2(0.22, 0.12)), length(x - vec2(0.22, -0.12))) - 0.07;
      col = mix(col, vec3(0.37, 0.95, 1.0), smoothstep(px, -px, eyes));
      float antenna = length(x - vec2(-0.15, 0.0)) - 0.06;
      col = mix(col, vec3(0.95, 0.3, 0.25), smoothstep(px, -px, antenna));
      float lamps = min(box(x - vec2(0.48, 0.0), vec2(0.03, 0.09), 0.02), box(x - vec2(-0.48, 0.0), vec2(0.03, 0.09), 0.02));
      col = mix(col, vec3(1.0, 0.95, 0.8), smoothstep(px, -px, lamps));

      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return { uBeta: { value: 0 } };
  },

  update(ctx, state) {
    state.uniforms.uBeta.value = ctx.motion.beta;
  },
};
