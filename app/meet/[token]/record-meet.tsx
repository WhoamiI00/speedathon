"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { muted, primaryBtn } from "@/app/ui";

export default function RecordMeet({ token }: { token: string }) {
  const sent = useRef(false);
  const [state, setState] = useState<{ met: boolean } | { error: string } | null>(null);

  useEffect(() => {
    if (sent.current) return; // StrictMode runs effects twice in dev
    sent.current = true;
    fetch("/api/encounters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ qr_token: token }) })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        setState(r.ok ? { met: !!j.met_intro } : { error: j.error ?? "Couldn't record the scan" });
      })
      .catch(() => setState({ error: "Network error, try again" }));
  }, [token]);

  if (!state) return <p className={muted}>Recording…</p>;
  if ("error" in state) return <p className="text-red-600">{state.error}</p>;
  return (
    <>
      <p className="text-lg">{state.met ? "🤝 You met! Your intro is now marked as met." : "Saved. Nice to meet them!"}</p>
      {state.met && <p className={muted}>Once you&apos;ve talked, rate how much they helped you.</p>}
      <Link className={`${primaryBtn} py-3`} href="/me">
        Back to my page
      </Link>
    </>
  );
}
