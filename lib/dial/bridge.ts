import "server-only";

// Owner: T3. The ONLY place Dial results are handed to T2's intro/ledger logic.
//
// Agreed contract with T2 (see PLAN.md §5). T2 exports these two functions and we swap the bodies below:
//
//   respondToIntro(personId, introId, accept)            // same logic as POST /api/intros/[id]/respond
//   recordRating(personId, introId, value, source)       // same logic as POST /api/ratings (applies ledger rules)
//
// Until T2 lands them these only log, so a call result is never lost: it is also stored on
// call_jobs.result, and the web flow keeps working as the fallback.

export async function respondToIntro(personId: string, introId: string, accept: boolean): Promise<void> {
  // TODO(T2): import { respondToIntro as t2Respond } from "@/lib/intros"; return t2Respond(personId, introId, accept);
  console.warn("[dial/bridge] respondToIntro not wired to T2 yet", { personId, introId, accept });
}

export async function recordRating(personId: string, introId: string, value: 0 | 1 | 2 | 3): Promise<void> {
  // TODO(T2): import { recordRating as t2Rate } from "@/lib/ledger"; return t2Rate(personId, introId, value, "call");
  console.warn("[dial/bridge] recordRating not wired to T2 yet", { personId, introId, value });
}
