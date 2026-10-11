import "server-only";
import { generateJSON } from "@/lib/llm";
import { db } from "@/lib/supabase/server";
import { emit, EV } from "@/lib/keewano";
import { darwinConfigured, searchAgents } from "@/lib/darwin";
import { enqueueCall } from "@/lib/dial/enqueue";
import type { Person } from "@/lib/types";

// Owner: T2. Bilateral matching (PLAN §8): one LLM call per run, whole room in the prompt.

const MIN_FIT = 6; // propose only if BOTH directions score >= 6/10
const MAX_MATCHES = 3;

type Candidate = Pick<Person, "id" | "role" | "who_i_am" | "needs" | "gives" | "follow_through">;

/** What the model returns, from the target's point of view (a = target, b = candidate). */
type RawMatch = { candidate_id: string; b_fits_a: number; a_fits_b: number; why_for_a: string; why_for_b: string };
type MatchOutput = { matches: RawMatch[]; unmet_needs: string[] };

export type RankedMatch = RawMatch & { combined: number; reliability_score: number };

export type MatchRunResult = {
  person_id: string;
  matches: (RankedMatch & { match_id: string; intro_id: string | null; intro_created: boolean })[];
  unmet_needs: string[];
};

const SYSTEM = `You are Sevendipity's matching agent at SpeedHacks SF. Find the people the TARGET should meet.
Evaluate BOTH directions: how well each candidate satisfies the target's needs (b_fits_a), and how well the target satisfies the candidate's needs (a_fits_b). Score each 0-10.
Interpret needs and offers semantically, not by keyword. Prefer mutual value. Never propose a one-sided match where either direction is below ${MIN_FIT}.
A candidate's follow_through (0-1) is how reliably they follow up on intros; use it only to break ties between similar fits.
Return up to ${MAX_MATCHES} matches. For each, write why_for_a (addressed to the target) and why_for_b (addressed to the candidate): one concrete sentence each, naming the specific need and offer, in a warm, direct tone. Do not use anyone's name; say "they".
Also list which of the target's needs have no candidate scoring >= ${MIN_FIT} on b_fits_a (unmet_needs), phrased as short needs.
Only use candidate ids from the list.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matches", "unmet_needs"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "b_fits_a", "a_fits_b", "why_for_a", "why_for_b"],
        properties: {
          candidate_id: { type: "string" },
          b_fits_a: { type: "integer" },
          a_fits_b: { type: "integer" },
          why_for_a: { type: "string" },
          why_for_b: { type: "string" },
        },
      },
    },
    unmet_needs: { type: "array", items: { type: "string" } },
  },
};

const oneLine = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function candidateLine(c: Candidate): string {
  return [c.id, c.role ?? "", oneLine(c.who_i_am, 120), oneLine(c.needs, 240), oneLine(c.gives, 240), Number(c.follow_through).toFixed(2)].join(" | ");
}

function buildPrompt(target: Person, candidates: Candidate[]): string {
  return `TARGET
role: ${target.role ?? ""}
who: ${oneLine(target.who_i_am, 600)}
needs: ${oneLine(target.needs, 600)}
gives: ${oneLine(target.gives, 600)}

CANDIDATES (id | role | who | needs | gives | follow_through)
${candidates.map(candidateLine).join("\n")}`;
}

const clamp10 = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

/**
 * Validate the model's output and rank it. Pure, so it is easy to test.
 * combined = round(10 * sqrt(b_fits_a * a_fits_b)); rank by combined * (0.7 + 0.6 * follow_through) (PLAN §6b).
 */
export function rankMatches(raw: RawMatch[], candidates: Map<string, Pick<Candidate, "follow_through">>): RankedMatch[] {
  const seen = new Set<string>();
  const out: RankedMatch[] = [];
  for (const m of raw) {
    const cand = candidates.get(m.candidate_id);
    if (!cand || seen.has(m.candidate_id)) continue;
    const b = clamp10(m.b_fits_a);
    const a = clamp10(m.a_fits_b);
    if (b < MIN_FIT || a < MIN_FIT) continue;
    seen.add(m.candidate_id);
    const combined = Math.round(10 * Math.sqrt(b * a));
    const raw = Number(cand.follow_through);
    const ft = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.5; // 0 is a real score, not "missing"
    out.push({
      ...m,
      b_fits_a: b,
      a_fits_b: a,
      why_for_a: oneLine(m.why_for_a, 400),
      why_for_b: oneLine(m.why_for_b, 400),
      combined,
      reliability_score: combined * (0.7 + 0.6 * ft),
    });
  }
  return out.sort((x, y) => y.reliability_score - x.reliability_score).slice(0, MAX_MATCHES);
}

/** Store each pair once with the lower uuid as a_id, swapping the directional fields to match. */
export function toMatchRow(roomId: string, targetId: string, m: RankedMatch) {
  const targetIsA = targetId < m.candidate_id;
  return targetIsA
    ? { room_id: roomId, a_id: targetId, b_id: m.candidate_id, b_fits_a: m.b_fits_a, a_fits_b: m.a_fits_b, combined: m.combined, why_for_a: m.why_for_a, why_for_b: m.why_for_b }
    : { room_id: roomId, a_id: m.candidate_id, b_id: targetId, b_fits_a: m.a_fits_b, a_fits_b: m.b_fits_a, combined: m.combined, why_for_a: m.why_for_b, why_for_b: m.why_for_a };
}

export async function proposeMatches(target: Person, candidates: Candidate[]): Promise<MatchOutput> {
  const parsed = await generateJSON<Partial<MatchOutput>>({
    system: SYSTEM,
    user: buildPrompt(target, candidates),
    schema: OUTPUT_SCHEMA,
    maxTokens: 16000,
    timeoutMs: 50_000, // route maxDuration is 60s
  });
  return {
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    unmet_needs: Array.isArray(parsed.unmet_needs) ? parsed.unmet_needs.filter((s) => typeof s === "string") : [],
  };
}

/**
 * Run matching for one person: LLM → matches upsert → proposed AI intros → briefing call for the #1 match.
 * Call this directly from server code (check-in, call tick). It trusts personId, so never expose it unauthenticated.
 */
export async function runMatch(personId: string): Promise<MatchRunResult> {
  const supa = db();

  const { data: target, error: tErr } = await supa.from("people").select("*").eq("id", personId).maybeSingle<Person>();
  if (tErr) throw new Error(tErr.message);
  if (!target) throw new Error("person not found");
  if (!target.needs.trim() && !target.gives.trim()) return { person_id: personId, matches: [], unmet_needs: [] };

  const { data: others, error: oErr } = await supa
    .from("people")
    .select("id, role, who_i_am, needs, gives, follow_through")
    .eq("room_id", target.room_id)
    .neq("id", personId)
    .returns<Candidate[]>();
  if (oErr) throw new Error(oErr.message);
  const candidates = (others ?? []).filter((c) => c.needs.trim() || c.gives.trim());
  if (candidates.length === 0) return { person_id: personId, matches: [], unmet_needs: [] };

  const output = await proposeMatches(target, candidates);
  const ranked = rankMatches(output.matches, new Map(candidates.map((c) => [c.id, c])));

  const results: MatchRunResult["matches"] = [];
  for (const m of ranked) {
    const row = toMatchRow(target.room_id, personId, m);
    const { data: match, error: mErr } = await supa.from("matches").upsert(row, { onConflict: "a_id,b_id" }).select("id").single();
    if (mErr) throw new Error(mErr.message);

    // One AI intro per pair: skip if any intro (AI or human, any status) already exists between them.
    const { data: existing, error: iErr } = await supa
      .from("intros")
      .select("id")
      .or(`and(a_id.eq.${row.a_id},b_id.eq.${row.b_id}),and(a_id.eq.${row.b_id},b_id.eq.${row.a_id})`)
      .limit(1);
    if (iErr) throw new Error(iErr.message);

    let introId: string | null = existing?.[0]?.id ?? null;
    let introCreated = false;
    if (!introId) {
      const { data: intro, error: insErr } = await supa
        .from("intros")
        .insert({ room_id: target.room_id, a_id: row.a_id, b_id: row.b_id, match_id: match.id, status: "proposed" })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      introId = intro.id as string;
      introCreated = true;
      emit(row.a_id, EV.intro_proposed, introId);
      emit(row.b_id, EV.intro_proposed, introId);
    }

    emit(personId, EV.match_proposed, m.candidate_id);
    emit(m.candidate_id, EV.match_proposed, personId);
    emit(personId, EV.match_score, m.combined);
    emit(m.candidate_id, EV.match_score, m.combined);

    results.push({ ...m, match_id: match.id as string, intro_id: introId, intro_created: introCreated });
  }

  // Briefing call for the #1 match (PLAN §5). enqueueCall checks call consent + phone and dedupes per intro.
  const top = results[0];
  if (top?.intro_created && top.intro_id) {
    const r = await enqueueCall({ personId, kind: "briefing", introId: top.intro_id });
    if (!r.queued && r.reason !== "person did not opt in to calls" && r.reason !== "no phone") {
      console.error("[match] enqueue briefing failed", r.reason);
    }
  }

  const unmet = output.unmet_needs.map((n) => oneLine(n, 256)).filter(Boolean);
  for (const need of unmet) emit(personId, EV.need_unmet, need);

  // Darwin (PLAN §7): an agent for each need no human covers. Never lets a Darwin outage break matching.
  if (unmet.length && darwinConfigured()) {
    for (const need of unmet.slice(0, 3)) {
      try {
        const cards = await searchAgents(need, target.who_i_am);
        if (cards.length) await supa.from("agent_matches").delete().eq("person_id", personId).eq("need", need); // re-runs replace, not duplicate
        for (const c of cards) {
          const { error } = await supa.from("agent_matches").insert({ person_id: personId, need, agent_name: c.agent_name, why: c.why, connect: c.connect });
          if (error) console.error("[match] agent_matches insert failed", error.message);
          else emit(personId, EV.darwin_agent_matched, c.agent_name);
        }
      } catch (e) {
        console.error("[match] darwin failed", e instanceof Error ? e.message : e);
      }
    }
  }

  return { person_id: personId, matches: results, unmet_needs: unmet };
}
