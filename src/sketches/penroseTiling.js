export default {
  name: 'Penrose Multigrid',
  description: 'A five-fold de Bruijn multigrid — the classic shader route to an aperiodic rhombic tiling.',
  tags: ['tiling', 'aperiodic', 'multigrid'],
  category: 'Geometry',
  mode: 'shader',
  shaderLang: 'glsl',
  latex:
    'S(\\mathbf p)=\\sum_{k=0}^{4}\\left\\lfloor \\mathbf p\\cdot \\hat u_k + \\gamma_k \\right\\rfloor,\\quad \\hat u_k=\\big(\\cos\\tfrac{2\\pi k}{5},\\sin\\tfrac{2\\pi k}{5}\\big)',

  params: {
    scale: { value: 10, min: 4, max: 30 },
    drift: { value: 0.05, min: 0, max: 0.3 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uScale;
    uniform float uDrift;
    varying vec2 vUv;

    const float PI = 3.14159265359;

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 p = uv * uScale;

      float sum = 0.0;
      float edge = 0.0;
      for (int k = 0; k < 5; k++) {
        float theta = float(k) * 2.0 * PI / 5.0;
        vec2 dir = vec2(cos(theta), sin(theta));
        float offset = 0.2 + float(k) * 0.05;
        if (k == 0) offset += uTime * uDrift;

        float g = dot(p, dir) + offset;
        sum += floor(g);

        float boundaryDist = min(fract(g), 1.0 - fract(g));
        edge = max(edge, smoothstep(0.015, 0.0, boundaryDist));
      }

      float parity = mod(sum, 2.0);
      vec3 colorA = vec3(0.85, 0.65, 0.25);
      vec3 colorB = vec3(0.15, 0.25, 0.45);
      vec3 fill = mix(colorA, colorB, parity);
      vec3 color = mix(fill, vec3(0.02, 0.02, 0.03), edge);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uScale: { value: 10 }, uDrift: { value: 0.05 } };
  },

  update(ctx, state) {
    state.uniforms.uScale.value = ctx.params.scale;
    state.uniforms.uDrift.value = ctx.params.drift;
  },
};
