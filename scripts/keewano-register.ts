// T4: register the Keewano custom event map (PLAN §6a) and optionally send one test event. Needs KEEWANO_API_KEY.
// Run: npm run keewano:register            (register only; safe to repeat)
//      npm run keewano:register -- --ping  (also sends a checked_in event for a random UUID)
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
config({ path: ".env.local" });

async function main() {
  if (!process.env.KEEWANO_API_KEY) {
    console.error("KEEWANO_API_KEY is not set");
    process.exit(1);
  }
  const { ensureRegistered, catalogHash, emit, EV, flushKeewano } = await import("@/lib/keewano");
  const ok = await ensureRegistered();
  console.log(ok ? `registered ${catalogHash()}` : "registration FAILED (see error above)");
  if (ok && process.argv.includes("--ping")) {
    const id = randomUUID();
    emit(id, EV.checked_in, "speedhacks-test");
    await flushKeewano();
    console.log("sent test event for", id, "(queryable in ~5 min)");
  }
  process.exit(ok ? 0 : 1);
}
main();
