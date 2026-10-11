"use client";

import { useState } from "react";
import { postJSON } from "@/components/me/api";

// "Ask the room" (PLAN §6c): POST /api/ask {question} → {answer}, answered by T4's Claude + Keewano agent.
export function AskRoom() {
  const [q, setQ] = useState("Who’s the biggest connector tonight?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    const r = await postJSON("/api/ask", { question: q });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setAnswer((r.data as { answer?: string }).answer ?? "No answer yet.");
  }

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[22px] bg-night-text px-5 py-4.5 text-ink">
      <h2 className="font-display text-[22px] font-bold">Ask the room</h2>
      <form onSubmit={ask} className="flex min-w-0 flex-[1_1_320px] gap-2">
        <label className="sr-only" htmlFor="ask-q">
          Ask a question about tonight
        </label>
        <input
          id="ask-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-13 min-w-0 flex-1 rounded-2xl border border-[#C9C5BB] bg-white px-4 text-[17px]"
        />
        <button type="submit" disabled={busy} className="h-13 rounded-2xl bg-ink px-5.5 font-semibold text-white disabled:opacity-60">
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
      {(answer || error) && (
        <p role={error ? "alert" : "status"} className={`basis-full text-[17px] leading-normal ${error ? "text-[#8A1C1C]" : ""}`}>
          {error ?? answer} {!error && <span className="text-[13px] text-muted">Answered live from tonight’s data.</span>}
        </p>
      )}
    </section>
  );
}
