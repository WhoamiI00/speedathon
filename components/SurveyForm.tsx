"use client";

import Link from "next/link";
import { useState } from "react";
import { postJSON } from "@/components/me/api";

const CHOICES: [string, number][] = [
  ["Under 15 min", 10],
  ["About 30 min", 30],
  ["About an hour", 60],
  ["2 hours", 120],
  ["3+ hours", 180],
  ["Never", 480],
];

// Baseline survey (PLAN §10, Keewano event 2019): "how long until you met someone useful at events like this?"
export function SurveyForm() {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (minutes === null) return setError("Pick the closest answer.");
    setBusy(true);
    setError(null);
    const r = await postJSON("/api/survey/baseline", { minutes });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(true);
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
        <p className="font-display text-xl font-semibold">Thanks, that helps us measure what changes tonight.</p>
        <Link href="/r/speedhacks" className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white">
          Check in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-2 gap-2.5">
        <legend className="sr-only">How long until you met someone useful</legend>
        {CHOICES.map(([label, m]) => (
          <label
            key={label}
            className={`flex h-12 cursor-pointer items-center justify-center rounded-xl border text-base font-medium ${
              minutes === m ? "border-ink bg-ink text-white" : "border-line-strong bg-card text-ink"
            }`}
          >
            <input type="radio" name="minutes" value={m} checked={minutes === m} onChange={() => setMinutes(m)} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-[#8A1C1C]">
          {error}
        </p>
      )}
      <button type="button" onClick={submit} disabled={busy} className="h-12 rounded-xl bg-ink font-semibold text-white disabled:opacity-60">
        {busy ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
