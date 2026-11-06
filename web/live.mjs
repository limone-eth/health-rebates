// Real claims on testnet: a new member account each time, then a signed result, then the on-chain claim.
// Wearable claim: the wearable service decides in code. Lab claim: the attested model reads the report, and code decides.
// Loaded only when keys exist, so the read-only app needs no npm install.
import { randomBytes } from "node:crypto";
import { accountWith, hasDevAccount, KeyPair, loadDevAccount, mustCall, nearBalance, privateKeyToAccount, relayCall, sleep, waitForAccount } from "../chain/near.mjs";
import { EXPLORER, view } from "../chain/view.mjs";
import { decide, explainResult } from "../tee/claim.mjs";
import { decideLab, explainLab, labClaimArgs, readLabReport } from "../tee/lab.mjs";
import { createNearAi } from "../tee/near-ai.mjs";
import { CLAIM_WEEK, MEMBERS } from "../wearable/data.mjs";
import { buildClaim, signRows } from "../wearable/server.mjs";

const CLAIM_READ_ATTEMPTS = 15;
const CLAIM_READ_DELAY_MS = 1000;
// An attestation is good for this long in one process. Then the next lab claim attests again.
const ATTESTATION_MS = 10 * 60 * 1000;
const idOf = Object.fromEntries(Object.entries(MEMBERS).map(([id, member]) => [member.name, id]));

export async function createLive({ pool, model, apiKey = process.env.NEARAI_CLOUD_API_KEY }) {
  if (!hasDevAccount()) throw new Error("No dev account: chain/.env.testnet does not exist");

  const { accountId: rootId, nearKey, wearableKey } = loadDevAccount();
  const keyPair = KeyPair.fromString(nearKey);
  const root = accountWith(rootId, keyPair);
  const config = await view(pool, "get_config");
  if (config.insurer !== rootId) throw new Error("The dev account is not the insurer of this pool");
  if (config.model !== model) throw new Error("This pool publishes another model");

  const wearableSigner = privateKeyToAccount(wearableKey);

  // The wearable service runs in this process for the demo, because the host does not let a function open a local server.
  const claims = { contract: pool, signMessage: (message) => wearableSigner.signMessage({ message }) };

  async function requestClaim(name, nearAccount, upload) {
    if (upload) return signRows(claims, upload.baselineRows, upload.claimRows, nearAccount, CLAIM_WEEK.start);
    const [status, body] = await buildClaim(claims, { user_id: idOf[name], near_account: nearAccount, week: CLAIM_WEEK.start });
    if (status !== 200) throw new Error(`wearable service: ${body.detail}`);
    return body;
  }

  // Views read final state, which comes some seconds after the transaction. Without this wait, the screens show "No claim".
  async function waitForClaim(memberId, week = CLAIM_WEEK.start) {
    for (let attempt = 0; attempt < CLAIM_READ_ATTEMPTS; attempt++) {
      if (await view(pool, "get_claim", { member: memberId, week })) return;
      await sleep(CLAIM_READ_DELAY_MS);
    }
    throw new Error("The claim transaction passed, but its record is not readable yet");
  }

  // The member signed a meta transaction, and the insurer's account sent it.
  async function gasText(member) {
    const balance = await nearBalance(member);
    return balance === 0n ? "The insurer paid the gas, and the member account holds 0 NEAR." : "The insurer paid the gas.";
  }

  async function newMember(name, onStep) {
    // Two claims can start in the same millisecond on the host.
    const stamp = `${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
    const memberId = `${name.toLowerCase()}-${stamp}.${rootId}`;
    // No NEAR: a small account needs none for storage (NEP-448), and the insurer relays each claim and pays the gas.
    await root.createSubAccount({ accountOrPrefix: memberId, publicKey: keyPair.getPublicKey(), nearToTransfer: 0n });
    const member = accountWith(memberId, keyPair);
    await waitForAccount(member);
    onStep("account", `New member account ${memberId}.`);
    return { memberId, member };
  }

  // Calls onStep for each finished step. Returns what the state file keeps. Throws if any check fails.
  async function runClaim(name, onStep, upload = null) {
    const { memberId, member } = await newMember(name, onStep);

    const claim = await requestClaim(name, memberId, upload);
    const result = { days_met: claim.days_met, pattern_matches_owner: claim.pattern_matches_owner };
    onStep(
      "wearable",
      `${upload ? "This demo's key" : "The wearable service"} applied the rule in code and signed the result. Decision: ${decide(result)}.`,
    );

    const { hash, failure } = await relayCall(root, member, pool, "claim_wearable", {
      week: CLAIM_WEEK.start,
      request_hash: claim.request_hash,
      days_met: claim.days_met,
      pattern_matches_owner: claim.pattern_matches_owner,
      wearable_signature: claim.wearable_signature,
    });
    if (failure) throw new Error(`claim failed: ${failure}`);
    await waitForClaim(memberId);
    onStep("chain", `The contract checked the signature. ${await gasText(member)} ${EXPLORER}/${hash}`);

    return {
      account: memberId,
      tx: hash,
      recorded_on: new Date().toISOString().slice(0, 10),
      explanation: explainResult(result),
    };
  }

  const ai = apiKey ? createNearAi({ apiKey, model }) : null;
  let attested = null;

  // The insurer checks the attestation off-chain, then registers each signer that the pool does not have yet.
  async function attestedSigners() {
    if (attested && Date.now() - attested.at < ATTESTATION_MS) return attested.signers;
    const signers = await ai.attest();
    for (const signer of signers) {
      if (!(await view(pool, "is_registered_signer", { signer }))) await mustCall(root, pool, "register_signer", { signer });
    }
    attested = { signers, at: Date.now() };
    return signers;
  }

  // A lab claim for the visitor's report. The report and its values stay in memory for this call only.
  // Returns the result and the proof, and the signed answer for the member to keep.
  async function runLab(image, onStep, today = new Date().toISOString().slice(0, 10)) {
    if (!ai) throw new Error("No NEAR AI key");
    const year = Number(today.slice(0, 4));
    const [signers, { memberId, member }] = await Promise.all([attestedSigners(), newMember("lab", onStep)]);
    onStep("attestation", `The NEAR AI attestation passed: ${signers.length === 1 ? "1 model signer" : `${signers.length} model signers`}, registered on the pool.`);

    const read = await readLabReport({ ai, signers, model, image, today });
    onStep("model", "The model in the TEE read the HbA1c values, and the NEAR AI signature on its answer is good.");
    onStep("rule", `Code applied the lab rule to the values. Decision: ${decideLab(read.result)}.`);

    const args = await labClaimArgs({ contract: pool, member: memberId, year, read, signMessage: claims.signMessage });
    const { hash, failure } = await relayCall(root, member, pool, "claim_lab", args);
    if (failure) throw new Error(`lab claim failed: ${failure}`);
    await waitForClaim(memberId, `lab-${year}`);
    onStep("chain", `The contract checked both signatures. ${await gasText(member)} ${EXPLORER}/${hash}`);

    return {
      account: memberId,
      tx: hash,
      year,
      result: read.result,
      request_hash: read.requestHash,
      response_hash: read.responseHash,
      explanation: explainLab(read.result),
      answer: read.answer,
    };
  }

  const resolveHeld = (memberId, week, approve) => mustCall(root, pool, "resolve_held", { member: memberId, week, approve });

  return { runClaim, runLab, resolveHeld };
}
