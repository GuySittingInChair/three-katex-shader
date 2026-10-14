import { supabase, getUser, isAdmin } from './community.js';

// Videos posted to aiship (supabase/migrations/0007_clips.sql): the file goes
// in the public "clips" bucket under <user id>/, the row says which sketch it
// is of. Clips wait for review unless the admin posted them.
export const MAX_CLIP_BYTES = 50 * 1024 * 1024;

const AUTHOR = 'author:profiles(username, avatar_url)';
const COLUMNS = `id, sketch_id, path, caption, seconds, width, height, status, created_at, user_id, ${AUTHOR}`;

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export const clipUrl = (path) => supabase.storage.from('clips').getPublicUrl(path).data.publicUrl;

// Width and height of a video blob (for the grid's aspect ratio).
function videoSize(blob) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth || null, height: v.videoHeight || null });
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => resolve({ width: null, height: null });
    v.src = URL.createObjectURL(blob);
  });
}

// Uploads the recording and posts it. `onProgress` isn't available from
// supabase-js, so the panel just shows a spinner.
export async function postClip(blob, { sketchId, caption, seconds }) {
  const user = getUser();
  if (!user) throw new Error('Log in first');
  if (blob.size > MAX_CLIP_BYTES) throw new Error('That clip is over 50 MB. Record a shorter or smaller one.');
  const type = (blob.type || 'video/mp4').split(';')[0];
  const ext = type === 'video/webm' ? 'webm' : 'mp4';
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('clips').upload(path, blob, { contentType: type, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  const { width, height } = await videoSize(blob);
  try {
    return check(
      await supabase
        .from('clips')
        .insert({
          sketch_id: sketchId,
          path,
          caption: caption?.trim() || null,
          seconds,
          width,
          height,
          status: isAdmin() ? 'approved' : 'pending',
        })
        .select(COLUMNS)
        .single()
    );
  } catch (err) {
    await supabase.storage.from('clips').remove([path]); // don't leave an orphaned file
    throw err;
  }
}

// Newest first. Filter by { sketchId } or { userId }; RLS hides other people's pending clips.
export async function listClips({ sketchId, userId, limit = 30 } = {}) {
  let q = supabase.from('clips').select(COLUMNS).neq('status', 'rejected').order('created_at', { ascending: false }).limit(limit);
  if (sketchId) q = q.eq('sketch_id', sketchId);
  if (userId) q = q.eq('user_id', userId);
  return check(await q);
}

export async function listPendingClips() {
  return check(await supabase.from('clips').select(COLUMNS).eq('status', 'pending').order('created_at'));
}

export async function deleteClip(clip) {
  check(await supabase.from('clips').delete().eq('id', clip.id).select('id'));
  await supabase.storage.from('clips').remove([clip.path]);
}
