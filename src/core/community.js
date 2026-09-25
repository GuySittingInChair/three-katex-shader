import { createClient } from '@supabase/supabase-js';

// Sign-in, comments, guide notes and shared sketches, backed by Supabase
// (schema and access rules: supabase/migrations/0001_community.sql).
// The publishable key is meant to be public; the database's row level
// security decides what each visitor may read and write.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jsxsswdmqtcvzkxeagft.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_EUFGs9ktv_A8UuAXSfdQUQ_ozChvUWd';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const AUTHOR = 'author:profiles(username, avatar_url)';

// ---------- auth ----------

let user = null;
let profile = null;
const listeners = new Set();

export const getUser = () => user;
export const getProfile = () => profile;
export const isAdmin = () => Boolean(profile?.is_admin);

export function onAuthChange(fn) {
  listeners.add(fn);
  fn(user, profile);
  return () => listeners.delete(fn);
}

async function setUser(next) {
  if ((next?.id ?? null) === (user?.id ?? null)) return;
  user = next;
  profile = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, bio, avatar_url, is_admin')
      .eq('id', user.id)
      .maybeSingle();
    profile = data;
  }
  listeners.forEach((fn) => fn(user, profile));
}

// Supabase warns against awaiting its own calls inside this callback, so the
// profile lookup runs on the next tick.
supabase.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => setUser(session?.user ?? null), 0);
});

export const PROVIDERS = [
  { id: 'github', label: 'GitHub' },
  { id: 'google', label: 'Google' },
  { id: 'discord', label: 'Discord' },
];

// Which of PROVIDERS are switched on in Supabase (a public settings endpoint),
// so the sign-in menu never offers one that isn't set up yet.
let enabledProviders = null;
export async function getEnabledProviders() {
  if (!enabledProviders) {
    enabledProviders = fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => r.json())
      .then((s) => PROVIDERS.filter((p) => s.external?.[p.id]))
      .catch(() => PROVIDERS.slice(0, 1));
  }
  return enabledProviders;
}

export function signIn(provider = 'github') {
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: location.origin + location.pathname },
  });
}

export const signOut = () => supabase.auth.signOut();

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ---------- profiles ----------

// Case-insensitive exact match (`_` and `%` escaped: they're LIKE wildcards).
export async function getProfileByUsername(username) {
  const pattern = username.replace(/[\\%_]/g, (c) => `\\${c}`);
  return check(
    await supabase
      .from('profiles')
      .select('id, username, display_name, bio, avatar_url, is_admin')
      .ilike('username', pattern)
      .limit(1)
      .maybeSingle()
  );
}

export async function updateProfile({ display_name, bio }) {
  const data = check(
    await supabase
      .from('profiles')
      .update({ display_name, bio })
      .eq('id', user.id)
      .select('id, username, display_name, bio, avatar_url, is_admin')
      .single()
  );
  profile = data;
  listeners.forEach((fn) => fn(user, profile));
  return data;
}

// ---------- comments ----------

export async function listComments(sketchId) {
  return check(
    await supabase
      .from('comments')
      .select(`id, body, created_at, user_id, ${AUTHOR}`)
      .eq('sketch_id', sketchId)
      .order('created_at', { ascending: true })
      .limit(200)
  );
}

export async function addComment(sketchId, body) {
  return check(await supabase.from('comments').insert({ sketch_id: sketchId, body }).select('id').single());
}

export async function deleteComment(id) {
  return check(await supabase.from('comments').delete().eq('id', id));
}

// ---------- guide notes ----------

// Approved notes for this sketch, plus the viewer's own pending ones (and
// every pending one, for the admin) — row level security picks which.
export async function listNotes(sketchId) {
  return check(
    await supabase
      .from('guide_notes')
      .select(`id, body, status, created_at, user_id, ${AUTHOR}`)
      .eq('sketch_id', sketchId)
      .neq('status', 'rejected')
      .order('created_at', { ascending: true })
  );
}

export async function addNote(sketchId, body) {
  const status = isAdmin() ? 'approved' : 'pending';
  return check(await supabase.from('guide_notes').insert({ sketch_id: sketchId, body, status }).select('id').single());
}

export async function deleteNote(id) {
  return check(await supabase.from('guide_notes').delete().eq('id', id));
}

// ---------- shared sketches ----------

export async function listSharedSketches() {
  return check(
    await supabase
      .from('shared_sketches')
      .select(`id, name, category, code, status, user_id, updated_at, ${AUTHOR}`)
      .neq('status', 'rejected')
      .order('created_at', { ascending: true })
  );
}

export async function shareSketch({ name, category, code }) {
  const status = isAdmin() ? 'approved' : 'pending';
  return check(
    await supabase.from('shared_sketches').insert({ name, category, code, status }).select('id, status').single()
  );
}

export async function updateSharedSketch(id, { name, category, code }) {
  return check(
    await supabase.from('shared_sketches').update({ name, category, code }).eq('id', id).select('id, status').single()
  );
}

// ---------- admin review ----------

export async function listPending() {
  const [notes, sketches] = await Promise.all([
    supabase
      .from('guide_notes')
      .select(`id, sketch_id, body, created_at, ${AUTHOR}`)
      .eq('status', 'pending')
      .order('created_at'),
    supabase
      .from('shared_sketches')
      .select(`id, name, category, code, created_at, ${AUTHOR}`)
      .eq('status', 'pending')
      .order('created_at'),
  ]);
  return { notes: check(notes), sketches: check(sketches) };
}

export async function review(table, id, status) {
  return check(
    await supabase.from(table).update({ status, reviewed_at: new Date().toISOString() }).eq('id', id).select('id').single()
  );
}
