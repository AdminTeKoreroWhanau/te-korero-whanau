-- Add date_of_birth and marital_status to profiles table
-- Run in the Supabase SQL editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS marital_status text;

-- Allow whānau members to read each other's profiles (for birthday lookups)
DROP POLICY IF EXISTS "Read whanau profiles" ON public.profiles;
CREATE POLICY "Read whanau profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR id IN (
      SELECT wm.user_id FROM public.whanau_members wm
      WHERE wm.whanau_id = public.user_whanau_id()
    )
  );
