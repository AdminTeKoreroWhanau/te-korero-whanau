-- Allow anonymous (unauthenticated) users to read the whānau list.
-- This is required so the signup page can display whānau for new users to join.
-- Run this in the Supabase SQL editor.

begin;

-- Replace the authenticated-only policy with a public one
drop policy if exists "Authenticated read whanau" on public.whanau;
drop policy if exists "Public read whanau" on public.whanau;

create policy "Public read whanau"
  on public.whanau for select
  to public
  using (true);

commit;
