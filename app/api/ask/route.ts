import { askTheRoom } from "@/lib/ask";
import { keewanoMcpConfigured } from "@/lib/keewano-mcp";

export const maxDuration = 60;

// POST /api/ask  {question} → {answer}   (Owner: T4)
// Claude + Keewano MCP tools. Aggregates only: never an individual's take/debit side.
export async function POST(req: Request) {
  let question = "";
  try {
    const body = (await req.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!question) return Response.json({ error: "question is required" }, { status: 400 });
  if (!keewanoMcpConfigured()) return Response.json({ error: "Keewano is not configured (KEEWANO_PAT)" }, { status: 503 });

  try {
    return Response.json({ answer: await askTheRoom(question) });
  } catch (e) {
    console.error("[ask]", e);
    return Response.json({ error: "ask failed" }, { status: 502 });
  }
}
