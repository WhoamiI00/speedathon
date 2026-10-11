import "server-only";
import { claude, MODEL } from "@/lib/claude";

// One place for every structured LLM call (matching, call-transcript extraction, later Ask the room).
// Provider: Claude by default. LLM_PROVIDER=gemini switches to Gemini (needs GEMINI_API_KEY).
// NOTE: Gemini's free tier may use submitted data for training. Use a paid key for real attendees.

export type Provider = "anthropic" | "gemini";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

export function llmProvider(): Provider {
  const forced = process.env.LLM_PROVIDER ?? process.env.EXTRACT_PROVIDER;
  if (forced === "anthropic" || forced === "gemini") return forced;
  return "anthropic";
}

export type JsonRequest = {
  system: string;
  user: string;
  /** JSON Schema of the answer. Converted per provider. */
  schema: Record<string, unknown>;
  maxTokens: number;
  /** On the call critical path: no thinking on Gemini, low effort on Claude. */
  fast?: boolean;
  timeoutMs?: number;
};

/** Claude structured outputs want closed objects and reject numeric bounds. */
function toClaudeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toClaudeSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "minimum" || k === "maximum") continue;
    out[k] = toClaudeSchema(v);
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

/** JSON Schema → Gemini's OpenAPI subset: ["integer","null"] becomes nullable; additionalProperties is unsupported. */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "additionalProperties") continue;
    if (k === "type" && Array.isArray(v)) {
      const types = v.filter((t) => t !== "null");
      out.type = types[0];
      if (types.length < v.length) out.nullable = true;
    } else out[k] = toGeminiSchema(v);
  }
  return out;
}

async function withClaude<T>(r: JsonRequest): Promise<T> {
  const res = await claude().beta.messages.create(
    {
      model: MODEL,
      max_tokens: r.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: r.fast ? "low" : "medium",
        format: { type: "json_schema", schema: toClaudeSchema(r.schema) as Record<string, unknown> },
      },
      system: r.system,
      messages: [{ role: "user", content: r.user }],
    },
    r.timeoutMs ? { timeout: r.timeoutMs } : undefined,
  );
  if (res.stop_reason === "refusal") throw new Error(`claude refused: ${res.stop_details?.category ?? "unknown"}`);
  if (res.stop_reason === "max_tokens") throw new Error("claude output truncated (max_tokens)");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  if (!text) throw new Error("claude returned no content");
  return JSON.parse(text) as T;
}

async function withGemini<T>(r: JsonRequest): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const request = (noThinking: boolean) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: r.system }] },
        contents: [{ role: "user", parts: [{ text: r.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(r.schema),
          temperature: 0,
          maxOutputTokens: r.maxTokens,
          // Not every model accepts a zero thinking budget, so it is dropped on a 400.
          ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
      signal: AbortSignal.timeout(r.timeoutMs ?? 30_000),
    });
  let noThinking = r.fast === true;
  let res = await request(noThinking);
  if (res.status === 400 && noThinking) res = await request((noThinking = false));
  // Free-tier Gemini returns transient 429/503 under load: retry with backoff.
  for (let attempt = 1; attempt <= 3 && (res.status === 429 || res.status >= 500); attempt++) {
    await new Promise((ok) => setTimeout(ok, 800 * attempt));
    res = await request(noThinking);
  }
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  const cand = body.candidates?.[0];
  if (cand?.finishReason === "MAX_TOKENS") throw new Error("gemini output truncated (MAX_TOKENS)");
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`gemini returned no content (${cand?.finishReason ?? "no candidate"})`);
  return JSON.parse(text) as T;
}

/** Ask the configured model for JSON matching `schema`. Callers still validate the result. */
export function generateJSON<T>(r: JsonRequest): Promise<T> {
  return llmProvider() === "gemini" ? withGemini<T>(r) : withClaude<T>(r);
}
