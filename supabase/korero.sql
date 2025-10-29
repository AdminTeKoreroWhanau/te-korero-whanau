-- Supabase schema + RLS for Kōrero posts and reactions
begin;

-- Posts table
create table if not exists public.korero_posts (
  id text primary key,
  type text not null check (type in ('story','vlog')),
  text text,
  media_url text,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Keep updated_at current on insert/update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists set_korero_posts_updated_at on public.korero_posts;
create trigger set_korero_posts_updated_at
before insert or update on public.korero_posts
for each row execute function public.set_updated_at();

alter table public.korero_posts enable row level security;

-- Reactions table
create table if not exists public.korero_reactions (
  id text primary key,
  post_id text not null references public.korero_posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('like','aroha')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, type)
);

alter table public.korero_reactions enable row level security;

-- Policies
-- Posts: anyone can read
create policy if not exists "Public read posts"
  on public.korero_posts for select
  to public
  using (true);

-- Posts: only authenticated users can insert their own author_id
create policy if not exists "Authenticated can insert own posts"
  on public.korero_posts for insert
  to authenticated
  with check (author_id = auth.uid());

-- Posts: authors can update/delete their own posts
create policy if not exists "Authors can update own posts"
  on public.korero_posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy if not exists "Authors can delete own posts"
  on public.korero_posts for delete
  to authenticated
  using (author_id = auth.uid());

-- Reactions: anyone can read
create policy if not exists "Public read reactions"
  on public.korero_reactions for select
  to public
  using (true);

-- Reactions: only authenticated users can insert/delete their own reactions
create policy if not exists "Authenticated can insert own reaction"
  on public.korero_reactions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy if not exists "Users can delete own reaction"
  on public.korero_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- Helpful indexes
create index if not exists idx_korero_posts_created_at on public.korero_posts (created_at desc);
create index if not exists idx_korero_reactions_post_id on public.korero_reactions (post_id);

commit;