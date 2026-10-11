"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { input, primaryBtn, secondaryBtn } from "@/app/ui";

async function call(path: string, body: unknown): Promise<string | null> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.error ?? "Something went wrong";
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const err = await call(path, body);
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
    return !err;
  };
  return { busy, error, run };
}

export function RespondButtons({ introId }: { introId: string }) {
  const { busy, error, run } = useAction();
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <button className={primaryBtn} disabled={busy} onClick={() => run(`/api/intros/${introId}/respond`, { accept: true })}>
          Yes, introduce us
        </button>
        <button className={secondaryBtn} disabled={busy} onClick={() => run(`/api/intros/${introId}/respond`, { accept: false })}>
          Not now
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

const SCALE = ["Not at all", "A little", "Quite a bit", "A lot"];

export function RateButtons({ introId }: { introId: string }) {
  const { busy, error, run } = useAction();
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-sm font-medium">How much did they help you?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SCALE.map((label, value) => (
          <button key={value} className={secondaryBtn} disabled={busy} onClick={() => run("/api/ratings", { intro_id: introId, value })}>
            {value} · {label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function IntroduceForm({ people }: { people: { id: string; label: string }[] }) {
  const { busy, error, run } = useAction();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(false);
        if (await run("/api/intros", { a_id: a, b_id: b, note })) {
          setA("");
          setB("");
          setNote("");
          setDone(true);
        }
      }}
    >
      {[
        [a, setA],
        [b, setB],
      ].map(([v, set], i) => (
        <select key={i} className={input} value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} required>
          <option value="">{i === 0 ? "Choose the first person…" : "…and who they should meet"}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      ))}
      <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why should they meet? (optional)" maxLength={500} />
      <button className={primaryBtn} disabled={busy || !a || !b}>
        Introduce them
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-green-700 dark:text-green-400">Sent. You earn credit as they accept, meet and rate it.</p>}
    </form>
  );
}
