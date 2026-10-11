import Link from "next/link";
import { db } from "@/lib/supabase/server";
import { getPersonId } from "@/lib/session";
import { introLabel, origin, publicLabel, qrSvg, short } from "@/lib/ui";
import type { AgentMatch, Intro, Match, Person } from "@/lib/types";
import Refresher from "@/app/refresher";
import { card, muted, primaryBtn } from "@/app/ui";
import { IntroduceForm, RateButtons, RespondButtons } from "./actions";

// Owner: T5 (minimal). Everything a checked-in person does: intros, QR, ratings, introducing others, private balance.

type Who = Pick<Person, "id" | "name" | "role" | "who_i_am" | "show_name">;

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export default async function MePage() {
  const pid = await getPersonId();
  const supa = db();
  const { data: me } = pid
    ? await supa.from("people").select("id,name,role,room_id,qr_token,profile_source,needs,gives").eq("id", pid).maybeSingle()
    : { data: null };

  if (!me) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10 text-center">
        <h1 className="text-2xl font-semibold">You&apos;re not checked in yet</h1>
        <Link className={`${primaryBtn} py-3`} href="/r/speedhacks">
          Check in
        </Link>
      </main>
    );
  }

  const [{ data: intros }, { data: myRatings }, { data: ledger }, { data: lastCall }, { data: agents }, { data: room }] = await Promise.all([
    supa.from("intros").select("*").or(`a_id.eq.${me.id},b_id.eq.${me.id}`).order("created_at", { ascending: false }),
    supa.from("ratings").select("intro_id").eq("rater_id", me.id),
    supa.from("ledger_entries").select("delta").eq("person_id", me.id),
    supa.from("call_jobs").select("kind,status,result").eq("person_id", me.id).order("created_at", { ascending: false }).limit(1),
    supa.from("agent_matches").select("*").eq("person_id", me.id).order("created_at", { ascending: false }),
    supa.from("people").select("id,name,role,who_i_am,show_name").eq("room_id", me.room_id).neq("id", me.id).order("created_at"),
  ]);

  const list = (intros ?? []) as Intro[];
  const roomPeople = (room ?? []) as Who[];
  const byId = new Map(roomPeople.map((p) => [p.id, p]));
  const matchIds = list.map((i) => i.match_id).filter((x): x is string => !!x);
  const { data: matches } = matchIds.length ? await supa.from("matches").select("*").in("id", matchIds) : { data: [] };
  const matchById = new Map(((matches ?? []) as Match[]).map((m) => [m.id, m]));
  const rated = new Set((myRatings ?? []).map((r) => r.intro_id));

  const deltas = (ledger ?? []).map((l) => Number(l.delta));
  const balance = deltas.reduce((a, d) => a + d, 0);
  const given = deltas.filter((d) => d > 0).reduce((a, d) => a + d, 0);

  const meetUrl = `${await origin()}/meet/${me.qr_token}`;
  const qr = await qrSvg(meetUrl);
  const call = lastCall?.[0];
  const waitingForProfile = !me.needs && !me.gives;

  const order: Record<Intro["status"], number> = { met: 0, accepted: 1, proposed: 2, rated: 3, declined: 4 };
  const sorted = [...list].sort((x, y) => order[x.status] - order[y.status]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <Refresher />
      <header>
        <p className="text-sm text-zinc-500">Checked in as</p>
        <h1 className="text-3xl font-semibold tracking-tight">{me.name}</h1>
        {me.role && <p className={muted}>{me.role}</p>}
      </header>

      {call?.kind === "intake" && (call.status === "queued" || call.status === "dialing") && (
        <p className={`${card} bg-zinc-50 dark:bg-zinc-900`}>📞 Your agent is calling you now. Pick up for a 90-second interview.</p>
      )}
      {call?.kind === "intake" && call.status === "failed" && waitingForProfile && (
        <p className={`${card} border-amber-400`}>
          We couldn&apos;t finish the call. <Link className="underline" href="/r/speedhacks">Fill in the form instead</Link>.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">People you should meet</h2>
        {!sorted.length && <p className={muted}>{waitingForProfile ? "Finish your profile to get matches." : "Your agent is finding people… this page updates by itself."}</p>}
        {sorted.map((intro) => {
          const otherId = intro.a_id === me.id ? intro.b_id : intro.a_id;
          const other = byId.get(otherId);
          const introducer = intro.introducer_id ? byId.get(intro.introducer_id) : null;
          const match = intro.match_id ? matchById.get(intro.match_id) : undefined;
          const why = match ? (match.a_id === me.id ? match.why_for_a : match.why_for_b) : intro.note;
          const myAccept = intro.a_id === me.id ? intro.a_accepted : intro.b_accepted;
          const mutual = ["accepted", "met", "rated"].includes(intro.status);
          return (
            <article key={intro.id} className={`${card} ${intro.status === "declined" ? "opacity-50" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{other ? introLabel(other, mutual) : "Someone here"}</h3>
                {match && <span className="text-sm text-zinc-500">{match.combined}% fit</span>}
              </div>
              {other && <p className="text-sm text-zinc-500">{[other.role, short(other.who_i_am, 90)].filter(Boolean).join(" · ")}</p>}
              {introducer && <p className="mt-1 text-sm text-zinc-500">Introduced by {publicLabel(introducer)}</p>}
              {why && <p className="mt-2">{why}</p>}

              {intro.status === "proposed" && !myAccept && <RespondButtons introId={intro.id} />}
              {intro.status === "proposed" && myAccept && <p className={`mt-3 text-sm ${muted}`}>You said yes. Waiting for them.</p>}
              {intro.status === "accepted" && (
                <p className="mt-3 text-sm font-medium">✅ You both said yes. Find each other and scan their QR code (or show them yours below).</p>
              )}
              {intro.status === "met" && !rated.has(intro.id) && <RateButtons introId={intro.id} />}
              {intro.status === "met" && rated.has(intro.id) && <p className={`mt-3 text-sm ${muted}`}>Thanks for rating. Waiting for their rating.</p>}
              {intro.status === "rated" && <p className={`mt-3 text-sm ${muted}`}>Done. Thanks for rating.</p>}
              {intro.status === "declined" && <p className={`mt-3 text-sm ${muted}`}>Declined.</p>}
            </article>
          );
        })}
      </section>

      {!!agents?.length && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">An agent can help with this</h2>
          {(agents as AgentMatch[]).map((a) => (
            <article key={a.id} className={card}>
              <p className="text-sm text-zinc-500">For: {a.need}</p>
              <h3 className="font-semibold">{a.agent_name}</h3>
              <p className="mt-1">{a.why}</p>
            </article>
          ))}
        </section>
      )}

      <section className={`${card} flex flex-col items-center gap-2 text-center`}>
        <h2 className="text-lg font-semibold">My QR code</h2>
        <p className={`text-sm ${muted}`}>When you meet someone, let them scan this with their phone camera.</p>
        <div className="w-56 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Introduce two people</h2>
        <p className={`text-sm ${muted}`}>Know two people here who should meet? You earn give credit when it turns out valuable.</p>
        <IntroduceForm people={roomPeople.map((p) => ({ id: p.id, label: `${publicLabel(p)} · ${short(p.who_i_am, 60)}` }))} />
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">My reciprocity balance</h2>
        <p className="text-3xl font-semibold">{fmt(balance)}</p>
        <p className={`text-sm ${muted}`}>
          Given to others: {fmt(given)}. Only you can see your balance. It measures reciprocity, not reputation: receiving help is fine.
        </p>
        <Link className="mt-2 inline-block text-sm underline" href={`/p/${me.id}`}>
          My public giving profile →
        </Link>
      </section>
    </main>
  );
}
