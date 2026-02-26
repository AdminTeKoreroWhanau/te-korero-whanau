-- Supabase migration: shared whakapapa tree with admin-controlled node positions
-- Run this in the SQL editor of your Supabase project AFTER supabase_whakapapa.sql.

-- 1) Update RLS on whakapapa_people so ALL authenticated users can read the shared tree
drop policy if exists "select own people" on public.whakapapa_people;
create policy "select all people" on public.whakapapa_people
  for select to authenticated using (true);

-- 2) Update RLS on whakapapa_relations so ALL authenticated users can read
drop policy if exists "select own relations" on public.whakapapa_relations;
create policy "select all relations" on public.whakapapa_relations
  for select to authenticated using (true);

-- 3) Positions table — stores the x/y position of each node on the tree canvas
--    Admin arranges nodes via drag-and-drop; these positions are shared with all viewers.
create table if not exists public.whakapapa_positions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  updated_at timestamptz default now()
);

create index if not exists idx_whakapapa_positions_profile on public.whakapapa_positions(profile_id);

alter table public.whakapapa_positions enable row level security;

-- All authenticated users can read positions
create policy "select positions" on public.whakapapa_positions
  for select to authenticated using (true);

-- Only admin users can insert positions (admin_users table membership)
create policy "admin insert positions" on public.whakapapa_positions
  for insert to authenticated with check (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- Only admin users can update positions
create policy "admin update positions" on public.whakapapa_positions
  for update to authenticated using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  ) with check (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- Only admin users can delete positions
create policy "admin delete positions" on public.whakapapa_positions
  for delete to authenticated using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );
