-- Allow public (anonymous) read access to profiles
-- Needed so the landing page can show recently joined member names and avatars
begin;

drop policy if exists "profiles readable to public" on public.profiles;
create policy "profiles readable to public"
  on public.profiles for select
  to public
  using (true);

commit;
