"use client";

import { useEffect } from "react";

// PLAN §5: the always-open big screen acts as the cron for the Dial call queue (Vercel Hobby cron is daily).
// Open the dashboard with ?tick=0 on any second screen so only one tab drives calls.
export function CallTicker({ everyMs = 5000 }: { everyMs?: number }) {
  useEffect(() => {
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await fetch("/api/calls/tick", { method: "POST" });
      } catch {
        // Next tick retries.
      } finally {
        busy = false;
      }
    }, everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return null;
}
