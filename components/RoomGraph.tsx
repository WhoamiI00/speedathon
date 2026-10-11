"use client";

import { SECTORS } from "@/lib/roles";

// Radial room graph (mockup "NormalRoomGraph"): one person in the centre, the room split into six role
// sectors. Inner ring = people linked to the centre by an intro (line style = intro stage), outer ring =
// everyone else. Tapping a sector label selects it; the parent owns the selection.

export type LinkStage = "proposed" | "accepted" | "met" | "valuable";

export type GraphLink = { key: string; sector: number; label: string; initials: string | null; stage: LinkStage };

type Props = {
  size: number;
  center: { initials: string; name: string; tag: string };
  links: GraphLink[];
  /** Number of other people per sector (outer ring). */
  outer: number[];
  selected?: number;
  onSelect?: (sector: number) => void;
  accent?: string;
};

const SECTOR_TINT = [
  ["rgba(90,120,210,0.14)", "rgba(90,120,210,0.24)"],
  ["rgba(220,90,110,0.13)", "rgba(220,90,110,0.22)"],
  ["rgba(240,170,60,0.16)", "rgba(240,170,60,0.26)"],
  ["rgba(60,170,160,0.14)", "rgba(60,170,160,0.24)"],
  ["rgba(150,110,210,0.14)", "rgba(150,110,210,0.24)"],
  ["rgba(120,130,150,0.14)", "rgba(120,130,150,0.24)"],
];

function ring(alpha: 0 | 1, gap: number) {
  const stops = SECTOR_TINT.map((t, i) => {
    const a = i * 60;
    return `${t[alpha]} ${a + gap}deg ${a + 60 - gap}deg, #F6F5F1 ${a + 60 - gap}deg ${a + 60 + gap}deg`;
  });
  return `conic-gradient(#F6F5F1 0deg ${gap}deg, ${stops.join(", ")})`;
}

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { left: `${50 + r * Math.sin(a)}%`, top: `${50 - r * Math.cos(a)}%` };
};

export function RoomGraph({ size, center, links, outer, selected = -1, onSelect, accent = "#F0B23E" }: Props) {
  const u = size / 100;
  const opFor = (sector: number) => (selected < 0 || selected === sector ? 1 : 0.22);
  const stage: Record<LinkStage, { h: number; bg: string; glow: string; border: string; dot: string }> = {
    proposed: {
      h: 1,
      bg: "repeating-linear-gradient(90deg, rgba(21,23,28,0.5) 0 4px, transparent 4px 8px)",
      glow: "none",
      border: "1.5px dashed rgba(21,23,28,0.45)",
      dot: "rgba(21,23,28,0.4)",
    },
    accepted: { h: 1, bg: "rgba(21,23,28,0.5)", glow: "none", border: "1.5px solid rgba(21,23,28,0.5)", dot: "#4E535D" },
    met: { h: 2, bg: "#15171C", glow: "none", border: "2px solid #15171C", dot: "#15171C" },
    valuable: { h: 3, bg: accent, glow: `0 0 8px ${accent}`, border: `2.5px solid ${accent}`, dot: accent },
  };

  // Spread several links in the same sector evenly across it.
  const perSector = new Map<number, GraphLink[]>();
  for (const l of links) perSector.set(l.sector, [...(perSector.get(l.sector) ?? []), l]);
  const placed = links.map((l) => {
    const group = perSector.get(l.sector)!;
    const k = group.indexOf(l);
    return { ...l, deg: l.sector * 60 + ((k + 1) * 60) / (group.length + 1) };
  });

  const highlight =
    selected < 0
      ? "none"
      : `conic-gradient(transparent 0deg ${selected * 60}deg, rgba(240,178,62,0.32) ${selected * 60}deg ${selected * 60 + 60}deg, transparent ${selected * 60 + 60}deg 360deg)`;
  const bandMask = (inner: number) => ({
    WebkitMask: `radial-gradient(closest-side, transparent ${inner}%, #000 ${inner + 0.5}%)`,
    mask: `radial-gradient(closest-side, transparent ${inner}%, #000 ${inner + 0.5}%)`,
  });

  return (
    <div
      role="group"
      aria-label={`Room circle centred on ${center.name}. Tap a group to see who is in it.`}
      className="relative shrink-0 overflow-hidden select-none"
      style={{ width: size, height: size }}
    >
      <div className="absolute rounded-full" style={{ inset: "2%", background: "radial-gradient(closest-side, rgba(240,178,62,0.20), rgba(140,170,230,0.10) 60%, transparent 100%)" }} />
      <div className="absolute rounded-full" style={{ inset: "7%", background: ring(0, 0.6), ...bandMask(69.5) }} />
      <div className="absolute rounded-full" style={{ inset: "22%", background: ring(1, 0.8), ...bandMask(56.5) }} />
      <div className="absolute rounded-full transition-[background]" style={{ inset: "7%", background: highlight, ...bandMask(37) }} />
      <div className="absolute rounded-full border border-ink/15" style={{ inset: "7%" }} />
      <div className="absolute rounded-full border border-ink/10" style={{ inset: "20%" }} />
      <div className="absolute rounded-full border border-ink/15" style={{ inset: "34%", background: "radial-gradient(closest-side, rgba(240,178,62,0.28), #FFFFFF)" }} />

      {placed.map((l) => {
        const s = stage[l.stage];
        return (
          <div
            key={`line-${l.key}`}
            className="absolute transition-opacity"
            style={{
              left: "50%",
              top: "50%",
              width: "22%",
              height: s.h,
              marginTop: -s.h / 2,
              transformOrigin: "0 50%",
              transform: `rotate(${l.deg - 90}deg)`,
              background: s.bg,
              boxShadow: s.glow,
              opacity: opFor(l.sector),
            }}
          />
        );
      })}

      {outer.map((count, sector) =>
        Array.from({ length: Math.min(count, 6) }, (_, i) => {
          const n = Math.min(count, 6);
          const pos = polar(sector * 60 + ((i + 1) * 60) / (n + 1), 36.5);
          const on = selected === sector;
          return (
            <span
              key={`o-${sector}-${i}`}
              aria-hidden="true"
              className="absolute flex items-center justify-center rounded-full bg-white transition-opacity"
              style={{
                ...pos,
                width: 5.2 * u,
                height: 5.2 * u,
                transform: "translate(-50%,-50%)",
                border: on ? "1.5px solid #15171C" : "1px solid rgba(21,23,28,0.18)",
                opacity: opFor(sector),
              }}
            >
              <PersonGlyph />
            </span>
          );
        }),
      )}

      {placed.map((l) => {
        const s = stage[l.stage];
        return (
          <div
            key={`n-${l.key}`}
            className="absolute flex flex-col items-center transition-opacity"
            style={{ ...polar(l.deg, 22), transform: "translate(-50%,-50%)", opacity: opFor(l.sector) }}
          >
            <span
              className="flex items-center justify-center rounded-full bg-white font-semibold text-ink"
              style={{
                width: 7.5 * u,
                height: 7.5 * u,
                fontSize: 2.2 * u,
                border: s.border,
                boxShadow: l.stage === "valuable" ? `0 0 ${2 * u}px rgba(240,178,62,0.6)` : "0 1px 3px rgba(21,23,28,0.12)",
              }}
            >
              {l.initials ?? <PersonGlyph />}
            </span>
            <span
              className="absolute top-full mt-0.5 font-medium whitespace-nowrap text-ink"
              style={{ fontSize: Math.max(9, 1.8 * u), textShadow: "0 0 4px #F6F5F1, 0 0 4px #F6F5F1" }}
            >
              {l.label}
            </span>
          </div>
        );
      })}

      {SECTORS.map((label, i) => {
        const on = selected === i;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect?.(on ? -1 : i)}
            className="absolute rounded-full font-display font-semibold whitespace-nowrap"
            style={{
              ...polar(i * 60 + 30, 46.5),
              transform: "translate(-50%,-50%)",
              padding: `${0.8 * u}px ${2 * u}px`,
              fontSize: Math.max(10, 1.9 * u),
              background: on ? "#15171C" : "rgba(255,255,255,0.9)",
              color: on ? "#FFFFFF" : "#3F434B",
              boxShadow: on ? "0 2px 8px rgba(21,23,28,0.25)" : "0 1px 2px rgba(21,23,28,0.10)",
            }}
          >
            {label}
          </button>
        );
      })}

      <div
        className="absolute flex items-center justify-center rounded-full bg-ink font-display font-bold text-white"
        style={{
          left: "50%",
          top: "50%",
          width: 15 * u,
          height: 15 * u,
          transform: "translate(-50%,-50%)",
          border: `${0.6 * u}px solid ${accent}`,
          boxShadow: `0 0 ${4 * u}px rgba(240,178,62,0.5)`,
          fontSize: 4 * u,
        }}
      >
        {center.initials}
      </div>
      <div className="absolute flex flex-col items-center whitespace-nowrap" style={{ left: "50%", top: "59.5%", transform: "translateX(-50%)" }}>
        <span className="font-semibold" style={{ fontSize: Math.max(10, 2.2 * u), textShadow: "0 0 4px #fff, 0 0 4px #fff" }}>
          {center.name}
        </span>
        <span className="font-display font-semibold tracking-wider text-gold-ink" style={{ fontSize: Math.max(8, 1.5 * u) }}>
          {center.tag}
        </span>
      </div>
    </div>
  );
}

function PersonGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="#8A8F99" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
