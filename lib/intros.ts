import "server-only";
import { db } from "@/lib/supabase/server";
import { emit, EV } from "@/lib/keewano";
import { applyIntroducerStage, introForParty, IntroError, isUuid, scheduleFollowups } from "@/lib/ledger";
import type { Intro, Person } from "@/lib/types";

// Owner: T2. Intro lifecycle (PLAN §1, §4): proposed → accepted → met → rated, or declined.
// Status changes use conditional updates (`.eq("status", from)`) so concurrent requests pay each ledger stage once.

const pairFilter = (x: string, y: string) => `and(a_id.eq.${x},b_id.eq.${y}),and(a_id.eq.${y},b_id.eq.${x})`;

/** "Introduce two people" (PLAN §4 POST /api/intros). The introducer earns staged credit as it progresses. */
export async function createHumanIntro(introducerId: string, aId: string, bId: string, note: string | null): Promise<Intro> {
  if (!isUuid(aId) || !isUuid(bId) || aId === bId) throw new IntroError(400, "pick two different people");
  if (aId === introducerId || bId === introducerId) throw new IntroError(400, "you can't introduce yourself");
  const supa = db();

  const { data: people, error } = await supa.from("people").select("id, room_id").in("id", [introducerId, aId, bId]);
  if (error) throw new Error(error.message);
  const rooms = new Set((people ?? []).map((p) => p.room_id));
  if ((people?.length ?? 0) !== 3 || rooms.size !== 1) throw new IntroError(404, "person not found in this room");

  // One live intro per pair (AI or human). A declined one can be retried.
  const { data: existing } = await supa.from("intros").select("id, status").or(pairFilter(aId, bId)).neq("status", "declined").limit(1);
  if (existing?.length) throw new IntroError(409, "these two already have an intro");

  const [a, b] = aId < bId ? [aId, bId] : [bId, aId]; // same orientation as matches
  const { data: intro, error: insErr } = await supa
    .from("intros")
    .insert({ room_id: [...rooms][0], a_id: a, b_id: b, introducer_id: introducerId, note: note?.trim().slice(0, 500) || null, status: "proposed" })
    .select("*")
    .single<Intro>();
  if (insErr) throw new Error(insErr.message);

  emit(introducerId, EV.human_intro_made, intro.id);
  emit(a, EV.intro_proposed, intro.id);
  emit(b, EV.intro_proposed, intro.id);
  return intro;
}

/**
 * Accept or decline an intro you are part of. When both have accepted, the intro moves to `accepted`
 * and the introducer earns the first stage. Shared by the web route and the Dial briefing call.
 */
export async function respondToIntro(personId: string, introId: string, accept: boolean): Promise<Intro> {
  const supa = db();
  const intro = await introForParty(introId, personId);
  if (intro.status !== "proposed") throw new IntroError(409, `intro is already ${intro.status}`);
  const side = intro.a_id === personId ? "a_accepted" : "b_accepted";

  if (!accept) {
    const { data } = await supa.from("intros").update({ [side]: false, status: "declined" }).eq("id", introId).eq("status", "proposed").select("*");
    emit(personId, EV.intro_declined, introId);
    return (data?.[0] as Intro | undefined) ?? intro;
  }

  const { data: updated, error } = await supa.from("intros").update({ [side]: true }).eq("id", introId).eq("status", "proposed").select("*").maybeSingle<Intro>();
  if (error) throw new Error(error.message);
  if (!updated) throw new IntroError(409, "intro changed, try again");
  emit(personId, EV.intro_accepted, introId);

  if (updated.a_accepted && updated.b_accepted) {
    const { data: flipped } = await supa.from("intros").update({ status: "accepted" }).eq("id", introId).eq("status", "proposed").select("*");
    const won = flipped?.[0] as Intro | undefined;
    if (won) {
      await applyIntroducerStage(won, "accepted");
      return won;
    }
  }
  return updated;
}

/**
 * Personal-QR scan (PLAN §4 POST /api/encounters): always logs the encounter; if the two have an
 * accepted intro, it becomes `met`, the introducer earns the second stage, and follow-up calls are queued.
 */
export async function recordEncounter(scannerId: string, qrToken: string) {
  const supa = db();
  const { data: scanned } = await supa.from("people").select("id, room_id").eq("qr_token", qrToken).maybeSingle<Pick<Person, "id" | "room_id">>();
  if (!scanned) throw new IntroError(404, "unknown QR code");
  if (scanned.id === scannerId) throw new IntroError(400, "that's your own QR code");
  const { data: scanner } = await supa.from("people").select("room_id").eq("id", scannerId).maybeSingle();
  if (!scanner || scanner.room_id !== scanned.room_id) throw new IntroError(404, "person not found in this room");

  const { data: encounter, error } = await supa
    .from("encounters")
    .insert({ room_id: scanned.room_id, scanner_id: scannerId, scanned_id: scanned.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  emit(scannerId, EV.met_scan, scanned.id);

  const { data: accepted } = await supa.from("intros").select("id").or(pairFilter(scannerId, scanned.id)).eq("status", "accepted").limit(1);
  let met: Intro | null = null;
  if (accepted?.length) {
    const { data: flipped } = await supa
      .from("intros")
      .update({ status: "met", met_at: new Date().toISOString() })
      .eq("id", accepted[0].id)
      .eq("status", "accepted")
      .select("*");
    met = (flipped?.[0] as Intro | undefined) ?? null;
    if (met) {
      await applyIntroducerStage(met, "met");
      await scheduleFollowups(met);
    }
  }
  return { encounter_id: encounter.id as string, met_intro: met };
}
