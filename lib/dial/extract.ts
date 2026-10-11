import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Call } from "@getdial/sdk";

// Owner: T3. Turn call transcripts into structured results with a forced Claude tool call.
const MODEL = "claude-sonnet-5-5";

let anthropic: Anthropic | null = null;
function claude(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

export type IntakeResult = {
  complete: boolean; // false = voicemail, refusal, or nothing usable → fall back to the web form
  role: string;
  who_i_am: string;
  needs: string;
  gives: string;
};
export type BriefingResult = { decision: "yes" | "no" | "unclear" };
export type FollowupResult = { rating: 0 | 1 | 2 | 3 | null };

/** "Agent: …\nCaller: …" from timed turns when available, else Dial's raw transcript. */
export function formatTranscript(call: Pick<Call, "transcript" | "transcriptTurns">): string {
  if (call.transcriptTurns?.length) {
    return call.transcriptTurns
      .map((t) => `${t.speaker === "agent" ? "Agent" : "Caller"}: ${t.text}`)
      .join("\n");
  }
  return call.transcript ?? "";
}

/** True when a human actually said something (guards against voicemail / silence). */
export function callerSpoke(call: Pick<Call, "transcript" | "transcriptTurns">): boolean {
  if (call.transcriptTurns?.length) return call.transcriptTurns.some((t) => t.speaker !== "agent" && t.text.trim().length > 1);
  return /caller:|user:/i.test(call.transcript ?? "") || (call.transcript ?? "").trim().length > 0;
}

async function extract<T>(opts: { name: string; description: string; schema: Anthropic.Tool["input_schema"]; system: string; transcript: string }): Promise<T> {
  const res = await claude().messages.create({
    model: MODEL,
    max_tokens: 600,
    system: opts.system,
    tools: [{ name: opts.name, description: opts.description, input_schema: opts.schema }],
    tool_choice: { type: "tool", name: opts.name },
    messages: [{ role: "user", content: `Phone call transcript:\n\n${opts.transcript}` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("extraction returned no tool call");
  return block.input as T;
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

export async function extractIntake(transcript: string): Promise<IntakeResult> {
  const raw = await extract<Partial<IntakeResult>>({
    name: "record_profile",
    description: "Record the networking profile the caller gave during the interview.",
    system:
      "You read a transcript of a short interview between Giverank's phone agent and an event attendee. Extract only what the CALLER said; never invent details. " +
      "Write each field as a concise first-person-neutral phrase (no 'I'), specific enough to match on (name sectors, stages, regions, resources). " +
      "Set complete=false if the caller declined, was a voicemail, or gave neither a need nor an offer.",
    schema: {
      type: "object",
      properties: {
        complete: { type: "boolean", description: "true only if the caller gave at least a need or an offer" },
        role: { type: "string", description: "One short label, e.g. Founder, Investor, Student, Engineer, Researcher, Mentor, Corporate, Other. Empty if unknown." },
        who_i_am: { type: "string", description: "Who they are and what they work on, ≤ 300 chars" },
        needs: { type: "string", description: "What they need right now, ≤ 300 chars" },
        gives: { type: "string", description: "What they can offer others, ≤ 300 chars" },
      },
      required: ["complete", "role", "who_i_am", "needs", "gives"],
    },
    transcript,
  });
  const needs = clip(raw.needs, 1000);
  const gives = clip(raw.gives, 1000);
  return {
    complete: raw.complete === true && (needs.length > 0 || gives.length > 0),
    role: clip(raw.role, 40),
    who_i_am: clip(raw.who_i_am, 1000),
    needs,
    gives,
  };
}

export async function extractBriefing(transcript: string): Promise<BriefingResult> {
  const raw = await extract<{ decision?: string }>({
    name: "record_decision",
    description: "Record whether the caller agreed to the introduction.",
    system:
      "You read a transcript where Giverank's phone agent asked the caller whether to set up an introduction. " +
      "Answer yes only if the caller clearly agreed, no only if they clearly declined; otherwise unclear. A voicemail or no caller reply is unclear.",
    schema: {
      type: "object",
      properties: { decision: { type: "string", enum: ["yes", "no", "unclear"] } },
      required: ["decision"],
    },
    transcript,
  });
  return { decision: raw.decision === "yes" || raw.decision === "no" ? raw.decision : "unclear" };
}

export async function extractFollowup(transcript: string): Promise<FollowupResult> {
  const raw = await extract<{ rating?: number | null }>({
    name: "record_rating",
    description: "Record how much the other person helped the caller, 0 to 3.",
    system:
      "You read a transcript where Giverank's phone agent asked the caller how much someone they met helped them, 0 (not at all) to 3 (very much). " +
      "Return the caller's rating as an integer 0-3. Map words: not at all=0, a little=1, quite a bit=2, very much=3. Return null if the caller gave no clear answer or it was a voicemail.",
    schema: {
      type: "object",
      properties: { rating: { type: ["integer", "null"], minimum: 0, maximum: 3 } },
      required: ["rating"],
    },
    transcript,
  });
  const r = raw.rating;
  return { rating: r === 0 || r === 1 || r === 2 || r === 3 ? r : null };
}
