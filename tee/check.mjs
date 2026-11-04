// TEE check: A, B and C must give the expected results on each run.
// Usage: npm run check. RUNS sets the number of runs (default 5).
import { buildClaimRequest, buildExplanationRequest, decide, parseResult } from "./claim.mjs";
import { EXPECTED, loadMembers } from "./members.mjs";
import { createNearAi } from "./near-ai.mjs";

const RUNS = Number(process.env.RUNS ?? 5);
const MODEL = process.env.NEARAI_MODEL || "Qwen/Qwen3.8-27B";

const memberData = await loadMembers();
const nearAi = createNearAi({ apiKey: process.env.NEARAI_CLOUD_API_KEY, model: MODEL });
console.log(`Model: ${MODEL}. Runs: ${RUNS}.`);

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};

for (let run = 1; run <= RUNS; run++) {
  console.log(`\nRun ${run}`);
  // A failed attestation throws here, before any member data goes to the model.
  const signers = await nearAi.attest();
  for (const { name, baselineRows, claimRows, ruleCount } of memberData) {
    const expected = EXPECTED[name];
    const claim = await nearAi.complete(buildClaimRequest(MODEL, baselineRows, claimRows));
    await nearAi.verifySignature(claim, signers);
    const result = parseResult(claim.content);
    const decision = decide(result);
    console.log(`  ${name}: ${claim.content} -> ${decision} (signature verified)`);

    if (ruleCount !== expected.days_met) fail(`${name}: rule code counts ${ruleCount}`);
    if (result.days_met !== ruleCount) fail(`${name}: model days_met ${result.days_met}, rule code ${ruleCount}`);
    if (result.pattern_matches_owner !== expected.pattern_matches_owner) fail(`${name}: pattern`);
    if (decision !== expected.decision) fail(`${name}: decision ${decision}`);

    const explanation = await nearAi.complete(buildExplanationRequest(MODEL, claimRows, result));
    if (!explanation.content?.trim()) fail(`${name}: empty explanation`);
    if (!explanation.content?.includes(String(result.days_met))) fail(`${name}: explanation has no day count`);
    if (run === 1) console.log(`     Explanation: ${explanation.content}`);
  }
}

console.log("\nNOTE: this does not check the event log, the compose hash, image provenance or GPU evidence.");
console.log(failures ? `\nRESULT: FAILED (${failures} failures)` : `\nRESULT: all ${RUNS} runs gave the expected results`);
process.exit(failures ? 1 : 0);
