# Te Kōrero Whānau

Preserving Whānau Legacy — a kaupapa to capture and share stories, histories, and voices of current and past whānau so their legacy endures for future generations (tamariki to kaumātua).

## Kaupapa / Purpose
- Māori cultural integration by default (te reo Māori in headings/labels; iwi/hapū/waka affiliations; pepeha builders; waiata/karakia recordings) grounded in tikanga Māori.
- Storytelling through multimedia: video interviews, audio kōrero, photo montages, and B-roll of homesteads and places of origin.
- Bridging relationships across dispersed whānau with updates, skills sharing (mahi, ika/kai, trades), and social media integration.
- Intergenerational learning: tools like whakapapa (family tree) and pepeha builders to educate tamariki and celebrate identity.
- User-driven, growing archive (2+ years): profiles with names, photos, dates, and stories; room to add new whānau.
- Digital accessibility and innovation: interactive, user-friendly site with potential AI chatbot to help discover kōrero.
- Focus on the journey: hopes, future prospects, and connection to whenua, not just static records.

## Whakatakotoranga / Structure
```
/ (root)
  public/           # static assets (images, audio, video)
  assets/           # styles and client-side scripts
  src/              # future JS/TS modules
  content/          # structured content (JSON/MD) for stories & profiles
  scripts/          # helper scripts for dev/ops
  index.html        # digital marae-style homepage
```

## Tīmata / Getting Started
- Quick preview: open `index.html` in your browser.
- Dev server (Python 3):
  - `python -m http.server 5173`
  - then browse http://localhost:5173

## Cultural notes
- Default language for headings is te reo Māori; English can appear as helper text.
- Respect tikanga and kaitiakitanga of media and stories; obtain whānau consent before publication.

## Next steps (suggested)
- Add content schemas for profiles, whakapapa, and waiata.
- Add upload/publishing workflow and access controls (private-by-default drafts).
- Integrate basic search and an optional AI assistant for discovery.

## Login, Registration, and Profile (Supabase)
This site now supports login/registration and a profile page with media uploads and posts, powered by Supabase.

1) Create a Supabase project at https://supabase.com and copy your Project URL and anon public key.
2) In `assets/auth.js`, set:
   - `SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'`
   - `SUPABASE_ANON_KEY = 'YOUR-ANON-KEY'`
   Alternatively, set globals before scripts in `index.html` and `profile.html`:
   ```html
   <script>
     window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
     window.SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
   </script>
   ```
3) In Supabase, create a public Storage bucket named `media`.
4) Create a `posts` table (SQL example):
   ```sql
   create table if not exists posts (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id) on delete cascade,
     content text,
     type text check (type in ('text','image','video')) default 'text',
     media_url text,
     created_at timestamptz default now()
   );
   -- RLS policies (enable RLS first)
   alter table posts enable row level security;
   create policy "insert own" on posts for insert with check (auth.uid() = user_id);
   create policy "select own" on posts for select using (auth.uid() = user_id);
   ```
5) For Storage bucket `media`, enable public access or create signed URLs; if using RLS, add a policy to allow authenticated uploads by path `user_id/*`.

Open `index.html` and click "Takiuru / Login" to sign in or register; after login you'll be redirected to `profile.html` where you can post text and upload images/videos.
