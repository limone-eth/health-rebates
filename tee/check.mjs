// TEE check: A, B and C must give the expected results on each run.
// Usage: npm run check. RUNS sets the number of runs (default 5).
import { BASELINE_WEEK, CLAIM_WEEK } from "../wearable/data.mjs";
import { countDaysMet } from "../wearable/rule.mjs";
import { createWearableServer } from "../wearable/server.mjs";
import { buildClaimRequest, buildExplanationRequest, decide, parseResult, toRows } from "./claim.mjs";
import { createNearAi } from "./near-ai.mjs";

const RUNS = Number(process.env.RUNS ?? 5);
const MODEL = process.env.NEARAI_MODEL || "Qwen/Qwen3.8-27B";
const WEARABLE_KEY = "demo-key";

const EXPECTED = {
  A: { days_met: 6, pattern_matches_owner: true, decision: "paid" },
  B: { days_met: 3, pattern_matches_owner: true, decision: "not paid" },
  C: { days_met: 6, pattern_matches_owner: false, decision: "held for review" },
};

const server = createWearableServer({ apiKey: WEARABLE_KEY });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const wearableBase = `http://127.0.0.1:${server.address().port}`;

async function fetchDays(memberId, kind, { start, end }) {
  const query = new URLSearchParams({ start_date: start, end_date: end, limit: "1000" });
  const res = await fetch(`${wearableBase}/api/v1/users/${memberId}/summaries/${kind}?${query}`, {
    headers: { "X-Open-Wearables-API-Key": WEARABLE_KEY },
  });
  if (!res.ok) throw new Error(`wearable: HTTP ${res.status}`);
  return (await res.json()).data;
}

const members = await (await fetch(`${wearableBase}/mock/members`)).json();
const memberData = await Promise.all(
  members.map(async ({ id, name }) => {
    const [baselineActivity, baselineSleep, claimActivity, claimSleep] = await Promise.all([
      fetchDays(id, "activity", BASELINE_WEEK),
      fetchDays(id, "sleep", BASELINE_WEEK),
      fetchDays(id, "activity", CLAIM_WEEK),
      fetchDays(id, "sleep", CLAIM_WEEK),
    ]);
    return {
      name,
      baselineRows: toRows(baselineActivity, baselineSleep),
      claimRows: toRows(claimActivity, claimSleep),
      ruleCount: countDaysMet(claimActivity, claimSleep),
    };
  }),
);

const nearAi = createNearAi({ apiKey: process.env.NEARAI_CLOUD_API_KEY, model: MODEL });
console.log(`Model: ${MODEL}. Runs: ${RUNS}.`);

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};

try {
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
} finally {
  server.close();
}

console.log("\nNOTE: this does not check the event log, the compose hash, image provenance or GPU evidence.");
console.log(failures ? `\nRESULT: FAILED (${failures} failures)` : `\nRESULT: all ${RUNS} runs gave the expected results`);
process.exit(failures ? 1 : 0);
