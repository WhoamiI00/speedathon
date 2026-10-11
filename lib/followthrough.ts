import "server-only";
import { db } from "@/lib/supabase/server";

// Owner: T4. People's follow-through score, 0..1 (PLAN §6b): how reliably they accept proposed intros and then actually meet.
// Laplace-smoothed so anyone with no history sits at 0.5 (the column default) and a single decline can't zero them.
//   follow_through = 0.5 * (accepted+1)/(proposed+2) + 0.5 * (met+1)/(accepted+2)
// NOTE: computed from the intros table, which holds the same facts as Keewano events 2006/2007/2010.
// PLAN §6b asks for the numbers from Keewano via MCP; swap `tallies()` for an MCP query once KEEWANO_PAT is available.

type IntroRow = { a_id: string; b_id: string; a_accepted: boolean | null; b_accepted: boolean | null; status: string; created_at?: string };
const GRACE_MS = 30 * 60_000; // an intro nobody has answered yet is not 'ignored' until this long has passed
type Tally = { proposed: number; accepted: number; met: number };

export function score(t: Tally): number {
  return 0.5 * ((t.accepted + 1) / (t.proposed + 2)) + 0.5 * ((t.met + 1) / (t.accepted + 2));
}

/** Pure: tally each person's intro history. `met` counts only intros the person accepted. */
export function tallies(intros: IntroRow[], now = Date.now()): Map<string, Tally> {
  const out = new Map<string, Tally>();
  const get = (id: string) => out.get(id) ?? out.set(id, { proposed: 0, accepted: 0, met: 0 }).get(id)!;
  for (const i of intros) {
    const fresh = i.created_at ? now - Date.parse(i.created_at) < GRACE_MS : false;
    for (const [id, accepted] of [[i.a_id, i.a_accepted], [i.b_id, i.b_accepted]] as const) {
      if (accepted === null && fresh) continue; // still waiting for an answer
      const t = get(id);
      t.proposed++;
      if (accepted === true) {
        t.accepted++;
        if (i.status === "met" || i.status === "rated") t.met++;
      }
    }
  }
  return out;
}

export async function refreshFollowThrough(): Promise<{ people: number; updated: number }> {
  const supa = db();
  const { data: intros, error } = await supa.from("intros").select("a_id, b_id, a_accepted, b_accepted, status, created_at");
  if (error) throw new Error(error.message);
  const { data: people, error: pErr } = await supa.from("people").select("id, follow_through");
  if (pErr) throw new Error(pErr.message);

  const tally = tallies((intros ?? []) as IntroRow[]);
  const changes = (people ?? []).flatMap((p) => {
    const t = tally.get(p.id);
    if (!t) return []; // no history: keep the default
    const next = Math.round(score(t) * 1000) / 1000;
    return Math.abs(next - Number(p.follow_through)) > 0.004 ? [{ id: p.id as string, next }] : [];
  });
  for (let i = 0; i < changes.length; i += 20) {
    await Promise.all(changes.slice(i, i + 20).map((c) => supa.from("people").update({ follow_through: c.next }).eq("id", c.id)));
  }
  return { people: people?.length ?? 0, updated: changes.length };
}
