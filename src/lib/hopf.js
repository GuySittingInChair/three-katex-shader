import * as THREE from 'three';

export function fibonacciSphere(samples) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < samples; i++) {
    const y = 1 - (i / (samples - 1)) * 2;
    points.push({ theta: Math.acos(THREE.MathUtils.clamp(y, -1, 1)), phi: goldenAngle * i });
  }
  return points;
}

export function hopfFiber(theta, phi, segments = 64, radius = 1) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const q0 = Math.cos(theta / 2) * Math.cos(t + phi / 2);
    const q1 = Math.cos(theta / 2) * Math.sin(t + phi / 2);
    const q2 = Math.sin(theta / 2) * Math.cos(t - phi / 2);
    const q3 = Math.sin(theta / 2) * Math.sin(t - phi / 2);
    const denom = 1 - q0;
    if (Math.abs(denom) < 1e-4) continue;   // skip projection-pole blowup
    points.push(new THREE.Vector3(
      (q1 / denom) * radius, (q2 / denom) * radius, (q3 / denom) * radius
    ));
  }
  return new THREE.CatmullRomCurve3(points, true);
}
