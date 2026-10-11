import "server-only";
import { db } from "@/lib/supabase/server";
import type { CallKind } from "./scripts";
import { nudgeCalls } from "./nudge";

// Owner: T3. Other tracks call this to schedule a call; they never talk to Dial directly.
//
//   T2 after match/run, for the person's #1 match:   enqueueCall({ personId, kind: "briefing", introId })
//   T2 when an intro reaches `met`:                   enqueueCall({ personId, kind: "followup", introId, delayMinutes: 30 })
//
// Consent: calls only go to people who chose the interview at check-in (profile_source = 'call')
// and have a phone number. Everyone else keeps the web flow. Pass { force: true } to override (demo/testing).

export type EnqueueResult = { queued: true; jobId: string } | { queued: false; reason: string };

export async function enqueueCall(opts: {
  personId: string;
  kind: CallKind;
  introId?: string | null;
  delayMinutes?: number;
  force?: boolean;
}): Promise<EnqueueResult> {
  if (process.env.DIAL_DISABLED === "1") return { queued: false, reason: "dial disabled" };
  const supa = db();

  const { data: person, error: pErr } = await supa
    .from("people")
    .select("phone, profile_source")
    .eq("id", opts.personId)
    .maybeSingle();
  if (pErr) return { queued: false, reason: pErr.message };
  if (!person?.phone) return { queued: false, reason: "no phone" };
  if (!opts.force && person.profile_source !== "call") return { queued: false, reason: "person did not opt in to calls" };

  if (opts.kind !== "intake") {
    if (!opts.introId) return { queued: false, reason: "introId required" };
    // One briefing / follow-up per person per intro.
    const { data: dupe } = await supa
      .from("call_jobs")
      .select("id")
      .eq("person_id", opts.personId)
      .eq("intro_id", opts.introId)
      .eq("kind", opts.kind)
      .limit(1);
    if (dupe?.length) return { queued: false, reason: "already queued" };
  }

  const notBefore = new Date(Date.now() + (opts.delayMinutes ?? 0) * 60_000).toISOString();
  const { data, error } = await supa
    .from("call_jobs")
    .insert({ person_id: opts.personId, intro_id: opts.introId ?? null, kind: opts.kind, not_before: notBefore })
    .select("id")
    .single();
  if (error) return { queued: false, reason: error.message };
  if (!opts.delayMinutes) nudgeCalls(); // due now: don't wait for the dashboard tick
  return { queued: true, jobId: data.id as string };
}
