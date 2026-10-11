"use client";

import { useState } from "react";
import { RoomGraph, type GraphLink, type LinkStage } from "@/components/RoomGraph";

const STAGES: LinkStage[] = ["valuable", "met", "accepted", "proposed"];
const NAMES = ["Maya Chen", "Kenji Mori", "Leo Park", "Ana Ruiz", "Priya Nair", "Tom Becker", "Jun Sato", "Dana Ito", "Omar Haddad", "Rosa Lind"];

function links(n: number, spread: number[]): GraphLink[] {
  return Array.from({ length: n }, (_, i) => {
    const name = NAMES[i % NAMES.length];
    const anon = i % 3 === 2;
    return {
      key: `l${i}`,
      sector: spread[i % spread.length],
      label: anon ? "A founder" : name,
      initials: anon ? null : name.split(" ").map((w) => w[0]).join(""),
      stage: STAGES[i % STAGES.length],
    };
  });
}

const SCENARIOS = {
  "Small room (12 people)": { outer: [3, 2, 2, 1, 2, 1], links: links(3, [0, 1, 3]) },
  "Busy event (120 people)": { outer: [34, 18, 22, 6, 30, 10], links: links(9, [0, 0, 0, 0, 1, 2, 4, 4, 5]) },
  "Huge (400 people, 20 links)": { outer: [120, 60, 80, 25, 90, 25], links: links(20, [0, 1, 2, 3, 4, 5, 0, 0, 1, 4]) },
};

export function GraphPreview() {
  const [sel, setSel] = useState(-1);
  return (
    <main className="flex flex-col gap-10 p-6">
      <h1 className="font-display text-2xl font-bold">Room circle preview (local only, fake data)</h1>
      {Object.entries(SCENARIOS).map(([title, s]) => (
        <section key={title} className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <div className="flex flex-wrap items-start gap-8">
            {[320, 380, 600].map((size) => (
              <div key={size} className="flex flex-col items-center gap-1">
                <RoomGraph size={size} center={{ initials: "ZS", name: "You", tag: "DESIGNER" }} links={s.links} outer={s.outer} selected={sel} onSelect={setSel} />
                <span className="text-xs text-subtle">{size}px</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
