import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
import { createEnvironment } from '../lib/environment.js';
import { caption, mood, inUnits, beat } from '../lib/bit.js';

// Every name a sketch can use without importing it. The code panel runs edited
// sketches as plain function bodies (see sketchCompiler.js), so these are
// passed in as parameters; sketches saved to src/sketches/ import the same
// names from here (tools/sketchFiles.js writes that import line), so a sketch
// behaves the same in both places.
export {
  THREE,
  OrbitControls,
  mergeGeometries,
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
  createEnvironment,
  caption,
  mood,
  inUnits,
  beat,
};

export const HELPERS = {
  THREE,
  OrbitControls,
  mergeGeometries,
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
  createEnvironment,
  caption,
  mood,
  inUnits,
  beat,
};
