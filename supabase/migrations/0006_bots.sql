-- The bot arena: bots people write for a game, and the official standings the
-- admin publishes. Paste into Supabase → SQL Editor and run once, after 0005.
-- (The arena works before this runs; bots just can't be saved or shared.)
--
-- A bot is JavaScript that runs in visitors' browsers (sealed off in a worker
-- with no network), so like shared sketches it's reviewed before anyone else
-- runs it; editing its code sends it back for review.

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  code text not null check (char_length(code) between 1 and 50000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index bots_game_idx on public.bots (game, status);

alter table public.bots enable row level security;
create policy "approved bots are public; authors and admin see the rest" on public.bots for select
  using (status = 'approved' or user_id = (select auth.uid()) or public.is_admin());
create policy "add bots as yourself, pending unless admin" on public.bots for insert to authenticated
  with check (user_id = (select auth.uid()) and (status = 'pending' or public.is_admin()));
create policy "authors edit their own, admin edits any" on public.bots for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy "delete own bots, admin deletes any" on public.bots for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create function public.bot_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    new.user_id := old.user_id;
    if new.code is distinct from old.code or new.name is distinct from old.name or new.game is distinct from old.game then
      new.status := 'pending';
      new.reviewed_at := null;
    else
      new.status := old.status;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger bot_guard
  before update on public.bots
  for each row execute function public.bot_guard();

-- The standings the admin publishes after running the tournament.
create table public.bot_standings (
  game text primary key check (game ~ '^[a-z0-9-]{1,40}$'),
  results jsonb not null check (jsonb_typeof(results) = 'array'),
  published_at timestamptz not null default now()
);
alter table public.bot_standings enable row level security;
create policy "standings are public" on public.bot_standings for select using (true);
create policy "admin publishes standings" on public.bot_standings for insert to authenticated
  with check (public.is_admin());
create policy "admin updates standings" on public.bot_standings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.bots, public.bot_standings to anon, authenticated;
grant insert, update, delete on public.bots to authenticated;
grant insert, update on public.bot_standings to authenticated;
