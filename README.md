# Giverank

SpeedHacks SF, Oct 11 2026. Read [PLAN.md](PLAN.md) and [CLAUDE.md](CLAUDE.md) first.

## Run locally
```bash
npm install
cp .env.example .env.local   # ask T1 for values
npm run dev                  # http://localhost:3000, health: /api/health
```

## What T1 already provides
| Thing | Where | Use |
|---|---|---|
| Schema (frozen) | `supabase/schema.sql` | PLAN §3 + `public_people` view, RLS, Realtime |
| Server DB client (service role) | `lib/supabase/server.ts` → `db()` | route handlers / server components only |
| Browser DB client (anon, read-only) | `lib/supabase/browser.ts` → `browserDb()` | dashboard Realtime; reads `public_givers`, `public_people`, `matches`, `intros`, `encounters`, `ledger_entries` (positive deltas only) |
| Identity cookie | `lib/session.ts` → `getPersonId()`, `setPersonId()`, `requirePersonId()` | who is calling |
| Row types | `lib/types.ts` | |
| Keewano emit | `lib/keewano.ts` → `emit(personId, EV.x, value)` | stub; T4 fills in the transport |
| LLM calls | `lib/llm.ts` → `generateJSON()` | every structured LLM call goes through here. Claude `claude-sonnet-5-5` by default; `LLM_PROVIDER=gemini` switches to Gemini |
| Check-in | `POST /api/checkin` | PLAN §4 (+ optional `role`) |
| Health | `GET /api/health` | DB + which env vars are set |
| Seed | `npm run seed` | 25 fictional people, idempotent |

## What T2 provides
| Thing | Where | Use |
|---|---|---|
| Bilateral matching | `lib/match.ts` → `runMatch(personId)` | one LLM call per run; stores `matches`, creates proposed AI `intros`, queues a briefing call for the #1 match, flags unmet needs |
| Run matching | `POST /api/match/run` | cookie-only: you can re-run your own matching. Server code calls `runMatch()` directly |
| Human intro | `POST /api/intros` `{a_id,b_id,note}` → `lib/intros.ts` `createHumanIntro` | introducer = cookie; one live intro per pair |
| Accept / decline | `POST /api/intros/[id]/respond` `{accept}` → `respondToIntro` | both accept → `accepted`, introducer +0.2 |
| QR "met" | `POST /api/encounters` `{qr_token}` → `recordEncounter` | logs every scan; accepted intro → `met`, +0.3, queues follow-up calls |
| Rate | `POST /api/ratings` `{intro_id,value 0-3}` → `lib/ledger.ts` `recordRating` | value flow r/3; both rated → `rated`; both ≥ 2 → +0.5 |

The ledger always sums to 0. Stage transitions use conditional updates, so each stage pays once even under concurrent requests.

## What T4 provides (Keewano + Darwin)
| Thing | Where | Use |
|---|---|---|
| Event transport | `lib/keewano.ts` → `emit(personId, EV.x, value)` | buffers and batches to Keewano's JSON ingest after the response; registers the event map once per instance; never throws. Without `KEEWANO_API_KEY` it only logs |
| Register events | `npm run keewano:register` (`-- --ping` sends a test event) | optional: registration also happens automatically on first send |
| Ask the room | `POST /api/ask {question}` → `{answer}` | Claude + Keewano MCP tools (`lib/ask.ts`, `lib/keewano-mcp.ts`); needs `KEEWANO_PAT`. Aggregates only, never a person's take/debit |
| Follow-through | `POST /api/cron/follow-through` | recomputes `people.follow_through` from intro history (`lib/followthrough.ts`). The matcher already weights by it |
| Baseline survey | `POST /api/survey/baseline {minutes}` | emits event 2019 (works before check-in) |
| Darwin | `lib/darwin.ts`, called from `runMatch()` | agent cards for unmet needs → `agent_matches`; needs `DARWIN_API_KEY` |

## What T3 provides (Dial calls)
Outbound voice calls through Dial, run from a queue in `call_jobs`. Details: PLAN §5.

| Thing | Where | Use |
|---|---|---|
| Queue worker | `lib/dial/queue.ts` → `tick()` | reconciles in-flight calls, starts queued ones (max 2 at a time), applies results |
| Tick route | `POST /api/calls/tick` | the `/dashboard` pings this every ~5 s. Backup: `npm run dial:tick` |
| Schedule a call | `lib/dial/enqueue.ts` → `enqueueCall({ personId, kind, introId, delayMinutes })` | only for people who chose the interview and have a phone; dedupes per person + intro + kind |
| Call scripts | `lib/dial/scripts.ts` | `intake`, `briefing`, `followup` |
| Transcript → result | `lib/dial/extract.ts` | intake profile, briefing yes/no/unclear, follow-up rating 0-3 |
| Hand results to T2 | `lib/dial/bridge.ts` | calls T2's `respondToIntro` and `recordRating` (`source = call`) |

Call flow: check-in with "interview" queues an `intake` job → tick dials → transcript is extracted into the profile (`profile_source = 'call'`) → `runMatch()` runs → briefing call for the top match. A failed or empty call sets `call_jobs.status = 'failed'` with `result.reason`; the web form stays the fallback.

Env: `DIAL_API_KEY`, `DIAL_NUMBER`, plus the LLM key. `DIAL_DISABLED=1` stops all calling; `DIAL_MAX_CONCURRENT` overrides the limit of 2. Dial calls US numbers only, 5 min max.

### Testing Dial
```bash
npm run dial:extract                                  # canned transcripts → extraction checks (LLM key only, no calls)
npm run dial:call -- intake +1XXXXXXXXXX "Your Name" # one real call to a phone you control (also: briefing, followup)
npm run dial:tick                                     # loop POSTing /api/calls/tick every 5 s
```
Only call people who agreed to be called (yourself or teammates).

## Status
Done: check-in, seed data, matching, Dial queue with intake / briefing / follow-up calls.
Open: T4 Keewano transport, Ask the room, Darwin; T5 all pages. See PLAN §9 and §10.

## Rules
- The browser can't read `people` at all (phones). Use `public_people` / `public_givers`, or a server component with `db()`.
- `cacheComponents` is off on purpose: read cookies anywhere on the server without Suspense.
- Small PRs into `main`; T1 merges. Run `npm run typecheck && npm run lint && npm run build` before opening one.
