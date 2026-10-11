"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While a person waits for their interview call, drive the call queue from their own page: tick every 5 s
// and refresh, so the call is started and its result applied even when no /dashboard is open and the
// server-side chain (lib/dial/nudge.ts) didn't carry it. Unmounts as soon as the page stops saying "pending".
export function CallWaiter({ everyMs = 5000, giveUpAfterMs = 6 * 60_000 }: { everyMs?: number; giveUpAfterMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const started = Date.now();
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      if (Date.now() - started > giveUpAfterMs) return clearInterval(id);
      busy = true;
      try {
        await fetch("/api/calls/tick", { method: "POST" });
        router.refresh();
      } catch {
        // next interval retries
      } finally {
        busy = false;
      }
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, giveUpAfterMs]);

  return null;
}
