"use client";

import { useEffect } from "react";

// PLAN §6b: refresh people.follow_through about every 5 minutes. Like CallTicker, the always-open big screen is the cron.
export function FollowThroughTicker({ everyMs = 5 * 60_000 }: { everyMs?: number }) {
  useEffect(() => {
    const run = () => fetch("/api/cron/follow-through", { method: "POST" }).catch(() => {});
    run();
    const id = setInterval(run, everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return null;
}
