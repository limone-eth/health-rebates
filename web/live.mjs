// A real claim: new member account, wearable request, attestation, TEE completion, signature, on-chain claim.
// Loaded only when keys exist, so the read-only app needs no npm install.
import { createHash } from "node:crypto";
import { accountWith, call, hasDevAccount, KeyPair, loadDevAccount, mustCall, NEAR, privateKeyToAccount, sleep, waitForAccount } from "../chain/near.mjs";
import { EXPLORER, view } from "../chain/view.mjs";
import { buildExplanationRequest, decide, parseResult } from "../tee/claim.mjs";
import { createNearAi } from "../tee/near-ai.mjs";
import { CLAIM_WEEK, MEMBERS } from "../wearable/data.mjs";
import { createWearableServer } from "../wearable/server.mjs";

// 0.07 NEAR. A claim with 50 Tgas needs about 0.051 NEAR up front, and the account also pays for its storage.
const MEMBER_DEPOSIT = (NEAR * 7n) / 100n;
const WEARABLE_API_KEY = "demo-key";
const CLAIM_READ_ATTEMPTS = 15;
const CLAIM_READ_DELAY_MS = 1000;
const idOf = Object.fromEntries(Object.entries(MEMBERS).map(([id, member]) => [member.name, id]));
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export async function createLive({ pool, model }) {
  const apiKey = process.env.NEARAI_CLOUD_API_KEY;
  if (!apiKey) throw new Error("NEARAI_CLOUD_API_KEY is not set");
  if (!hasDevAccount()) throw new Error("chain/.env.testnet does not exist");

  const { accountId: rootId, nearKey, wearableKey } = loadDevAccount();
  const keyPair = KeyPair.fromString(nearKey);
  const root = accountWith(rootId, keyPair);
  const config = await view(pool, "get_config");
  if (config.insurer !== rootId) throw new Error("The dev account is not the insurer of this pool");
  if (config.model !== model) throw new Error("This pool publishes another model");

  const wearableSigner = privateKeyToAccount(wearableKey);
  const nearAi = createNearAi({ apiKey, model });

  // The wearable service runs here for the demo, and it keeps the only copy of its key in this process.
  const wearable = createWearableServer({
    apiKey: WEARABLE_API_KEY,
    claims: { model, contract: pool, signMessage: (message) => wearableSigner.signMessage({ message }) },
  });
  await new Promise((resolve) => wearable.listen(0, "127.0.0.1", resolve));
  wearable.unref();
  const wearableBase = `http://127.0.0.1:${wearable.address().port}`;

  async function requestClaim(name, nearAccount) {
    const res = await fetch(`${wearableBase}/mock/claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Open-Wearables-API-Key": WEARABLE_API_KEY },
      body: JSON.stringify({ user_id: idOf[name], near_account: nearAccount, week: CLAIM_WEEK.start }),
    });
    if (!res.ok) throw new Error(`wearable service: HTTP ${res.status}`);
    return res.json();
  }

  // Views read final state, which comes some seconds after the transaction. Without this wait, the screens show "No claim".
  async function waitForClaim(memberId) {
    for (let attempt = 0; attempt < CLAIM_READ_ATTEMPTS; attempt++) {
      if (await view(pool, "get_claim", { member: memberId, week: CLAIM_WEEK.start })) return;
      await sleep(CLAIM_READ_DELAY_MS);
    }
    throw new Error("The claim transaction passed, but its record is not readable yet");
  }

  // Calls onStep for each finished step. Returns what the state file keeps. Throws if any check fails.
  async function runClaim(name, onStep) {
    const stamp = Date.now().toString(36);
    const memberId = `${name.toLowerCase()}-${stamp}.${rootId}`;

    // The attestation passes first, or this throws before member data goes to the model.
    const signers = await nearAi.attest();
    onStep("attestation", `Intel signature passed on each quote. ${signers.length} model signers.`);

    await root.createSubAccount({ accountOrPrefix: memberId, publicKey: keyPair.getPublicKey(), nearToTransfer: MEMBER_DEPOSIT });
    const member = accountWith(memberId, keyPair);
    await waitForAccount(member);
    onStep("account", `New member account ${memberId}.`);

    const claim = await requestClaim(name, memberId);
    onStep("wearable", "The wearable service built the request and signed its hash.");

    const completion = await nearAi.complete(claim.request_body);
    if (sha256(completion.requestBody) !== claim.request_hash) throw new Error("Sent bytes do not match the signed hash");
    const signature = await nearAi.verifySignature(completion, signers);
    const result = parseResult(completion.content);
    onStep("tee", `The TEE model answered, and a signer from the attestation signed the answer. Decision: ${decide(result)}.`);

    const explanation = await nearAi.complete(
      buildExplanationRequest(model, JSON.parse(JSON.parse(claim.request_body).messages[1].content).claim_week, result),
    );
    onStep("explanation", "The explanation is ready. It stays off-chain.");

    if (!(await view(pool, "is_registered_signer", { signer: signature.signing_address }))) {
      await mustCall(root, pool, "register_signer", { signer: signature.signing_address });
      onStep("signer", "The insurer registered the attested signer.");
    }

    const { hash, failure } = await call(member, pool, "claim", {
      week: CLAIM_WEEK.start,
      request_hash: claim.request_hash,
      response_body: completion.responseBody.toString("utf8"),
      ai_signature: signature.signature,
      wearable_signature: claim.wearable_signature,
    });
    if (failure) throw new Error(`claim failed: ${failure}`);
    await waitForClaim(memberId);
    onStep("chain",`The contract checked both signatures. ${EXPLORER}/${hash}`);

    return {
      account: memberId,
      tx: hash,
      signer: signature.signing_address,
      recorded_on: new Date().toISOString().slice(0, 10),
      explanation: explanation.content,
    };
  }

  const resolveHeld = (memberId, week, approve) => mustCall(root, pool, "resolve_held", { member: memberId, week, approve });

  return { runClaim, resolveHeld };
}
