-- Games against the built-in AI: each finished game by a logged-in player, and
-- a leaderboard per game and level. Paste into Supabase → SQL Editor and run
-- once, after 0004. (The site works before this runs; results just aren't saved.)
--
-- Results are reported by the player's browser, so they're honour-system: a
-- determined person could post fake wins through the API. Games where Undo
-- was used aren't reported as wins.

create table public.game_results (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9-]{1,40}$'),
  level smallint not null check (level between 1 and 5),
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  moves smallint check (moves between 0 and 200),
  created_at timestamptz not null default now()
);
create index game_results_board_idx on public.game_results (game, level, outcome);

alter table public.game_results enable row level security;
create policy "results are public" on public.game_results for select using (true);
create policy "record your own results" on public.game_results for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "admin removes results" on public.game_results for delete to authenticated
  using (public.is_admin());

grant select on public.game_results to anon, authenticated;
grant insert, delete on public.game_results to authenticated;

-- Wins, losses and draws per player, game and level.
create view public.game_leaderboard with (security_invoker = true) as
select
  r.game,
  r.level,
  p.username,
  p.avatar_url,
  count(*) filter (where r.outcome = 'win') as wins,
  count(*) filter (where r.outcome = 'loss') as losses,
  count(*) filter (where r.outcome = 'draw') as draws
from public.game_results r
join public.profiles p on p.id = r.user_id
group by r.game, r.level, p.username, p.avatar_url;

grant select on public.game_leaderboard to anon, authenticated;
