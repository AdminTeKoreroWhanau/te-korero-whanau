-- Seed: Create whānau "Otimi" and add all existing users
-- Run AFTER whanau.sql in the Supabase SQL editor.

DO $$
DECLARE
  w_id uuid;
  first_uid uuid;
BEGIN
  -- 1. Create the Otimi whānau
  INSERT INTO public.whanau (name, description)
  VALUES ('Otimi', 'Whānau Otimi')
  RETURNING id INTO w_id;

  -- 2. Find the first-created user (will be admin)
  SELECT id INTO first_uid FROM auth.users ORDER BY created_at ASC LIMIT 1;

  -- 3. Add all existing users as members (first = admin, rest = member)
  INSERT INTO public.whanau_members (whanau_id, user_id, role)
  SELECT w_id, u.id,
    CASE WHEN u.id = first_uid THEN 'admin' ELSE 'member' END
  FROM auth.users u
  ON CONFLICT DO NOTHING;

  -- 4. Backfill whanau_id on existing content so it's visible within Otimi
  UPDATE public.korero_posts SET whanau_id = w_id WHERE whanau_id IS NULL;
  UPDATE public.hui_events SET whanau_id = w_id WHERE whanau_id IS NULL;
  UPDATE public.waiata_items SET whanau_id = w_id WHERE whanau_id IS NULL;
  UPDATE public.ngatoi_items SET whanau_id = w_id WHERE whanau_id IS NULL;
  UPDATE public.whakapapa_people SET whanau_id = w_id WHERE whanau_id IS NULL;
  UPDATE public.whakapapa_relations SET whanau_id = w_id WHERE whanau_id IS NULL;
END $$;
