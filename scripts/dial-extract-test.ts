// T3: checks transcript → structured result extraction against canned transcripts. Needs ANTHROPIC_API_KEY (or GEMINI_API_KEY with LLM_PROVIDER=gemini).
// Run: npm run dial:extract
import { config } from "dotenv";
import { extractBriefing, extractFollowup, extractIntake } from "@/lib/dial/extract";

config({ path: ".env.local" });

// Free-tier Gemini allows only ~10 requests/minute: EXTRACT_TEST_PACE_MS=7000 spaces the calls out.
const PACE_MS = Number(process.env.EXTRACT_TEST_PACE_MS ?? 0);
let last = 0;
async function paced<T>(fn: (t: string) => Promise<T>, transcript: string): Promise<T> {
  const wait = PACE_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return fn(transcript);
}

let failures = 0;
function check(label: string, ok: boolean, got: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "\n      got: " + JSON.stringify(got)}`);
}

async function main() {
  const intakeGood = await paced(extractIntake, `Agent: Hi Sam, this is Sevendipity, your networking agent at SpeedHacks. Is now a good time for a quick interview?
Caller: Sure.
Agent: Great. Who are you and what do you work on?
Caller: I'm a second-year PhD student at NYU working on brain-computer interfaces, decoding speech from EEG.
Agent: What do you need most right now?
Caller: Honestly a co-founder with a hardware background, and maybe seed investors who know neurotech.
Agent: And what can you offer others?
Caller: I can give ML expertise, and I can introduce people to our lab and to other researchers in the field.`);
  check("intake: complete", intakeGood.complete === true, intakeGood);
  check("intake: needs mention co-founder", /co-?founder/i.test(intakeGood.needs), intakeGood);
  check("intake: gives mention ML/expertise", /ML|machine|expertise/i.test(intakeGood.gives), intakeGood);
  check("intake: role set", intakeGood.role.length > 0, intakeGood);

  const intakeNoisy = await paced(extractIntake, `Agent: Hi Kate, who are you and what do you work on?
Caller: I work on AI UGC, we make AI generated content for brands on TikTok.
Agent: What do you most need right now?
Caller: Customers, mainly. Also looking for in bed storage.
Agent: And what can you offer others?
Caller: I can help creators grow their followers on TikTok.`);
  check("intake: keeps customers need", /customer/i.test(intakeNoisy.needs), intakeNoisy);
  check("intake: drops garbled fragment and commentary", !/storage|unclear|transcri|possibly|mention/i.test(intakeNoisy.needs), intakeNoisy);

  const intakeVoicemail = await paced(extractIntake, `Agent: Hi, this is Sevendipity...\nCaller: You have reached the voicemail of 415 555 0123. Please leave a message after the tone.`);
  check("intake: voicemail is not complete", intakeVoicemail.complete === false, intakeVoicemail);
  check("intake: voicemail is flagged for retry", intakeVoicemail.voicemail === true, intakeVoicemail);
  const intakeJaVoicemail = await paced(extractIntake, `Caller: 電話に出ることができません。 P という発信音の後に名前とご用件をお話しください。\nAgent: （無言で通話を終了します）`);
  check("intake: Japanese voicemail is flagged", intakeJaVoicemail.voicemail === true && intakeJaVoicemail.complete === false, intakeJaVoicemail);
  const intakeDecline = await paced(extractIntake, `Agent: Hi Sam, who are you and what do you work on?\nCaller: Sorry, I'm not interested. Please don't call again.`);
  check("intake: a decline is not voicemail", intakeDecline.complete === false && intakeDecline.voicemail === false, intakeDecline);
  check("intake: real answers are not voicemail", intakeGood.voicemail === false, intakeGood);

  const yes = await paced(extractBriefing, `Agent: I found someone you should meet, Priya, a Series A investor in DeepTech. Would you like me to set up the introduction?\nCaller: Yeah, absolutely, please do.`);
  check("briefing: yes", yes.decision === "yes", yes);
  const no = await paced(extractBriefing, `Agent: Would you like me to set up the introduction?\nCaller: Nah, not right now, thanks.`);
  check("briefing: no", no.decision === "no", no);
  const unclear = await paced(extractBriefing, `Agent: Would you like me to set up the introduction?\nCaller: Hmm, what time is it? I'm in the middle of something.`);
  check("briefing: unclear", unclear.decision === "unclear", unclear);

  const r3 = await paced(extractFollowup, `Agent: On a scale from zero to three, how much did Priya help you?\nCaller: Oh, three. She was incredibly helpful.`);
  check("followup: 3", r3.rating === 3, r3);
  const r1 = await paced(extractFollowup, `Agent: How much did Priya help you, zero to three?\nCaller: A little, I'd say.`);
  check("followup: 'a little' → 1", r1.rating === 1, r1);
  const r0 = await paced(extractFollowup, `Agent: How much did Priya help you, zero to three?\nCaller: Zero, we barely talked.`);
  check("followup: 0", r0.rating === 0, r0);
  const rn = await paced(extractFollowup, `Agent: How much did Priya help you, zero to three?\nCaller: Can you call back later?`);
  check("followup: unclear → null", rn.rating === null, rn);

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
