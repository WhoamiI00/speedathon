# Sevendipity (SpeedHacks SF hackathon, Oct 11 2026)

Read `PLAN.md` before doing anything. It holds the locked product decisions, schema, API contracts, Keewano event IDs, ledger rules, team tracks and timeline.

## Rules for every agent on this repo
- Stack: Next.js App Router + TypeScript, Supabase, deployed on Vercel. LLM: Claude `claude-sonnet-5-5` by default (`ANTHROPIC_API_KEY`), Gemini only if `LLM_PROVIDER=gemini`. All LLM calls go through `generateJSON()` in `lib/llm.ts`; never call a provider directly.
- Stay inside your track's files (PLAN.md §9). The schema (§3) and route contracts (§4) are frozen. Changes go through Track 1 and must be announced to the team.
- Every state change calls `emit()` from `lib/keewano.ts` with an event ID from PLAN.md §6a. `emit` never throws. Never reuse or retype an event ID; add a new one.
- Secrets are server-only. Only `NEXT_PUBLIC_*` vars may be read in client components. Never send `people.phone` to the browser.
- Never expose anyone's balance or take/debit side publicly (dashboard, `/p/[id]`, Ask-the-room). Only the owner sees their balance on `/me`.
- Every Dial call step needs a web fallback.
- Keep `main` deployable. Small PRs, merged by Track 1.
- Speed over polish until the 1:30 PM thin path works. Cut order is in PLAN.md §10.
