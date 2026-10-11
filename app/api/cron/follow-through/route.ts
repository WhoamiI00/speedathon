import { refreshFollowThrough } from "@/lib/followthrough";

export const maxDuration = 60;

// POST /api/cron/follow-through  → {people, updated}   (Owner: T4)
// Recomputes people.follow_through (PLAN §6b). The dashboard pings this every ~5 min. Idempotent and safe to call anytime.
export async function POST() {
  try {
    return Response.json(await refreshFollowThrough());
  } catch (e) {
    console.error("[cron/follow-through]", e);
    return Response.json({ error: "refresh failed" }, { status: 500 });
  }
}
