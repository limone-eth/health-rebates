// NEAR AI Cloud client: attestation first, then completion, then response signature.
// Same checks as spike/verify-completion.mjs. Follows https://docs.near.ai/cloud/verification.
// It does not check the event log, the compose hash, image provenance or GPU evidence.
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { recoverMessageAddress } from "viem";

const { js_get_collateral: getCollateral, js_verify: verifyQuote } = createRequire(import.meta.url)(
  "@phala/dcap-qvl-node",
);
const INTEL_PCCS = "https://api.trustedservices.intel.com/tdx/certification/v4";
const SIGNING_ALGO = "ecdsa";
const BASE = "https://cloud-api.near.ai/v1";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sameAddress = (a, b) => a?.toLowerCase() === b?.toLowerCase();

async function verifyReport(report, nonce) {
  const quote = Buffer.from(report.intel_quote.replace(/^0x/, ""), "hex");
  const collateral = await getCollateral(INTEL_PCCS, quote);
  // verifyQuote throws if the Intel signature is not valid.
  const verified = verifyQuote(quote, collateral, BigInt(Math.floor(Date.now() / 1000)));
  const { report_data: reportData, td_attributes: tdAttributes } = verified.report.TD10;

  const head = Buffer.alloc(32);
  Buffer.from(report.signing_address.replace(/^0x/, ""), "hex").copy(head);

  if (verified.status !== "UpToDate") throw new Error(`Quote status: ${verified.status}`);
  // Bit 0 of TDATTRIBUTES is DEBUG. The host can read the memory of a debug TD, keys included.
  if (Buffer.from(tdAttributes, "hex")[0] & 1) throw new Error("Quote is from a debug TD");
  if (reportData !== head.toString("hex") + nonce) throw new Error("Quote does not bind the signer and nonce");
  if (report.request_nonce !== nonce) throw new Error("Echoed nonce does not match");
  if (report.signing_algo !== SIGNING_ALGO) throw new Error(`Signing algorithm: ${report.signing_algo}`);
}

export function createNearAi({ apiKey, model }) {
  if (!apiKey) throw new Error("Set NEARAI_CLOUD_API_KEY in .env");
  const auth = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  // The model ID is in the signed text, so the gateway must not rewrite it.
  const noAlias = { "x-no-aliasing": "true" };

  // Returns the verified signers. Throws if any report fails. Call this before sending data.
  async function attest() {
    const nonce = randomBytes(32).toString("hex");
    const query = new URLSearchParams({ signing_algo: SIGNING_ALGO, nonce, model, provider: "near" });
    const res = await fetch(`${BASE}/attestation/report?${query}`, { headers: { ...auth, ...noAlias } });
    if (!res.ok) throw new Error(`attestation: HTTP ${res.status}`);
    const { gateway_attestation: gateway, model_attestations: reports = [] } = await res.json();
    if (!gateway) throw new Error("No gateway report");
    if (reports.length === 0) throw new Error("No model reports");
    for (const report of [gateway, ...reports]) await verifyReport(report, nonce);
    return reports.map((report) => report.signing_address);
  }

  // Hashes the exact bytes. Do not parse and serialize again.
  async function complete(request) {
    const requestBody = Buffer.from(JSON.stringify(request));
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { ...auth, ...noAlias, "Content-Type": "application/json", "Accept-Encoding": "identity" },
      body: requestBody,
    });
    const responseBody = Buffer.from(await res.arrayBuffer());
    if (!res.ok) throw new Error(`completion: HTTP ${res.status}: ${responseBody}`);
    const parsed = JSON.parse(responseBody);
    if (parsed.model !== model) throw new Error(`Response is from ${parsed.model}`);
    const { reasoning, reasoning_content: reasoningContent } = parsed.choices[0].message;
    if (reasoning || reasoningContent) throw new Error("Response holds reasoning text");
    return { id: parsed.id, content: parsed.choices[0].message.content, requestBody, responseBody };
  }

  // Returns the signature. Throws unless a signer from attest() signed these exact bytes.
  async function verifySignature({ id, requestBody, responseBody }, signers) {
    let signature;
    for (let attempt = 0; attempt < 5 && !signature; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
      const res = await fetch(`${BASE}/signature/${id}?signing_algo=${SIGNING_ALGO}`, { headers: auth });
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`signature: HTTP ${res.status}`);
      signature = await res.json();
    }
    if (!signature?.signature) throw new Error("No signature");
    if (signature.signature_kind !== "provider_tee") throw new Error(`Signature kind: ${signature.signature_kind}`);
    if (signature.text !== `${model}:${sha256(requestBody)}:${sha256(responseBody)}`) {
      throw new Error("Signed text does not match our bytes");
    }
    const recovered = await recoverMessageAddress({ message: signature.text, signature: signature.signature });
    if (!sameAddress(recovered, signature.signing_address)) throw new Error("Signature does not match signing_address");
    const matches = signers.filter((signer) => sameAddress(signer, recovered));
    if (matches.length !== 1) throw new Error(`${matches.length} verified reports have this signer`);
    return signature;
  }

  return { attest, complete, verifySignature };
}
