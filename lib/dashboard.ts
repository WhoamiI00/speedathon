import "server-only";
import { db } from "@/lib/supabase/server";
import { displayName, initialsOf, SECTORS, sectorOf } from "@/lib/roles";
import type { GraphLink, LinkStage } from "@/components/RoomGraph";
import type { Intro, Person, PublicGiver } from "@/lib/types";

// Big-screen data (PLAN §4 /dashboard). Public-safe only: display names honour show_name, the giving side
// is shown, the taking side never is.

type P = Pick<Person, "id" | "name" | "role" | "show_name" | "created_at">;

export type FeedItem = { id: string; text: string; tone: "gold" | "ink" | "muted"; minutesAgo: number };

export type DashboardData = {
  room: { name: string; slug: string };
  connectors: { id: string; label: string; score: number; note: string }[];
  graph: { center: { initials: string; name: string; tag: string }; links: GraphLink[]; outer: number[] } | null;
  stats: { checkedIn: number; intros: number; met: number; medianMinutesToMeet: number | null };
  feed: FeedItem[];
};

const STAGE: Record<Intro["status"], LinkStage | null> = { proposed: "proposed", accepted: "accepted", met: "met", rated: "valuable", declined: null };
const ago = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export async function loadDashboard(slug: string): Promise<DashboardData | null> {
  const supa = db();
  const { data: room } = await supa.from("rooms").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!room) return null;

  const [peopleQ, introsQ, giversQ] = await Promise.all([
    supa.from("people").select("id, name, role, show_name, created_at").eq("room_id", room.id),
    supa.from("intros").select("*").eq("room_id", room.id).order("created_at", { ascending: false }),
    supa.from("public_givers").select("*").gt("give_score", 0).order("give_score", { ascending: false }).limit(20),
  ]);
  const people = new Map<string, P>((peopleQ.data ?? []).map((p: P) => [p.id, p]));
  const label = (id: string | null) => (id && people.get(id) ? displayName(people.get(id)!) : "Someone");
  const intros = (introsQ.data ?? []) as Intro[];

  const connectors = ((giversQ.data ?? []) as PublicGiver[])
    .filter((g) => people.has(g.id))
    .slice(0, 5)
    .map((g) => ({
      id: g.id,
      label: g.display_name,
      score: Number(g.give_score),
      note: g.verified_intros > 0 ? `${g.verified_intros} verified ${g.verified_intros === 1 ? "intro" : "intros"}` : "helped people",
    }));

  // Graph centred on the top connector: everyone they introduced or met through an intro.
  let graph: DashboardData["graph"] = null;
  const top = connectors[0] ? people.get(connectors[0].id) : undefined;
  if (top) {
    const links: GraphLink[] = [];
    const seen = new Set<string>();
    for (const i of intros) {
      const stage = STAGE[i.status];
      if (!stage) continue;
      const others = i.introducer_id === top.id ? [i.a_id, i.b_id] : i.a_id === top.id ? [i.b_id] : i.b_id === top.id ? [i.a_id] : [];
      for (const o of others) {
        const p = people.get(o);
        if (!p || seen.has(o)) continue;
        seen.add(o);
        links.push({ key: `${i.id}-${o}`, sector: sectorOf(p.role), label: displayName(p), initials: initialsOf(p), stage });
      }
    }
    const outer = SECTORS.map(() => 0);
    for (const p of people.values()) if (p.id !== top.id && !seen.has(p.id)) outer[sectorOf(p.role)] += 1;
    graph = { center: { initials: initialsOf({ ...top, show_name: top.show_name }) ?? "★", name: displayName(top), tag: "TOP CONNECTOR" }, links, outer };
  }

  // Minutes from check-in to first confirmed meeting (met_at), per person, median.
  const firstMet = new Map<string, number>();
  for (const i of intros) {
    if (!i.met_at) continue;
    const t = new Date(i.met_at).getTime();
    for (const id of [i.a_id, i.b_id]) if (!firstMet.has(id) || t < firstMet.get(id)!) firstMet.set(id, t);
  }
  const waits = [...firstMet.entries()]
    .map(([id, t]) => (people.get(id) ? (t - new Date(people.get(id)!.created_at).getTime()) / 60000 : null))
    .filter((m): m is number => m !== null && m >= 0)
    .sort((a, b) => a - b);
  const median = waits.length ? Math.round(waits[Math.floor(waits.length / 2)]) : null;

  const feed: FeedItem[] = intros.slice(0, 7).map((i) => {
    const pair = `${label(i.a_id)} and ${label(i.b_id)}`;
    const by = i.introducer_id ? `${label(i.introducer_id)}’s intro: ` : "";
    const text =
      i.status === "rated"
        ? `${by}${pair} rated their meeting valuable`
        : i.status === "met"
          ? `${by}${pair} just met`
          : i.status === "accepted"
            ? `${by}${pair} both said yes`
            : i.status === "declined"
              ? `${pair} will meet another time`
              : i.introducer_id
                ? `${label(i.introducer_id)} introduced ${pair}`
                : `${pair} were matched`;
    return { id: i.id, text, tone: i.status === "rated" ? "gold" : i.status === "met" ? "ink" : "muted", minutesAgo: ago(i.met_at ?? i.created_at) };
  });

  return {
    room: { name: room.name, slug: room.slug },
    connectors,
    graph,
    stats: {
      checkedIn: people.size,
      intros: intros.filter((i) => i.status !== "declined").length,
      met: intros.filter((i) => i.status === "met" || i.status === "rated").length,
      medianMinutesToMeet: median,
    },
    feed,
  };
}
