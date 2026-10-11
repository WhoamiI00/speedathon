import { after } from "next/server";
import { db } from "@/lib/supabase/server";
import { getPersonId, setPersonId } from "@/lib/session";
import { emit, EV } from "@/lib/keewano";
import { runMatch } from "@/lib/match";
import { nudgeCalls } from "@/lib/dial/nudge";

export const maxDuration = 60;

type Body = {
  slug?: string;
  name?: string;
  phone?: string;
  role?: string; // optional extra (not in PLAN §4): drives "A founder" labels in public views
  who_i_am?: string;
  needs?: string;
  gives?: string;
  show_name?: boolean;
  interview?: boolean;
};

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

/** Loose E.164: "+1 (415) 555-0123" → "+14155550123"; bare 10 digits assume US. */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// POST /api/checkin  {slug,name,phone,who_i_am,needs,gives,show_name,interview,role?} → {person_id}
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const name = clip(body.name, 80);
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const interview = body.interview === true;
  let phone: string | null = null;
  if (body.phone && body.phone.trim()) {
    phone = toE164(body.phone);
    if (!phone) return Response.json({ error: "phone must be a valid number, e.g. +14155550123" }, { status: 400 });
  }
  if (interview && !phone) return Response.json({ error: "phone is required for the interview call" }, { status: 400 });

  const fields = {
    name,
    phone,
    role: clip(body.role, 40) || null,
    who_i_am: clip(body.who_i_am, 1000),
    needs: clip(body.needs, 1000),
    gives: clip(body.gives, 1000),
    show_name: body.show_name === true,
    profile_source: interview ? "call" : "form",
  };
  if (!interview && !fields.needs && !fields.gives) {
    return Response.json({ error: "tell us what you need or can give, or choose the interview call" }, { status: 400 });
  }

  const supa = db();
  const { data: room, error: roomErr } = await supa
    .from("rooms")
    .select("id")
    .eq("slug", clip(body.slug, 60) || "speedhacks")
    .maybeSingle();
  if (roomErr) return Response.json({ error: roomErr.message }, { status: 500 });
  if (!room) return Response.json({ error: "unknown room" }, { status: 404 });

  // Re-check-in from the same browser updates the same person instead of creating a duplicate.
  let personId: string | null = null;
  const existing = await getPersonId();
  if (existing) {
    // Only overwrite what was actually sent: a re-check-in without a phone must not wipe it.
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== ""));
    const { data } = await supa
      .from("people")
      .update(patch)
      .eq("id", existing)
      .eq("room_id", room.id)
      .select("id")
      .maybeSingle();
    personId = data?.id ?? null;
  }
  if (!personId) {
    const { data, error } = await supa
      .from("people")
      .insert({ ...fields, room_id: room.id })
      .select("id")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    personId = data.id as string;
  }

  await setPersonId(personId);

  emit(personId, EV.checked_in, clip(body.slug, 60) || "speedhacks");
  if (fields.role) emit(personId, EV.profile_role, fields.role);
  emit(personId, EV.profile_source, fields.profile_source);

  if (interview) {
    // The call queue dials it; the profile is filled from the transcript, then matching runs.
    const { error } = await supa.from("call_jobs").insert({ person_id: personId, kind: "intake" });
    if (error) console.error("[checkin] enqueue intake failed", error.message);
    // Start the queue now so the phone rings in seconds, not on the next /dashboard tick; the chain keeps ticking until it ends.
    else nudgeCalls(new URL(req.url).origin);
  } else {
    // Matching is slow (Claude); run it after responding. UI updates via Realtime.
    // Called in-process (not via /api/match/run) so that route never has to trust a person_id from the body.
    const pid = personId;
    after(async () => {
      try {
        await runMatch(pid);
      } catch (e) {
        console.error("[checkin] match failed", e);
      }
    });
  }

  return Response.json({ person_id: personId });
}
