-- Supabase schema + RLS for Hui (whānau events)
begin;

create table if not exists public.hui_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_date date not null,
  event_time time,
  event_location text not null,
  event_description text,
  is_public boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current
create or replace function public.set_hui_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists set_hui_events_updated_at on public.hui_events;
create trigger set_hui_events_updated_at
before insert or update on public.hui_events
for each row execute function public.set_hui_updated_at();

alter table public.hui_events enable row level security;

-- Anyone can read public events
drop policy if exists "Public read events" on public.hui_events;
create policy "Public read events"
  on public.hui_events for select
  to public
  using (is_public = true);

-- Authenticated users can also see non-public events
drop policy if exists "Authenticated read all events" on public.hui_events;
create policy "Authenticated read all events"
  on public.hui_events for select
  to authenticated
  using (true);

-- Authenticated users can insert events
drop policy if exists "Authenticated can insert events" on public.hui_events;
create policy "Authenticated can insert events"
  on public.hui_events for insert
  to authenticated
  with check (created_by = auth.uid());

-- Authors can update their own events
drop policy if exists "Authors can update own events" on public.hui_events;
create policy "Authors can update own events"
  on public.hui_events for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Authors can delete their own events
drop policy if exists "Authors can delete own events" on public.hui_events;
create policy "Authors can delete own events"
  on public.hui_events for delete
  to authenticated
  using (created_by = auth.uid());

-- Indexes
create index if not exists idx_hui_events_date on public.hui_events (event_date desc);
create index if not exists idx_hui_events_public on public.hui_events (is_public) where is_public = true;

commit;
