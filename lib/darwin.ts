import "server-only";

// Owner: T4. Darwin agent search for needs no human in the room can meet (PLAN §7).
// POST https://api.darwin.so/api/v3/search  header x-api-key  {query, maxResults, context:[{type:"text", text}]}
// The response shape comes from Darwin's v3 docs; parsing is defensive because we could not exercise it without a key.

export type AgentCard = { agent_name: string; why: string; connect: Record<string, unknown> };

export const darwinConfigured = () => Boolean(process.env.DARWIN_API_KEY);

type DarwinAgent = {
  name?: string;
  description?: string;
  reasons?: string[];
  connectionMethods?: unknown[];
  connectionPrompt?: string;
  agentSlug?: string;
  agentId?: string;
};

export async function searchAgents(need: string, whoIAm: string, max = 2): Promise<AgentCard[]> {
  const key = process.env.DARWIN_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.darwin.so/api/v3/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      query: (whoIAm.trim() ? `${need}. The person asking: ${whoIAm.trim().slice(0, 300)}` : need).slice(0, 2000),
      maxResults: 5,
      ...(whoIAm.trim() ? { context: [{ type: "text", text: `Requester: ${whoIAm.trim().slice(0, 500)}` }] } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`darwin ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { status?: string; response?: { agents?: DarwinAgent[] } };
  if (body.status === "no_match" || body.status === "needs_input") return [];
  return (body.response?.agents ?? [])
    .filter((a) => a.name)
    .slice(0, max)
    .map((a) => ({
      agent_name: String(a.name).slice(0, 200),
      why: (a.reasons?.length ? a.reasons.join(" ") : a.description ?? "Matched by Darwin to this need.").slice(0, 600),
      connect: { methods: a.connectionMethods ?? [], prompt: a.connectionPrompt ?? null, slug: a.agentSlug ?? null, id: a.agentId ?? null },
    }));
}
