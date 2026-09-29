-- Sounds: a sound per sketch (plays while people scroll) and voice notes on
-- explanations. Paste into Supabase → SQL Editor and run once, after 0003.
--
-- Files live in the public "sounds" storage bucket, each person in their own
-- folder (<user id>/<file>). The admin sets built-in sketches' sounds; authors
-- set their shared sketches' sounds, which wait for review before anyone else
-- hears them; a note's audio is reviewed with the note.

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sounds',
  'sounds',
  true,
  10485760, -- 10 MB
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm',
        'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac']
)
on conflict (id) do nothing;

create policy "upload sounds into your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'sounds' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete your own sounds, admin deletes any" on storage.objects for delete to authenticated
  using (bucket_id = 'sounds' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- ---------- where sounds are attached ----------
alter table public.sketch_settings add column sound_path text;

alter table public.shared_sketches
  add column sound_path text,
  add column sound_status text not null default 'none'
    check (sound_status in ('none', 'pending', 'approved', 'rejected'));

alter table public.guide_notes add column audio_path text;

-- A note's audio must come from its author's own folder.
drop policy "add notes as yourself, pending unless admin" on public.guide_notes;
create policy "add notes as yourself, pending unless admin" on public.guide_notes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (status = 'pending' or public.is_admin())
    and (audio_path is null or split_part(audio_path, '/', 1) = (select auth.uid())::text)
  );

-- New shared sketches start without a sound (it's added, and reviewed, later).
drop policy "share as yourself, pending unless admin" on public.shared_sketches;
create policy "share as yourself, pending unless admin" on public.shared_sketches for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and ((status = 'pending' and sound_path is null and sound_status = 'none') or public.is_admin())
  );

-- Authors editing their sketch: changing the code sends the sketch back for
-- review; changing the sound sends only the sound back for review. Only the
-- admin approves either, or changes who owns it.
create or replace function public.shared_sketch_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    new.user_id := old.user_id;
    if new.code is distinct from old.code or new.name is distinct from old.name
       or new.category is distinct from old.category then
      new.status := 'pending';
      new.reviewed_at := null;
    else
      new.status := old.status;
      new.reviewed_at := old.reviewed_at;
    end if;
    if new.sound_path is distinct from old.sound_path then
      if new.sound_path is not null and split_part(new.sound_path, '/', 1) <> old.user_id::text then
        raise exception 'a sketch''s sound must be uploaded by its author';
      end if;
      new.sound_status := case when new.sound_path is null then 'none' else 'pending' end;
    else
      new.sound_status := old.sound_status;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
