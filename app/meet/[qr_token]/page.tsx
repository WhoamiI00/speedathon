import Link from "next/link";
import { Logo } from "@/components/Logo";
import { RecordEncounter } from "@/components/RecordEncounter";
import { displayName, initialsOf } from "@/lib/roles";
import { getPersonId } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import type { Intro } from "@/lib/types";

export const metadata = { title: "We met · Sevendipity" };

// What a phone's native camera opens after scanning someone's personal QR (PLAN §4).
// The scanner's cookie identifies them; the encounter itself is recorded by T2's POST /api/encounters.
export default async function MeetPage(props: PageProps<"/meet/[qr_token]">) {
  const { qr_token } = await props.params;
  const supa = db();
  const { data: them } = await supa.from("people").select("id, name, role, show_name").eq("qr_token", qr_token).maybeSingle();
  const pid = await getPersonId();

  if (!them) return <Shell title="This code isn’t valid" body="Ask them to open their QR again on their page." />;
  if (!pid) {
    return (
      <Shell title="Check in first" body="Check in to the event, then scan their code again to confirm you met.">
        <Link href="/r/speedhacks" className="flex h-13 items-center justify-center rounded-2xl bg-ink font-semibold text-white">
          Check in
        </Link>
      </Shell>
    );
  }
  if (pid === them.id) return <Shell title="That’s your own code" body="Show it to the person you just met so they can scan it." />;

  const [{ data: meRow }, { data: intro }] = await Promise.all([
    supa.from("people").select("name, role, show_name").eq("id", pid).maybeSingle(),
    supa
      .from("intros")
      .select("status")
      .or(`and(a_id.eq.${pid},b_id.eq.${them.id}),and(a_id.eq.${them.id},b_id.eq.${pid})`)
      .neq("status", "declined")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const label = displayName(them);
  const status = (intro as Pick<Intro, "status"> | null)?.status ?? null;
  const steps = [
    { label: "Intro proposed", done: status !== null },
    { label: "You both accepted", done: status === "accepted" || status === "met" || status === "rated" },
    { label: "You met", done: status === "met" || status === "rated", now: true },
    { label: "Both rate how much it helped", done: status === "rated" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-7 px-5 pt-5 pb-10">
      <Logo />
      <div className="flex flex-col items-center gap-4 pt-6 text-center">
        <div className="flex items-center">
          <Avatar text={meRow ? (initialsOf({ ...meRow, show_name: true }) ?? "Me") : "Me"} dark />
          <span className="relative -mx-2.5 flex size-10 items-center justify-center rounded-full bg-gold">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15171C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>
          <Avatar text={initialsOf(them) ?? "?"} />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight">You met {label}</h1>
        <p className="max-w-[300px] text-muted">
          {status ? "Your intro is confirmed. Enjoy the conversation." : "Nice to meet. It’s saved, even without an intro."}
        </p>
      </div>

      <RecordEncounter qrToken={qr_token} />

      {status && (
        <ol className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-card p-4">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-3">
              <span
                className={`flex size-6.5 items-center justify-center rounded-full text-[13px] ${
                  s.done ? (s.now ? "bg-gold font-semibold" : "bg-ink text-white") : "border-[1.5px] border-[#BDB9AE]"
                }`}
              >
                {i + 1}
              </span>
              <span className={`flex-1 ${s.now && s.done ? "font-semibold" : s.done ? "" : "text-muted"}`}>{s.label}</span>
              <span className={`text-[13px] font-semibold ${s.done ? "text-good" : "text-subtle"}`}>{s.done ? "Done" : "Next"}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-2.5">
        <p className="text-center text-sm leading-snug text-muted">After you talk, rate it on your page. Your agent may also call to ask.</p>
        <Link href="/me" className="flex h-13 items-center justify-center rounded-2xl bg-ink font-semibold text-white">
          Back to my page
        </Link>
      </div>
    </main>
  );
}

function Avatar({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <span
      className={`flex size-18 items-center justify-center rounded-full border-4 border-ground text-[22px] font-semibold ${
        dark ? "bg-ink text-white" : "bg-[#DCE6F5]"
      }`}
    >
      {text}
    </span>
  );
}

function Shell({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-5 pb-10">
      <Logo />
      <div className="flex flex-col gap-2 pt-10 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted">{body}</p>
      </div>
      {children}
    </main>
  );
}
