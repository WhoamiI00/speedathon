import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, MODEL } from "@/lib/claude";
import { db } from "@/lib/supabase/server";
import { keewanoProjectId, openKeewano } from "@/lib/keewano-mcp";

// Owner: T4. "Ask the room" (PLAN §6c): Claude + Keewano MCP tools in a tool-use loop (max 6 turns).
// This is a multi-turn tool loop, so it uses the Anthropic SDK directly instead of generateJSON() in lib/llm.ts.

const MAX_TURNS = 8; // guide + schema lookup + query + retry + name lookup + answer
const MAX_TOOL_CHARS = 20_000;
const LOOKUP = "lookup_people";
// Keewano's MCP also exposes game-analytics reports that mean nothing for a networking room; only these help.
const ALLOWED_TOOLS = new Set(["run_sql_query", "list_event_types", "get_tool_guide", "get_data_table"]);

const systemPrompt = (projectId: string) => `You answer questions about the SpeedHacks SF networking room for Sevendipity, using ONLY data from the Keewano tools (event history) and the ${LOOKUP} tool.
Keewano projectId: ${projectId} (pass it to every Keewano tool).
How the data works: each custom event is a COLUMN of the events table, named exactly as below. The entity user_id is a person id (UUID). Event columns: checked_in (room slug), profile_role, profile_source (form/call/seed), intake_call_seconds, match_proposed (other person id), match_score (0-100), intro_proposed, intro_accepted, intro_declined, human_intro_made (intro ids), met_scan (other person id), rating_given and rating_received (0-3), give_credit_milli (credit x1000), take_debit_milli (PRIVATE), minutes_to_first_valuable_meeting, need_unmet (the need text), darwin_agent_matched (agent name), briefing_call_result (yes/no/unclear), baseline_minutes_to_useful_meeting.
Keewano SQL is PostgreSQL syntax but a column holds the last-known value along each user's timeline, and WHERE selects stretches of the timeline, not rows. Before writing a non-trivial query, call get_tool_guide (tool "run_sql_query", sections "the-mental-model" and "worked-examples"). Use count(DISTINCT user_id) for people and count(column) for how many times an event happened. Start simple, check the result, and fix errors. Names that are not plain lowercase need double quotes.
Rules:
- Giving is public, taking is private. NEVER report any individual's take_debit_milli or balance, and never say who received help from whom. Aggregates over many people are fine. If asked about one person's balance or what they took, politely decline.
- Never show raw person ids or phone numbers. To name a person, call ${LOOKUP} with their ids and use the display_name it returns exactly (it already respects the show_name opt-in).
- Be concise (2-4 sentences). Give numbers when you have them. If the data does not answer the question, say so plainly; do not guess.
- Recent events can take about 5 minutes to appear in Keewano.`;

async function lookupPeople(ids: unknown): Promise<string> {
  const list = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string").slice(0, 50) : [];
  if (!list.length) return "[]";
  const { data, error } = await db().from("people").select("id, name, role, show_name").in("id", list);
  if (error) return `ERROR: ${error.message}`;
  return JSON.stringify(
    (data ?? []).map((p) => ({ id: p.id, display_name: p.show_name ? p.name : `A ${String(p.role ?? "participant").toLowerCase()}`, role: p.role })),
  );
}

export async function askTheRoom(question: string): Promise<string> {
  const projectId = keewanoProjectId();
  if (!projectId) throw new Error("Keewano project id unknown: set KEEWANO_PROJECT_ID");
  const kw = await openKeewano();
  try {
    const tools: Anthropic.Tool[] = [
      ...kw.tools.filter((t) => ALLOWED_TOOLS.has(t.name)).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Tool.InputSchema })),
      {
        name: LOOKUP,
        description: "Map person ids to display names. Respects each person's show_name opt-in (non-opted-in people come back as e.g. 'A founder').",
        input_schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] },
      },
    ];
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await claude().messages.create({ model: MODEL, max_tokens: 1500, system: systemPrompt(projectId), tools, messages });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !uses.length) return text || "I couldn't find an answer in the room data.";

      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        let out: string;
        try {
          const args = (u.input ?? {}) as Record<string, unknown>;
          out = u.name === LOOKUP ? await lookupPeople(args.ids) : await kw.call(u.name, args);
        } catch (e) {
          out = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
        }
        results.push({ type: "tool_result", tool_use_id: u.id, content: out.slice(0, MAX_TOOL_CHARS) });
      }
      messages.push({ role: "user", content: results });
    }
    return "That question needed more lookups than I can do live. Try a narrower question.";
  } finally {
    await kw.close();
  }
}
