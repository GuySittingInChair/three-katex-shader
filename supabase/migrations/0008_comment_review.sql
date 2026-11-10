-- Comments wait for review, like everything else. Paste into Supabase →
-- SQL Editor and run once (after 0007_clips.sql).
--
-- Rule: someone's first comment waits for the admin. Once the admin has
-- approved one of their comments they're trusted, and later comments appear
-- at once. The admin's own comments always appear at once. Comments already
-- on the site stay up. Until approved, a comment is visible only to its
-- author (marked "waiting for review") and the admin.

alter table public.comments
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column reviewed_at timestamptz;
alter table public.comments alter column status set default 'pending';
create index comments_pending_idx on public.comments (status, created_at) where status = 'pending';

-- Decide the status on insert; nobody can pick their own.
create function public.comment_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_admin() or exists (
    select 1 from public.comments c where c.user_id = new.user_id and c.status = 'approved' and c.reviewed_at is not null
  ) then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  new.reviewed_at := null;
  return new;
end $$;

create trigger comments_status_on_insert
  before insert on public.comments
  for each row execute function public.comment_status();

drop policy "comments are public" on public.comments;
create policy "approved comments are public" on public.comments for select
  using (status = 'approved' or user_id = (select auth.uid()) or public.is_admin());
create policy "admin reviews comments" on public.comments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant update (status, reviewed_at) on public.comments to authenticated;
