import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";

// Owner: T4. Keewano event transport (PLAN §6a).
// Contract: emit(personId, eventId, value). Buffers, batches, NEVER throws.
// Use the EV constants below; never retype a numeric id. Event ids are append-only: add a new one, never change a type.
//
// Wire format (verified against @keewano/core's REST transport):
//   POST {BASE}/event/ingress/v1/json/custom   header k-token   {customEventsHash, eventTypes:[{eventTypeId,name,dataType}]}   (register once)
//   POST {BASE}/event/ingress/v1/json/in?k-token=KEY   {dataSessionId, batch, customEventsHash, installId, sdkVersion, events:[{eventTypeId,timestamp,dataType,data}]}
// Verified live: /in rejects the header (401 "Missing API Key") and wants the key as a query param; /custom wants the header.
// Every custom event must carry its dataType, otherwise the server answers 202 with accepted:0 and silently drops it.
// Entity = installId = people.id (UUID). Without KEEWANO_API_KEY events are only logged.

export const EV = {
  checked_in: 2000,
  profile_role: 2001,
  profile_source: 2002,
  intake_call_seconds: 2003,
  match_proposed: 2004,
  match_score: 2005,
  intro_proposed: 2006,
  intro_accepted: 2007,
  intro_declined: 2008,
  human_intro_made: 2009,
  met_scan: 2010,
  rating_given: 2011,
  rating_received: 2012,
  give_credit_milli: 2013,
  take_debit_milli: 2014,
  minutes_to_first_valuable_meeting: 2015,
  need_unmet: 2016,
  darwin_agent_matched: 2017,
  briefing_call_result: 2018,
  baseline_minutes_to_useful_meeting: 2019,
} as const;

export type EventId = (typeof EV)[keyof typeof EV];

type DataType = "string" | "uint";

/** Value type per event id (PLAN §6a). Keep in sync with the EV table; ids are append-only. */
export const EVENT_CATALOG: { id: EventId; name: keyof typeof EV; type: DataType }[] = [
  { id: EV.checked_in, name: "checked_in", type: "string" },
  { id: EV.profile_role, name: "profile_role", type: "string" },
  { id: EV.profile_source, name: "profile_source", type: "string" },
  { id: EV.intake_call_seconds, name: "intake_call_seconds", type: "uint" },
  { id: EV.match_proposed, name: "match_proposed", type: "string" },
  { id: EV.match_score, name: "match_score", type: "uint" },
  { id: EV.intro_proposed, name: "intro_proposed", type: "string" },
  { id: EV.intro_accepted, name: "intro_accepted", type: "string" },
  { id: EV.intro_declined, name: "intro_declined", type: "string" },
  { id: EV.human_intro_made, name: "human_intro_made", type: "string" },
  { id: EV.met_scan, name: "met_scan", type: "string" },
  { id: EV.rating_given, name: "rating_given", type: "uint" },
  { id: EV.rating_received, name: "rating_received", type: "uint" },
  { id: EV.give_credit_milli, name: "give_credit_milli", type: "uint" },
  { id: EV.take_debit_milli, name: "take_debit_milli", type: "uint" },
  { id: EV.minutes_to_first_valuable_meeting, name: "minutes_to_first_valuable_meeting", type: "uint" },
  { id: EV.need_unmet, name: "need_unmet", type: "string" },
  { id: EV.darwin_agent_matched, name: "darwin_agent_matched", type: "string" },
  { id: EV.briefing_call_result, name: "briefing_call_result", type: "string" },
  { id: EV.baseline_minutes_to_useful_meeting, name: "baseline_minutes_to_useful_meeting", type: "uint" },
];
const TYPE_OF = new Map<number, DataType>(EVENT_CATALOG.map((e) => [e.id, e.type]));

const BASE = process.env.KEEWANO_BASE_URL ?? "https://api.keewano.com";
const UINT32_MAX = 4_294_967_295;
const MAX_BATCH = 200;
const MAX_BUFFER = 5_000; // drop oldest beyond this so an outage can't grow memory without bound
const MAX_ATTEMPTS = 3;
const FLUSH_DELAY_MS = 1_000;

/** Deterministic uint32 (FNV-1a) of the catalog: the server keys registrations on it, so changing a type changes it (and 409s). */
export function catalogHash(): number {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(EVENT_CATALOG)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0 || 1;
}

type Item = { eventTypeId: number; timestamp: number; dataType: DataType; data: string | number };
type Pending = { personId: string; items: Item[]; num: number; attempts: number };

const dataSessionId = randomUUID(); // stable per server instance
let batchNum = 0;
let queue: { personId: string; item: Item }[] = [];
let inFlight: Pending | null = null; // retried with the SAME batch number: ingestion is idempotent per (session, batch)
let registered: Promise<boolean> | null = null;
let scheduled = false;
let flushing: Promise<void> = Promise.resolve();

const apiKey = () => process.env.KEEWANO_API_KEY;

function headers(): Record<string, string> {
  return { "content-type": "application/json", "k-token": apiKey() ?? "" };
}

/** Register the custom event map once per instance (idempotent server-side). Resolves false on a permanent failure. */
export function ensureRegistered(): Promise<boolean> {
  if (!registered) {
    registered = (async () => {
      const hash = catalogHash();
      try {
        const check = await fetch(`${BASE}/event/ingress/v1/json/custom?customEventsHash=${hash}`, { headers: headers(), signal: AbortSignal.timeout(8_000) });
        if (check.status === 200) return true;
        const res = await fetch(`${BASE}/event/ingress/v1/json/custom`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            customEventsHash: hash,
            eventTypes: EVENT_CATALOG.map((e) => ({ eventTypeId: e.id, name: e.name, dataType: e.type })),
          }),
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) return true;
        console.error("[keewano] register failed", res.status, (await res.text()).slice(0, 200));
        if (res.status >= 500 || res.status === 429) registered = null; // transient: try again next flush
        return false;
      } catch (e) {
        console.error("[keewano] register error", e instanceof Error ? e.message : e);
        registered = null;
        return false;
      }
    })();
  }
  return registered;
}

async function send(p: Pending): Promise<"ok" | "retry" | "drop"> {
  const hash = catalogHash();
  try {
    const res = await fetch(`${BASE}/event/ingress/v1/json/in?k-token=${encodeURIComponent(apiKey() ?? "")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataSessionId,
        batch: p.num,
        customEventsHash: hash,
        installId: p.personId,
        sdkVersion: "server/sevendipity-1",
        events: p.items,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const receipt = (await res.json().catch(() => null)) as { received?: number; accepted?: number } | null;
      if (receipt && typeof receipt.accepted === "number" && receipt.accepted < (receipt.received ?? p.items.length)) {
        console.error("[keewano] batch only partly accepted", p.num, JSON.stringify(receipt));
      }
      return "ok";
    }
    console.error("[keewano] ingest rejected", res.status, (await res.text()).slice(0, 200));
    return [400, 401, 403, 413].includes(res.status) ? "drop" : "retry";
  } catch (e) {
    console.error("[keewano] ingest error", e instanceof Error ? e.message : e);
    return "retry";
  }
}

async function drain(): Promise<void> {
  if (!apiKey()) {
    queue = [];
    return;
  }
  if (!(await ensureRegistered())) return; // keep events; try again on the next flush
  while (inFlight || queue.length) {
    if (!inFlight) {
      // One batch carries ONE installId (PLAN: entity = person), so group by the first queued person.
      const personId = queue[0].personId;
      const mine: Item[] = [];
      const rest: typeof queue = [];
      for (const q of queue) {
        if (q.personId === personId && mine.length < MAX_BATCH) mine.push(q.item);
        else rest.push(q);
      }
      queue = rest;
      inFlight = { personId, items: mine, num: ++batchNum, attempts: 0 };
    }
    const outcome = await send(inFlight);
    if (outcome === "ok" || outcome === "drop") inFlight = null;
    else if (++inFlight.attempts >= MAX_ATTEMPTS) inFlight = null;
    else return; // transient failure: leave it in flight, retry on the next flush
  }
}

/** Send everything buffered. Serialized so batch numbers stay in order. Never throws. */
export function flushKeewano(): Promise<void> {
  flushing = flushing.then(drain).catch((e) => console.error("[keewano] flush failed", e));
  return flushing;
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    return flushKeewano();
  };
  try {
    // Inside a request: run after the response so a serverless function isn't frozen before we send.
    after(run);
  } catch {
    setTimeout(run, FLUSH_DELAY_MS).unref?.(); // scripts / outside a request
  }
}

export function emit(personId: string, eventId: EventId, value: string | number): void {
  try {
    const type = TYPE_OF.get(eventId);
    if (!type) {
      console.error("[keewano] unknown event id", eventId);
      return;
    }
    const data = type === "uint" ? Math.min(UINT32_MAX, Math.max(0, Math.round(Number(value) || 0))) : String(value).slice(0, 256);
    if (!apiKey()) {
      console.log("[keewano]", eventId, personId, data);
      return;
    }
    queue.push({ personId, item: { eventTypeId: eventId, timestamp: Math.floor(Date.now() / 1000), dataType: type, data } });
    if (queue.length > MAX_BUFFER) queue = queue.slice(-MAX_BUFFER);
    schedule();
  } catch (e) {
    console.error("[keewano] emit failed", e);
  }
}
