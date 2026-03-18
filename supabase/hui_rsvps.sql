-- RSVP table for Hui events (attending / maybe / declined)
begin;

create table if not exists public.hui_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.hui_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('attending','maybe','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- Keep updated_at current
create or replace function public.set_hui_rsvp_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists set_hui_rsvps_updated_at on public.hui_rsvps;
create trigger set_hui_rsvps_updated_at
before insert or update on public.hui_rsvps
for each row execute function public.set_hui_rsvp_updated_at();

alter table public.hui_rsvps enable row level security;

-- Anyone can read RSVPs (needed to show attendee avatars)
drop policy if exists "Public read rsvps" on public.hui_rsvps;
create policy "Public read rsvps"
  on public.hui_rsvps for select
  to public
  using (true);

-- Authenticated users can insert their own RSVP
drop policy if exists "Users can insert own rsvp" on public.hui_rsvps;
create policy "Users can insert own rsvp"
  on public.hui_rsvps for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can update their own RSVP
drop policy if exists "Users can update own rsvp" on public.hui_rsvps;
create policy "Users can update own rsvp"
  on public.hui_rsvps for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can delete their own RSVP
drop policy if exists "Users can delete own rsvp" on public.hui_rsvps;
create policy "Users can delete own rsvp"
  on public.hui_rsvps for delete
  to authenticated
  using (user_id = auth.uid());

-- Indexes
create index if not exists idx_hui_rsvps_event on public.hui_rsvps (event_id);
create index if not exists idx_hui_rsvps_user on public.hui_rsvps (user_id);
create index if not exists idx_hui_rsvps_status on public.hui_rsvps (event_id, status);

commit;
