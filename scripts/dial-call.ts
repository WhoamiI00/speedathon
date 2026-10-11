// T3: place ONE real Dial call to a phone you control, wait for it to end, print the transcript and extraction.
// No Supabase needed. Needs DIAL_API_KEY, DIAL_NUMBER, and ANTHROPIC_API_KEY (or GEMINI_API_KEY with LLM_PROVIDER=gemini).
// Run:  npm run dial:call -- intake +14155550123 "Sam Rivera"
//       npm run dial:call -- briefing +14155550123 "Sam Rivera"
//       npm run dial:call -- followup +14155550123 "Sam Rivera"
// Only call numbers of people who agreed to be called (yourself / teammates).
import { config } from "dotenv";
import { dial, dialNumber } from "@/lib/dial/client";
import { briefingInstruction, followupInstruction, intakeInstruction, MAX_SECONDS, type CallKind } from "@/lib/dial/scripts";
import { callerSpoke, extractBriefing, extractFollowup, extractIntake, formatTranscript } from "@/lib/dial/extract";

config({ path: ".env.local" });

async function main() {
  const [kind, to, name = "Sam Rivera"] = process.argv.slice(2);
  if (!["intake", "briefing", "followup"].includes(kind) || !to?.startsWith("+")) {
    console.error('usage: npm run dial:call -- <intake|briefing|followup> +1XXXXXXXXXX ["Name"]');
    process.exit(1);
  }
  const k = kind as CallKind;
  const instruction =
    k === "intake"
      ? intakeInstruction(name)
      : k === "briefing"
        ? briefingInstruction({
            name,
            otherName: "Priya",
            otherRole: "Series A investor",
            why: "she backs Japanese DeepTech startups and you need U.S. investors, while you can open doors to a differentiated BrainTech company she wants to see",
          })
        : followupInstruction({ name, otherName: "Priya" });

  const call = await dial().makeCall({
    to,
    fromNumber: dialNumber(),
    outboundInstruction: instruction,
    maxCallDurationSeconds: MAX_SECONDS[k],
  });
  console.log(`placed ${k} call ${call.id} to ${to}; waiting for it to end…`);

  let last = "";
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const c = await dial().getCall(call.id);
    if (c.status.state !== last) console.log(`  state: ${(last = c.status.state)}${c.status.terminationType ? ` (${c.status.terminationType})` : ""}`);
    if (c.status.state !== "Terminated") continue;

    // transcript can land a moment after the call ends
    let done = c;
    for (let j = 0; j < 10 && !formatTranscript(done); j++) {
      await new Promise((r) => setTimeout(r, 3000));
      done = await dial().getCall(call.id);
    }
    const transcript = formatTranscript(done);
    console.log(`\n--- transcript (${done.duration}s) ---\n${transcript || "(none)"}\n`);
    if (!transcript || !callerSpoke(done)) return console.log("caller never spoke; nothing to extract");
    const result = k === "intake" ? await extractIntake(transcript) : k === "briefing" ? await extractBriefing(transcript) : await extractFollowup(transcript);
    console.log("--- extracted ---\n" + JSON.stringify(result, null, 2));
    return;
  }
  console.log("gave up waiting");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
