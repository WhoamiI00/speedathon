"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MeMatch } from "@/lib/me";
import { postJSON } from "./api";

export function MatchCard({ m, first }: { m: MeMatch; first: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    if (!m.introId) return;
    setBusy(true);
    setError(null);
    const r = await postJSON(`/api/intros/${m.introId}/respond`, { accept });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const waiting = m.iAccepted === true && m.theyAccepted !== true && m.status === "proposed";
  const bothYes = m.status === "accepted";
  const met = m.status === "met" || m.status === "rated";
  const canRespond = m.introId && m.iAccepted === null && m.status === "proposed";

  return (
    <article className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-11.5 shrink-0 items-center justify-center rounded-full font-semibold ${first ? "bg-gold" : "bg-[#DCE6F5]"}`}
        >
          {m.other.initials ?? "?"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{m.other.label}</span>
          {m.other.role && <span className="text-[13px] text-subtle">{m.other.role}</span>}
        </div>
        {m.combined !== null && (
          <div className="flex flex-col items-end">
            <span className="font-mono text-lg">{m.combined}</span>
            <span className="text-[11px] text-subtle">fit</span>
          </div>
        )}
      </div>

      {m.introducedBy && <p className="text-[13px] text-subtle">Introduced by {m.introducedBy}</p>}
      {m.why && (
        <p className="text-[15px] leading-normal">
          <span className="font-semibold">Why meet: </span>
          {m.why}
        </p>
      )}
      {m.theyHelpMe !== null && m.iHelpThem !== null && (
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-chip px-2 py-1 text-xs text-[#3F434B]">They help you {m.theyHelpMe}/10</span>
          <span className="rounded-full bg-chip px-2 py-1 text-xs text-[#3F434B]">You help them {m.iHelpThem}/10</span>
        </div>
      )}

      {canRespond && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => respond(true)}
            className="h-11.5 flex-1 rounded-xl bg-ink font-semibold text-white disabled:opacity-60"
          >
            Yes, introduce us
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => respond(false)}
            className="h-11.5 rounded-xl border border-line-strong bg-card px-4 font-medium disabled:opacity-60"
          >
            Not now
          </button>
        </div>
      )}
      {waiting && <p className="rounded-xl bg-chip p-3 text-sm">You said yes. Waiting for them to accept.</p>}
      {bothYes && (
        <p className="rounded-xl bg-gold/25 p-3 text-sm leading-snug">
          <span className="font-semibold">You both said yes.</span> Find each other and scan each other’s QR to confirm you met.
        </p>
      )}
      {met && <p className="rounded-xl bg-chip p-3 text-sm">You met. Rate it below when you’re ready.</p>}
      {!m.introId && <p className="text-[13px] text-subtle">Your agent is setting up this intro…</p>}
      {error && (
        <p role="alert" className="text-sm text-[#8A1C1C]">
          {error}
        </p>
      )}
    </article>
  );
}
