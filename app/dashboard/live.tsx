"use client";

import { useEffect, useState } from "react";
import { input, primaryBtn } from "@/app/ui";

/**
 * The always-open big screen drives background work (PLAN §5): the Dial call queue every 5 s and the
 * Keewano follow-through refresh every 5 min. Missing routes (404) are ignored.
 */
export function Ticker() {
  const [last, setLast] = useState<string>("starting…");
  useEffect(() => {
    const tick = () =>
      fetch("/api/calls/tick", { method: "POST" })
        .then((r) => r.json())
        .then((j) => setLast(j.skipped ? `calls: ${j.skipped}` : `calls: ${j.started ?? 0} started, ${j.reconciled ?? 0} in progress`))
        .catch(() => setLast("calls: tick failed"));
    const follow = () => fetch("/api/cron/follow-through", { method: "POST" }).catch(() => {});
    tick();
    follow();
    const a = setInterval(tick, 5000);
    const b = setInterval(follow, 5 * 60_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);
  return <p className="text-xs text-zinc-500">{last}</p>;
}

export function AskRoom() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setAnswer(null);
        try {
          const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
          const j = await r.json().catch(() => ({}));
          setAnswer(r.status === 404 ? "Ask the room isn't deployed yet." : (j.answer ?? j.error ?? "No answer"));
        } catch {
          setAnswer("Network error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-2">
        <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who's the biggest connector tonight?" required />
        <button className={primaryBtn} disabled={busy}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
      {answer && <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">{answer}</p>}
    </form>
  );
}
