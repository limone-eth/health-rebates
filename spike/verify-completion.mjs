// Day 1 spike: verify the attestation, get one structured completion, then verify its signature.
// Follows https://docs.near.ai/cloud/verification. Never prints the API key.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { recoverMessageAddress } from "viem";
import { checkGpu, checkSoftware } from "../tee/software.mjs";

const { js_get_collateral: getCollateral, js_verify: verifyQuote } = createRequire(import.meta.url)(
  "@phala/dcap-qvl-node",
);
const INTEL_PCCS = "https://api.trustedservices.intel.com/tdx/certification/v4";
const QUOTE_OK = new Set(["UpToDate"]);
const SIGNING_ALGO = "ecdsa";

const BASE = "https://cloud-api.near.ai/v1";
const KEY = process.env.NEARAI_CLOUD_API_KEY;
if (!KEY) throw new Error("Set NEARAI_CLOUD_API_KEY in .env");
const auth = { Authorization: `Bearer ${KEY}`, Accept: "application/json" };
// The model ID is in the signed text, so the gateway must not rewrite it.
const noAlias = { "x-no-aliasing": "true" };

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sameAddress = (a, b) => a?.toLowerCase() === b?.toLowerCase();
let failed = false;
const check = (name, ok, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// A NEAR-hosted model with TEE evidence. Many listed models are proxied third parties.
const model = process.env.NEARAI_MODEL || "Qwen/Qwen3.8-27B";
console.log("Model:", model);

// 1. Attestation, before any data goes to the model.
const nonce = randomBytes(32).toString("hex");
const query = new URLSearchParams({ signing_algo: SIGNING_ALGO, nonce, model, provider: "near" });
const report = await fetch(`${BASE}/attestation/report?${query}`, { headers: { ...auth, ...noAlias } });
if (!report.ok) throw new Error(`attestation: HTTP ${report.status}`);
const attestation = await report.json();

// Verifies the Intel signature, then returns the fields of the verified quote.
// verifyQuote throws if the signature is not valid.
const verifiedQuote = async (r) => {
  const quote = Buffer.from(r.intel_quote.replace(/^0x/, ""), "hex");
  const collateral = await getCollateral(INTEL_PCCS, quote);
  const result = verifyQuote(quote, collateral, BigInt(Math.floor(Date.now() / 1000)));
  const { report_data: reportData, td_attributes: tdAttributes } = result.report.TD10;
  return { status: result.status, reportData, tdAttributes, td: result.report.TD10 };
};
const expectedReportData = (r) => {
  const head = Buffer.alloc(32);
  Buffer.from(r.signing_address.replace(/^0x/, ""), "hex").copy(head);
  return head.toString("hex") + nonce;
};
// Bit 0 of TDATTRIBUTES is DEBUG. The host can read the memory of a debug TD, keys included.
const isDebug = (tdAttributes) => (Buffer.from(tdAttributes, "hex")[0] & 1) === 1;

async function verifyReport(label, r) {
  const { status, reportData, tdAttributes, td } = await verifiedQuote(r);
  const signed = QUOTE_OK.has(status);
  const production = !isDebug(tdAttributes);
  const bound = reportData === expectedReportData(r);
  const echoed = r.request_nonce === nonce && (r.report_data === undefined || r.report_data === reportData);
  const algo = r.signing_algo === SIGNING_ALGO;
  check(`${label}: valid Intel signature`, signed, status);
  check(`${label}: not a debug TD`, production, `td_attributes ${tdAttributes}`);
  check(`${label}: verified quote binds the signer and our nonce`, bound, r.signing_address);
  check(`${label}: echoed nonce matches`, echoed);
  check(`${label}: signing algorithm is ${SIGNING_ALGO}`, algo, r.signing_algo);
  let software = true;
  try {
    const { composeHash, images } = checkSoftware(r, td);
    check(`${label}: event log replays to RTMR3, and the compose file matches it and MRCONFIGID`, true, composeHash);
    console.log(`      compose file names: ${images.join(", ")}`);
  } catch (error) {
    software = false;
    check(`${label}: event log and compose file`, false, error.message);
  }
  return signed && production && bound && echoed && algo && software;
}

const verifyGpu = async (label, r) => {
  try {
    const { gpus } = await checkGpu(r, nonce);
    check(`${label}: NVIDIA accepted the GPU evidence`, true, `${gpus} GPUs`);
    return true;
  } catch (error) {
    check(`${label}: GPU evidence`, false, error.message);
    return false;
  }
};

check("gateway report is present", Boolean(attestation.gateway_attestation));
if (attestation.gateway_attestation) await verifyReport("gateway", attestation.gateway_attestation);

const modelReports = attestation.model_attestations ?? [];
check("model reports are present", modelReports.length > 0, `${modelReports.length} reports`);
const verifiedModelReports = [];
for (const [i, r] of modelReports.entries()) {
  const label = `model report ${i}`;
  if ((await verifyReport(label, r)) && (await verifyGpu(label, r))) verifiedModelReports.push(r);
}
if (failed) {
  console.log("\nRESULT: FAILED. No data was sent to the model.");
  process.exit(1);
}

// 2. Completion. Hash the exact bytes: do not parse and serialize again.
const requestBody = Buffer.from(
  JSON.stringify({
    model,
    // Signed bytes cannot be edited later, so the model must not produce reasoning text.
    reasoning_effort: "none",
    messages: [{ role: "user", content: "Synthetic test. 5 of 7 days met the rule. Report the count." }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "result",
        strict: true,
        schema: {
          type: "object",
          properties: { days_met: { type: "integer" } },
          required: ["days_met"],
          additionalProperties: false,
        },
      },
    },
  }),
);
const completion = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers: { ...auth, ...noAlias, "Content-Type": "application/json", "Accept-Encoding": "identity" },
  body: requestBody,
});
const responseBody = Buffer.from(await completion.arrayBuffer());
if (!completion.ok) throw new Error(`completion: HTTP ${completion.status}: ${responseBody}`);
const parsed = JSON.parse(responseBody);
console.log("Answer:", parsed.choices[0].message.content);
check("response is from the requested model", parsed.model === model, parsed.model);
check("structured JSON output", Number.isInteger(JSON.parse(parsed.choices[0].message.content).days_met));
// The response body goes on-chain, so it must not hold model reasoning.
const { reasoning, reasoning_content: reasoningContent } = parsed.choices[0].message;
check("response holds no reasoning text", !reasoning && !reasoningContent);

// 3. Response signature. A 404 can be retried for a short time.
let sig;
for (let attempt = 0; attempt < 5 && !sig; attempt++) {
  const res = await fetch(`${BASE}/signature/${parsed.id}?signing_algo=${SIGNING_ALGO}`, { headers: auth });
  if (res.status === 404) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    continue;
  }
  if (!res.ok) throw new Error(`signature: HTTP ${res.status}`);
  sig = await res.json();
}
if (!sig?.signature) throw new Error(`No signature: ${JSON.stringify(sig)}`);
console.log("Signature kind:", sig.signature_kind, "| algo:", sig.signing_algo, "| signer:", sig.signing_address);

check("signed by the provider TEE, not only the gateway", sig.signature_kind === "provider_tee");
check("signed text matches our exact bytes", sig.text === `${model}:${sha256(requestBody)}:${sha256(responseBody)}`);
const recovered = await recoverMessageAddress({ message: sig.text, signature: sig.signature });
check("EIP-191 signer matches signing_address", sameAddress(recovered, sig.signing_address));

// The docs require exactly one verified model report with this signer and algorithm.
const matches = verifiedModelReports.filter(
  (r) => sameAddress(r.signing_address, sig.signing_address) && r.signing_algo === sig.signing_algo,
);
check("exactly one verified model report has this signer", matches.length === 1, `${matches.length} matches`);

mkdirSync("out", { recursive: true });
writeFileSync("out/attestation.json", JSON.stringify(attestation, null, 2));
writeFileSync("out/signature.json", JSON.stringify(sig, null, 2));
writeFileSync(
  "out/fixture.json",
  JSON.stringify(
    {
      model,
      request_hash: sha256(requestBody),
      response_body: responseBody.toString("utf8"),
      signature: sig.signature,
      signing_address: sig.signing_address,
    },
    null,
    2,
  ),
);

console.log("\nNOTE: this does not check that the images are safe, or what the compose manager starts later.");
console.log(failed ? "\nRESULT: FAILED" : "\nRESULT: signature and bindings verified");
process.exit(failed ? 1 : 0);
