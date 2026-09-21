export default {
  name: 'Metaballs',
  description: 'Raymarched blobby spheres merging via a smooth-minimum SDF.',
  tags: ['raymarch', 'sdf', 'metaballs'],
  category: '3D',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\mathrm{smin}(a,b,k) = \\mathrm{mix}(b,a,h) - kh(1{-}h),\\quad h=\\mathrm{clamp}\\!\\big(\\tfrac{1}{2}{+}\\tfrac{b-a}{2k},0,1\\big)',

  params: {
    blend: { value: 0.4, min: 0.1, max: 1.5 },
    speed: { value: 1.0, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uBlend;
    uniform float uSpeed;
    varying vec2 vUv;

    float sdSphere(vec3 p, vec3 center, float r) {
      return length(p - center) - r;
    }

    float smin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    vec3 ballPos(float t, float freq, float phase, float radius) {
      return radius * vec3(cos(t * freq + phase), sin(t * freq * 0.7 + phase), sin(t * freq * 1.3));
    }

    float map(vec3 p, float t) {
      vec3 p0 = ballPos(t, 1.0, 0.0, 0.9);
      vec3 p1 = ballPos(t, 1.3, 2.1, 0.9);
      vec3 p2 = ballPos(t, 0.8, 4.2, 0.9);
      vec3 p3 = ballPos(t, 1.6, 1.0, 0.7);

      float d0 = sdSphere(p, p0, 0.55);
      float d1 = sdSphere(p, p1, 0.5);
      float d2 = sdSphere(p, p2, 0.45);
      float d3 = sdSphere(p, p3, 0.4);

      float d = smin(d0, d1, uBlend);
      d = smin(d, d2, uBlend);
      d = smin(d, d3, uBlend);
      return d;
    }

    vec3 estimateNormal(vec3 p, float t) {
      vec2 eps = vec2(0.001, 0.0);
      return normalize(vec3(
        map(p + eps.xyy, t) - map(p - eps.xyy, t),
        map(p + eps.yxy, t) - map(p - eps.yxy, t),
        map(p + eps.yyx, t) - map(p - eps.yyx, t)
      ));
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      vec3 ro = vec3(0.0, 0.0, 4.0);
      vec3 rd = normalize(vec3(uv, -1.6));

      float t = uTime * uSpeed;

      float dist = 0.0;
      vec3 p = ro;
      bool hit = false;
      for (int i = 0; i < 90; i++) {
        p = ro + rd * dist;
        float d = map(p, t);
        if (d < 0.001) { hit = true; break; }
        dist += d;
        if (dist > 12.0) break;
      }

      vec3 color = vec3(0.02, 0.02, 0.04);
      if (hit) {
        vec3 normal = estimateNormal(p, t);
        vec3 lightDir = normalize(vec3(0.6, 0.8, 0.5));
        float diff = max(dot(normal, lightDir), 0.0);
        float rim = pow(1.0 - max(dot(normal, -rd), 0.0), 2.0);
        float hue = fract(0.55 + 0.15 * p.x + 0.1 * p.y + uTime * 0.02);
        vec3 base = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
        color = base * (0.25 + 0.75 * diff) + rim * 0.4;
        color *= 1.0 - dist * 0.03;
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uBlend: { value: 0.4 }, uSpeed: { value: 1.0 } };
  },

  update(ctx, state) {
    state.uniforms.uBlend.value = ctx.params.blend;
    state.uniforms.uSpeed.value = ctx.params.speed;
  },
};
