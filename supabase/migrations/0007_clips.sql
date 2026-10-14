-- Clips: videos people record of a sketch and post to aiship. Paste into
-- Supabase → SQL Editor and run once, after 0006. (Recording works before this
-- runs; clips just can't be posted.)
--
-- Files live in the public "clips" storage bucket, each person in their own
-- folder (<user id>/<file>.mp4). A clip waits for review before anyone else
-- sees it; the admin's own clips go straight up.

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', true, 52428800, array['video/mp4', 'video/webm']) -- 50 MB (the free plan's cap)
on conflict (id) do nothing;

create policy "upload clips into your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete your own clips, admin deletes any" on storage.objects for delete to authenticated
  using (bucket_id = 'clips' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- ---------- the clips ----------
create table public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  sketch_id text not null check (char_length(sketch_id) between 1 and 200),
  path text not null,
  caption text check (char_length(caption) <= 300),
  seconds real,
  width int,
  height int,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index clips_sketch_idx on public.clips (sketch_id, status, created_at desc);
create index clips_user_idx on public.clips (user_id, created_at desc);

alter table public.clips enable row level security;
create policy "approved clips are public; owners and admin see the rest" on public.clips for select
  using (status = 'approved' or user_id = (select auth.uid()) or public.is_admin());
create policy "post clips as yourself, pending unless admin" on public.clips for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (status = 'pending' or public.is_admin())
    and split_part(path, '/', 1) = (select auth.uid())::text
  );
create policy "only the admin reviews clips" on public.clips for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "delete own clips, admin deletes any" on public.clips for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
