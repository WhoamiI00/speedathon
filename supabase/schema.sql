-- Sevendipity schema (PLAN.md §3). FROZEN at 11:30. Changes go through T1 and get announced.
-- Run once in Supabase SQL editor (or `psql $DATABASE_URL -f supabase/schema.sql`) on a fresh project.

create extension if not exists pgcrypto;

create table rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,            -- 'speedhacks'
  name text not null
);

create table people (
  id uuid primary key default gen_random_uuid(),   -- also the Keewano installId (must be UUID)
  room_id uuid references rooms(id) not null,
  name text not null,
  phone text,                            -- E.164, e.g. +14155550123
  role text,                             -- short label: Founder / Investor / Student / Engineer / Sponsor …
  who_i_am text not null default '',
  needs text not null default '',
  gives text not null default '',
  show_name boolean not null default false,
  qr_token text unique not null default encode(gen_random_bytes(8), 'hex'),
  follow_through numeric not null default 0.5,     -- 0..1, refreshed from Keewano (§6b)
  is_seed boolean not null default false,
  profile_source text not null default 'form',     -- 'form' | 'call' | 'seed'
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) not null,
  a_id uuid references people(id) not null,
  b_id uuid references people(id) not null,
  b_fits_a int not null,                 -- 0..10: does B satisfy A's needs
  a_fits_b int not null,                 -- 0..10: does A satisfy B's needs
  combined int not null,                 -- 0..100
  why_for_a text not null,               -- shown to A: why meet B
  why_for_b text not null,               -- shown to B: why meet A
  created_at timestamptz not null default now(),
  unique (a_id, b_id)
);

create type intro_status as enum ('proposed','accepted','met','rated','declined');

create table intros (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) not null,
  a_id uuid references people(id) not null,
  b_id uuid references people(id) not null,
  introducer_id uuid references people(id),        -- null = AI-made
  match_id uuid references matches(id),
  note text,
  status intro_status not null default 'proposed',
  a_accepted boolean,
  b_accepted boolean,
  met_at timestamptz,
  created_at timestamptz not null default now()
);

create table encounters (                -- every personal-QR scan, intro or not
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) not null,
  scanner_id uuid references people(id) not null,
  scanned_id uuid references people(id) not null,
  created_at timestamptz not null default now()
);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  intro_id uuid references intros(id) not null,
  rater_id uuid references people(id) not null,
  ratee_id uuid references people(id) not null,
  value int not null check (value between 0 and 3),
  source text not null default 'web',    -- 'web' | 'call'
  created_at timestamptz not null default now(),
  unique (intro_id, rater_id)
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) not null,
  intro_id uuid references intros(id),
  kind text not null,                    -- 'introducer_stage' | 'introduced_cost' | 'value_flow'
  stage text,                            -- 'accepted' | 'met' | 'valuable' (introducer kinds)
  delta numeric not null,
  created_at timestamptz not null default now()
);

create table call_jobs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) not null,
  intro_id uuid references intros(id),
  kind text not null,                    -- 'intake' | 'briefing' | 'followup'
  status text not null default 'queued', -- queued | dialing | done | failed
  dial_call_id text,
  transcript text,
  result jsonb,                          -- extracted profile / {accept:bool} / {rating:int}
  not_before timestamptz not null default now(),   -- follow-ups scheduled +30 min
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_matches (             -- Darwin
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) not null,
  need text not null,
  agent_name text not null,
  why text not null,
  connect jsonb,                         -- connection details from Darwin
  created_at timestamptz not null default now()
);

-- Public giving view (never exposes take side)
create view public_givers as
select p.id, case when p.show_name then p.name else 'A ' || lower(coalesce(p.role,'participant')) end as display_name,
       p.role,
       coalesce(sum(l.delta) filter (where l.delta > 0), 0) as give_score,
       (select count(*) from intros i where i.introducer_id = p.id and i.status = 'rated') as verified_intros,
       (select avg(value) from ratings r where r.ratee_id = p.id) as helpfulness
from people p left join ledger_entries l on l.person_id = p.id
group by p.id;

-- ───────────── T1 additions below (not in PLAN §3, additive only) ─────────────

-- Masked people for the browser: no phone, no qr_token, name only if opted in.
create view public_people as
select p.id, p.room_id,
       case when p.show_name then p.name else 'A ' || lower(coalesce(p.role,'participant')) end as display_name,
       p.role, p.is_seed, p.profile_source, p.created_at
from people p;

-- Helpful indexes
create index on people (room_id);
create index on matches (a_id);
create index on matches (b_id);
create index on intros (a_id);
create index on intros (b_id);
create index on intros (introducer_id);
create index on ledger_entries (person_id);
create index on call_jobs (status, not_before);

-- ───────────── Security: RLS ─────────────
-- Server routes use the service-role key (bypasses RLS). The browser uses the anon key and
-- may only READ the dashboard tables below. Nothing else is readable or writable from the browser.
alter table rooms          enable row level security;
alter table people         enable row level security;  -- no anon policy: phone must never reach the client
alter table matches        enable row level security;
alter table intros         enable row level security;
alter table encounters     enable row level security;
alter table ratings        enable row level security;  -- private
alter table ledger_entries enable row level security;
alter table call_jobs      enable row level security;  -- private
alter table agent_matches  enable row level security;  -- private (read via server)

create policy anon_read_rooms   on rooms   for select to anon, authenticated using (true);
create policy anon_read_matches on matches for select to anon, authenticated using (true);
create policy anon_read_intros  on intros  for select to anon, authenticated using (true);
create policy anon_read_encounters on encounters for select to anon, authenticated using (true);
-- Giving is public, taking stays private: the browser only ever sees positive deltas.
create policy anon_read_gives   on ledger_entries for select to anon, authenticated using (delta > 0);

revoke all on all tables in schema public from anon, authenticated;
grant select on rooms, matches, intros, encounters, ledger_entries to anon, authenticated;
grant select on public_givers, public_people to anon, authenticated;

-- ───────────── Realtime ─────────────
-- people is in the publication for completeness, but anon cannot read it (no policy);
-- the dashboard should react to matches/intros/ledger_entries and re-read public_people / public_givers.
alter publication supabase_realtime add table matches, intros, ledger_entries, people, encounters;

-- ───────────── The room ─────────────
insert into rooms (slug, name) values ('speedhacks', 'SpeedHacks SF') on conflict (slug) do nothing;
