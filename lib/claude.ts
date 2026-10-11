import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Shared Claude client (PLAN §0.7). Server-only: ANTHROPIC_API_KEY never reaches the browser.
export const MODEL = "claude-sonnet-5-5";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}
