import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Tone from 'tone';
import { fibonacciSphere, hopfFiber } from '../lib/hopf.js';
import { parametricSurface } from '../lib/parametric.js';
import { parametricCurve } from '../lib/curves.js';
import {
  surfaceParams,
  createSurfaceMaterial,
  updateSurfaceMaterial,
  SHADING_OPTIONS,
  COLORMAP_GLSL,
} from '../lib/surfaceMaterial.js';
import { morphParams, createMorphSurface, updateMorphSurface } from '../lib/morphSurface.js';
import { TAU, clamp01, lerp, smooth, phaseOf, segments } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';
import { SHELL_STRIDE, createShellBuffer, extractShell, packPoints } from '../lib/voxelShell.js';

// Globals available inside edited sketch code, since the editor runs plain
// function bodies (no `import` resolution for blob/eval'd code). Sketches
// can also reach the same Tone instance via ctx.audio.Tone.
const HELPERS = {
  THREE,
  OrbitControls,
  Tone,
  fibonacciSphere,
  hopfFiber,
  parametricSurface,
  parametricCurve,
  surfaceParams,
  createSurfaceMaterial,
  updateSurfaceMaterial,
  SHADING_OPTIONS,
  COLORMAP_GLSL,
  morphParams,
  createMorphSurface,
  updateMorphSurface,
  TAU,
  clamp01,
  lerp,
  smooth,
  phaseOf,
  segments,
  createFatLines,
  createDots,
  SHELL_STRIDE,
  createShellBuffer,
  extractShell,
  packPoints,
};

export function compileSketch(code) {
  let fn;
  try {
    fn = new Function(...Object.keys(HELPERS), `"use strict";\n${code}`);
  } catch (err) {
    throw new Error(`Syntax error: ${err.message}`);
  }

  const result = fn(...Object.values(HELPERS));

  if (!result || typeof result !== 'object') {
    throw new Error('Code must end with `return { ... }` (a sketch object).');
  }
  if (!result.name) throw new Error('Sketch object needs a `name` field.');
  if (result.mode !== 'shader' && result.mode !== '3d') {
    throw new Error('Sketch object needs `mode: "shader"` or `mode: "3d"`.');
  }
  return result;
}
