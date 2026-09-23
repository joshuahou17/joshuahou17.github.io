-- joshhou.com/joyshua: everything added or edited from the page itself.
--
-- The page's original content lives in static files (joyshua/postcards.js,
-- joyshua/letters.js). These tables hold what's been added on top, plus edits
-- to anything (a banner's text and position, which letters are in the box).
--
-- Anyone with the link may edit (Josh's call), so the browser NEVER writes here
-- directly: there are read policies and no write policies. Every write goes
-- through the `joyshua` edge function (service role), which validates it,
-- rate-limits it and records the before/after in joyshua_log first. Nothing is
-- ever deleted -- rows are hidden -- so any vandalism can be rolled back.
--
-- Apply this BEFORE deploying the function:
--   supabase db query --linked -f scripts/joyshua_schema.sql

create table if not exists public.joyshua_postcards (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 60),
  front_path  text not null,
  w           int  not null check (w between 1 and 4000),
  h           int  not null check (h between 1 and 4000),
  author      text not null check (author in ('josh', 'joyce')),
  created_at  timestamptz not null default now(),
  hidden      boolean not null default false
);

create table if not exists public.joyshua_photos (
  id           uuid primary key default gen_random_uuid(),
  postcard_key text not null check (char_length(postcard_key) between 1 and 80),  -- a static card's title, or a joyshua_postcards id
  path         text not null,
  thumb_path   text not null,
  w            int  not null check (w between 1 and 4000),
  h            int  not null check (h between 1 and 4000),
  label        text not null default '' check (char_length(label) <= 80),
  author       text not null check (author in ('josh', 'joyce')),
  created_at   timestamptz not null default now(),
  hidden       boolean not null default false
);
create index if not exists joyshua_photos_card on public.joyshua_photos (postcard_key, created_at);

create table if not exists public.joyshua_letters (
  id          uuid primary key default gen_random_uuid(),
  label       text not null check (char_length(label) between 1 and 80),
  greeting    text not null default '' check (char_length(greeting) <= 80),
  body        text not null check (char_length(body) between 1 and 8000),
  closing     text not null default '' check (char_length(closing) <= 80),
  name        text not null default '' check (char_length(name) <= 40),
  author      text not null check (author in ('josh', 'joyce')),
  created_at  timestamptz not null default now(),
  hidden      boolean not null default false
);

-- Edits to anything, static or added, keyed by what they edit:
--   label:<photo src>   -> {"text": "...", "x": 42.5, "y": 88}   (x/y = % of the photo)
--   box:<letter key>    -> {"in": true}
create table if not exists public.joyshua_state (
  key         text primary key check (char_length(key) <= 400),
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Append-only record of every write: the undo button.
create table if not exists public.joyshua_log (
  id       bigserial primary key,
  action   text not null,
  key      text,
  old      jsonb,
  new      jsonb,
  visitor  text,            -- a daily-salted hash; no IP is stored
  at       timestamptz not null default now()
);
create index if not exists joyshua_log_visitor on public.joyshua_log (visitor, at);
create index if not exists joyshua_log_action on public.joyshua_log (action, at);

alter table public.joyshua_postcards enable row level security;
alter table public.joyshua_photos    enable row level security;
alter table public.joyshua_letters   enable row level security;
alter table public.joyshua_state     enable row level security;
alter table public.joyshua_log       enable row level security;   -- no policies: unreadable from the browser

drop policy if exists "joyshua read postcards" on public.joyshua_postcards;
create policy "joyshua read postcards" on public.joyshua_postcards for select to anon, authenticated using (not hidden);
drop policy if exists "joyshua read photos" on public.joyshua_photos;
create policy "joyshua read photos" on public.joyshua_photos for select to anon, authenticated using (not hidden);
drop policy if exists "joyshua read letters" on public.joyshua_letters;
create policy "joyshua read letters" on public.joyshua_letters for select to anon, authenticated using (not hidden);
drop policy if exists "joyshua read state" on public.joyshua_state;
create policy "joyshua read state" on public.joyshua_state for select to anon, authenticated using (true);

-- Uploaded photos and postcard fronts. Public to read; uploads only through
-- signed URLs the function hands out.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('joyshua', 'joyshua', true, 12582912, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = excluded.public,
                               file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Conversation topics: index cards Josh and Joyce fill in during the week and
-- tick off once they've talked about them. Added 2026-09-22.
create table if not exists public.joyshua_topics (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 1 and 280),
  author      text not null check (author in ('josh', 'joyce')),
  created_at  timestamptz not null default now(),
  done_at     timestamptz,                -- null until it's been discussed
  hidden      boolean not null default false
);
create index if not exists joyshua_topics_open on public.joyshua_topics (done_at, created_at);

alter table public.joyshua_topics enable row level security;
drop policy if exists "joyshua read topics" on public.joyshua_topics;
create policy "joyshua read topics" on public.joyshua_topics for select to anon, authenticated using (not hidden);

-- The bucket list shares the topics table: same shape (a line of text, who
-- wrote it, when, ticked off when it's done). `kind` tells them apart; every
-- row written before 2026-09-22 is a topic. Added 2026-09-22.
alter table public.joyshua_topics add column if not exists kind text not null default 'topic';
alter table public.joyshua_topics drop constraint if exists joyshua_topics_kind;
alter table public.joyshua_topics add constraint joyshua_topics_kind check (kind in ('topic', 'bucket'));

-- Notifications: the devices that asked to hear when the other person adds
-- something. `who` is whose device it is (Josh's devices hear about Joyce's
-- additions, and the other way round). Only the edge function touches this --
-- no policies, so the browser can't read anyone's subscription. Rows really
-- are deleted here: a device that's turned off, or that its push service says
-- is gone, is just dropped. Added 2026-09-23.
create table if not exists public.joyshua_push (
  endpoint    text primary key check (char_length(endpoint) <= 1000),
  who         text not null check (who in ('josh', 'joyce')),
  p256dh      text not null check (char_length(p256dh) <= 100),
  auth        text not null check (char_length(auth) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  last_ok_at  timestamptz                -- the last notification it accepted
);
create index if not exists joyshua_push_who on public.joyshua_push (who, updated_at);

alter table public.joyshua_push enable row level security;   -- no policies: unreadable from the browser

-- When a photo was taken (read from the picture by the page), so a postcard's
-- photos can sort by it (#54). It was added straight to the database; it's here
-- so a fresh setup has it too.
alter table public.joyshua_photos add column if not exists taken_at timestamptz;

-- Polaroids: a photo taken there and then with the camera, a line on its white
-- strip, sent to the other person. It arrives blank and develops the first
-- time they open it; `developed_at` records that, so it's developed on every
-- device after. Added 2026-09-23.
create table if not exists public.joyshua_polaroids (
  id            uuid primary key default gen_random_uuid(),
  path          text not null,
  thumb_path    text not null,
  w             int  not null check (w between 1 and 4000),
  h             int  not null check (h between 1 and 4000),
  caption       text not null default '' check (char_length(caption) <= 40),
  author        text not null check (author in ('josh', 'joyce')),
  created_at    timestamptz not null default now(),
  developed_at  timestamptz,               -- null until the other person has watched it develop
  hidden        boolean not null default false
);
create index if not exists joyshua_polaroids_made on public.joyshua_polaroids (created_at);

alter table public.joyshua_polaroids enable row level security;
drop policy if exists "joyshua read polaroids" on public.joyshua_polaroids;
create policy "joyshua read polaroids" on public.joyshua_polaroids for select to anon, authenticated using (not hidden);
