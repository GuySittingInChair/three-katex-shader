export default {
  name: 'Reflective Spheres',
  description: 'Analytic ray-traced spheres over a checkered floor, one reflection bounce deep.',
  tags: ['raytracing', 'reflection', 'spheres'],
  category: 'Ray Tracing',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 't = \\dfrac{-b - \\sqrt{b^2 - 4ac}}{2a},\\quad \\mathbf{r}\\prime = \\mathbf{d} - 2(\\mathbf{d}\\cdot\\mathbf{n})\\mathbf{n}',

  params: {
    speed: { value: 0.3, min: 0, max: 1.5 },
    reflectivity: { value: 0.55, min: 0, max: 1 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uSpeed;
    uniform float uReflectivity;
    varying vec2 vUv;

    #define MAX_SPHERES 4

    vec3 sphereCenters[MAX_SPHERES];
    float sphereRadii[MAX_SPHERES];
    vec3 sphereColors[MAX_SPHERES];

    void initScene() {
      sphereCenters[0] = vec3(-1.1, -0.2, 0.0);
      sphereRadii[0] = 0.8;
      sphereColors[0] = vec3(0.9, 0.25, 0.25);

      sphereCenters[1] = vec3(1.0, -0.35, -0.4);
      sphereRadii[1] = 0.65;
      sphereColors[1] = vec3(0.25, 0.55, 0.95);

      sphereCenters[2] = vec3(0.05, 0.15, 1.1);
      sphereRadii[2] = 0.5;
      sphereColors[2] = vec3(0.3, 0.9, 0.4);

      sphereCenters[3] = vec3(-0.4, 0.6, -1.0);
      sphereRadii[3] = 0.4;
      sphereColors[3] = vec3(0.95, 0.8, 0.2);
    }

    mat3 rotateY(float a) {
      float c = cos(a), s = sin(a);
      return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
    }

    // Returns t (or -1.0 if no hit).
    float intersectSphere(vec3 ro, vec3 rd, vec3 center, float radius) {
      vec3 oc = ro - center;
      float b = dot(oc, rd);
      float c = dot(oc, oc) - radius * radius;
      float h = b * b - c;
      if (h < 0.0) return -1.0;
      h = sqrt(h);
      float t = -b - h;
      if (t > 0.001) return t;
      t = -b + h;
      return t > 0.001 ? t : -1.0;
    }

    float intersectFloor(vec3 ro, vec3 rd) {
      if (abs(rd.y) < 0.0001) return -1.0;
      float t = (-1.0 - ro.y) / rd.y;
      return t > 0.001 ? t : -1.0;
    }

    // hitType: 0 = none, 1 = sphere, 2 = floor. sphereIdx valid when hitType == 1.
    float traceScene(vec3 ro, vec3 rd, out int hitType, out int sphereIdx, out vec3 hitPos, out vec3 hitNormal) {
      float bestT = 1000.0;
      hitType = 0;
      sphereIdx = -1;

      for (int i = 0; i < MAX_SPHERES; i++) {
        float t = intersectSphere(ro, rd, sphereCenters[i], sphereRadii[i]);
        if (t > 0.0 && t < bestT) {
          bestT = t;
          hitType = 1;
          sphereIdx = i;
        }
      }

      float tFloor = intersectFloor(ro, rd);
      if (tFloor > 0.0 && tFloor < bestT) {
        bestT = tFloor;
        hitType = 2;
        sphereIdx = -1;
      }

      if (hitType != 0) {
        hitPos = ro + rd * bestT;
        if (hitType == 1) {
          hitNormal = normalize(hitPos - sphereCenters[sphereIdx]);
        } else {
          hitNormal = vec3(0.0, 1.0, 0.0);
        }
      }
      return bestT;
    }

    vec3 shade(vec3 hitPos, vec3 hitNormal, vec3 baseColor, vec3 rd, vec3 lightDir) {
      float diffuse = max(0.0, dot(hitNormal, lightDir));
      vec3 halfVec = normalize(lightDir - rd);
      float spec = pow(max(0.0, dot(hitNormal, halfVec)), 32.0);
      return baseColor * (0.15 + 0.85 * diffuse) + vec3(1.0) * spec * 0.6;
    }

    vec3 shadeFloor(vec3 hitPos, vec3 lightDir) {
      vec2 c = floor(hitPos.xz * 1.0);
      float checker = mod(c.x + c.y, 2.0);
      vec3 base = mix(vec3(0.12, 0.12, 0.16), vec3(0.75, 0.75, 0.8), checker);
      float diffuse = max(0.0, dot(vec3(0.0, 1.0, 0.0), lightDir));
      return base * (0.2 + 0.8 * diffuse);
    }

    vec3 background(vec3 rd) {
      float t = 0.5 * (rd.y + 1.0);
      return mix(vec3(0.03, 0.03, 0.06), vec3(0.1, 0.12, 0.22), t);
    }

    void main() {
      initScene();

      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      vec3 ro = vec3(0.0, 0.9, 4.2);
      vec3 rd = normalize(vec3(uv, -1.8));

      float angle = uTime * uSpeed;
      mat3 rot = rotateY(angle);
      ro = rot * ro;
      rd = rot * rd;

      vec3 lightDir = normalize(vec3(0.5, 0.8, 0.4));

      int hitType, sphereIdx;
      vec3 hitPos, hitNormal;
      float t = traceScene(ro, rd, hitType, sphereIdx, hitPos, hitNormal);

      vec3 color;
      if (hitType == 0) {
        color = background(rd);
      } else {
        vec3 baseColor = hitType == 1 ? sphereColors[sphereIdx] : vec3(1.0);
        vec3 primary = hitType == 1
          ? shade(hitPos, hitNormal, baseColor, rd, lightDir)
          : shadeFloor(hitPos, lightDir);

        vec3 reflectDir = reflect(rd, hitNormal);
        vec3 ro2 = hitPos + hitNormal * 0.002;
        int hitType2, sphereIdx2;
        vec3 hitPos2, hitNormal2;
        float t2 = traceScene(ro2, reflectDir, hitType2, sphereIdx2, hitPos2, hitNormal2);

        vec3 reflected;
        if (hitType2 == 0) {
          reflected = background(reflectDir);
        } else if (hitType2 == 1) {
          reflected = shade(hitPos2, hitNormal2, sphereColors[sphereIdx2], reflectDir, lightDir);
        } else {
          reflected = shadeFloor(hitPos2, lightDir);
        }

        float refl = hitType == 1 ? uReflectivity : uReflectivity * 0.4;
        color = mix(primary, reflected, refl);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uSpeed: { value: 0.3 }, uReflectivity: { value: 0.55 } };
  },

  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
    state.uniforms.uReflectivity.value = ctx.params.reflectivity;
  },
};
