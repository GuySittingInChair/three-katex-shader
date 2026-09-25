-- Profiles for every sign-in provider (GitHub, Google, Discord): a unique
-- @handle for /u/<handle>, a display name and a bio people can edit.
-- Paste into Supabase → SQL Editor and run once, after 0001.

alter table public.profiles
  add column display_name text check (char_length(display_name) <= 60),
  add column bio text check (char_length(bio) <= 500);

-- Handles are unique regardless of case, since they appear in URLs.
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- A handle from whatever the provider sends: GitHub gives user_name, Discord
-- a name, Google only a full name. Reduced to URL-safe characters and made
-- unique with a number if taken.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := new.raw_user_meta_data;
  base text;
  candidate text;
  n int := 0;
begin
  base := coalesce(
    meta ->> 'user_name',
    meta ->> 'preferred_username',
    meta -> 'custom_claims' ->> 'global_name',
    meta ->> 'name',
    meta ->> 'full_name',
    'user'
  );
  base := left(regexp_replace(base, '[^A-Za-z0-9_-]+', '', 'g'), 30);
  if base = '' then
    base := 'user';
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url, is_admin)
  values (
    new.id,
    candidate,
    left(coalesce(meta ->> 'full_name', meta ->> 'name', meta -> 'custom_claims' ->> 'global_name', candidate), 60),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture'),
    coalesce(
      new.raw_app_meta_data ->> 'provider' = 'github' and meta ->> 'provider_id' = '41241378',
      false
    )
  );
  return new;
end $$;

-- People edit their own display name and bio, and nothing else: the column
-- grant keeps username and is_admin out of reach.
create policy "edit your own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update (display_name, bio) on public.profiles to authenticated;
