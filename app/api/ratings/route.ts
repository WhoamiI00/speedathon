import { requirePersonId } from "@/lib/session";
import { errorResponse, jsonBody, recordRating } from "@/lib/ledger";

// POST /api/ratings  {intro_id, value 0-3} → {rating, intro_closed}. The rater is the cookie (PLAN §2b, §4).
export async function POST(req: Request) {
  const pid = await requirePersonId();
  if (pid instanceof Response) return pid;
  const body = await jsonBody(req);
  try {
    return Response.json(await recordRating(pid, String(body.intro_id ?? ""), Number(body.value), "web"));
  } catch (e) {
    return errorResponse(e, "ratings");
  }
}
