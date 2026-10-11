import { after } from "next/server";
import { tick } from "@/lib/dial/queue";
import { CHAIN_GAP_MS, tickUrl } from "@/lib/dial/nudge";

export const maxDuration = 60;

// POST /api/calls/tick (Owner: T3). Processes the call queue: reconcile in-flight calls, start queued ones
// (≤ DIAL_MAX_CONCURRENT at a time). The always-open /dashboard pings this every ~5s.
// Backup driver:  while true; do curl -s -X POST $URL/api/calls/tick; sleep 5; done
//
// ?chain=N (set by nudgeCalls when a call is queued): after responding, wait 5 s and tick again with N-1,
// as long as a call is in flight or was just started. This is what finishes a call when no dashboard is open.
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const hops = Math.min(60, Math.max(0, Number(url.searchParams.get("chain")) || 0));
    const report = await tick((fn) => after(fn));

    // Keep the chain alive while a call is in flight or due soon (retries wait 1-2 min). A skipped tick means another
    // ticker (the dashboard) is already handling the queue, so keep going as well; DIAL_DISABLED ends the chain.
    const active = report.pending > 0 || report.skipped === "tick already running";
    if (hops > 1 && active) {
      after(async () => {
        await new Promise((r) => setTimeout(r, CHAIN_GAP_MS));
        await fetch(tickUrl(url.origin, hops - 1), { method: "POST", signal: AbortSignal.timeout(55_000) }).catch(() => {});
      });
    }
    return Response.json(report);
  } catch (e) {
    console.error("[calls/tick]", e);
    return Response.json({ error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}
