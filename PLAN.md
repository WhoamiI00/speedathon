# Sevendipity: MVP Build Plan (SpeedHacks SF, Oct 11 2026)

> **Sevendipity is the AI networking agent that makes giving visible.**
> It matches the right people in the room and calls you to brief you on why you should meet. Every intro that creates real value goes on a reciprocity ledger.

Source concept: `Social_Capital_Network_Product_Concept.docx` (Phase 1 AI Serendipity → Phase 2 Social Capital → Phase 3 Trust Infrastructure).
Hackathon challenge: *"Remove a meaningful bottleneck in how people work, learn, or access services: give people their time back."*

**The bottleneck we remove:** at events, people spend hours talking to the wrong people, and nobody gets credit for connecting others.
**The metric we show:** minutes from check-in to first *valuable* (bilaterally rated) meeting, and the share of needs left unmet. Both are measured live in Keewano.

---

## 0. Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Team | 5 engineers. Submissions due **9:00 PM PT** |
| 2 | Prize strategy | Grand prize first. **Dial, Keewano and Darwin** must be load-bearing. Alike is used passively. **Sparta is skipped** |
| 3 | Scope | Phase 1 (bilateral AI matching) plus a **thin Phase 2 ledger**. No Phase 3 math (pitch slide only) |
| 4 | Demo context | **Live at SpeedHacks SF.** Attendees and judges check in. 25 seeded fictional profiles are the safety net |
| 5 | Discovery | **Event QR check-in** plus a **person-to-person QR scan** that proves "we met" |
| 6 | Interface | Thin mobile web app, a **big-screen dashboard**, and **opt-in Dial voice calls** |
| 7 | Stack | **Next.js (App Router, TS) on Vercel, with Supabase** (Postgres + Realtime) and **Claude `claude-sonnet-5-5`** |
| 8 | Matching | **One Claude call per check-in**, with the whole room in the prompt. Bilateral scores; propose an intro only if **both ≥ 6/10** |
| 9 | Ledger credit | **Both mechanisms:** human introducers earn staged rewards, and the two people's balances move by rated value flow |
| 10 | Keewano | Every event goes to Keewano. It powers the **"Ask the room" agent** and a **follow-through signal** that weights matching |
| 11 | Darwin | Search API finds **agent matches for unmet needs**. Track the unmet-need rate before and after |
| 12 | Dial | Opt-in **intake interview call**, **briefing call for the top match**, and **follow-up rating call**. Calls run through a queue (2 concurrent max) |
| 13 | Visibility | **Giving is public, taking stays private.** Names appear on the big screen only after opt-in |
| 14 | Demo | Live loop with a judge (their phone rings on stage). **Backup video recorded at 8:15 PM** |
| 15 | Team split | 5 tracks, one owner each (section 9) |
| 16 | Name | **Sevendipity** |

---

## 1. Core user loop

```
Scan event QR ──► /r/speedhacks check-in (name, phone, I am / I need / I can give, show-name opt-in)
      │                    └─ or tap "Let my agent interview me" ─► Dial intake call (~90s) ─► Claude extracts profile
      ▼
Claude bilateral matching against everyone in the room (+ Keewano follow-through weighting)
      │                                   └─ needs with no human match ≥6 ─► Darwin agent match card
      ▼
Intro proposed (AI-made, or human-made via "Introduce two people")
      │   └─ top match only: Dial briefing call "You should meet X because… want me to set it up?" → yes = accept
      ▼
Both accept (web or call) ─► they find each other ─► scan each other's personal QR ─► "met"
      ▼
Both rate "how much did they help you?" (web, or Dial follow-up call ~30 min later) ─► ledger updates
      ▼
Big screen: live room + Top Connectors.  "Ask the room" ─► Claude + Keewano MCP answers live
```

---

## 2. Ledger rules (the thin Phase 2)

Two separate numbers, as in concept doc §4:
- **Balance** = give − take. It measures reciprocity. **Only the owner sees it**, labeled *"reciprocity, not reputation."*
- **Give score / reputation** = verified value created for others. Shown **publicly**.

### 2a. Human introducer staged rewards (concept doc §5)

Credit accumulates as the intro progresses (deltas sum to 1.0):

| Stage | Trigger | Introducer Δ | Each of the 2 people introduced Δ |
|---|---|---|---|
| Sent | Human creates intro | 0 | 0 |
| Accepted | Both accept | **+0.2** | −0.1 |
| Met | Mutual QR scan | **+0.3** (total 0.5) | −0.15 |
| Valuable | Both rate ≥ 2 | **+0.5** (total 1.0) | −0.25 |

The two introduced people's debits equal the introducer's credit, so **the ledger always sums to 0**. That's a nice property to mention in the pitch.
AI-made intros have no introducer. Only 2b applies to them.

### 2b. Value flow between the two people who met

Each person rates the other: **"How much did they help you?" 0–3**.
For rating `r` given by rater R about ratee E: `E += r/3`, `R −= r/3`.
If both help each other equally, the net is 0 (doc §3 "direct mutual-value match"). Lopsided meetings move balance toward the giver.

### 2c. Public numbers
- **Give score** = sum of all positive ledger deltas.
- **Verified helpful intros** = human intros that reached the Valuable stage.
- **Helpfulness** = average rating received (shown once there are ≥ 1 ratings).
- **Top Connectors** leaderboard = ranked by Give score. Only people with `show_name = true` are named; others appear as "A founder" and so on.

---

## 3. Data model (Supabase / Postgres)

Track 1 owns this. **Frozen at 11:30.** Announce any change in the team chat.

```sql
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
```

Enable **Realtime** on `matches`, `intros`, `ledger_entries` and `people` (the dashboard subscribes to them).
Hackathon security posture: the service-role key is used only in route handlers. The browser uses the anon key with read-only RLS on the dashboard tables and views. Never expose `phone` to the client.

**Identity (no real auth):** check-in sets an httpOnly signed cookie `gr_pid = person_id`. Lose the cookie and you check in again. That's acceptable for one day.

---

## 4. Pages and API contracts

### Pages
| Route | Purpose | Owner |
|---|---|---|
| `/r/[slug]` | Event QR target: check-in form + "Let my agent interview me" + show-name opt-in | T5 |
| `/me` | My matches (why-you-should-meet), intro accept/decline, **my personal QR**, Darwin agent cards, "Introduce two people", rate my meetings, **my private balance** | T5 |
| `/meet/[qr_token]` | What a phone's **native camera** opens when it scans someone's personal QR. Uses the scanner's cookie to record an encounter, so no in-app scanner is needed | T5 |
| `/p/[id]` | Public giving profile (give score, verified intros, helpfulness; never balance) | T5 |
| `/dashboard` | Big screen: live anonymized room feed, Top Connectors, live metrics, **"Ask the room"** box. It also drives the call-queue tick (§5) | T5 + T4 |

### Route handlers (`app/api/...`), all server-side
| Method & path | Body → Result | Owner |
|---|---|---|
| `POST /api/checkin` | `{slug,name,phone,who_i_am,needs,gives,show_name,interview}` → `{person_id}`. Sets the cookie. If `interview`, enqueue an `intake` call job; else run matching | T1 |
| `POST /api/match/run` | `{person_id}` → matches + proposed intros. Also triggers Darwin for unmet needs | T2 |
| `POST /api/intros` | `{a_id,b_id,note}` (introducer = cookie) → intro | T2 |
| `POST /api/intros/[id]/respond` | `{accept:boolean}` (cookie) → intro | T2 |
| `POST /api/encounters` | `{qr_token}` (cookie) → encounter. Advances a matching accepted intro to `met` | T2 |
| `POST /api/ratings` | `{intro_id,value}` (cookie) → rating. Applies ledger rules | T2 |
| `POST /api/calls/tick` | none → processes the queue (≤2 dialing), polls transcripts, applies results | T3 |
| `POST /api/ask` | `{question}` → `{answer}` via Claude + Keewano MCP tools | T4 |
| `POST /api/cron/follow-through` | none → refreshes `people.follow_through` from Keewano | T4 |

Every state change must call `emit()` from `lib/keewano.ts` (§6a). It must never throw: catch and log, so Keewano outages can't break the app.

Set `export const maxDuration = 60` on routes that call Claude, Dial or Darwin.

---

## 5. Dial (Track 3)

SDK: `npm i @getdial/sdk`. Env: `DIAL_API_KEY`, `DIAL_NUMBER`. Docs MCP for your Claude Code: `claude mcp add --transport http docs-getdial-ai https://docs.getdial.ai/_mcp/server`.
**Limits today:** outbound voice to any US number, **5 min max, 2 concurrent**. SMS is Dial-to-Dial only. iMessage and WhatsApp are by request (**ask at the Dial table first thing**, and ask about raising the concurrency limit for the demo). Request the $100 builder credits.

```ts
const call = await dial.makeCall({ to, fromNumber: process.env.DIAL_NUMBER!, outboundInstruction });
// later: (await dial.getCall(call.id)).transcript
```

**Call queue:** `call_jobs` rows. `/api/calls/tick`:
1. For `dialing` jobs, `getCall`. When finished, store the transcript, run Claude extraction, set `result`, mark `done`, apply the effect.
2. If fewer than 2 jobs are `dialing`, start the oldest `queued` job whose `not_before <= now()`.

**Tick driver:** the `/dashboard` page calls `/api/calls/tick` every 5 s (Vercel Hobby cron is daily only, so the always-open big screen acts as the cron). Backup: a `while true; curl …; sleep 5` loop on a laptop.

**Call scripts (`outboundInstruction`), each kept under 90 s:**
- **intake**: "You are Sevendipity, a friendly networking agent at SpeedHacks SF. Ask the person briefly: (1) who they are and what they work on, (2) what they need most right now (capital, co-founder, hires, customers, mentors…), (3) what they can offer others. Keep it under 90 seconds, then say they'll get their matches on screen and say goodbye." → Claude extracts `{role, who_i_am, needs, gives}` → update person → `match/run`.
- **briefing** (top match only, after an AI intro is proposed): "Tell {name} they should meet {other} ({role}) at SpeedHacks because {why_for_a}. Ask if they want the intro. Accept a clear yes or no." → Claude extracts `{accept: boolean|null}` → if yes, `respond(accept=true)`. If null, leave it for the web.
- **followup** (`not_before = met_at + 30 min`): "Ask {name} how valuable meeting {other} was, from 0 (not at all) to 3 (very)." → `{rating}` → `/api/ratings` logic.

**Web fallback for everything:** a call is never the only path.

**T3 ↔ T2 / T1 contract (implemented in `lib/dial/`):**
- **Scheduling (T2 calls T3):** `enqueueCall({ personId, kind, introId, delayMinutes })` from `lib/dial/enqueue.ts`. Briefing for the person's #1 match after `match/run`; follow-up with `delayMinutes: 30` when an intro reaches `met`. It only queues for people who chose the interview at check-in (`profile_source = 'call'`) and have a phone, and dedupes per person+intro+kind.
- **Results (T3 calls T2):** T2 exports `respondToIntro(personId, introId, accept)` (same logic as `POST /api/intros/[id]/respond`) and `recordRating(personId, introId, value, 'call')` (same logic as `POST /api/ratings`, applies the ledger rules). T3 wires them in `lib/dial/bridge.ts`; until then they only log.
- **Intake (T1 ↔ T3):** `/api/checkin` inserts the `intake` job; the tick fills the profile from the transcript, sets `profile_source = 'call'`, then calls `POST /api/match/run`. A failed or empty intake leaves `call_jobs.status = 'failed'` with `result.reason`, so the UI can tell the person to use the web form.
- **Briefings** name the other person only if their `show_name` is true; otherwise "a founder at the event".
- **Kill switch:** `DIAL_DISABLED=1` stops all calling. `DIAL_MAX_CONCURRENT` overrides the limit of 2.
- **Test without the app:** `npm run dial:extract` (canned transcripts) and `npm run dial:call -- intake +1… "Name"` (one real call to your own phone).

---

## 6. Keewano (Track 4)

Setup: sign up → in-app chat send **`#SpeedHacks`** (full access, MCP, seats) → project API key (`KEEWANO_API_KEY`, ingestion) → personal access token (`KEEWANO_PAT`, MCP).
Your Claude Code: `claude mcp add --scope user --transport http keewano https://api.keewano.com/mcp --header "k-token: $KEEWANO_PAT"`.
**Facts:** events take **~5 min to become queryable**. There's **no REST query API** (MCP only). Entity id = `installId` = **UUID** (= `people.id`). One typed value per event. Strings are ≤ 256 chars. Custom event IDs are ≥ 2000 and **append-only** (never change a type; add a new ID).

### 6a. Event catalog (register once via `POST /event/ingress/v1/json/custom`; ingest via `POST /event/ingress/v1/json/in`, `k-token: KEEWANO_API_KEY`)

| ID | Name | Type | Value | Entity |
|---|---|---|---|---|
| 2000 | `checked_in` | string | room slug | person |
| 2001 | `profile_role` | string | role | person |
| 2002 | `profile_source` | string | form / call / seed | person |
| 2003 | `intake_call_seconds` | uint | seconds | person |
| 2004 | `match_proposed` | string | other person id | person (both sides) |
| 2005 | `match_score` | uint | combined 0–100 | person (both sides) |
| 2006 | `intro_proposed` | string | intro id | each introduced person |
| 2007 | `intro_accepted` | string | intro id | responder |
| 2008 | `intro_declined` | string | intro id | responder |
| 2009 | `human_intro_made` | string | intro id | introducer |
| 2010 | `met_scan` | string | other person id | scanner |
| 2011 | `rating_given` | uint | 0–3 | rater |
| 2012 | `rating_received` | uint | 0–3 | ratee |
| 2013 | `give_credit_milli` | uint | delta × 1000 | person |
| 2014 | `take_debit_milli` | uint | \|delta\| × 1000 | person |
| 2015 | `minutes_to_first_valuable_meeting` | uint | minutes | person |
| 2016 | `need_unmet` | string | need (truncated 256) | person |
| 2017 | `darwin_agent_matched` | string | agent name | person |
| 2018 | `briefing_call_result` | string | yes / no / unclear | person |
| 2019 | `baseline_minutes_to_useful_meeting` | uint | minutes (from the "before" survey) | survey respondent |

`lib/keewano.ts` exports `emit(personId, eventId, value)`. It batches, never throws, and uses a stable `dataSessionId` per server instance.
**Backfill:** REST accepts timestamps, so seed profiles can get a plausible afternoon history. Label seed data honestly in the pitch.

### 6b. Load-bearing use #1: follow-through weighting in matching
Every ~5 min (`/api/cron/follow-through`, triggered by the dashboard tick), ask Keewano via MCP: per person, `accepted / proposed` and `met / accepted`. Store `people.follow_through` as a 0–1 value (default 0.5 for anyone new).
The matcher adds a follow-through line per candidate, and the ranking uses `combined × (0.7 + 0.6 × follow_through)`. **Without Keewano, the match ordering changes.** Show that on the dashboard ("reliability-weighted").

### 6c. Load-bearing use #2: "Ask the room"
`/api/ask`: connect to the Keewano MCP from the server with the **MCP TypeScript SDK client** (`StreamableHTTPClientTransport` with `requestInit.headers = {'k-token': KEEWANO_PAT}`). The Anthropic MCP connector only sends Bearer tokens. List the tools and pass them to Claude as tools, then run a tool-use loop (max ~6 turns).
System prompt: answer about the SpeedHacks room using only Keewano data. **Never reveal an individual's take/debit side.** Aggregates are fine. Map person ids to display names via a Supabase lookup tool that respects `show_name`.
**Spike this before 1:30 PM.** It's the riskiest integration. Fallback: Claude Code with Keewano MCP on a laptop during the demo (still a live query).

Judge questions to rehearse: *"Who's the biggest connector tonight?" "Which needs are going unmet?" "How fast do people get to a valuable meeting?" "Do investors or founders give more?"*

---

## 7. Darwin (Track 4)

Env: `DARWIN_API_KEY` (server-only). Register an app → Search API key (shown once). TypeScript SDK. Endpoint `POST https://api.darwin.so/api/v3/search` with `{ query, maxResults (1–20), context }`.
**When:** after `match/run`, for each of the person's needs where no human's `b_fits_a ≥ 6`, emit `need_unmet` and query Darwin (`query` = the need; `context` = who they are). Take the top 1–2 results and store them in `agent_matches` with Darwin's reason and connect details. Emit `darwin_agent_matched`.
**UI:** a secondary "An agent can help with this" card on `/me`, below the human matches. The product stays about people.
**Darwin judging story:** "X% of needs had no human match in the room. Darwin covered Y% of those with zero per-provider integrations." Note one concrete gap we hit (for example, missing coverage for a need category). Act API: skip (needs special access).

---

## 8. Matching (Track 2)

`lib/match.ts`: one Claude call (`claude-sonnet-5-5`, `@anthropic-ai/sdk`) per run. Get structured output with `output_config: { format: { type: "json_schema", schema } }` (objects need `additionalProperties: false`). **Do not use `tool_choice: {type:"tool"}`: `claude-sonnet-5-5` rejects it** (see `lib/dial/extract.ts` for a working example). Use this schema.

Prompt inputs: the target person (full profile) and everyone else in the room as compact lines (`id | role | who (≤120 chars) | needs | gives | follow_through`).

**System prompt (starting point):**
> You are Sevendipity's matching agent at SpeedHacks SF. Find the people the TARGET should meet. Evaluate BOTH directions: how well each candidate satisfies the target's needs (`b_fits_a`), and how well the target satisfies the candidate's needs (`a_fits_b`). Interpret needs and offers semantically, not by keyword. Prefer mutual value. Never propose a one-sided match where either direction is below 6. Return up to 3 matches. For each, write `why_for_a` (to the target) and `why_for_b` (to the candidate): one concrete sentence each, naming the specific need and offer, in a warm, direct tone. Also list which of the target's needs have no candidate scoring ≥ 6 (`unmet_needs`).

**Tool schema:** `{ matches: [{ candidate_id, b_fits_a:0-10, a_fits_b:0-10, why_for_a, why_for_b }], unmet_needs: string[] }`. Compute `combined = round(10 × sqrt(b_fits_a × a_fits_b))` in code. Rank by combined × reliability (§6b).
**After the run:** upsert `matches` (store the pair once with the lower uuid as `a_id`), create `intros` (status `proposed`, `introducer_id = null`) for new pairs, enqueue a `briefing` call for the #1 match if the person opted into calls, and run Darwin for `unmet_needs`.
**Re-matching:** a new person only runs their own match. Because scoring is bilateral, they show up in others' lists through the stored `matches` rows. Optional: re-run the 5 oldest unmatched people every 10 minutes.

### Seed profiles (Track 1)
25 **fictional** people with plausible mutual fits: founders (BrainTech, climate, devtools, fintech), investors (pre-seed to Series A, US/Japan DeepTech), students seeking internships, engineers seeking co-founders, corporate BD, researchers, mentors. Include the concept doc's Founder × Investor BrainTech pair as a guaranteed showcase match. **Don't use or imitate real people.** Mark them `is_seed = true` and give them no phone numbers.

---

## 9. Team tracks (one owner each)

| Track | Owner | Scope | Done when |
|---|---|---|---|
| **T1 Core & data / integrator** | ___ | Next.js scaffold, Supabase project + schema, Vercel deploy, env vars, cookie identity, `/api/checkin`, seed script, merging PRs, keeping `main` deployable | Others can code against a live DB and deployed URL by 11:30 |
| **T2 Matching & ledger brain** | ___ | `lib/match.ts`, `/api/match/run`, intro routes, encounter → met, ratings, `lib/ledger.ts` (§2 rules), reliability weighting hook | The full thin path works by 1:30, and the ledger sums to 0 |
| **T3 Dial** | ___ | Account and credits, Dial table asks (iMessage, concurrency), `lib/dial.ts`, `call_jobs` queue, `/api/calls/tick`, intake/briefing/followup scripts, transcript → Claude extraction | A teammate's phone rings, and the profile appears in under 2 minutes |
| **T4 Keewano + Darwin** | ___ | `#SpeedHacks` access, event registration, `lib/keewano.ts` emit, MCP client spike, `/api/ask`, follow-through refresh, Darwin search + `agent_matches`, before/after metric events, baseline survey | "Ask the room" answers an unscripted question from live data |
| **T5 Frontend & demo** | ___ | All pages (§4), mobile-first UI, personal QR (`qrcode` lib), dashboard with Supabase Realtime, the event QR poster, **recruiting real check-ins from 2 PM**, pitch deck (≤ 4 slides), demo script, backup video | A judge can go from QR scan to seeing their match with no help |

**Everyone:** run **Alike** in your Claude Code sessions (one-command install) so all five agents share decisions. Read `CLAUDE.md`.

## 10. Timeline (PT)

| Time | Checkpoint |
|---|---|
| 11:00 | Plan read. Accounts created: Supabase, Vercel, Dial (+credits), Keewano (`#SpeedHacks`), Darwin, Anthropic key. T3 at the Dial table |
| **11:30** | **Schema and API contracts frozen.** Deployed hello-world with DB connected. Seed loaded |
| 12:30 | Matching returns bilateral JSON for a seed person. A first Dial call places. Keewano events land. Check-in page renders |
| **1:30** | **Thin path end to end on prod:** web check-in → matches → accept both → QR "met" → rate → ledger. Keewano MCP spike resolved (works or fallback chosen) |
| **2:00** | **Start recruiting real check-ins** (poster plus walking around). Run the baseline survey ("how long until you met someone useful today?") → event 2019 |
| 3:30 | Intake and briefing calls live. Dashboard realtime. Human "Introduce two people" works. Darwin cards appear |
| **5:00** | **All integrations live.** "Ask the room" works. Follow-through weighting on |
| **6:30** | **Cut what isn't working** (cut order below). Polish UI and copy |
| **8:00** | **Code freeze.** Only demo-critical fixes after this |
| 8:15 | Record backup video of the exact demo flow |
| 8:30 | Two full rehearsals with a teammate playing the judge. Submit before 9:00 |

**Cut order if behind:** (1) follow-up rating calls (rate on the web) → (2) value-flow ratings 2b (keep introducer stages) → (3) follow-through weighting (keep Ask the room) → (4) Darwin. **Never cut:** check-in → match → intro → met → ledger → dashboard, the live Dial call, and the live Keewano query.

---

## 11. Demo script (~3 min, live)

1. **Hook (20s):** "At every event you spend three hours talking to the wrong people. The investor you needed was twenty feet away. And the person who introduced you? They got nothing."
2. **Live check-in (40s):** the judge scans the QR code and taps "Let my agent interview me." **Their phone rings.** Sevendipity asks 3 questions. Profile and top match appear on the big screen with the two-way *why you should meet*.
3. **The ledger (40s):** show a human intro from this afternoon moving accepted (+0.2) → met via QR (+0.5) → both rated valuable (+1.0). Show Top Connectors. "We show who gives. We never shame who takes. Your balance is private, because a student shouldn't be penalized for needing help."
4. **Ask the room (30s):** the judge asks anything, and Keewano answers live from tonight's data.
5. **Darwin (15s):** "No one in this room could help Maya with SAFE docs, so Sevendipity found an agent."
6. **Metric + vision (35s):** today's real numbers (median minutes to first valuable meeting vs. the baseline survey, unmet needs covered). "LinkedIn owns professional identity. Sevendipity owns professional reciprocity. Every encounter, intro and outcome builds a trust graph of who creates value for whom."

**Pre-demo checklist:** dashboard open and ticking, the judge's phone number format tested, Dial credits present, Keewano has ≥ 5 min of fresh events, backup video ready, a seed BrainTech Founder × Investor match visible.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Dial's 2-call limit or 5-min cap hits during the demo | Queue; keep calls short; ask Dial to raise the limit; web fallback for every step; keep the dashboard ticking |
| SMS to real phones unavailable | Voice only; ask about iMessage |
| Keewano's 5-min ingestion lag | Supabase is the live source of truth; Keewano is for analytics and weighting; generate real events from 2 PM |
| Keewano MCP header auth from the server | MCP SDK client with a custom header; fallback to Claude Code on a laptop |
| Too few real participants | 25 seed profiles plus recruiting from 2 PM; the showcase seed pair |
| Claude latency on check-in | Run matching async after check-in; the UI shows "your agent is finding people…" and updates via Realtime |
| Venue Wi-Fi | Phone hotspot for the demo laptop |
| Privacy | Phones are never sent to the client; names are opt-in; take side is never shown publicly or in Ask-the-room answers |

## 13. Env vars

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
DIAL_API_KEY=
DIAL_NUMBER=
KEEWANO_API_KEY=        # ingestion (project key)
KEEWANO_PAT=            # MCP (personal access token)
DARWIN_API_KEY=
COOKIE_SECRET=
```
None of these except `NEXT_PUBLIC_*` may reach the browser.

## 14. Out of scope today (roadmap slide)
Bluetooth/geo proximity · graph-based trust propagation (`Social Capital = α·Give + β·Outcome + γ·Trust + δ·NetworkQuality + ε·Reciprocity`) · anti-sybil/collusion detection · context-specific reputation per domain · investor profile metrics (Founder Helpful Score, etc.) · multi-event portability · outcome verification for investments and hires.
