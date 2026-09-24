-- Community features: GitHub sign-in profiles, comments, guide notes and
-- shared sketches. Paste into Supabase → SQL Editor and run once.
--
-- Everyone can read comments and anything approved. Signed-in users post as
-- themselves and can delete their own posts. Guide notes and shared sketches
-- start as 'pending' and only the admin can approve them: a shared sketch is
-- JavaScript that runs in every viewer's browser, so nobody else's code runs
-- for other people until the admin has read it.

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- The admin is fixed by GitHub's numeric user id (GuySittingInChair), which
-- survives renames and can't be claimed by someone taking the username.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, avatar_url, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username', 'user'),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(
      new.raw_app_meta_data ->> 'provider' = 'github'
        and new.raw_user_meta_data ->> 'provider_id' = '41241378',
      false
    )
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

alter table public.profiles enable row level security;
create policy "profiles are public" on public.profiles for select using (true);

-- ---------- comments ----------
create table public.comments (
  id bigint generated always as identity primary key,
  sketch_id text not null check (char_length(sketch_id) between 1 and 200),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index comments_sketch_idx on public.comments (sketch_id, created_at);

alter table public.comments enable row level security;
create policy "comments are public" on public.comments for select using (true);
create policy "comment as yourself" on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "delete own comments, admin deletes any" on public.comments for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------- guide notes ----------
create table public.guide_notes (
  id bigint generated always as identity primary key,
  sketch_id text check (char_length(sketch_id) between 1 and 200), -- null: the guide in general
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index guide_notes_sketch_idx on public.guide_notes (sketch_id, status);

alter table public.guide_notes enable row level security;
create policy "approved notes are public; authors and admin see the rest" on public.guide_notes for select
  using (status = 'approved' or user_id = (select auth.uid()) or public.is_admin());
create policy "add notes as yourself, pending unless admin" on public.guide_notes for insert to authenticated
  with check (user_id = (select auth.uid()) and (status = 'pending' or public.is_admin()));
create policy "admin reviews notes" on public.guide_notes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "delete own notes, admin deletes any" on public.guide_notes for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------- shared sketches ----------
create table public.shared_sketches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text check (char_length(category) <= 60),
  code text not null check (char_length(code) between 1 and 200000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.shared_sketches enable row level security;
create policy "approved sketches are public; authors and admin see the rest" on public.shared_sketches for select
  using (status = 'approved' or user_id = (select auth.uid()) or public.is_admin());
create policy "share as yourself, pending unless admin" on public.shared_sketches for insert to authenticated
  with check (user_id = (select auth.uid()) and (status = 'pending' or public.is_admin()));
create policy "authors edit their own, admin edits any" on public.shared_sketches for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy "delete own sketches, admin deletes any" on public.shared_sketches for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- An author editing their sketch sends it back for review; only the admin
-- can change who owns it or approve it.
create function public.shared_sketch_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    new.status := 'pending';
    new.reviewed_at := null;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger shared_sketch_guard
  before update on public.shared_sketches
  for each row execute function public.shared_sketch_guard();

-- ---------- API access (row level security above decides the rows) ----------
grant select on public.profiles, public.comments, public.guide_notes, public.shared_sketches to anon, authenticated;
grant insert, delete on public.comments to authenticated;
grant insert, update, delete on public.guide_notes, public.shared_sketches to authenticated;
