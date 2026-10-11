import "server-only";
import { db } from "@/lib/supabase/server";
import { emit, EV } from "@/lib/keewano";
import type { CallJob, Intro, Match, Person } from "@/lib/types";
import type { Call } from "@getdial/sdk";
import { dial, dialNumber, MAX_CONCURRENT_CALLS } from "./client";
import { briefingInstruction, followupInstruction, intakeInstruction, MAX_SECONDS } from "./scripts";
import {
  callerSpoke,
  extractBriefing,
  extractFollowup,
  extractIntake,
  formatTranscript,
} from "./extract";
import { recordRating, respondToIntro } from "./bridge";
import { runMatch } from "@/lib/match";

// Owner: T3. The call queue (PLAN §5). `call_jobs` rows are the queue; `tick()` is the worker.
// Driven by POST /api/calls/tick (the always-open /dashboard pings it every ~5s).

const MAX_ATTEMPTS = 2; // one retry on no-answer / busy
const RETRY_DELAY_MS = 60_000;
const PENDING_WINDOW_MS = 3 * 60_000; // how far ahead a queued job still counts as 'pending' for the nudge chain
const VOICEMAIL_RETRY_DELAY_MS = 120_000; // they may be reachable in a couple of minutes
const RATE_LIMIT_DELAY_MS = 15_000;
const STUCK_CALL_MS = 8 * 60_000; // Dial caps calls at 5 min; anything older is dead
const UNCLAIMED_DIALING_MS = 2 * 60_000; // claimed but makeCall never recorded an id
const TRANSCRIPT_WAIT_MS = 45_000; // transcripts can land a moment after the call ends

type Defer = (fn: () => Promise<void>) => void;
export type TickReport = {
  skipped?: string;
  reconciled: number;
  started: number;
  finished: number;
  failed: number;
  requeued: number;
  pending: number; // calls in flight or due within the next few minutes: the nudge chain keeps ticking while > 0
};

let running = false; // in-process guard; the atomic claims below protect across instances

const now = () => new Date().toISOString();
const ageMs = (iso: string) => Date.now() - Date.parse(iso);
const attemptsOf = (job: CallJob) => Number((job.result as { attempts?: number } | null)?.attempts ?? 0);

async function patch(id: string, from: CallJob["status"], fields: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db()
    .from("call_jobs")
    .update({ ...fields, updated_at: now() })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) console.error("[dial/queue] patch failed", id, error.message);
  return !error && (data?.length ?? 0) > 0;
}

function requeue(job: CallJob, reason: string, delayMs: number, countAttempt = true) {
  const attempts = attemptsOf(job) + (countAttempt ? 1 : 0);
  return patch(job.id, "dialing", {
    status: "queued",
    dial_call_id: null,
    not_before: new Date(Date.now() + delayMs).toISOString(),
    result: { attempts, last: reason },
  });
}

function fail(job: CallJob, reason: string, extra: Record<string, unknown> = {}) {
  return patch(job.id, "dialing", {
    status: "failed",
    result: { attempts: attemptsOf(job), reason, ...extra },
  });
}

/** Label for a person that respects the show_name opt-in (names are never exposed without it). */
function label(p: Pick<Person, "name" | "role" | "show_name">): string {
  if (p.show_name) return p.name;
  return p.role ? `a ${p.role.toLowerCase()} at the event` : "someone at the event";
}

// ───────────── start queued jobs ─────────────

async function buildInstruction(job: CallJob, person: Person): Promise<string> {
  if (job.kind === "intake") return intakeInstruction(person.name);
  if (!job.intro_id) throw new Error(`${job.kind} job without intro_id`);

  const supa = db();
  const { data: intro } = await supa.from("intros").select("*").eq("id", job.intro_id).maybeSingle<Intro>();
  if (!intro) throw new Error("intro not found");
  const otherId = intro.a_id === person.id ? intro.b_id : intro.a_id;
  const { data: other } = await supa.from("people").select("*").eq("id", otherId).maybeSingle<Person>();
  if (!other) throw new Error("other person not found");

  if (job.kind === "followup") return followupInstruction({ name: person.name, otherName: label(other) });

  // briefing: use the match explanation written for THIS person; human intros fall back to the introducer's note.
  let why = intro.note ?? "";
  if (intro.match_id) {
    const { data: m } = await supa.from("matches").select("*").eq("id", intro.match_id).maybeSingle<Match>();
    if (m) why = m.a_id === person.id ? m.why_for_a : m.why_for_b;
  }
  if (!why) why = "you look like a strong two-way fit based on what you each need and can offer";
  return briefingInstruction({ name: person.name, otherName: label(other), otherRole: other.show_name ? other.role : null, why });
}

async function startJobs(slots: number, report: TickReport) {
  if (slots <= 0) return;
  const { data: queued } = await db()
    .from("call_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("not_before", now())
    .order("not_before", { ascending: true })
    .limit(slots);

  for (const row of (queued ?? []) as CallJob[]) {
    // Atomic claim: only one tick (or instance) wins this job.
    const { data: claimed } = await db()
      .from("call_jobs")
      .update({ status: "dialing", updated_at: now() })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("*");
    const job = claimed?.[0] as CallJob | undefined;
    if (!job) continue;

    try {
      const { data: person } = await db().from("people").select("*").eq("id", job.person_id).maybeSingle<Person>();
      if (!person?.phone) {
        await fail(job, "no_phone");
        report.failed++;
        continue;
      }
      const call = await dial().makeCall({
        to: person.phone,
        fromNumber: dialNumber(),
        outboundInstruction: await buildInstruction(job, person),
        maxCallDurationSeconds: MAX_SECONDS[job.kind],
        idempotencyKey: `${job.id}:${attemptsOf(job)}`,
      });
      await patch(job.id, "dialing", { dial_call_id: call.id });
      report.started++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[dial/queue] makeCall failed", job.id, msg);
      if (/429|rate|concurren|too many|limit/i.test(msg)) {
        // Over Dial's concurrency/rate limit: put it back, stop starting more this tick.
        await requeue(job, "rate_limited", RATE_LIMIT_DELAY_MS, false);
        report.requeued++;
        break;
      }
      if (attemptsOf(job) + 1 < MAX_ATTEMPTS) {
        await requeue(job, `dial_error: ${msg.slice(0, 120)}`, RETRY_DELAY_MS);
        report.requeued++;
      } else {
        await fail(job, "dial_error", { error: msg.slice(0, 300) });
        report.failed++;
      }
    }
  }
}

// ───────────── reconcile in-flight jobs ─────────────

async function reconcile(defer: Defer, report: TickReport) {
  const { data } = await db().from("call_jobs").select("*").eq("status", "dialing");
  for (const job of (data ?? []) as CallJob[]) {
    report.reconciled++;
    try {
      if (!job.dial_call_id) {
        if (ageMs(job.updated_at) > UNCLAIMED_DIALING_MS) {
          await requeue(job, "claim_never_dialed", 0, false); // idempotencyKey makes a re-dial safe
          report.requeued++;
        }
        continue;
      }
      const call = await dial().getCall(job.dial_call_id);
      const state = call.status.state;

      if (state !== "Terminated") {
        if (ageMs(job.updated_at) > STUCK_CALL_MS) {
          await dial().stopCall(job.dial_call_id).catch(() => {});
          await fail(job, "timeout");
          report.failed++;
        }
        continue;
      }
      await handleTerminated(job, call, defer, report);
    } catch (e) {
      console.error("[dial/queue] reconcile failed", job.id, e instanceof Error ? e.message : e);
      // A call Dial can no longer look up (e.g. placed on a previous account) would hold a slot forever.
      if (ageMs(job.updated_at) > STUCK_CALL_MS && (await fail(job, "lookup_failed"))) report.failed++;
    }
  }
}

async function handleTerminated(job: CallJob, call: Call, defer: Defer, report: TickReport) {
  const type = call.status.terminationType ?? call.terminationType ?? "unknown";

  if (type !== "completed") {
    // Never connected: retry once for busy / no-answer, otherwise give up (the web flow is the fallback).
    if ((type === "busy" || type === "no-answer") && attemptsOf(job) + 1 < MAX_ATTEMPTS) {
      await requeue(job, type, RETRY_DELAY_MS);
      report.requeued++;
    } else {
      await fail(job, type, { failureReason: call.failureReason });
      report.failed++;
    }
    return;
  }

  const transcript = formatTranscript(call);
  if (!transcript) {
    // Transcript can arrive slightly after the call ends.
    const endedAgo = call.terminatedAt ? ageMs(call.terminatedAt) : Infinity;
    if (endedAgo < TRANSCRIPT_WAIT_MS) return;
  }

  if (!transcript || !callerSpoke(call)) {
    if (job.kind === "briefing") {
      await finish(job, call, transcript, { decision: "unclear", reason: "no_response" }, defer, report);
    } else {
      await fail(job, "no_response", { durationSeconds: call.duration });
      report.failed++;
    }
    return;
  }

  let result: Record<string, unknown>;
  if (job.kind === "intake") result = { ...(await extractIntake(transcript)) };
  else if (job.kind === "briefing") result = { ...(await extractBriefing(transcript)) };
  else result = { ...(await extractFollowup(transcript)) };

  if (job.kind === "intake" && result.complete !== true && result.voicemail === true && attemptsOf(job) + 1 < MAX_ATTEMPTS) {
    await requeue(job, "voicemail", VOICEMAIL_RETRY_DELAY_MS); // one more try; the web form stays the fallback
    report.requeued++;
    return;
  }
  if (job.kind === "intake" && result.complete !== true) {
    await patch(job.id, "dialing", { status: "failed", transcript, result: { reason: "no_usable_answers", ...result } });
    report.failed++;
    return;
  }
  await finish(job, call, transcript, result, defer, report);
}

// ───────────── effects of a finished call ─────────────

async function finish(
  job: CallJob,
  call: Call,
  transcript: string,
  result: Record<string, unknown>,
  defer: Defer,
  report: TickReport,
) {
  // Claim the finish: whoever flips dialing→done owns the side effects (no double-apply across ticks).
  const owned = await patch(job.id, "dialing", {
    status: "done",
    transcript,
    result: { ...result, attempts: attemptsOf(job), durationSeconds: call.duration },
  });
  if (!owned) return;
  report.finished++;

  try {
    if (job.kind === "intake") await applyIntake(job, call, result, defer);
    else if (job.kind === "briefing") await applyBriefing(job, result);
    else await applyFollowup(job, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[dial/queue] effect failed", job.id, msg);
    await db()
      .from("call_jobs")
      .update({ result: { ...result, effect_error: msg.slice(0, 300) }, updated_at: now() })
      .eq("id", job.id);
  }
}

async function applyIntake(job: CallJob, call: Call, r: Record<string, unknown>, defer: Defer) {
  const fields: Record<string, string> = {};
  for (const k of ["role", "who_i_am", "needs", "gives"] as const) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) fields[k] = v.trim();
  }
  const { error } = await db()
    .from("people")
    .update({ ...fields, profile_source: "call" })
    .eq("id", job.person_id);
  if (error) throw new Error(`profile update failed: ${error.message}`);

  if (fields.role) emit(job.person_id, EV.profile_role, fields.role);
  emit(job.person_id, EV.profile_source, "call");
  emit(job.person_id, EV.intake_call_seconds, Math.max(0, Math.round(call.duration ?? 0)));

  // Matching is slow (Claude); run it after the tick responds. UI updates via Realtime.
  // In-process: /api/match/run is cookie-only and rejects a person_id from the body.
  defer(async () => {
    try {
      await runMatch(job.person_id);
      // runMatch may have queued a briefing call: dial it now instead of on the next /dashboard tick.
      await tick(defer);
    } catch (e) {
      console.error("[dial/queue] match failed", e);
    }
  });
}

async function applyBriefing(job: CallJob, r: Record<string, unknown>) {
  const decision = r.decision === "yes" || r.decision === "no" ? r.decision : "unclear";
  emit(job.person_id, EV.briefing_call_result, decision);
  if (decision === "unclear" || !job.intro_id) return; // left for the web flow
  await respondToIntro(job.person_id, job.intro_id, decision === "yes");
}

async function applyFollowup(job: CallJob, r: Record<string, unknown>) {
  const v = r.rating;
  if ((v === 0 || v === 1 || v === 2 || v === 3) && job.intro_id) await recordRating(job.person_id, job.intro_id, v);
}

// ───────────── the worker ─────────────

export async function tick(defer: Defer): Promise<TickReport> {
  const report: TickReport = { reconciled: 0, started: 0, finished: 0, failed: 0, requeued: 0, pending: 0 };
  if (process.env.DIAL_DISABLED === "1") return { ...report, skipped: "DIAL_DISABLED" };
  if (running) return { ...report, skipped: "tick already running" };
  running = true;
  try {
    await reconcile(defer, report);
    const { count } = await db().from("call_jobs").select("id", { count: "exact", head: true }).eq("status", "dialing");
    await startJobs(MAX_CONCURRENT_CALLS - (count ?? 0), report);
    const soon = new Date(Date.now() + PENDING_WINDOW_MS).toISOString();
    const { count: pending } = await db()
      .from("call_jobs")
      .select("id", { count: "exact", head: true })
      .or(`status.eq.dialing,and(status.eq.queued,not_before.lte.${soon})`);
    report.pending = pending ?? 0;
    return report;
  } finally {
    running = false;
  }
}
