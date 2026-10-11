import "server-only";
import { db } from "@/lib/supabase/server";
import { displayName, initialsOf, SECTORS, sectorOf } from "@/lib/roles";
import type { GraphLink, LinkStage } from "@/components/RoomGraph";
import type { AgentMatch, CallJob, Intro, LedgerEntry, Match, Person, Rating } from "@/lib/types";

// Everything /me renders for the signed-in person, read server-side with the service role.
// Privacy: other people are shown by displayName() (real name only with show_name), never with phone.

type Other = Pick<Person, "id" | "name" | "role" | "show_name" | "who_i_am">;

export type MeMatch = {
  key: string;
  introId: string | null;
  other: { id: string; label: string; initials: string | null; role: string | null };
  combined: number | null;
  theyHelpMe: number | null;
  iHelpThem: number | null;
  why: string;
  status: Intro["status"] | "none";
  iAccepted: boolean | null;
  theyAccepted: boolean | null;
  introducedBy: string | null;
};

export type DirectoryEntry = { id: string; label: string; initials: string | null; line: string; tag: string | null };

export type MeData = {
  me: Pick<Person, "id" | "name" | "role" | "show_name" | "qr_token" | "profile_source">;
  room: { id: string; slug: string; name: string };
  matches: MeMatch[];
  toRate: { introId: string; label: string }[];
  agentMatches: (Pick<AgentMatch, "id" | "need" | "agent_name" | "why"> & { url: string | null })[];
  balance: { given: number; received: number };
  giving: { score: number; verifiedIntros: number; helpfulness: number | null };
  circle: { links: GraphLink[]; outer: number[]; directory: DirectoryEntry[][] };
  roomPeople: { id: string; label: string }[];
  intake: { status: CallJob["status"]; reason: string | null } | null;
};

const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const STAGE: Record<Intro["status"], LinkStage | null> = {
  proposed: "proposed",
  accepted: "accepted",
  met: "met",
  rated: "valuable",
  declined: null,
};

export async function loadMe(personId: string): Promise<MeData | null> {
  const supa = db();
  const { data: me } = await supa
    .from("people")
    .select("id, name, role, show_name, qr_token, profile_source, room_id")
    .eq("id", personId)
    .maybeSingle();
  if (!me) return null;

  const [roomQ, peopleQ, matchesQ, introsQ, ratingsQ, ledgerQ, agentQ, giverQ, intakeQ] = await Promise.all([
    supa.from("rooms").select("id, slug, name").eq("id", me.room_id).single(),
    supa.from("people").select("id, name, role, show_name, who_i_am").eq("room_id", me.room_id),
    supa.from("matches").select("*").or(`a_id.eq.${personId},b_id.eq.${personId}`).order("combined", { ascending: false }),
    supa.from("intros").select("*").or(`a_id.eq.${personId},b_id.eq.${personId}`).order("created_at", { ascending: false }),
    supa.from("ratings").select("intro_id").eq("rater_id", personId),
    supa.from("ledger_entries").select("delta").eq("person_id", personId),
    supa.from("agent_matches").select("id, need, agent_name, why, connect").eq("person_id", personId).order("created_at", { ascending: false }),
    supa.from("public_givers").select("give_score, verified_intros, helpfulness").eq("id", personId).maybeSingle(),
    supa
      .from("call_jobs")
      .select("status, result")
      .eq("person_id", personId)
      .eq("kind", "intake")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const people = new Map<string, Other>((peopleQ.data ?? []).map((p: Other) => [p.id, p]));
  const otherOf = (id: string) => {
    const p = people.get(id);
    if (!p) return { id, label: "Someone here", initials: null, role: null };
    return { id, label: displayName(p), initials: initialsOf(p), role: p.role };
  };

  const intros = (introsQ.data ?? []) as Intro[];
  const introByMatch = new Map(intros.filter((i) => i.match_id).map((i) => [i.match_id!, i]));
  const mine = (i: Intro) => (i.a_id === personId ? i.a_accepted : i.b_accepted);
  const theirs = (i: Intro) => (i.a_id === personId ? i.b_accepted : i.a_accepted);
  const otherId = (row: { a_id: string; b_id: string }) => (row.a_id === personId ? row.b_id : row.a_id);

  const matches: MeMatch[] = ((matchesQ.data ?? []) as Match[]).map((m) => {
    const iAmA = m.a_id === personId;
    const intro = introByMatch.get(m.id) ?? null;
    return {
      key: m.id,
      introId: intro?.id ?? null,
      other: otherOf(otherId(m)),
      combined: m.combined,
      theyHelpMe: iAmA ? m.b_fits_a : m.a_fits_b,
      iHelpThem: iAmA ? m.a_fits_b : m.b_fits_a,
      why: iAmA ? m.why_for_a : m.why_for_b,
      status: intro?.status ?? "none",
      iAccepted: intro ? mine(intro) : null,
      theyAccepted: intro ? theirs(intro) : null,
      introducedBy: null,
    };
  });
  // Human-made intros (someone introduced me) have no match row.
  for (const i of intros) {
    if (i.match_id || i.introducer_id === personId) continue;
    matches.push({
      key: i.id,
      introId: i.id,
      other: otherOf(otherId(i)),
      combined: null,
      theyHelpMe: null,
      iHelpThem: null,
      why: i.note ?? "",
      status: i.status,
      iAccepted: mine(i),
      theyAccepted: theirs(i),
      introducedBy: i.introducer_id ? otherOf(i.introducer_id).label : null,
    });
  }
  const visible = matches.filter((m) => m.status !== "declined");

  const rated = new Set(((ratingsQ.data ?? []) as Pick<Rating, "intro_id">[]).map((r) => r.intro_id));
  const toRate = intros
    .filter((i) => (i.a_id === personId || i.b_id === personId) && (i.status === "met" || i.status === "rated") && !rated.has(i.id))
    .map((i) => ({ introId: i.id, label: otherOf(otherId(i)).label }));

  const deltas = ((ledgerQ.data ?? []) as Pick<LedgerEntry, "delta">[]).map((l) => Number(l.delta));
  const balance = {
    given: deltas.filter((d) => d > 0).reduce((a, b) => a + b, 0),
    received: -deltas.filter((d) => d < 0).reduce((a, b) => a + b, 0),
  };

  // Circle: inner ring = people I'm linked to by an intro or match; outer ring = everyone else, by role.
  const tagFor = new Map<string, string>();
  for (const m of visible) {
    const tag =
      m.status === "met" || m.status === "rated"
        ? "You met"
        : m.introducedBy
          ? `Introduced by ${m.introducedBy}`
          : m.combined !== null
            ? `Your match · ${m.combined}`
            : "Intro";
    tagFor.set(m.other.id, tag);
  }
  for (const i of intros) if (i.introducer_id && i.introducer_id !== personId) tagFor.set(i.introducer_id, "Introduced you");

  const links: GraphLink[] = visible.map((m) => ({
    key: m.key,
    sector: sectorOf(m.other.role),
    label: m.other.label,
    initials: m.other.initials,
    stage: m.status === "none" ? "proposed" : (STAGE[m.status as Intro["status"]] ?? "proposed"),
  }));
  const linked = new Set(visible.map((m) => m.other.id));
  const outer = SECTORS.map(() => 0);
  const directory: DirectoryEntry[][] = SECTORS.map(() => []);
  for (const p of people.values()) {
    if (p.id === personId) continue;
    const s = sectorOf(p.role);
    if (!linked.has(p.id)) outer[s] += 1;
    directory[s].push({
      id: p.id,
      label: displayName(p),
      initials: initialsOf(p),
      line: [p.role, clip(p.who_i_am, 90)].filter(Boolean).join(" · "),
      tag: tagFor.get(p.id) ?? null,
    });
  }
  for (const list of directory) list.sort((a, b) => Number(!!b.tag) - Number(!!a.tag));

  const giver = giverQ.data as { give_score: number; verified_intros: number; helpfulness: number | null } | null;
  const intakeRow = intakeQ.data as { status: CallJob["status"]; result: { reason?: string } | null } | null;

  return {
    me: { id: me.id, name: me.name, role: me.role, show_name: me.show_name, qr_token: me.qr_token, profile_source: me.profile_source },
    room: roomQ.data as MeData["room"],
    matches: visible,
    toRate,
    agentMatches: ((agentQ.data ?? []) as AgentMatch[]).map((a) => ({
      id: a.id,
      need: a.need,
      agent_name: a.agent_name,
      why: a.why,
      url: typeof a.connect?.url === "string" ? (a.connect.url as string) : null,
    })),
    balance,
    giving: {
      score: Number(giver?.give_score ?? 0),
      verifiedIntros: Number(giver?.verified_intros ?? 0),
      helpfulness: giver?.helpfulness == null ? null : Number(giver.helpfulness),
    },
    circle: { links, outer, directory },
    roomPeople: [...people.values()].filter((p) => p.id !== personId).map((p) => ({ id: p.id, label: displayName(p) })),
    intake: intakeRow ? { status: intakeRow.status, reason: intakeRow.result?.reason ?? null } : null,
  };
}
