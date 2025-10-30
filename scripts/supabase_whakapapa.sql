-- Supabase schema for Whakapapa builder (per-user trees using existing profiles)
-- Run this in the SQL editor of your Supabase project.

-- UUID generator (Supabase usually has pgcrypto, but ensure it):
create extension if not exists "pgcrypto";

-- Optional: basic profiles table if you don't already have one.
-- If you already maintain a profiles table, this will be skipped or you can remove it.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

-- Table linking which profiles a user has included in THEIR whakapapa tree
create table if not exists public.whakapapa_people (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, profile_id)
);

-- Relationships between selected profiles in a user's tree
create table if not exists public.whakapapa_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('parent','mother','father','spouse','partner','sibling')),
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_whakapapa_people_user on public.whakapapa_people(user_id);
create index if not exists idx_whakapapa_people_profile on public.whakapapa_people(profile_id);
create index if not exists idx_whakapapa_relations_user on public.whakapapa_relations(user_id);
create index if not exists idx_whakapapa_relations_from on public.whakapapa_relations(from_id);
create index if not exists idx_whakapapa_relations_to on public.whakapapa_relations(to_id);

-- Enable Row Level Security
alter table public.whakapapa_people enable row level security;
alter table public.whakapapa_relations enable row level security;

-- Policies: users can only manage their own tree
-- Select
create policy if not exists "select own people" on public.whakapapa_people
  for select to authenticated using (auth.uid() = user_id);
create policy if not exists "select own relations" on public.whakapapa_relations
  for select to authenticated using (auth.uid() = user_id);

-- Insert
create policy if not exists "insert own people" on public.whakapapa_people
  for insert to authenticated with check (auth.uid() = user_id);
create policy if not exists "insert own relations" on public.whakapapa_relations
  for insert to authenticated with check (auth.uid() = user_id);

-- Update
create policy if not exists "update own people" on public.whakapapa_people
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "update own relations" on public.whakapapa_relations
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Delete
create policy if not exists "delete own people" on public.whakapapa_people
  for delete to authenticated using (auth.uid() = user_id);
create policy if not exists "delete own relations" on public.whakapapa_relations
  for delete to authenticated using (auth.uid() = user_id);

-- OPTIONAL: if your profiles table has RLS enabled and you want all signed-in users
-- to be able to list profiles (id, full_name, avatar_url) for selection in the tree,
-- add a read policy like this (adjust columns as needed):
-- alter table public.profiles enable row level security;
-- create policy if not exists "profiles readable to authenticated" on public.profiles
--   for select to authenticated using (true);
