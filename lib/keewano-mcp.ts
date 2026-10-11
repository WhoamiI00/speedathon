import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Owner: T4. Server-side MCP client for Keewano (PLAN §6c).
// Anthropic's MCP connector only sends Bearer tokens, so we connect ourselves with the `k-token` header (a personal access token).

const MCP_URL = process.env.KEEWANO_MCP_URL ?? "https://api.keewano.com/mcp";

export type KeewanoSession = {
  tools: { name: string; description?: string; input_schema: Record<string, unknown> }[];
  call: (name: string, args: Record<string, unknown>) => Promise<string>;
  close: () => Promise<void>;
};

/** Keewano's tools all take a projectId. KEEWANO_PROJECT_ID, else the one embedded in the ingestion key (a JWT with a projectId claim). */
export function keewanoProjectId(): string | null {
  if (process.env.KEEWANO_PROJECT_ID) return process.env.KEEWANO_PROJECT_ID;
  try {
    const payload = process.env.KEEWANO_API_KEY?.split(".")[1];
    const id = payload ? (JSON.parse(Buffer.from(payload, "base64url").toString()) as { projectId?: unknown }).projectId : null;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

export const keewanoMcpConfigured = () => Boolean(process.env.KEEWANO_PAT);

export async function openKeewano(): Promise<KeewanoSession> {
  const pat = process.env.KEEWANO_PAT;
  if (!pat) throw new Error("Missing KEEWANO_PAT");
  const client = new Client({ name: "sevendipity", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { "k-token": pat } } }));
  const listed = await client.listTools();
  return {
    tools: listed.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
    })),
    async call(name, args) {
      const res = await client.callTool({ name, arguments: args });
      const parts = Array.isArray(res.content) ? res.content : [];
      const text = parts.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : JSON.stringify(c))).join("\n");
      return res.isError ? `ERROR: ${text}` : text;
    },
    close: () => client.close().catch(() => {}),
  };
}
