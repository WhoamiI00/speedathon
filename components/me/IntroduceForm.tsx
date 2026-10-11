"use client";

import { useState } from "react";
import { postJSON } from "./api";

const select = "h-12 w-full rounded-xl border border-line-strong bg-card px-3 text-base";

export function IntroduceForm({ people }: { people: { id: string; label: string }[] }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!a || !b || a === b) return setMsg({ ok: false, text: "Choose two different people." });
    setBusy(true);
    setMsg(null);
    const r = await postJSON("/api/intros", { a_id: a, b_id: b, note });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setA("");
    setB("");
    setNote("");
    setMsg({ ok: true, text: "Intro sent. You’ll earn credit as it works out." });
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-4">
      <h2 className="font-display text-xl font-semibold">Introduce two people</h2>
      <p className="text-sm leading-snug text-muted">
        Know two people who should meet? You earn credit as the intro works out: when they accept, when they meet, and when both say it
        helped.
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        First person
        <select className={select} value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Choose someone in the room</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Second person
        <select className={select} value={b} onChange={(e) => setB(e.target.value)}>
          <option value="">Choose someone in the room</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Why they should meet
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="One sentence for both of them"
          className="w-full resize-none rounded-xl border border-line-strong bg-card px-3.5 py-3 text-base"
        />
      </label>
      <button type="submit" disabled={busy} className="h-12.5 rounded-2xl bg-ink font-semibold text-white disabled:opacity-60">
        {busy ? "Sending…" : "Send intro"}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-good" : "text-[#8A1C1C]"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
