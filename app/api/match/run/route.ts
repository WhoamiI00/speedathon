import { requirePersonId } from "@/lib/session";
import { runMatch } from "@/lib/match";

export const maxDuration = 60;

// POST /api/match/run  {person_id?} → {person_id, matches, unmet_needs}
// Cookie-only: you can re-run your own matching, nobody else's. Server code (check-in, call tick)
// calls runMatch() directly instead of this route, so person_id is never trusted from the body.
export async function POST(req: Request) {
  const pid = await requirePersonId();
  if (pid instanceof Response) return pid;

  let body: { person_id?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  if (body.person_id !== undefined && body.person_id !== pid) {
    return Response.json({ error: "you can only run your own matching" }, { status: 403 });
  }

  try {
    return Response.json(await runMatch(pid));
  } catch (e) {
    console.error("[match/run]", e);
    return Response.json({ error: "matching failed" }, { status: 500 });
  }
}
