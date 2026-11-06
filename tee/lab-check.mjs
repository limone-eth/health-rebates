// Sends each synthetic lab report to the attested model, checks the response signature, and compares the answer with the rule.
// Run from tee/: npm run lab-check. Needs NEARAI_CLOUD_API_KEY in ../.env.
import { readFileSync } from "node:fs";
import { buildLabRequest, parseLabResult } from "./lab.mjs";
import { LAB_SAMPLES } from "./lab-samples.mjs";
import { createNearAi } from "./near-ai.mjs";

const MODEL = process.env.NEARAI_MODEL || "Qwen/Qwen3.8-27B";
// The samples have fixed dates, so the check uses the date the rule was written for.
const TODAY = "2026-11-06";
const RUNS = Number(process.env.RUNS ?? 1);

const ai = createNearAi({ apiKey: process.env.NEARAI_CLOUD_API_KEY, model: MODEL });
const started = Date.now();
const signers = await ai.attest();
console.log(`Attestation passed: ${signers.length} model signers, ${((Date.now() - started) / 1000).toFixed(1)} s`);

let failures = 0;
for (let run = 1; run <= RUNS; run++) {
  for (const sample of LAB_SAMPLES) {
    const bytes = readFileSync(new URL(`../web/public/lab-samples/${sample.id}.png`, import.meta.url));
    const { body } = buildLabRequest(MODEL, { type: "image/png", bytes }, TODAY);
    const t0 = Date.now();
    const done = await ai.complete(body);
    await ai.verifySignature(done, signers);
    const result = parseLabResult(done.content);
    const ok = result.test_found === sample.expected.test_found && result.rule_met === sample.expected.rule_met;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  run ${run}  ${sample.id.padEnd(20)} ${JSON.stringify(result)}  signature OK  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
console.log(failures ? `\nRESULT: ${failures} answers differ from the rule` : "\nRESULT: each answer matches the rule, and each signature passed");
process.exitCode = failures ? 1 : 0;
