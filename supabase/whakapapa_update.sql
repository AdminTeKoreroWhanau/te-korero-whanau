-- Whakapapa update: expanded relationship types + whānau member editing
-- Run this in the Supabase SQL editor AFTER whanau.sql has been applied.
--
-- Fixes:
--   1. Adds grandparent, uncle_aunt, cousin to allowed relationship types
--   2. Lets any whānau member save/edit positions (not just admins)
--   3. Ensures all whānau members can insert/edit people & relations

begin;

------------------------------------------------------------
-- 1. Update the CHECK constraint on whakapapa_relations.type
--    to include the new relationship types
------------------------------------------------------------

-- Drop the old constraint (the auto-generated name may vary;
-- this covers the common naming patterns Supabase/Postgres uses)
alter table public.whakapapa_relations
  drop constraint if exists whakapapa_relations_type_check;

-- Re-add with expanded list
alter table public.whakapapa_relations
  add constraint whakapapa_relations_type_check
  check (type in (
    'parent',
    'mother',
    'father',
    'spouse',
    'partner',
    'sibling',
    'grandparent',
    'uncle_aunt',
    'cousin'
  ));

------------------------------------------------------------
-- 2. Update whakapapa_positions RLS so any whānau member
--    can save positions (not just admin_users)
------------------------------------------------------------

-- Drop the old admin-only policies
drop policy if exists "admin insert positions" on public.whakapapa_positions;
drop policy if exists "admin update positions" on public.whakapapa_positions;
drop policy if exists "admin delete positions" on public.whakapapa_positions;

-- Any authenticated whānau member can insert positions
create policy "whanau insert positions" on public.whakapapa_positions
  for insert to authenticated
  with check (true);

-- Any authenticated whānau member can update positions
create policy "whanau update positions" on public.whakapapa_positions
  for update to authenticated
  using (true)
  with check (true);

-- Any authenticated whānau member can delete positions
create policy "whanau delete positions" on public.whakapapa_positions
  for delete to authenticated
  using (true);

------------------------------------------------------------
-- 3. Ensure whakapapa_people and whakapapa_relations
--    RLS policies allow whānau members to read and write.
--    (If whanau.sql was already run, these already exist —
--     the DROP IF EXISTS + CREATE pattern is safe to re-run.)
------------------------------------------------------------

-- whakapapa_people: select
drop policy if exists "select whanau people" on public.whakapapa_people;
drop policy if exists "select all people" on public.whakapapa_people;
drop policy if exists "select own people" on public.whakapapa_people;
create policy "select whanau people" on public.whakapapa_people
  for select to authenticated
  using (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  );

-- whakapapa_people: insert
drop policy if exists "insert whanau people" on public.whakapapa_people;
drop policy if exists "insert own people" on public.whakapapa_people;
create policy "insert whanau people" on public.whakapapa_people
  for insert to authenticated
  with check (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  );

-- whakapapa_people: update
drop policy if exists "update whanau people" on public.whakapapa_people;
drop policy if exists "update own people" on public.whakapapa_people;
create policy "update whanau people" on public.whakapapa_people
  for update to authenticated
  using (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  )
  with check (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  );

-- whakapapa_people: delete
drop policy if exists "delete whanau people" on public.whakapapa_people;
drop policy if exists "delete own people" on public.whakapapa_people;
create policy "delete whanau people" on public.whakapapa_people
  for delete to authenticated
  using (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  );

-- whakapapa_relations: select
drop policy if exists "select whanau relations" on public.whakapapa_relations;
drop policy if exists "select all relations" on public.whakapapa_relations;
drop policy if exists "select own relations" on public.whakapapa_relations;
create policy "select whanau relations" on public.whakapapa_relations
  for select to authenticated
  using (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  );

-- whakapapa_relations: insert
drop policy if exists "insert whanau relations" on public.whakapapa_relations;
drop policy if exists "insert own relations" on public.whakapapa_relations;
create policy "insert whanau relations" on public.whakapapa_relations
  for insert to authenticated
  with check (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  );

-- whakapapa_relations: update
drop policy if exists "update whanau relations" on public.whakapapa_relations;
drop policy if exists "update own relations" on public.whakapapa_relations;
create policy "update whanau relations" on public.whakapapa_relations
  for update to authenticated
  using (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  )
  with check (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  );

-- whakapapa_relations: delete
drop policy if exists "delete whanau relations" on public.whakapapa_relations;
drop policy if exists "delete own relations" on public.whakapapa_relations;
create policy "delete whanau relations" on public.whakapapa_relations
  for delete to authenticated
  using (
    whanau_id = public.user_whanau_id()
    OR whanau_id IS NULL
  );

commit;
