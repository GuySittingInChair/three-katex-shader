export default {
  name: 'Menger Sponge',
  description: 'Raymarched Menger sponge with a seamless infinite zoom loop.',
  tags: ['fractal', 'raymarch'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'd(\\mathbf{p}) = \\max\\big(d_{\\text{box}}(\\mathbf{p}),\\ \\max_k c_k(3^{-k}\\bmod \\mathbf{p})\\big)',

  params: {
    zoomSpeed: { value: 0.15, min: 0, max: 1 },
    spin: { value: 0.1, min: -1, max: 1 },
    morph: { value: 0.12, min: 0, max: 0.4 },
    morphSpeed: { value: 0.6, min: 0, max: 3 },
    hueSpeed: { value: 0.05, min: 0, max: 1 },
    glow: { value: 1.0, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uZoomSpeed;
    uniform float uSpin;
    uniform float uMorph;
    uniform float uMorphSpeed;
    uniform float uHueSpeed;
    uniform float uGlow;
    varying vec2 vUv;

    const int MAX_ITER = 7;
    float gTrap;

    float sdBox(vec3 p, vec3 b) {
      vec3 d = abs(p) - b;
      return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
    }

    // Domain-repetition box fold: the mod() already encodes infinite
    // recursive detail, MAX_ITER only caps how deep we bother rendering.
    float mengerDE(vec3 p) {
      float d = sdBox(p, vec3(1.0));
      float s = 1.0;
      gTrap = 1000.0;
      for (int i = 0; i < MAX_ITER; i++) {
        vec3 a = mod(p * s, 2.0) - 1.0;
        s *= 3.0;
        float wobble = 1.0 + uMorph * sin(uTime * uMorphSpeed + float(i) * 2.1);
        vec3 r = abs(wobble - 3.0 * abs(a));
        float da = max(r.x, r.y);
        float db = max(r.y, r.z);
        float dc = max(r.z, r.x);
        float c = (min(da, min(db, dc)) - 1.0) / s;
        d = max(d, c);
        gTrap = min(gTrap, abs(c) * s);
      }
      return d;
    }

    mat3 rotateY(float a) {
      float c = cos(a), s = sin(a);
      return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      vec3 ro = vec3(0.0, 0.0, 2.6);
      vec3 rd = normalize(vec3(uv, -1.6));

      mat3 rot = rotateY(uTime * uSpin);
      ro = rot * ro;
      rd = rot * rd;

      // Scaling the sampled point (and dividing distance back down) by a
      // continuously-growing zoom factor is what makes the fly-through feel
      // infinite: the fractal is exactly self-similar under 3x scaling, so
      // fract(time) makes the loop seamless instead of ever "running out."
      float zoom = pow(3.0, fract(uTime * uZoomSpeed));

      float t = 0.0;
      float glow = 0.0;
      bool hit = false;
      float hitTrap = 0.0;
      vec3 p = ro;
      for (int i = 0; i < 90; i++) {
        p = (ro + rd * t) * zoom;
        float d = mengerDE(p) / zoom;
        glow += 0.02 / (0.03 + d * d * 40.0);
        if (d < 0.0015) {
          hit = true;
          hitTrap = gTrap;
          break;
        }
        t += d * 0.7;
        if (t > 8.0) break;
      }

      vec3 color = vec3(0.0);
      if (hit) {
        vec2 e = vec2(0.0015, 0.0);
        vec3 n = normalize(vec3(
          mengerDE(p + e.xyy) - mengerDE(p - e.xyy),
          mengerDE(p + e.yxy) - mengerDE(p - e.yxy),
          mengerDE(p + e.yyx) - mengerDE(p - e.yyx)
        ));

        float hue = fract(hitTrap * 2.0 + uTime * uHueSpeed + fract(uTime * uZoomSpeed) * 0.5);
        vec3 base = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
        float shade = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.4, 0.6, -0.5))), 0.0);
        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        color = base * shade;
        color += fresnel * uGlow * base * 2.0;
        color *= 1.0 - t / 8.0;
      }

      color += glow * uGlow * vec3(0.2, 0.5, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uZoomSpeed: { value: 0.15 },
      uSpin: { value: 0.1 },
      uMorph: { value: 0.12 },
      uMorphSpeed: { value: 0.6 },
      uHueSpeed: { value: 0.05 },
      uGlow: { value: 1.0 },
    };
  },

  update(ctx, state) {
    state.uniforms.uZoomSpeed.value = ctx.params.zoomSpeed;
    state.uniforms.uSpin.value = ctx.params.spin;
    state.uniforms.uMorph.value = ctx.params.morph;
    state.uniforms.uMorphSpeed.value = ctx.params.morphSpeed;
    state.uniforms.uHueSpeed.value = ctx.params.hueSpeed;
    state.uniforms.uGlow.value = ctx.params.glow;
  },
};
