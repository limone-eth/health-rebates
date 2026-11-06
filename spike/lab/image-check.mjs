// Sends a sample lab report photo to the attested model and checks the signature. Values are made up.
import { readFileSync } from "node:fs";
import { createNearAi } from "../../tee/near-ai.mjs";
const model = "Qwen/Qwen3.8-27B";
const ai = createNearAi({ apiKey: process.env.NEARAI_CLOUD_API_KEY, model });
const t0 = Date.now();
const signers = await ai.attest();
console.log("attested signers:", signers.length, ((Date.now()-t0)/1000).toFixed(1)+"s");
const img = readFileSync(new URL("./sample-report.png", import.meta.url)).toString("base64");
const request = { model, temperature: 0, reasoning_effort: "none",
  response_format: { type: "json_schema", json_schema: { name: "lab_result", strict: true, schema: { type: "object", additionalProperties: false, properties: { test_found: { type: "boolean" }, rule_met: { type: "boolean" } }, required: ["test_found", "rule_met"] } } },
  messages: [
    { role: "system", content: "You read one lab report. Find HbA1c in this report and in any earlier result it lists. Convert to percent with: percent = mmol/mol / 10.929 + 2.15. Rule: the test date is within 12 months of 2026-11-06, and HbA1c is under 5.7% or at least 0.3 points lower than the earlier result. Reply only with JSON: {\"test_found\": boolean, \"rule_met\": boolean}." },
    { role: "user", content: [ { type: "image_url", image_url: { url: "data:image/png;base64," + img } }, { type: "text", text: "Check this report." } ] },
  ] };
const t1 = Date.now();
const done = await ai.complete(request);
console.log("answer:", done.content, ((Date.now()-t1)/1000).toFixed(1)+"s");
const sig = await ai.verifySignature(done, signers);
console.log("signature OK:", sig.signature_kind, sig.signing_address);
