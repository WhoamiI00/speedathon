import { randomUUID } from "node:crypto";
import { emit, EV } from "@/lib/keewano";
import { getPersonId } from "@/lib/session";

// POST /api/survey/baseline  {minutes}  (Owner: T4; route added for event 2019, PLAN §10 "baseline survey")
// "How long (minutes) until you met someone useful at an event like this?" Works before check-in:
// without a cookie the answer is recorded under a fresh anonymous UUID (Keewano entities must be UUIDs).
export async function POST(req: Request) {
  let minutes = NaN;
  try {
    minutes = Number(((await req.json()) as { minutes?: unknown }).minutes);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
    return Response.json({ error: "minutes must be a number between 0 and 1440" }, { status: 400 });
  }
  emit((await getPersonId()) ?? randomUUID(), EV.baseline_minutes_to_useful_meeting, Math.round(minutes));
  return Response.json({ ok: true });
}
