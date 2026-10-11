import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AskRoom } from "@/components/dashboard/AskRoom";
import { CallTicker } from "@/components/dashboard/CallTicker";
import { FollowThroughTicker } from "@/components/dashboard/FollowThroughTicker";
import { DashboardGraph } from "@/components/dashboard/DashboardGraph";
import { LiveRefresh } from "@/components/LiveRefresh";
import { LogoMark } from "@/components/Logo";
import { loadDashboard } from "@/lib/dashboard";

export const metadata = { title: "The room · Sevendipity" };

// Big screen (PLAN §4 /dashboard): live room circle, Top Connectors, metrics, feed, Ask the room.
// Also drives the Dial call queue tick (PLAN §5). Add ?tick=0 on extra screens.
export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const sp = await props.searchParams;
  const slug = typeof sp.room === "string" ? sp.room : "speedhacks";
  const data = await loadDashboard(slug);
  if (!data) notFound();

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const qrSvg = await QRCode.toString(`${origin}/r/${data.room.slug}`, { type: "svg", margin: 0, color: { dark: "#0E1015", light: "#F2F2EE" } });
  const s = data.stats;

  return (
    <main className="flex min-h-full flex-1 flex-col gap-6 bg-night px-4 py-7 text-night-text sm:px-10">
      <LiveRefresh tables={["matches", "intros", "ledger_entries", "encounters"]} pollMs={15000} />
      {sp.tick !== "0" && (
        <>
          <CallTicker />
          <FollowThroughTicker />
        </>
      )}

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <LogoMark size={44} ink="#F2F2EE" />
          <div className="flex flex-col">
            <span className="font-display text-[32px] leading-none font-bold tracking-tight">Sevendipity</span>
            <span className="text-[15px] text-night-muted">{data.room.name} · live room</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-night-text py-2 pr-4 pl-2 text-night">
          {/* qrcode generates this SVG from our own URL; no user HTML involved. */}
          <div className="size-16 [&>svg]:size-full" role="img" aria-label="Check-in QR code" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="flex flex-col">
            <span className="font-semibold">Scan to join</span>
            <span className="text-[13px] text-[#3F434B]">Meet who you should meet</span>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col items-center gap-3 rounded-[22px] bg-ground p-5 text-ink">
          <div className="flex flex-wrap items-baseline justify-between gap-2 self-stretch">
            <h2 className="font-display text-[22px] font-semibold">The room tonight</h2>
            <span className="text-[13px] text-muted">Each circle is a person, grouped by role. Each line is an intro. Gold means it created real value.</span>
          </div>
          {data.graph ? (
            <DashboardGraph center={data.graph.center} links={data.graph.links} outer={data.graph.outer} />
          ) : (
            <p className="py-24 text-center text-muted">The circle fills in as soon as the first intro creates value.</p>
          )}
          <Legend />
        </section>

        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5">
            <Tile big={s.medianMinutesToMeet === null ? "–" : `${s.medianMinutesToMeet}`} unit={s.medianMinutesToMeet === null ? "" : " min"} label="median from check-in to first meeting" gold />
            <Tile big={String(s.checkedIn)} label="people checked in" />
            <Tile big={String(s.intros)} label="intros made" />
            <Tile big={String(s.met)} label="meetings confirmed by QR" />
          </div>

          <section className="flex flex-col gap-1 rounded-[18px] border border-night-line bg-night-card px-4.5 py-4">
            <h2 className="mb-1.5 font-display text-xl font-semibold">Top Connectors</h2>
            {data.connectors.length === 0 && <p className="text-sm text-night-muted">The first person to make a valuable intro shows up here.</p>}
            {data.connectors.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 border-t border-[#222632] py-2">
                <span className="w-5.5 font-mono text-[#8F95A1]">{i + 1}</span>
                <span className={`flex-1 text-base ${i === 0 ? "font-semibold" : ""}`}>{c.label}</span>
                <span className="text-[13px] text-night-muted">{c.note}</span>
                <span className={`w-14 text-right font-mono ${i === 0 ? "text-gold" : ""}`}>{c.score.toFixed(2)}</span>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2.5 rounded-[18px] border border-night-line bg-night-card px-4.5 py-4">
            <h2 className="font-display text-xl font-semibold">Happening now</h2>
            {data.feed.length === 0 && <p className="text-sm text-night-muted">Waiting for the first match…</p>}
            {data.feed.map((f) => (
              <span key={f.id} className="flex gap-2.5 text-sm text-[#D6D8DD]">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${f.tone === "gold" ? "bg-gold" : f.tone === "ink" ? "bg-[#C9CCD3]" : "bg-[#6E7482]"}`}
                />
                <span className="flex-1">{f.text}</span>
                <span className="text-[#8F95A1]">{f.minutesAgo < 1 ? "now" : `${f.minutesAgo}m`}</span>
              </span>
            ))}
          </section>
        </div>
      </div>

      <AskRoom />
    </main>
  );
}

function Tile({ big, unit = "", label, gold = false }: { big: string; unit?: string; label: string; gold?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-night-line bg-night-card p-3.5">
      <span className={`font-display text-[34px] font-bold ${gold ? "text-gold" : ""}`}>
        {big}
        {unit && <span className="text-base">{unit}</span>}
      </span>
      <span className="text-[13px] leading-snug text-[#C9CCD3]">{label}</span>
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["Proposed", "h-px bg-[repeating-linear-gradient(90deg,#15171C_0_4px,transparent_4px_8px)]"],
    ["Accepted", "h-px bg-ink/50"],
    ["Met", "h-0.5 bg-ink"],
    ["Rated valuable", "h-[3px] bg-gold"],
  ];
  return (
    <div className="flex flex-wrap justify-center gap-4.5 text-[13px] text-muted">
      {items.map(([label, cls]) => (
        <span key={label} className="flex items-center gap-2">
          <span className={`w-6.5 ${cls}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
