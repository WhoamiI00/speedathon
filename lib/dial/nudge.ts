import "server-only";
import { after } from "next/server";

// Owner: T3. Start calls right after they are queued, without waiting for the dashboard's 5 s tick, and keep
// ticking until they finish. A call's result is applied by a LATER tick, so a single tick is not enough.
//
// nudgeCalls() POSTs /api/calls/tick?chain=N; the tick route re-posts itself every 5 s with N-1 while any call is
// in flight or due (see app/api/calls/tick/route.ts). Each hop is a short request, so no function stays alive for
// a whole call. Where after() is unavailable it falls back to a plain request; the dashboard tick and
// `npm run dial:tick` are the backups.

export const CHAIN_HOPS = 36; // 36 x 5 s = 3 min, longer than any call (5 min cap, scripts are ~90 s)
export const CHAIN_GAP_MS = 5_000;

/** Where this deployment can reach itself. On Vercel previews the unique URL is behind SSO, so prefer the production alias. */
export function appOrigin(): string {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function tickUrl(origin: string, hops: number): string {
  return `${origin}/api/calls/tick?chain=${hops}`;
}

export function nudgeCalls(origin: string = appOrigin()): void {
  try {
    after(async () => {
      await fetch(tickUrl(origin, CHAIN_HOPS), { method: "POST", signal: AbortSignal.timeout(55_000) }).catch((e) =>
        console.error("[dial/nudge] tick request failed", e instanceof Error ? e.message : e),
      );
    });
  } catch {
    // after() is unavailable (e.g. already inside a deferred step, or a script). Fire the request directly; if
    // nothing is listening this is a harmless no-op, and the dashboard tick is the backup.
    void fetch(tickUrl(origin, CHAIN_HOPS), { method: "POST", signal: AbortSignal.timeout(55_000) }).catch(() => {});
  }
}
