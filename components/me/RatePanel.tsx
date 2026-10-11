"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJSON } from "./api";

const LABELS = ["Not at all", "A little", "A lot", "Hugely"];

export function RatePanel({ introId, label }: { introId: string; label: string }) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (value === null) return;
    setBusy(true);
    setError(null);
    const r = await postJSON("/api/ratings", { intro_id: introId, value });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-4">
      <h2 className="font-display text-xl font-semibold">Rate your meeting</h2>
      <p className="text-[15px] leading-snug">
        How much did <span className="font-semibold">{label}</span> help you?
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {LABELS.map((l, i) => {
          const on = value === i;
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              onClick={() => setValue(i)}
              className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl ${on ? "border-2 border-ink bg-gold" : "border border-line-strong bg-card"}`}
            >
              <span className="font-mono text-lg">{i}</span>
              <span className="text-[11px] text-[#3F434B]">{l}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={value === null || busy}
        onClick={send}
        className="h-12 rounded-xl bg-ink font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Sending…" : "Send rating"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[#8A1C1C]">
          {error}
        </p>
      )}
      <span className="text-[13px] text-subtle">Or skip this. Your agent may call later to ask.</span>
    </section>
  );
}
