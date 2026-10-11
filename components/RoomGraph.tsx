"use client";

import { SECTORS } from "@/lib/roles";

// Radial room graph. Overview: one person in the centre, the room split into six role sectors.
//  - Inner ring: people linked to the centre by an intro. A sector with more than MAX_INDIVIDUAL links shows
//    a single aggregate bubble with the count instead.
//  - Outer ring: everyone else, summarised per sector as an avatar stack and a count; the sector tint darkens
//    with its share of the room.
//  - The pie slices themselves are the tap targets; labels are faint text.
// Tapping a slice zooms into it: the sector opens as a large fan with every link drawn individually.
// The parent owns the selection (selected = -1 is the overview).

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

const MAX_INDIVIDUAL = 2;
const ZOOM_MAX = 14;
const STAGE_RANK: Record<LinkStage, number> = { valuable: 0, met: 1, accepted: 2, proposed: 3 };
const HUES = ["90,120,210", "220,90,110", "240,170,60", "60,170,160", "150,110,210", "120,130,150"];

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (deg: number, r: number, cx = 50, cy = 50) => ({
  left: `${cx + r * Math.sin(rad(deg))}%`,
  top: `${cy - r * Math.cos(rad(deg))}%`,
});
const pt = (deg: number, r: number, cx = 50, cy = 50) => `${(cx + r * Math.sin(rad(deg))).toFixed(3)} ${(cy - r * Math.cos(rad(deg))).toFixed(3)}`;

/** SVG path of an annular wedge from angle a0 to a1 (degrees clockwise from 12 o'clock). */
function wedge(a0: number, a1: number, r0: number, r1: number, cx = 50, cy = 50) {
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(a0, r1, cx, cy)} A ${r1} ${r1} 0 ${large} 1 ${pt(a1, r1, cx, cy)} L ${pt(a1, r0, cx, cy)} A ${r0} ${r0} 0 ${large} 0 ${pt(a0, r0, cx, cy)} Z`;
}

function ring(alphas: number[], gap: number) {
  const stops = HUES.map((hue, i) => {
    const a = i * 60;
    return `rgba(${hue},${alphas[i].toFixed(3)}) ${a + gap}deg ${a + 60 - gap}deg, #F6F5F1 ${a + 60 - gap}deg ${a + 60 + gap}deg`;
  });
  return `conic-gradient(#F6F5F1 0deg ${gap}deg, ${stops.join(", ")})`;
}

function stageStyle(accent: string): Record<LinkStage, { h: number; bg: string; glow: string; border: string }> {
  return {
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
}

const byStrength = (a: GraphLink, b: GraphLink) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage];

export function RoomGraph(props: Props) {
  const { size, selected = -1 } = props;
  return (
    <div
      role="group"
      aria-label={
        selected >= 0
          ? `${SECTORS[selected]} around ${props.center.name}, zoomed in`
          : `Room circle centred on ${props.center.name}. Tap a slice to zoom into that group.`
      }
      className="relative shrink-0 overflow-hidden select-none"
      style={{ width: size, height: size }}
    >
      {selected >= 0 ? <ZoomView key={selected} {...props} sector={selected} /> : <Overview {...props} />}
    </div>
  );
}

function Overview({ size, center, links, outer, onSelect, accent = "#F0B23E" }: Props) {
  const u = size / 100;
  const stage = stageStyle(accent);

  // Inner ring: up to MAX_INDIVIDUAL links per sector, otherwise one aggregate bubble with the count.
  type Placed = GraphLink & { deg: number; count?: number };
  const placed: Placed[] = [];
  for (let s = 0; s < 6; s++) {
    const group = links.filter((l) => l.sector === s).sort(byStrength);
    if (group.length > MAX_INDIVIDUAL) {
      placed.push({ ...group[0], key: `agg-${s}`, deg: s * 60 + 30, count: group.length, label: `${group.length} people` });
    } else {
      group.forEach((l, k) => placed.push({ ...l, deg: s * 60 + ((k + 1) * 60) / (group.length + 1) }));
    }
  }

  const most = Math.max(1, ...outer);
  const outerAlpha = outer.map((n) => 0.07 + 0.25 * (n / most));
  const innerAlpha = outer.map((n) => 0.16 + 0.14 * (n / most));
  const bandMask = (inner: number) => ({
    WebkitMask: `radial-gradient(closest-side, transparent ${inner}%, #000 ${inner + 0.5}%)`,
    mask: `radial-gradient(closest-side, transparent ${inner}%, #000 ${inner + 0.5}%)`,
  });
  const labelSize = Math.max(10, 2.1 * u);

  return (
    <>
      <div className="absolute rounded-full" style={{ inset: "2%", background: "radial-gradient(closest-side, rgba(240,178,62,0.18), rgba(140,170,230,0.08) 60%, transparent 100%)" }} />
      <div className="absolute rounded-full" style={{ inset: "4%", background: ring(outerAlpha, 0.6), ...bandMask(71) }} />
      <div className="absolute rounded-full" style={{ inset: "22%", background: ring(innerAlpha, 0.8), ...bandMask(56.5) }} />
      <div className="absolute rounded-full border border-ink/15" style={{ inset: "4%" }} />
      <div className="absolute rounded-full border border-ink/10" style={{ inset: "20%" }} />
      <div className="absolute rounded-full border border-ink/15" style={{ inset: "34%", background: "radial-gradient(closest-side, rgba(240,178,62,0.28), #FFFFFF)" }} />

      {placed.map((l) => {
        const s = stage[l.stage];
        return (
          <div
            key={`line-${l.key}`}
            className="absolute"
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
            }}
          />
        );
      })}

      {/* Outer ring summary per sector: avatar stack + faint label + count. Not interactive itself. */}
      {SECTORS.map((label, i) => {
        const n = outer[i] ?? 0;
        const mid = i * 60 + 30;
        const side = i === 1 ? "right" : i === 4 ? "left" : null;
        const stack = Math.min(3, n);
        return (
          <div key={`sum-${label}`} aria-hidden="true" className="pointer-events-none">
            {stack > 0 && (
              <span className="absolute flex" style={{ ...polar(side === "right" ? mid + 16 : side === "left" ? mid - 16 : mid, 34), transform: "translate(-50%,-50%)" }}>
                {Array.from({ length: stack }, (_, k) => (
                  <span
                    key={k}
                    className="flex items-center justify-center rounded-full border border-ink/20 bg-white"
                    style={{ width: 4.8 * u, height: 4.8 * u, marginLeft: k ? -1.6 * u : 0 }}
                  >
                    <PersonGlyph />
                  </span>
                ))}
              </span>
            )}
            <span
              className={`absolute flex flex-col font-display whitespace-nowrap ${side === "right" ? "items-end" : side === "left" ? "items-start" : "items-center"}`}
              style={{
                ...polar(side ? (side === "right" ? mid - 8 : mid + 8) : mid, side ? 44.5 : 41),
                transform: side === "right" ? "translate(-100%,-50%)" : side === "left" ? "translate(0,-50%)" : "translate(-50%,-50%)",
                fontSize: labelSize,
                lineHeight: 1.1,
                color: "rgba(21,23,28,0.42)",
                fontWeight: 600,
              }}
            >
              <span>{label}</span>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: labelSize * 0.92 }}>
                {n}
              </span>
            </span>
          </div>
        );
      })}

      {placed.map((l) => {
        const s = stage[l.stage];
        if (l.count) {
          return (
            <div key={l.key} className="absolute flex flex-col items-center" style={{ ...polar(l.deg, 22), transform: "translate(-50%,-50%)" }}>
              <span
                className="flex items-center justify-center rounded-full bg-white font-mono font-semibold text-ink"
                style={{ width: 8.5 * u, height: 8.5 * u, fontSize: Math.max(11, 2.8 * u), border: s.border, boxShadow: "0 1px 4px rgba(21,23,28,0.18)" }}
              >
                {l.count}
              </span>
              <span className="absolute top-full mt-0.5 font-medium whitespace-nowrap text-ink" style={{ fontSize: Math.max(9, 1.8 * u), textShadow: "0 0 4px #F6F5F1" }}>
                {l.label}
              </span>
            </div>
          );
        }
        return (
          <div key={`n-${l.key}`} className="absolute flex flex-col items-center" style={{ ...polar(l.deg, 22), transform: "translate(-50%,-50%)" }}>
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

      <CenterNode u={u} center={center} accent={accent} left="50%" top="50%" />

      {/* The slices are the tap targets. */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {SECTORS.map((label, i) => {
          const n = outer[i] ?? 0;
          const linked = links.filter((l) => l.sector === i).length;
          return (
            <path
              key={label}
              d={wedge(i * 60 + 0.6, i * 60 + 59.4, 17, 46)}
              role="button"
              tabIndex={0}
              aria-label={`${label}: ${n} in the room${linked ? `, ${linked} linked to you` : ""}. Zoom in`}
              className="cursor-pointer fill-transparent outline-none hover:fill-gold/15 focus-visible:fill-gold/25"
              onClick={() => onSelect?.(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(i);
                }
              }}
            />
          );
        })}
      </svg>
    </>
  );
}

// Zoomed sector: the slice opens as a wide fan above the centre person, every link drawn individually.
function ZoomView({ size, center, links, outer, onSelect, accent = "#F0B23E", sector }: Props & { sector: number }) {
  const u = size / 100;
  const stage = stageStyle(accent);
  const cx = 50;
  const cy = 82;
  const group = links.filter((l) => l.sector === sector).sort(byStrength);
  const shown = group.slice(0, ZOOM_MAX);
  const extra = group.length - shown.length;
  const others = outer[sector] ?? 0;

  // Two arcs: the strongest links on the outer arc (up to 8), the rest on the inner arc.
  const rings = [shown.slice(0, 8), shown.slice(8)];
  const radii = [54, 36];
  const span = 44;
  const nodes = rings.flatMap((row, r) =>
    row.map((l, k) => ({ ...l, deg: row.length === 1 ? 0 : -span + (2 * span * k) / (row.length - 1), r: radii[r] })),
  );

  return (
    <div className="absolute inset-0 origin-[50%_82%] animate-zoom-in">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
        <path d={wedge(-56, 56, 9, 66, cx, cy)} fill={`rgba(${HUES[sector]},0.22)`} />
        <path d={wedge(-56, 56, 9, 66, cx, cy)} fill="none" stroke="rgba(21,23,28,0.12)" strokeWidth="0.3" />
      </svg>

      <button
        type="button"
        onClick={() => onSelect?.(-1)}
        className="absolute top-[2%] left-[2%] flex items-center gap-1 rounded-full border border-line-strong bg-card font-semibold"
        style={{ height: Math.max(32, 8 * u), padding: `0 ${2.6 * u}px`, fontSize: Math.max(11, 2.6 * u) }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All groups
      </button>
      <div className="absolute top-[3%] right-[3%] flex flex-col items-end font-display" style={{ fontSize: Math.max(11, 2.8 * u) }}>
        <span className="font-bold text-ink">{SECTORS[sector]}</span>
        <span className="font-mono text-subtle" style={{ fontSize: Math.max(10, 2.2 * u) }}>
          {group.length} linked · {others} more here
        </span>
      </div>

      {nodes.map((l) => {
        const s = stage[l.stage];
        return (
          <div
            key={`zl-${l.key}`}
            className="absolute"
            style={{
              left: `${cx}%`,
              top: `${cy}%`,
              width: `${l.r}%`,
              height: s.h,
              marginTop: -s.h / 2,
              transformOrigin: "0 50%",
              transform: `rotate(${l.deg - 90}deg)`,
              background: s.bg,
              boxShadow: s.glow,
            }}
          />
        );
      })}
      {nodes.map((l) => {
        const s = stage[l.stage];
        return (
          <div key={`zn-${l.key}`} className="absolute flex flex-col items-center" style={{ ...polar(l.deg, l.r, cx, cy), transform: "translate(-50%,-50%)" }}>
            <span
              className="flex items-center justify-center rounded-full bg-white font-semibold text-ink"
              style={{
                width: 8 * u,
                height: 8 * u,
                fontSize: 2.4 * u,
                border: s.border,
                boxShadow: l.stage === "valuable" ? `0 0 ${2 * u}px rgba(240,178,62,0.6)` : "0 1px 3px rgba(21,23,28,0.12)",
              }}
            >
              {l.initials ?? <PersonGlyph />}
            </span>
            <span
              className="absolute top-full mt-0.5 max-w-[16ch] truncate font-medium whitespace-nowrap text-ink"
              style={{ fontSize: Math.max(9, 1.9 * u), textShadow: "0 0 4px #F6F5F1, 0 0 4px #F6F5F1" }}
            >
              {l.label}
            </span>
          </div>
        );
      })}

      {group.length === 0 && (
        <p className="absolute right-[10%] left-[10%] text-center text-muted" style={{ top: "40%", fontSize: Math.max(11, 2.6 * u) }}>
          No intros with {SECTORS[sector].toLowerCase()} yet.
        </p>
      )}
      {extra > 0 && (
        <span
          className="absolute rounded-full border border-dashed border-ink/40 bg-white px-2 font-mono text-ink"
          style={{ ...polar(0, 22, cx, cy), transform: "translate(-50%,-50%)", fontSize: Math.max(10, 2.2 * u) }}
        >
          +{extra} more
        </span>
      )}

      <CenterNode u={u * 0.85} center={center} accent={accent} left={`${cx}%`} top={`${cy}%`} />
    </div>
  );
}

function CenterNode({ u, center, accent, left, top }: { u: number; center: Props["center"]; accent: string; left: string; top: string }) {
  return (
    <>
      <div
        className="absolute flex items-center justify-center rounded-full bg-ink font-display font-bold text-white"
        style={{
          left,
          top,
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
      <div
        className="absolute flex flex-col items-center whitespace-nowrap"
        style={{ left, top: `calc(${top} + ${9.5 * u}px)`, transform: "translateX(-50%)" }}
      >
        <span className="font-semibold" style={{ fontSize: Math.max(10, 2.2 * u), textShadow: "0 0 4px #fff, 0 0 4px #fff" }}>
          {center.name}
        </span>
        <span className="font-display font-semibold tracking-wider text-gold-ink" style={{ fontSize: Math.max(8, 1.5 * u) }}>
          {center.tag}
        </span>
      </div>
    </>
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
