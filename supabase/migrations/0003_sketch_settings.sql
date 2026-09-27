-- Per-sketch site settings the admin changes from the live site:
--   published  whether it's in the feed, gallery and previous/next
--              (a sketch with no row here is published)
--   params     slider values every visitor starts from, overriding the
--              defaults written in the sketch's code
-- Paste into Supabase → SQL Editor and run once, after 0002.

create table public.sketch_settings (
  sketch_id text primary key check (char_length(sketch_id) between 1 and 200),
  published boolean not null default true,
  params jsonb check (params is null or jsonb_typeof(params) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.sketch_settings enable row level security;
create policy "settings are public" on public.sketch_settings for select using (true);
create policy "admin adds settings" on public.sketch_settings for insert to authenticated
  with check (public.is_admin());
create policy "admin changes settings" on public.sketch_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin removes settings" on public.sketch_settings for delete to authenticated
  using (public.is_admin());

grant select on public.sketch_settings to anon, authenticated;
grant insert, update, delete on public.sketch_settings to authenticated;
