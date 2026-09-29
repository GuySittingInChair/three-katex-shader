import { supabase, getUser } from './community.js';

// Audio files in the public "sounds" bucket (supabase/migrations/0004_sounds.sql),
// each person's under their own folder: <user id>/<random>.<ext>.
export const MAX_SOUND_BYTES = 10 * 1024 * 1024;

const EXT = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
};

export function soundUrl(path) {
  return path ? supabase.storage.from('sounds').getPublicUrl(path).data.publicUrl : null;
}

export async function uploadSound(fileOrBlob) {
  const user = getUser();
  if (!user) throw new Error('Log in first');
  const type = (fileOrBlob.type || '').split(';')[0];
  if (!EXT[type]) throw new Error("That isn't a supported audio file (mp3, m4a, wav, ogg, webm or flac)");
  if (fileOrBlob.size > MAX_SOUND_BYTES) throw new Error('That file is over 10 MB');
  const path = `${user.id}/${crypto.randomUUID()}.${EXT[type]}`;
  const { error } = await supabase.storage
    .from('sounds')
    .upload(path, fileOrBlob, { contentType: type, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return path;
}

// Only removes files in your own folder (the storage rules allow nothing else,
// except for the admin); a failure here just leaves an unused file behind.
export async function deleteSound(path) {
  const user = getUser();
  if (!path || !user || !path.startsWith(`${user.id}/`)) return;
  await supabase.storage.from('sounds').remove([path]);
}
