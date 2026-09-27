import { supabase } from './community.js';

// Which sketches are published and their saved slider defaults
// (supabase/migrations/0003_sketch_settings.sql). Everyone reads; only the
// admin writes. A sketch with no row is published with its code's defaults.
let rows = new Map();
const listeners = new Set();

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

export async function loadSettings() {
  const { data, error } = await supabase.from('sketch_settings').select('sketch_id, published, params');
  if (error) {
    console.warn(`[settings] couldn't load: ${error.message}`);
    return;
  }
  rows = new Map(data.map((r) => [r.sketch_id, r]));
  emit();
}

// Built-in sketches: published unless unpublished here. Shared sketches: once
// approved (their author also sees their own pending ones listed).
export function isPublished(sketch) {
  if (sketch.community) return sketch.community.status === 'approved';
  return rows.get(sketch.id)?.published ?? true;
}

export function savedParams() {
  const out = {};
  for (const [id, r] of rows) if (r.params) out[id] = r.params;
  return out;
}

async function upsert(sketchId, patch) {
  const current = rows.get(sketchId) ?? { sketch_id: sketchId, published: true, params: null };
  const next = { ...current, ...patch, sketch_id: sketchId, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('sketch_settings').upsert(next).select().single();
  if (error) throw new Error(error.message);
  rows.set(sketchId, data);
  emit();
  return data;
}

export const setPublished = (sketchId, published) => upsert(sketchId, { published });
export const saveParams = (sketchId, params) => upsert(sketchId, { params });
export const clearParams = (sketchId) => upsert(sketchId, { params: null });
export const hasSavedParams = (sketchId) => Boolean(rows.get(sketchId)?.params);
