import { requirePersonId } from "@/lib/session";
import { createHumanIntro } from "@/lib/intros";
import { errorResponse, jsonBody } from "@/lib/ledger";

// POST /api/intros  {a_id, b_id, note?} → intro. The introducer is the cookie (PLAN §4).
export async function POST(req: Request) {
  const pid = await requirePersonId();
  if (pid instanceof Response) return pid;
  const body = await jsonBody(req);
  try {
    const intro = await createHumanIntro(pid, String(body.a_id ?? ""), String(body.b_id ?? ""), typeof body.note === "string" ? body.note : null);
    return Response.json({ intro });
  } catch (e) {
    return errorResponse(e, "intros");
  }
}
