-- Add location column to profiles table so it can be displayed on other users' profiles.
-- Run this in the Supabase SQL editor.

begin;

alter table public.profiles
  add column if not exists location text;

commit;
