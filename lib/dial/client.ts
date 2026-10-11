import "server-only";
import { DialClient } from "@getdial/sdk";

// Owner: T3. One Dial client per server instance.
let client: DialClient | null = null;

export function dial(): DialClient {
  if (!client) {
    const apiKey = process.env.DIAL_API_KEY;
    if (!apiKey) throw new Error("Missing DIAL_API_KEY");
    client = new DialClient({ apiKey });
  }
  return client;
}

export function dialNumber(): string {
  const n = process.env.DIAL_NUMBER;
  if (!n) throw new Error("Missing DIAL_NUMBER");
  return n;
}

/** Dial limits today (quickstart): 2 concurrent calls, 5-minute cap per call. Ask the Dial table to raise it. */
export const MAX_CONCURRENT_CALLS = Number(process.env.DIAL_MAX_CONCURRENT ?? 2);
