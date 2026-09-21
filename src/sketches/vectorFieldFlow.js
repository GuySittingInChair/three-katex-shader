export default {
  name: 'Vector Field Flow',
  description: 'A grid of arrow glyphs tracing an animated analytic vector field.',
  tags: ['field', 'vectors', 'shader'],
  category: 'Vector Fields',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\mathbf{F}(x,y,t) = \\big(\\sin(ky{+}t) + 0.3\\cos(1.7x{-}0.6t),\\ \\cos(kx{-}t) + 0.3\\sin(1.7y{+}0.6t)\\big)',

  params: {
    density: { value: 12, min: 6, max: 30 },
    speed: { value: 1.0, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uDensity;
    uniform float uSpeed;
    varying vec2 vUv;

    vec2 field(vec2 p, float t) {
      float k = 3.0;
      return vec2(
        sin(p.y * k + t) + 0.3 * cos(p.x * 1.7 - t * 0.6),
        cos(p.x * k - t) + 0.3 * sin(p.y * 1.7 + t * 0.6)
      );
    }

    float sdSegment(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      return length(pa - ba * h);
    }

    void main() {
      vec2 uv = vUv;
      uv.x *= uResolution.x / uResolution.y;

      float density = uDensity;
      vec2 cell = floor(uv * density) / density;
      vec2 cellCenter = cell + 0.5 / density;

      vec2 dir = field(cellCenter * 2.0 - 1.0, uTime * uSpeed);
      float mag = length(dir);
      vec2 ndir = dir / max(mag, 1e-4);

      float armLen = 0.32 / density;
      vec2 tip = cellCenter + ndir * armLen;
      vec2 tail = cellCenter - ndir * armLen;

      float shaft = sdSegment(uv, tail, tip);

      vec2 perp = vec2(-ndir.y, ndir.x);
      vec2 back1 = tip - ndir * armLen * 0.6 + perp * armLen * 0.35;
      vec2 back2 = tip - ndir * armLen * 0.6 - perp * armLen * 0.35;
      float head = min(sdSegment(uv, tip, back1), sdSegment(uv, tip, back2));

      float d = min(shaft, head);
      float lineWidth = 0.0025;
      float glyph = smoothstep(lineWidth, 0.0, d);

      float t = clamp(mag / 1.6, 0.0, 1.0);
      vec3 slow = vec3(0.15, 0.35, 0.9);
      vec3 fast = vec3(1.0, 0.55, 0.15);
      vec3 color = mix(slow, fast, t);

      vec3 bg = vec3(0.03, 0.04, 0.07);
      vec3 finalColor = mix(bg, color, glyph);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,

  uniforms() {
    return { uDensity: { value: 12 }, uSpeed: { value: 1.0 } };
  },

  update(ctx, state) {
    state.uniforms.uDensity.value = ctx.params.density;
    state.uniforms.uSpeed.value = ctx.params.speed;
  },
};
