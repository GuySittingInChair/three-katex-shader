import * as THREE from 'three';

const VERT = `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uAmplitude;
  varying float vHeight;
  varying vec3 vNormalW;

  const vec2 SRC0 = vec2(-1.2, -0.8);
  const vec2 SRC1 = vec2(1.0, 1.3);
  const vec2 SRC2 = vec2(0.3, -1.5);
  const vec2 SRC3 = vec2(-1.5, 1.0);

  float rippleHeight(vec2 p) {
    float h = 0.0;
    float t = uTime * uSpeed;

    float d0 = length(p - SRC0);
    h += sin(d0 * 6.0 - t * 2.0) / (1.0 + d0 * 1.2);

    float d1 = length(p - SRC1);
    h += sin(d1 * 7.0 - t * 2.3 + 1.0) / (1.0 + d1 * 1.2);

    float d2 = length(p - SRC2);
    h += sin(d2 * 5.0 - t * 1.7 + 2.0) / (1.0 + d2 * 1.2);

    float d3 = length(p - SRC3);
    h += sin(d3 * 8.0 - t * 2.6 + 3.0) / (1.0 + d3 * 1.2);

    return h * uAmplitude;
  }

  void main() {
    vec2 p = position.xy;
    float h = rippleHeight(p);

    float eps = 0.05;
    float hx = rippleHeight(p + vec2(eps, 0.0));
    float hy = rippleHeight(p + vec2(0.0, eps));
    vec3 tangentX = vec3(eps, 0.0, hx - h);
    vec3 tangentY = vec3(0.0, eps, hy - h);
    vec3 n = normalize(cross(tangentX, tangentY));

    vHeight = h;
    vNormalW = normalize(normalMatrix * n);

    vec3 displaced = vec3(position.xy, position.z + h);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FRAG = `
  uniform float uAmplitude;
  varying float vHeight;
  varying vec3 vNormalW;

  void main() {
    vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
    float diff = max(dot(vNormalW, lightDir), 0.0);

    vec3 deep = vec3(0.02, 0.12, 0.28);
    vec3 shallow = vec3(0.1, 0.45, 0.55);
    vec3 foam = vec3(0.85, 0.95, 1.0);

    float t = clamp(vHeight / max(uAmplitude, 0.001) * 0.5 + 0.5, 0.0, 1.0);
    vec3 base = mix(deep, shallow, t);
    base = mix(base, foam, smoothstep(0.75, 1.0, t));

    vec3 color = base * (0.35 + 0.65 * diff);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export default {
  name: 'Ripple Waves',
  description: 'A water surface displaced by four interfering circular ripple sources.',
  tags: ['waves', 'water', 'displacement'],
  category: 'Waves',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: 'h(\\mathbf{p},t) = \\sum_i \\dfrac{\\sin(k_i\\,d_i(\\mathbf{p}) - \\omega_i t + \\phi_i)}{1 + 1.2\\,d_i(\\mathbf{p})}',

  params: {
    speed: { value: 1.0, min: 0, max: 3 },
    amplitude: { value: 0.12, min: 0.02, max: 0.3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 2.2, 2.6);
    ctx.camera.lookAt(0, 0, 0);

    const geometry = new THREE.PlaneGeometry(4, 4, 120, 120);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: ctx.params.speed },
        uAmplitude: { value: ctx.params.amplitude },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    ctx.scene.add(mesh);
    return { mesh, material };
  },

  update(ctx, state) {
    state.material.uniforms.uTime.value = ctx.time;
    state.material.uniforms.uSpeed.value = ctx.params.speed;
    state.material.uniforms.uAmplitude.value = ctx.params.amplitude;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
