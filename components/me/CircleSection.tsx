"use client";

import { useState } from "react";
import { ResponsiveGraph } from "@/components/ResponsiveGraph";
import type { GraphLink } from "@/components/RoomGraph";
import { SECTORS } from "@/lib/roles";
import type { DirectoryEntry } from "@/lib/me";

// "My circle": the radial graph centred on me + role filter + who-is-here list.
export function CircleSection({
  center,
  links,
  outer,
  directory,
}: {
  center: { initials: string; name: string; tag: string };
  links: GraphLink[];
  outer: number[];
  directory: DirectoryEntry[][];
}) {
  const [sel, setSel] = useState(-1);
  const people = sel >= 0 ? directory[sel] : [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">My circle</h2>
      <ResponsiveGraph max={380} center={center} links={links} outer={outer} selected={sel} onSelect={setSel} />

      <div role="group" aria-label="Filter the room by role" className="flex flex-wrap gap-1.5">
        {["All", ...SECTORS].map((label, k) => {
          const i = k - 1;
          const on = sel === i;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => setSel(i)}
              className={`h-11 rounded-full border px-3.5 text-sm font-semibold ${on ? "border-ink bg-ink text-white" : "border-line-strong bg-card"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {sel < 0 ? (
        <p className="text-sm text-muted">Tap a slice of the circle, or a button above, to zoom into that group and see who is in the room.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="mt-1 font-display text-[17px] font-semibold">
            {SECTORS[sel]} in the room · {people.length}
          </h3>
          {people.length === 0 && <p className="text-sm text-muted">Nobody here yet.</p>}
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-card p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EEECE6] text-sm font-semibold">
                {p.initials ?? "·"}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{p.label}</span>
                {p.line && <span className="text-[13px] leading-snug text-subtle">{p.line}</span>}
                {p.tag && (
                  <span className="self-start rounded-full bg-gold/25 px-2 py-0.5 text-xs font-semibold text-[#6B4700]">{p.tag}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
