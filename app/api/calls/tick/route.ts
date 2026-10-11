import { after } from "next/server";
import { tick } from "@/lib/dial/queue";

export const maxDuration = 60;

// POST /api/calls/tick (Owner: T3). Processes the call queue: reconcile in-flight calls, start queued ones
// (≤ DIAL_MAX_CONCURRENT at a time). The always-open /dashboard pings this every ~5s.
// Backup driver:  while true; do curl -s -X POST $URL/api/calls/tick; sleep 5; done
export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const report = await tick(origin, (fn) => after(fn));
    return Response.json(report);
  } catch (e) {
    console.error("[calls/tick]", e);
    return Response.json({ error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}
