-- Add public/private visibility to Kōrero posts
-- Private posts are only visible to the author and whānau in the same whakapapa tree
begin;

-- 1. Add is_public column (default true so existing posts stay public)
alter table public.korero_posts add column if not exists is_public boolean not null default true;

-- 2. Function to check if the current user is whānau of another user
--    Two users are whānau if they both appear as profile_ids in the same whakapapa tree.
--    Uses security definer to bypass whakapapa_people RLS (which is scoped per-user).
create or replace function public.is_whanau_of(target_user uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.whakapapa_people wp1
    join public.whakapapa_people wp2 on wp1.user_id = wp2.user_id
    where wp1.profile_id = auth.uid()
      and wp2.profile_id = target_user
      and wp1.profile_id != wp2.profile_id
  )
$$;

-- 3. Replace the old "anyone can read" policy with visibility-aware policy
drop policy if exists "Public read posts" on public.korero_posts;
drop policy if exists "Read posts by visibility" on public.korero_posts;

create policy "Read posts by visibility"
  on public.korero_posts for select
  to public
  using (
    is_public = true
    OR author_id = auth.uid()
    OR public.is_whanau_of(author_id)
  );

-- 4. Index for filtering by visibility
create index if not exists idx_korero_posts_public on public.korero_posts (is_public) where is_public = true;

commit;
