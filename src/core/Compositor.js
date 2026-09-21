import * as THREE from 'three';

const COMPOSITE_FRAG = `
  uniform sampler2D tFrom;
  uniform sampler2D tTo;
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    vec4 a = texture2D(tFrom, vUv);
    vec4 b = texture2D(tTo, vUv);
    gl_FragColor = mix(a, b, uProgress);
  }
`;

const COMPOSITE_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

// Blends two render targets to screen. Transition shader is swappable.
export class Compositor {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      tFrom: { value: null },
      tTo: { value: null },
      uProgress: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: COMPOSITE_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  render(fromTexture, toTexture, progress) {
    this.uniforms.tFrom.value = fromTexture;
    this.uniforms.tTo.value = toTexture ?? fromTexture;
    this.uniforms.uProgress.value = toTexture ? progress : 0;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
