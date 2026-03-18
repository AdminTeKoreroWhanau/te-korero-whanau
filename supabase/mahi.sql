-- Supabase schema + RLS for Mahi (whānau projects & tasks)
begin;

-- ─── Projects ────────────────────────────────────────────────────
create table if not exists public.mahi_projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  project_description text,
  status text not null default 'active' check (status in ('active','completed','paused')),
  is_public boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_mahi_project_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists set_mahi_projects_updated_at on public.mahi_projects;
create trigger set_mahi_projects_updated_at
before insert or update on public.mahi_projects
for each row execute function public.set_mahi_project_updated_at();

alter table public.mahi_projects enable row level security;

drop policy if exists "Public read projects" on public.mahi_projects;
create policy "Public read projects"
  on public.mahi_projects for select
  to public
  using (is_public = true);

drop policy if exists "Authenticated read all projects" on public.mahi_projects;
create policy "Authenticated read all projects"
  on public.mahi_projects for select
  to authenticated
  using (true);

drop policy if exists "Authenticated can insert projects" on public.mahi_projects;
create policy "Authenticated can insert projects"
  on public.mahi_projects for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Authors can update own projects" on public.mahi_projects;
create policy "Authors can update own projects"
  on public.mahi_projects for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "Authors can delete own projects" on public.mahi_projects;
create policy "Authors can delete own projects"
  on public.mahi_projects for delete
  to authenticated
  using (created_by = auth.uid());

create index if not exists idx_mahi_projects_status on public.mahi_projects (status);
create index if not exists idx_mahi_projects_public on public.mahi_projects (is_public) where is_public = true;

-- ─── Project Members ─────────────────────────────────────────────
create table if not exists public.mahi_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mahi_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (project_id, user_id)
);

alter table public.mahi_members enable row level security;

drop policy if exists "Anyone can read members" on public.mahi_members;
create policy "Anyone can read members"
  on public.mahi_members for select
  to public
  using (true);

drop policy if exists "Authenticated can join projects" on public.mahi_members;
create policy "Authenticated can join projects"
  on public.mahi_members for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Members can leave projects" on public.mahi_members;
create policy "Members can leave projects"
  on public.mahi_members for delete
  to authenticated
  using (user_id = auth.uid());

create index if not exists idx_mahi_members_project on public.mahi_members (project_id);
create index if not exists idx_mahi_members_user on public.mahi_members (user_id);

-- ─── Project Updates ─────────────────────────────────────────────
create table if not exists public.mahi_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mahi_projects(id) on delete cascade,
  update_text text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.mahi_updates enable row level security;

drop policy if exists "Anyone can read updates" on public.mahi_updates;
create policy "Anyone can read updates"
  on public.mahi_updates for select
  to public
  using (true);

drop policy if exists "Authenticated can post updates" on public.mahi_updates;
create policy "Authenticated can post updates"
  on public.mahi_updates for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Authors can delete own updates" on public.mahi_updates;
create policy "Authors can delete own updates"
  on public.mahi_updates for delete
  to authenticated
  using (created_by = auth.uid());

create index if not exists idx_mahi_updates_project on public.mahi_updates (project_id);
create index if not exists idx_mahi_updates_created on public.mahi_updates (created_at desc);

commit;
