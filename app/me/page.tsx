import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Logo } from "@/components/Logo";
import { CallWaiter } from "@/components/me/CallWaiter";
import { CircleSection } from "@/components/me/CircleSection";
import { IntroduceForm } from "@/components/me/IntroduceForm";
import { MatchCard } from "@/components/me/MatchCard";
import { RatePanel } from "@/components/me/RatePanel";
import { loadMe } from "@/lib/me";
import { initialsOf } from "@/lib/roles";
import { getPersonId } from "@/lib/session";

export const metadata = { title: "My page · Sevendipity" };

// PLAN §4 /me: matches, accept/decline, personal QR, Darwin agent cards, introduce two people,
// rate meetings, private balance. Server-rendered; LiveRefresh re-renders on Realtime changes.
export default async function MePage(props: PageProps<"/me">) {
  const pid = await getPersonId();
  if (!pid) redirect("/r/speedhacks");
  const data = await loadMe(pid);
  if (!data) redirect("/r/speedhacks");
  const { calling } = await props.searchParams;

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const qrSvg = await QRCode.toString(`${origin}/meet/${data.me.qr_token}`, { type: "svg", margin: 0, color: { dark: "#15171C", light: "#FFFFFF" } });

  const first = data.me.name.split(/\s+/)[0];
  const center = { initials: initialsOf({ ...data.me, show_name: true }) ?? "Me", name: "You", tag: (data.me.role ?? "").toUpperCase() };
  const intakePending = data.intake && (data.intake.status === "queued" || data.intake.status === "dialing");
  const intakeFailed = data.intake?.status === "failed";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-7 px-5 pt-5 pb-12">
      <LiveRefresh tables={["matches", "intros", "ledger_entries"]} />

      <header className="flex items-center justify-between">
        <Logo />
        <Link
          href={`/p/${data.me.id}`}
          aria-label="My public profile"
          className="flex size-11 items-center justify-center rounded-full bg-ink font-semibold text-white"
        >
          {center.initials}
        </Link>
      </header>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">Hi {first}</h1>
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className={`size-2 rounded-full ${data.matches.length ? "bg-[#2E9E5B]" : "animate-pulse bg-gold"}`} />
          {data.matches.length
            ? `Your agent found ${data.matches.length} ${data.matches.length === 1 ? "person" : "people"} for you`
            : "Your agent is finding people for you…"}
        </span>
      </div>

      {(intakePending || (calling && !data.intake)) && <CallWaiter />}
      {(intakePending || (calling && !data.intake)) && (
        <p role="status" className="rounded-2xl bg-ink p-4 text-sm leading-snug text-white">
          <span className="font-semibold text-gold">Your phone will ring shortly.</span> Your agent asks three quick questions, then your
          matches appear here.
        </p>
      )}
      {intakeFailed && (
        <p role="alert" className="rounded-2xl border border-line-strong bg-card p-4 text-sm leading-snug">
          We couldn’t finish the call. <Link href={`/r/${data.room.slug}`} className="font-semibold underline">Fill in the form instead</Link>{" "}
          and your agent will match you right away.
        </p>
      )}

      <CircleSection center={center} links={data.circle.links} outer={data.circle.outer} directory={data.circle.directory} />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">People you should meet</h2>
        {data.matches.length === 0 && (
          <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-sm text-muted">
            Matches show up here in a minute or two. You can keep this page open.
          </p>
        )}
        {data.matches.map((m, i) => (
          <MatchCard key={m.key} m={m} first={i === 0} />
        ))}
      </section>

      <section className="flex flex-col items-center gap-3.5 rounded-[20px] bg-ink p-5 text-white">
        <h2 className="self-start font-display text-xl font-semibold">My QR</h2>
        <p className="self-start text-sm leading-snug text-[#C9CCD3]">
          When you meet someone, they scan this with their phone camera. That confirms you met.
        </p>
        {/* qrcode generates this SVG from our own URL; no user HTML involved. */}
        <div className="size-52 rounded-2xl bg-white p-3.5 [&>svg]:size-full" role="img" aria-label="My personal QR code" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <span className="text-[13px] text-[#C9CCD3]">
          {data.me.name} · {data.room.name}
        </span>
      </section>

      {data.toRate.map((r) => (
        <RatePanel key={r.introId} introId={r.introId} label={r.label} />
      ))}

      {data.agentMatches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">An agent can help with this</h2>
          {data.agentMatches.map((a) => (
            <div key={a.id} className="flex flex-col gap-2.5 rounded-[18px] bg-[#EEECE6] p-4">
              <span className="text-[13px] text-muted">Nobody in the room matched this need:</span>
              <span className="font-semibold">“{a.need}”</span>
              <div className="flex items-center gap-2.5 rounded-xl bg-card p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ink">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <rect x="4" y="8" width="16" height="12" rx="2" />
                    <path d="M12 4v4M9 13h.01M15 13h.01" />
                  </svg>
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="text-[15px] font-semibold">{a.agent_name}</span>
                  <span className="text-[13px] text-subtle">{a.why}</span>
                </div>
              </div>
              {a.url && (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">
                  Connect to this agent
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      <IntroduceForm people={data.roomPeople} />

      <section className="flex flex-col gap-3.5 rounded-[18px] border-[1.5px] border-dashed border-[#BDB9AE] p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">My balance</h2>
          <span className="flex items-center gap-1 text-xs font-medium text-muted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Only you see this
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Given", data.balance.given.toFixed(2)],
            ["Received", data.balance.received.toFixed(2)],
            ["Balance", `${data.balance.given - data.balance.received >= 0 ? "+" : ""}${(data.balance.given - data.balance.received).toFixed(2)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-subtle">{label}</span>
              <span className="font-mono text-[22px]">{value}</span>
            </div>
          ))}
        </div>
        <p className="text-[13px] leading-snug text-muted">Reciprocity, not reputation. Receiving help is fine. Everyone starts somewhere.</p>
        <Link href={`/p/${data.me.id}`} className="text-sm font-semibold underline">
          See my public giving profile
        </Link>
      </section>
    </main>
  );
}
