begin;

-- Create public storage bucket for Ngā Toi images (idempotent)
-- Requires the storage extension (enabled by default in Supabase)
select
  case when not exists (
    select 1 from storage.buckets where id = 'ngatoi'
  ) then storage.create_bucket('ngatoi', public := true)
  else null end;

-- Storage policies for bucket 'ngatoi' (drop/create for idempotency)
-- Allow anyone to read objects
drop policy if exists "Public read ngatoi" on storage.objects;
create policy "Public read ngatoi"
  on storage.objects for select to public
  using (bucket_id = 'ngatoi');

-- Allow authenticated users to upload into 'ngatoi' and mark themselves owner
drop policy if exists "Users upload ngatoi" on storage.objects;
create policy "Users upload ngatoi"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ngatoi' and auth.uid() = owner);

-- Allow owners to update/delete their objects in 'ngatoi'
drop policy if exists "Owners modify ngatoi" on storage.objects;
create policy "Owners modify ngatoi"
  on storage.objects for update to authenticated
  using (bucket_id = 'ngatoi' and auth.uid() = owner)
  with check (bucket_id = 'ngatoi' and auth.uid() = owner);

drop policy if exists "Owners delete ngatoi" on storage.objects;
create policy "Owners delete ngatoi"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ngatoi' and auth.uid() = owner);

-- Tables for Ngā Toi gallery items, reactions, and comments
create table if not exists public.ngatoi_items (
  id text primary key,
  title text,
  author text,
  image_url text,
  storage_path text,
  created_at timestamptz not null default now()
);

alter table public.ngatoi_items enable row level security;

-- Anyone (anon) can view gallery items
drop policy if exists "Public can view ngatoi items" on public.ngatoi_items;
create policy "Public can view ngatoi items"
  on public.ngatoi_items for select to public
  using (true);

-- Authenticated users can insert new items
drop policy if exists "Users can add ngatoi items" on public.ngatoi_items;
create policy "Users can add ngatoi items"
  on public.ngatoi_items for insert to authenticated
  with check (true);

-- Reactions
create table if not exists public.ngatoi_reactions (
  id text primary key,
  art_id text not null references public.ngatoi_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('aroha')),
  created_at timestamptz not null default now(),
  unique (art_id, user_id, type)
);

alter table public.ngatoi_reactions enable row level security;

-- Anyone can read reactions; only owner can insert/delete their reaction
drop policy if exists "Public can view ngatoi reactions" on public.ngatoi_reactions;
create policy "Public can view ngatoi reactions"
  on public.ngatoi_reactions for select to public
  using (true);

drop policy if exists "Users can react" on public.ngatoi_reactions;
create policy "Users can react"
  on public.ngatoi_reactions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove own reaction" on public.ngatoi_reactions;
create policy "Users can remove own reaction"
  on public.ngatoi_reactions for delete to authenticated
  using (auth.uid() = user_id);

-- Comments
create table if not exists public.ngatoi_comments (
  id text primary key,
  art_id text not null references public.ngatoi_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.ngatoi_comments enable row level security;

drop policy if exists "Public can view ngatoi comments" on public.ngatoi_comments;
create policy "Public can view ngatoi comments"
  on public.ngatoi_comments for select to public
  using (true);

drop policy if exists "Users can add ngatoi comments" on public.ngatoi_comments;
create policy "Users can add ngatoi comments"
  on public.ngatoi_comments for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ngatoi comments" on public.ngatoi_comments;
create policy "Users can delete own ngatoi comments"
  on public.ngatoi_comments for delete to authenticated
  using (auth.uid() = user_id);

commit;
