import "server-only";
import { db } from "@/lib/supabase/server";
import { emit, EV } from "@/lib/keewano";
import { enqueueCall } from "@/lib/dial/enqueue";
import type { Intro, LedgerEntry } from "@/lib/types";

// Owner: T2. Ledger rules (PLAN §2). Every write is a set of rows that sums to 0.

/** Thrown for expected failures; routes map `status` to the HTTP status. */
export class IntroError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Route helper: IntroError → its status, anything else → logged 500 without internals. */
export function errorResponse(e: unknown, tag: string): Response {
  if (e instanceof IntroError) return Response.json({ error: e.message }, { status: e.status });
  console.error(`[${tag}]`, e);
  return Response.json({ error: "something went wrong" }, { status: 500 });
}

/** Parse a JSON body; an empty or invalid body becomes {}. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type Stage = "accepted" | "met" | "valuable";

/** §2a staged rewards for HUMAN intros: introducer credit, split as equal debits on the two people introduced. */
export const STAGE_CREDIT: Record<Stage, number> = { accepted: 0.2, met: 0.3, valuable: 0.5 };

/** "Valuable" = both people rated the meeting >= 2 (PLAN §2a). */
const VALUABLE_MIN = 2;

type Row = Pick<LedgerEntry, "person_id" | "intro_id" | "kind" | "stage" | "delta">;

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const round4 = (n: number) => Math.round(n * 10000) / 10000;

async function insertRows(rows: Row[]): Promise<void> {
  const clean = rows.map((r) => ({ ...r, delta: round4(r.delta) })).filter((r) => r.delta !== 0);
  if (!clean.length) return;
  const { error } = await db().from("ledger_entries").insert(clean);
  if (error) throw new Error(`ledger insert failed: ${error.message}`);
  for (const r of clean) {
    const milli = Math.round(Math.abs(r.delta) * 1000);
    emit(r.person_id, r.delta > 0 ? EV.give_credit_milli : EV.take_debit_milli, milli);
  }
}

/** Credit the introducer for a stage. No-op for AI intros (no introducer). Call once per stage transition. */
export async function applyIntroducerStage(intro: Intro, stage: Stage): Promise<void> {
  if (!intro.introducer_id) return;
  const credit = STAGE_CREDIT[stage];
  await insertRows([
    { person_id: intro.introducer_id, intro_id: intro.id, kind: "introducer_stage", stage, delta: credit },
    { person_id: intro.a_id, intro_id: intro.id, kind: "introduced_cost", stage, delta: -credit / 2 },
    { person_id: intro.b_id, intro_id: intro.id, kind: "introduced_cost", stage, delta: -credit / 2 },
  ]);
}

/** Load an intro and check `personId` is one of the two people in it. */
export async function introForParty(introId: string, personId: string): Promise<Intro> {
  if (!isUuid(introId)) throw new IntroError(404, "intro not found");
  const { data: intro, error } = await db().from("intros").select("*").eq("id", introId).maybeSingle<Intro>();
  if (error) throw new Error(error.message);
  if (!intro) throw new IntroError(404, "intro not found");
  if (intro.a_id !== personId && intro.b_id !== personId) throw new IntroError(403, "not your intro");
  return intro;
}

/**
 * Record "how much did they help you?" (0-3) from one side of a met intro (PLAN §2b), then, once both
 * sides have rated, close the intro and pay the "valuable" stage if both ratings are >= 2.
 * Shared by POST /api/ratings (source 'web') and the Dial follow-up call (source 'call').
 */
export async function recordRating(personId: string, introId: string, value: number, source: "web" | "call" = "web") {
  if (!Number.isInteger(value) || value < 0 || value > 3) throw new IntroError(400, "value must be an integer 0-3");
  const supa = db();
  const intro = await introForParty(introId, personId);
  if (intro.status !== "met" && intro.status !== "rated") throw new IntroError(409, "you can rate only after you have met");
  const rateeId = intro.a_id === personId ? intro.b_id : intro.a_id;

  // unique (intro_id, rater_id) makes this the once-only guard, even across web + call.
  const { data: rating, error } = await supa
    .from("ratings")
    .insert({ intro_id: introId, rater_id: personId, ratee_id: rateeId, value, source })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new IntroError(409, "you already rated this meeting");
    throw new Error(error.message);
  }

  emit(personId, EV.rating_given, value);
  emit(rateeId, EV.rating_received, value);
  // §2b value flow: the ratee gave r/3 of help, the rater received it.
  await insertRows([
    { person_id: rateeId, intro_id: introId, kind: "value_flow", stage: null, delta: value / 3 },
    { person_id: personId, intro_id: introId, kind: "value_flow", stage: null, delta: -value / 3 },
  ]);

  const { data: both } = await supa.from("ratings").select("value").eq("intro_id", introId);
  let closed = false;
  if ((both?.length ?? 0) >= 2) {
    // Whoever flips met → rated owns the stage reward, so it is paid once even if both rate at the same moment.
    const { data: flipped } = await supa.from("intros").update({ status: "rated" }).eq("id", introId).eq("status", "met").select("*");
    const won = flipped?.[0] as Intro | undefined;
    if (won) {
      closed = true;
      if (both!.every((r) => r.value >= VALUABLE_MIN)) {
        await applyIntroducerStage(won, "valuable");
        await emitMinutesToFirstValuable(won);
      }
    }
  }
  return { rating, intro_closed: closed };
}

/** Event 2015 for each person whose FIRST valuable meeting this is: minutes from check-in to now. */
async function emitMinutesToFirstValuable(intro: Intro) {
  const supa = db();
  for (const pid of [intro.a_id, intro.b_id]) {
    const { count } = await supa
      .from("intros")
      .select("id", { count: "exact", head: true })
      .eq("status", "rated")
      .neq("id", intro.id)
      .or(`a_id.eq.${pid},b_id.eq.${pid}`);
    if (count) continue; // not their first (an earlier rated intro exists; good enough for the metric)
    const { data: p } = await supa.from("people").select("created_at").eq("id", pid).maybeSingle();
    if (p) emit(pid, EV.minutes_to_first_valuable_meeting, Math.max(0, Math.round((Date.now() - Date.parse(p.created_at)) / 60000)));
  }
}

/** After an intro reaches `met`: schedule the ~30 min follow-up rating call for each person who opted into calls. */
export async function scheduleFollowups(intro: Intro) {
  for (const pid of [intro.a_id, intro.b_id]) {
    const r = await enqueueCall({ personId: pid, kind: "followup", introId: intro.id, delayMinutes: 30 });
    if (!r.queued && !["no phone", "person did not opt in to calls", "dial disabled", "already queued"].includes(r.reason)) {
      console.error("[ledger] enqueue followup failed", r.reason);
    }
  }
}
