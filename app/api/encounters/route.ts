import { requirePersonId } from "@/lib/session";
import { recordEncounter } from "@/lib/intros";
import { errorResponse, jsonBody } from "@/lib/ledger";

// POST /api/encounters  {qr_token} → {encounter_id, met_intro}. The scanner is the cookie (PLAN §4).
export async function POST(req: Request) {
  const pid = await requirePersonId();
  if (pid instanceof Response) return pid;
  const body = await jsonBody(req);
  const token = typeof body.qr_token === "string" ? body.qr_token.trim() : "";
  if (!token) return Response.json({ error: "qr_token is required" }, { status: 400 });
  try {
    return Response.json(await recordEncounter(pid, token));
  } catch (e) {
    return errorResponse(e, "encounters");
  }
}
