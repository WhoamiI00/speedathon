import "server-only";
import { respondToIntro as t2Respond } from "@/lib/intros";
import { IntroError, recordRating as t2Rate } from "@/lib/ledger";

// Owner: T3. The ONLY place Dial results are handed to T2's intro/ledger logic (contract in PLAN.md §5).
// A result that no longer applies (intro already answered/declined, already rated) is logged, not thrown:
// the call itself succeeded and its result is still stored on call_jobs.result.

export async function respondToIntro(personId: string, introId: string, accept: boolean): Promise<void> {
  try {
    await t2Respond(personId, introId, accept);
  } catch (e) {
    if (e instanceof IntroError) console.warn("[dial/bridge] respond skipped:", e.message, { personId, introId, accept });
    else throw e;
  }
}

export async function recordRating(personId: string, introId: string, value: 0 | 1 | 2 | 3): Promise<void> {
  try {
    await t2Rate(personId, introId, value, "call");
  } catch (e) {
    if (e instanceof IntroError) console.warn("[dial/bridge] rating skipped:", e.message, { personId, introId, value });
    else throw e;
  }
}
