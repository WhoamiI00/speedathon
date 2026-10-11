"use client";

import { SECTORS } from "@/lib/roles";

// Radial room graph (mockup "NormalRoomGraph"): one person in the centre, the room split into six role
// sectors. Inner ring = people linked to the centre by an intro (line style = intro stage), at most
// MAX_LINKS per sector plus a "+N more" bubble. Outer ring = everyone else, summarised per sector as a
// small avatar stack and a count, with the sector tint darkening as it fills, so a crowded room stays
// readable. Sector labels are plain text inside their slice; tapping one selects it (parent owns state).

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

const MAX_LINKS = 3;
const STAGE_RANK: Record<LinkStage, number> = { valuable: 0, met: 1, accepted: 2, proposed: 3 };
const HUES = ["90,120,210", "220,90,110", "240,170,60", "60,170,160", "150,110,210", "120,130,150"];

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { left: `${50 + r * Math.sin(a)}%`, top: `${50 - r * Math.cos(a)}%` };
};

/** Conic gradient with one colour per sector and a thin ground-coloured gap between sectors. */
function ring(alphas: number[], gap: number) {
  const stops = HUES.map((hue, i) => {
    const a = i * 60;
    return `rgba(${hue},${alphas[i].toFixed(3)}) ${a + gap}deg ${a + 60 - gap}deg, #F6F5F1 ${a + 60 - gap}deg ${a + 60 + gap}deg`;
  });
  return `conic-gradient(#F6F5F1 0deg ${gap}deg, ${stops.join(", ")})`;
}

export function RoomGraph({ size, center, links, outer, selected = -1, onSelect, accent = "#F0B23E" }: Props) {
  const u = size / 100;
  const opFor = (sector: number) => (selected < 0 || selected === sector ? 1 : 0.25);
  const stage: Record<LinkStage, { h: number; bg: string; glow: string; border: string }> = {
    proposed: {
      h: 1,
      bg: "repeating-linear-gradient(90deg, rgba(21,23,28,0.5) 0 4px, transparent 4px 8px)",
      glow: "none",
      border: "1.5px dashed rgba(21,23,28,0.45)",
    },
    accepted: { h: 1, bg: "rgba(21,23,28,0.5)", glow: "none", border: "1.5px solid rgba(21,23,28,0.5)" },
    met: { h: 2, bg: "#15171C", glow: "none", border: "2px solid #15171C" },
    valuable: { h: 3, bg: accent, glow: `0 0 8px ${accent}`, border: `2.5px solid ${accent}` },
  };

  // Inner ring: keep the strongest MAX_LINKS per sector, summarise the rest as "+N".
  type Placed = GraphLink & { deg: number; more?: number };
  const placed: Placed[] = [];
  for (let s = 0; s < 6; s++) {
    const group = links.filter((l) => l.sector === s).sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage]);
    const shown = group.slice(0, MAX_LINKS);
    const extra = group.length - shown.length;
    const slots = shown.length + (extra > 0 ? 1 : 0);
    shown.forEach((l, k) => placed.push({ ...l, deg: s * 60 + ((k + 1) * 60) / (slots + 1) }));
    if (extra > 0) {
      placed.push({ key: `more-${s}`, sector: s, label: "", initials: null, stage: "proposed", deg: s * 60 + (slots * 60) / (slots + 1), more: extra });
    }
  }

  // Outer ring density: the fuller a sector, the stronger its tint.
  const most = Math.max(1, ...outer);
  const outerAlpha = outer.map((n) => 0.07 + 0.25 * (n / most));
  const innerAlpha = outer.map((n) => 0.16 + 0.14 * (n / most));

  const highlight =
    selected < 0
      ? "none"
      : `conic-gradient(transparent 0deg ${selected * 60}deg, rgba(240,178,62,0.30) ${selected * 60}deg ${selected * 60 + 60}deg, transparent ${selected * 60 + 60}deg 360deg)`;
  const bandMask = (inner: number) => ({
    WebkitMask: `radial-gradient(closest-side, transparent ${inner}%, #000 ${inner + 0.5}%)`,
    mask: `radial-gradient(closest-side, transparent ${inner}%, #000 ${inner + 0.5}%)`,
  });
  const labelSize = Math.max(10, 2.1 * u);

  return (
    <div
      role="group"
      aria-label={`Room circle centred on ${center.name}. Tap a group to see who is in it.`}
      className="relative shrink-0 overflow-hidden select-none"
      style={{ width: size, height: size }}
    >
      <div className="absolute rounded-full" style={{ inset: "2%", background: "radial-gradient(closest-side, rgba(240,178,62,0.18), rgba(140,170,230,0.08) 60%, transparent 100%)" }} />
      <div className="absolute rounded-full" style={{ inset: "4%", background: ring(outerAlpha, 0.6), ...bandMask(71) }} />
      <div className="absolute rounded-full" style={{ inset: "22%", background: ring(innerAlpha, 0.8), ...bandMask(56.5) }} />
      <div className="absolute rounded-full transition-[background]" style={{ inset: "4%", background: highlight, ...bandMask(34.5) }} />
      <div className="absolute rounded-full border border-ink/15" style={{ inset: "4%" }} />
      <div className="absolute rounded-full border border-ink/10" style={{ inset: "20%" }} />
      <div className="absolute rounded-full border border-ink/15" style={{ inset: "34%", background: "radial-gradient(closest-side, rgba(240,178,62,0.28), #FFFFFF)" }} />

      {placed
        .filter((l) => !l.more)
        .map((l) => {
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

      {/* Outer ring: per-sector summary (avatar stack + label with count) instead of one dot per person. */}
      {SECTORS.map((label, i) => {
        const n = outer[i] ?? 0;
        const on = selected === i;
        const mid = i * 60 + 30;
        const stack = Math.min(3, n);
        // Sectors 1 (right) and 4 (left) touch the circle's edge: anchor their labels inward so they never clip.
        const side = i === 1 ? "right" : i === 4 ? "left" : null;
        return (
          <div key={`sum-${label}`} className="transition-opacity" style={{ opacity: opFor(i) }}>
            {stack > 0 && (
              <span aria-hidden="true" className="absolute flex" style={{ ...polar(side === "right" ? mid + 16 : side === "left" ? mid - 16 : mid, 34), transform: "translate(-50%,-50%)" }}>
                {Array.from({ length: stack }, (_, k) => (
                  <span
                    key={k}
                    className="flex items-center justify-center rounded-full bg-white"
                    style={{
                      width: 4.8 * u,
                      height: 4.8 * u,
                      marginLeft: k ? -1.6 * u : 0,
                      border: on ? "1.5px solid #15171C" : "1px solid rgba(21,23,28,0.22)",
                    }}
                  >
                    <PersonGlyph />
                  </span>
                ))}
              </span>
            )}
            <button
              type="button"
              aria-pressed={on}
              aria-label={`${label}: ${n} ${n === 1 ? "person" : "people"}`}
              onClick={() => onSelect?.(on ? -1 : i)}
              className={`absolute flex flex-col bg-transparent font-display whitespace-nowrap ${
                side === "right" ? "items-end" : side === "left" ? "items-start" : "items-center"
              }`}
              style={{
                ...polar(side ? (side === "right" ? mid - 8 : mid + 8) : mid, side ? 44.5 : 41),
                transform: side === "right" ? "translate(-100%,-50%)" : side === "left" ? "translate(0,-50%)" : "translate(-50%,-50%)",
                padding: `${0.6 * u}px ${1.2 * u}px`,
                fontSize: labelSize,
                lineHeight: 1.1,
                color: on ? "#15171C" : "#3F434B",
                fontWeight: on ? 700 : 600,
                textDecoration: on ? "underline" : "none",
                textUnderlineOffset: 3,
                textShadow: "0 0 3px rgba(246,245,241,0.9)",
              }}
            >
              <span>{label}</span>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: labelSize * 0.92, color: on ? "#15171C" : "#5B606B" }}>
                {n}
              </span>
            </button>
          </div>
        );
      })}

      {placed.map((l) => {
        if (l.more) {
          return (
            <span
              key={l.key}
              className="absolute flex items-center justify-center rounded-full border border-dashed border-ink/40 bg-white font-mono text-ink transition-opacity"
              style={{ ...polar(l.deg, 22), width: 6.4 * u, height: 6.4 * u, fontSize: Math.max(9, 2 * u), transform: "translate(-50%,-50%)", opacity: opFor(l.sector) }}
              title={`${l.more} more`}
            >
              +{l.more}
            </span>
          );
        }
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
              className="absolute top-full mt-0.5 max-w-[22ch] truncate font-medium whitespace-nowrap text-ink"
              style={{ fontSize: Math.max(9, 1.8 * u), textShadow: "0 0 4px #F6F5F1, 0 0 4px #F6F5F1" }}
            >
              {l.label}
            </span>
          </div>
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
    <svg viewBox="0 0 24 24" width="58%" height="58%" fill="none" stroke="#8A8F99" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
