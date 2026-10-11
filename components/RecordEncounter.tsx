"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postJSON } from "@/components/me/api";

// Fires POST /api/encounters once when the scan page opens (the scanner's cookie identifies them).
export function RecordEncounter({ qrToken }: { qrToken: string }) {
  const router = useRouter();
  const sent = useRef(false);
  const [state, setState] = useState<"saving" | "saved" | { error: string }>("saving");

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    postJSON("/api/encounters", { qr_token: qrToken }).then((r) => {
      if (r.ok) {
        setState("saved");
        router.refresh();
      } else setState({ error: r.error });
    });
  }, [qrToken, router]);

  if (state === "saving") return <p className="text-center text-sm text-muted">Confirming your meeting…</p>;
  if (state === "saved") return null;
  return (
    <p role="alert" className="rounded-xl bg-[#FDECEC] p-3 text-center text-sm text-[#8A1C1C]">
      We couldn’t confirm this meeting: {state.error}
    </p>
  );
}
