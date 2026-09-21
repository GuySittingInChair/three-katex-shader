import { HELPERS } from './sketchHelpers.js';

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
