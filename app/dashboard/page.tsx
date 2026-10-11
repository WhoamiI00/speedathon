import Link from "next/link";
import { db } from "@/lib/supabase/server";
import { origin, publicLabel, qrSvg } from "@/lib/ui";
import type { Intro, Person, PublicGiver } from "@/lib/types";
import Refresher from "@/app/refresher";
import { card, muted } from "@/app/ui";
import { AskRoom, Ticker } from "./live";

// Big screen (PLAN §4). Minimal version: the team will redesign it. Shows only public, anonymized data:
// giving is public, taking (balances, debits) never appears here.

const STATUS_TEXT: Record<Intro["status"], string> = {
  proposed: "were introduced",
  accepted: "both said yes",
  met: "just met",
  rated: "rated their meeting",
  declined: "passed",
};

export default async function Dashboard() {
  const supa = db();
  const { data: room } = await supa.from("rooms").select("id,name,slug").eq("slug", "speedhacks").single();
  const [{ data: people }, { data: intros }, { data: ratings }, { data: givers }, { count: agentCount }] = await Promise.all([
    supa.from("people").select("id,name,role,show_name,is_seed").eq("room_id", room!.id),
    supa.from("intros").select("id,a_id,b_id,introducer_id,status,created_at,met_at").eq("room_id", room!.id).order("created_at", { ascending: false }),
    supa.from("ratings").select("intro_id,value"),
    supa.from("public_givers").select("*").gt("give_score", 0).order("give_score", { ascending: false }).limit(8),
    supa.from("agent_matches").select("id", { count: "exact", head: true }),
  ]);

  const ppl = (people ?? []) as Pick<Person, "id" | "name" | "role" | "show_name" | "is_seed">[];
  const byId = new Map(ppl.map((p) => [p.id, p]));
  const all = (intros ?? []) as Intro[];
  const byIntro = new Map<string, number[]>();
  for (const r of ratings ?? []) byIntro.set(r.intro_id, [...(byIntro.get(r.intro_id) ?? []), r.value]);
  const valuable = all.filter((i) => i.status === "rated" && (byIntro.get(i.id) ?? []).every((v) => v >= 2)).length;

  const stats: [string, number][] = [
    ["Checked in", ppl.filter((p) => !p.is_seed).length],
    ["Intros", all.length],
    ["Human intros", all.filter((i) => i.introducer_id).length],
    ["Met (QR)", all.filter((i) => ["met", "rated"].includes(i.status)).length],
    ["Valuable meetings", valuable],
    ["Needs covered by agents", agentCount ?? 0],
  ];

  const label = (id: string) => {
    const p = byId.get(id);
    return p ? publicLabel(p) : "Someone";
  };
  const checkinUrl = `${await origin()}/r/${room!.slug}`;
  const qr = await qrSvg(checkinUrl);

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-6 lg:grid-cols-3">
      <Refresher />
      <section className="flex flex-col gap-4 lg:col-span-2">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-500">{room!.name}</p>
            <h1 className="text-4xl font-semibold tracking-tight">Giverank live</h1>
          </div>
          <Ticker />
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map(([k, v]) => (
            <div key={k} className={card}>
              <p className="text-3xl font-semibold">{v}</p>
              <p className="text-sm text-zinc-500">{k}</p>
            </div>
          ))}
        </div>

        <div className={card}>
          <h2 className="mb-2 text-lg font-semibold">Ask the room</h2>
          <AskRoom />
        </div>

        <div className={card}>
          <h2 className="mb-2 text-lg font-semibold">Live activity</h2>
          {!all.length && <p className={muted}>No intros yet. Scan the QR code to check in.</p>}
          <ul className="flex flex-col gap-1">
            {all.slice(0, 10).map((i) => (
              <li key={i.id}>
                {label(i.a_id)} and {label(i.b_id)} {STATUS_TEXT[i.status]}
                {i.introducer_id && <span className="text-zinc-500"> · intro by {label(i.introducer_id)}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className={`${card} flex flex-col items-center gap-2 text-center`}>
          <h2 className="text-lg font-semibold">Scan to check in</h2>
          <div className="w-64 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-xs text-zinc-500">{checkinUrl}</p>
        </div>
        <div className={card}>
          <h2 className="mb-2 text-lg font-semibold">Top connectors</h2>
          {!givers?.length && <p className={muted}>Nobody yet. Make a valuable intro to get on the board.</p>}
          <ol className="flex flex-col gap-1">
            {((givers ?? []) as PublicGiver[]).map((g, n) => (
              <li key={g.id} className="flex justify-between gap-2">
                <Link className="underline-offset-2 hover:underline" href={`/p/${g.id}`}>
                  {n + 1}. {g.display_name}
                </Link>
                <span className="tabular-nums">{Number(g.give_score).toFixed(2)}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </main>
  );
}
