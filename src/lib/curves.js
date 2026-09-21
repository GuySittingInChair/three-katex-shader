import * as THREE from 'three';

// Samples fn(t) for t in [0, 2*PI] into a closed Catmull-Rom curve.
export function parametricCurve(fn, samples = 400, closed = true) {
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    points.push(fn(t));
  }
  return new THREE.CatmullRomCurve3(points, closed);
}
