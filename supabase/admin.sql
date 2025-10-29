-- Admin users list and optional elevated policies for Kōrero
begin;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Allow a logged-in user to see their own admin row (to drive UI)
create policy if not exists "Admins can see membership"
  on public.admin_users for select
  to authenticated
  using (user_id = auth.uid());

-- Helper function: current user is admin
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.admin_users au where au.user_id = auth.uid())
$$;

-- Optional: give admins full control over korero tables
do $$ begin
  if exists (select 1 from pg_class where relname = 'korero_posts') then
    create policy if not exists "Admins manage posts"
      on public.korero_posts for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
  if exists (select 1 from pg_class where relname = 'korero_reactions') then
    create policy if not exists "Admins manage reactions"
      on public.korero_reactions for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

commit;