"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { browserDb } from "@/lib/supabase/browser";

// Re-renders the server page when the room changes (Supabase Realtime), with a slow poll as a fallback
// for flaky venue Wi-Fi. Tables listed here must be in the realtime publication and anon-readable.
export function LiveRefresh({ tables: list, pollMs = 20000 }: { tables: string[]; pollMs?: number }) {
  const router = useRouter();
  const key = list.join(",");

  useEffect(() => {
    const tables = key.split(",");
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 600);
    };

    let cleanup = () => {};
    try {
      const channel = browserDb().channel(`live-${tables.join("-")}`);
      for (const table of tables) channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
      channel.subscribe();
      cleanup = () => {
        browserDb().removeChannel(channel);
      };
    } catch {
      // No Supabase env in the browser: polling below still keeps the page fresh.
    }
    const poll = setInterval(() => router.refresh(), pollMs);
    return () => {
      cleanup();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
  }, [router, key, pollMs]);

  return null;
}
