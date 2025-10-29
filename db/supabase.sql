-- Supabase schema and policies for Waiata sharing (public read, permissive write/delete)

-- Extensions for UUID generation (usually enabled)
create extension if not exists "pgcrypto";

create table if not exists public.waiata_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('audio','lyrics','doc')),
  title text not null,
  author text,
  lyrics text,
  audio_url text,
  file_url text,
  filename text,
  storage_path text,
  created_at timestamptz not null default now(),
  created_by uuid
);

alter table public.waiata_items enable row level security;

-- Read: anyone
create policy if not exists "waiata_read_all" on public.waiata_items
for select using (true);

-- Insert: anyone (MVP)
create policy if not exists "waiata_insert_any" on public.waiata_items
for insert with check (true);

-- Delete: anyone (MVP)
create policy if not exists "waiata_delete_any" on public.waiata_items
for delete using (true);

-- Storage bucket for audio files (public)
select storage.create_bucket('waiata', public => true);

-- Storage policies (bucket: waiata)
create policy if not exists "Public read" on storage.objects for select
using ( bucket_id = 'waiata' );

create policy if not exists "Anyone upload" on storage.objects for insert
with check ( bucket_id = 'waiata' );

create policy if not exists "Anyone delete" on storage.objects for delete
using ( bucket_id = 'waiata' );
