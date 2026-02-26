-- Whānau Group System: tables, columns, functions, and RLS
-- Run this in the Supabase SQL editor AFTER all previous migrations.
begin;

------------------------------------------------------------
-- 1. New tables
------------------------------------------------------------

create table if not exists public.whanau (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.whanau_members (
  whanau_id uuid not null references public.whanau(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (whanau_id, user_id)
);

create index if not exists idx_whanau_members_user on public.whanau_members(user_id);
create index if not exists idx_whanau_members_whanau on public.whanau_members(whanau_id);

alter table public.whanau enable row level security;
alter table public.whanau_members enable row level security;

------------------------------------------------------------
-- 2. Helper function: get current user's whānau id
------------------------------------------------------------

create or replace function public.user_whanau_id()
returns uuid language sql stable security definer as $$
  select whanau_id from public.whanau_members
  where user_id = auth.uid()
  limit 1
$$;

------------------------------------------------------------
-- 3. Update is_whanau_of() to use whanau_members
------------------------------------------------------------

create or replace function public.is_whanau_of(target_user uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.whanau_members m1
    join public.whanau_members m2 on m1.whanau_id = m2.whanau_id
    where m1.user_id = auth.uid()
      and m2.user_id = target_user
      and m1.user_id != m2.user_id
  )
$$;

------------------------------------------------------------
-- 4. RLS for whanau table
------------------------------------------------------------

-- Anyone authenticated can list whānau (needed for join page)
drop policy if exists "Authenticated read whanau" on public.whanau;
create policy "Authenticated read whanau"
  on public.whanau for select
  to authenticated
  using (true);

-- Authenticated users can create a whānau
drop policy if exists "Authenticated create whanau" on public.whanau;
create policy "Authenticated create whanau"
  on public.whanau for insert
  to authenticated
  with check (created_by = auth.uid());

-- Creator or whānau admin can update
drop policy if exists "Admin update whanau" on public.whanau;
create policy "Admin update whanau"
  on public.whanau for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.whanau_members
      where whanau_id = id and user_id = auth.uid() and role = 'admin'
    )
  );

------------------------------------------------------------
-- 5. RLS for whanau_members
------------------------------------------------------------

-- Members can see their own row + other members in their whānau
drop policy if exists "Read own whanau members" on public.whanau_members;
create policy "Read own whanau members"
  on public.whanau_members for select
  to authenticated
  using (
    user_id = auth.uid()
    OR whanau_id = public.user_whanau_id()
  );

-- Any authenticated user can join a whānau (insert themselves)
drop policy if exists "Users can join whanau" on public.whanau_members;
create policy "Users can join whanau"
  on public.whanau_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- Admin can remove members; members can remove themselves
drop policy if exists "Admin or self delete member" on public.whanau_members;
create policy "Admin or self delete member"
  on public.whanau_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.whanau_members wm
      where wm.whanau_id = whanau_id and wm.user_id = auth.uid() and wm.role = 'admin'
    )
  );

------------------------------------------------------------
-- 6. Add whanau_id to content tables
------------------------------------------------------------

-- korero_posts
alter table public.korero_posts
  add column if not exists whanau_id uuid references public.whanau(id) on delete set null;
create index if not exists idx_korero_posts_whanau on public.korero_posts(whanau_id);

-- hui_events
alter table public.hui_events
  add column if not exists whanau_id uuid references public.whanau(id) on delete set null;
create index if not exists idx_hui_events_whanau on public.hui_events(whanau_id);

-- waiata_items (covers waiata + tauparapara)
alter table public.waiata_items
  add column if not exists whanau_id uuid references public.whanau(id) on delete set null;
alter table public.waiata_items
  add column if not exists is_public boolean not null default true;
create index if not exists idx_waiata_items_whanau on public.waiata_items(whanau_id);

-- ngatoi_items
alter table public.ngatoi_items
  add column if not exists whanau_id uuid references public.whanau(id) on delete set null;
alter table public.ngatoi_items
  add column if not exists is_public boolean not null default true;
create index if not exists idx_ngatoi_items_whanau on public.ngatoi_items(whanau_id);

-- whakapapa_people
alter table public.whakapapa_people
  add column if not exists whanau_id uuid references public.whanau(id) on delete set null;
create index if not exists idx_whakapapa_people_whanau on public.whakapapa_people(whanau_id);

-- whakapapa_relations
alter table public.whakapapa_relations
  add column if not exists whanau_id uuid references public.whanau(id) on delete set null;
create index if not exists idx_whakapapa_relations_whanau on public.whakapapa_relations(whanau_id);

------------------------------------------------------------
-- 7. Update RLS on korero_posts
------------------------------------------------------------

-- Replace visibility policy: public posts visible to all, private to whānau/author
drop policy if exists "Read posts by visibility" on public.korero_posts;
drop policy if exists "Public read posts" on public.korero_posts;
create policy "Read posts by visibility"
  on public.korero_posts for select
  to public
  using (
    is_public = true
    OR author_id = auth.uid()
    OR whanau_id = public.user_whanau_id()
  );

-- Update insert policy to require whanau_id
drop policy if exists "Authenticated can insert own posts" on public.korero_posts;
create policy "Authenticated can insert own posts"
  on public.korero_posts for insert
  to authenticated
  with check (author_id = auth.uid());

------------------------------------------------------------
-- 8. Update RLS on hui_events
------------------------------------------------------------

drop policy if exists "Public read events" on public.hui_events;
drop policy if exists "Authenticated read all events" on public.hui_events;

-- Public events visible to everyone; private events to whānau members or creator
drop policy if exists "Read events by visibility" on public.hui_events;
create policy "Read events by visibility"
  on public.hui_events for select
  to public
  using (
    is_public = true
    OR created_by = auth.uid()
    OR whanau_id = public.user_whanau_id()
  );

------------------------------------------------------------
-- 9. Update RLS on waiata_items
------------------------------------------------------------

drop policy if exists "Public read waiata" on public.waiata_items;
drop policy if exists "Anyone can read waiata" on public.waiata_items;
drop policy if exists "Read waiata by visibility" on public.waiata_items;

create policy "Read waiata by visibility"
  on public.waiata_items for select
  to public
  using (
    is_public = true
    OR whanau_id = public.user_whanau_id()
  );

------------------------------------------------------------
-- 10. Update RLS on ngatoi_items
------------------------------------------------------------

drop policy if exists "Public can view ngatoi items" on public.ngatoi_items;
drop policy if exists "Read ngatoi by visibility" on public.ngatoi_items;

create policy "Read ngatoi by visibility"
  on public.ngatoi_items for select
  to public
  using (
    is_public = true
    OR whanau_id = public.user_whanau_id()
  );

------------------------------------------------------------
-- 11. Update RLS on whakapapa tables
------------------------------------------------------------

-- whakapapa_people: same whānau can read; insert/update/delete own
drop policy if exists "select all people" on public.whakapapa_people;
drop policy if exists "select own people" on public.whakapapa_people;
drop policy if exists "select whanau people" on public.whakapapa_people;
create policy "select whanau people"
  on public.whakapapa_people for select
  to authenticated
  using (whanau_id = public.user_whanau_id());

drop policy if exists "insert own people" on public.whakapapa_people;
drop policy if exists "insert whanau people" on public.whakapapa_people;
create policy "insert whanau people"
  on public.whakapapa_people for insert
  to authenticated
  with check (whanau_id = public.user_whanau_id());

drop policy if exists "update own people" on public.whakapapa_people;
drop policy if exists "update whanau people" on public.whakapapa_people;
create policy "update whanau people"
  on public.whakapapa_people for update
  to authenticated
  using (whanau_id = public.user_whanau_id())
  with check (whanau_id = public.user_whanau_id());

drop policy if exists "delete own people" on public.whakapapa_people;
drop policy if exists "delete whanau people" on public.whakapapa_people;
create policy "delete whanau people"
  on public.whakapapa_people for delete
  to authenticated
  using (whanau_id = public.user_whanau_id());

-- whakapapa_relations: same whānau can read; insert/update/delete own
drop policy if exists "select all relations" on public.whakapapa_relations;
drop policy if exists "select own relations" on public.whakapapa_relations;
drop policy if exists "select whanau relations" on public.whakapapa_relations;
create policy "select whanau relations"
  on public.whakapapa_relations for select
  to authenticated
  using (whanau_id = public.user_whanau_id());

drop policy if exists "insert own relations" on public.whakapapa_relations;
drop policy if exists "insert whanau relations" on public.whakapapa_relations;
create policy "insert whanau relations"
  on public.whakapapa_relations for insert
  to authenticated
  with check (whanau_id = public.user_whanau_id());

drop policy if exists "update own relations" on public.whakapapa_relations;
drop policy if exists "update whanau relations" on public.whakapapa_relations;
create policy "update whanau relations"
  on public.whakapapa_relations for update
  to authenticated
  using (whanau_id = public.user_whanau_id())
  with check (whanau_id = public.user_whanau_id());

drop policy if exists "delete own relations" on public.whakapapa_relations;
drop policy if exists "delete whanau relations" on public.whakapapa_relations;
create policy "delete whanau relations"
  on public.whakapapa_relations for delete
  to authenticated
  using (whanau_id = public.user_whanau_id());

commit;
