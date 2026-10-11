import { requirePersonId } from "@/lib/session";
import { respondToIntro } from "@/lib/intros";
import { errorResponse, jsonBody } from "@/lib/ledger";

// POST /api/intros/[id]/respond  {accept: boolean} → intro. Only the two people in the intro may answer.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const pid = await requirePersonId();
  if (pid instanceof Response) return pid;
  const { id } = await params;
  const body = await jsonBody(req);
  if (typeof body.accept !== "boolean") return Response.json({ error: "accept must be true or false" }, { status: 400 });
  try {
    return Response.json({ intro: await respondToIntro(pid, id, body.accept) });
  } catch (e) {
    return errorResponse(e, "intros/respond");
  }
}
