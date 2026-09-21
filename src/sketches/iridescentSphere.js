import * as THREE from 'three';

const VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = `
  uniform float uPower;
  uniform float uHueSpeed;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);
    float fresnel = pow(1.0 - max(0.0, dot(n, v)), uPower);

    float hue = fract(fresnel * 1.4 + uTime * uHueSpeed);
    vec3 sheen = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));

    vec3 base = vec3(0.04, 0.04, 0.06);
    vec3 color = mix(base, sheen, fresnel);

    // A soft moving specular highlight, also Fresnel-modulated.
    vec3 lightDir = normalize(vec3(0.4, 0.6, 0.7));
    vec3 halfVec = normalize(lightDir + v);
    float spec = pow(max(0.0, dot(n, halfVec)), 60.0) * fresnel;
    color += vec3(1.0) * spec;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default {
  name: 'Iridescent Sphere',
  description: 'A Fresnel-driven thin-film shimmer, like a soap bubble or oil slick.',
  tags: ['material', 'fresnel', 'iridescence'],
  category: 'Materials',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: 'F(\\theta) = (1 - \\cos\\theta)^{p},\\quad \\text{hue} = \\text{fract}(F \\cdot 1.4 + \\omega t)',

  params: {
    power: { value: 3.5, min: 1, max: 8 },
    spin: { value: 0.3, min: -1, max: 1 },
    hueSpeed: { value: 0.05, min: 0, max: 0.3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 3);
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPower: { value: 3.5 },
        uHueSpeed: { value: 0.05 },
        uTime: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    ctx.scene.add(mesh);
    return { mesh, material };
  },

  update(ctx, state) {
    state.material.uniforms.uPower.value = ctx.params.power;
    state.material.uniforms.uHueSpeed.value = ctx.params.hueSpeed;
    state.material.uniforms.uTime.value = ctx.time;
    state.mesh.rotation.y += ctx.delta * ctx.params.spin;
    state.mesh.rotation.x += ctx.delta * ctx.params.spin * 0.3;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
