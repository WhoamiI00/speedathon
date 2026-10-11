import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getPersonId } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import type { LedgerEntry, PublicGiver } from "@/lib/types";

export const metadata = { title: "Giving profile · Sevendipity" };

// Public giving profile (PLAN §4 /p/[id]): give score, verified intros, helpfulness. Never the balance
// or anything received: only positive ledger entries are read.
export default async function ProfilePage(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supa = db();
  const [{ data: giver }, { data: gives }, viewer] = await Promise.all([
    supa.from("public_givers").select("*").eq("id", id).maybeSingle(),
    supa
      .from("ledger_entries")
      .select("id, kind, stage, delta, created_at")
      .eq("person_id", id)
      .gt("delta", 0)
      .order("created_at", { ascending: false })
      .limit(8),
    getPersonId(),
  ]);
  if (!giver) notFound();
  const g = giver as PublicGiver;
  const initials = g.display_name
    .split(/\s+/)
    .filter((w) => !/^an?$/i.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-5 pb-10">
      <header className="flex items-center justify-between">
        <Logo />
        {viewer ? (
          <Link href="/me" className="flex h-11 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3.5 text-sm font-semibold">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            My page
          </Link>
        ) : (
          <Link href="/r/speedhacks" className="flex h-11 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white">
            Check in
          </Link>
        )}
      </header>

      <div className="flex flex-col items-center gap-2.5 pt-2 text-center">
        <span className="flex size-22 items-center justify-center rounded-full bg-ink text-[28px] font-semibold text-white shadow-[0_0_0_6px_rgba(240,178,62,0.35)]">
          {initials || "·"}
        </span>
        <h1 className="font-display text-[28px] font-bold tracking-tight">{g.display_name}</h1>
        {g.role && <span className="text-muted">{g.role}</span>}
      </div>

      <div className="flex flex-col items-center gap-1 rounded-[20px] bg-ink p-5 text-white">
        <span className="text-sm text-[#C9CCD3]">Give score</span>
        <span className="font-display text-[56px] leading-none font-bold text-gold">{Number(g.give_score).toFixed(2)}</span>
        <span className="text-[13px] text-[#C9CCD3]">Verified value created for others</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Stat value={String(g.verified_intros)} label={g.verified_intros === 1 ? "Verified helpful intro" : "Verified helpful intros"} />
        <Stat value={g.helpfulness == null ? "–" : Number(g.helpfulness).toFixed(1)} suffix={g.helpfulness == null ? "" : " / 3"} label="Helpfulness" />
      </div>

      {gives && gives.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-lg font-semibold">Recent giving</h2>
          <div className="rounded-2xl border border-line bg-card px-3.5">
            {(gives as Pick<LedgerEntry, "id" | "kind" | "stage" | "delta">[]).map((l, i) => (
              <div key={l.id} className={`flex items-center gap-2.5 py-3 ${i ? "border-t border-[#EEEBE4]" : ""}`}>
                <span className="flex-1 text-sm leading-snug">{describe(l)}</span>
                <span className="font-mono text-sm text-gold-ink">+{Number(l.delta).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-[13px] leading-snug text-muted">Sevendipity shows what people give. What they receive is never shown publicly.</p>
    </main>
  );
}

function describe(l: Pick<LedgerEntry, "kind" | "stage">): string {
  if (l.kind === "value_flow") return "Someone said their help made a difference";
  if (l.stage === "valuable") return "An intro they made was rated valuable by both people";
  if (l.stage === "met") return "Two people they introduced met";
  if (l.stage === "accepted") return "Two people accepted their intro";
  return "Helped someone at the event";
}

function Stat({ value, suffix = "", label }: { value: string; suffix?: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-3.5">
      <span className="font-mono text-[26px]">
        {value}
        {suffix && <span className="text-[15px] text-subtle">{suffix}</span>}
      </span>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  );
}
