// A real wearable claim: new member account, a result that the wearable service decides and signs, on-chain claim.
// No model decides a wearable claim. The attested model is for lab reports.
// Loaded only when keys exist, so the read-only app needs no npm install.
import { randomBytes } from "node:crypto";
import { accountWith, call, hasDevAccount, KeyPair, loadDevAccount, mustCall, NEAR, privateKeyToAccount, sleep, waitForAccount } from "../chain/near.mjs";
import { EXPLORER, view } from "../chain/view.mjs";
import { decide, explainResult } from "../tee/claim.mjs";
import { CLAIM_WEEK, MEMBERS } from "../wearable/data.mjs";
import { buildClaim, signRows } from "../wearable/server.mjs";

// 0.07 NEAR. A claim with 50 Tgas needs about 0.051 NEAR up front, and the account also pays for its storage.
const MEMBER_DEPOSIT = (NEAR * 7n) / 100n;
const CLAIM_READ_ATTEMPTS = 15;
const CLAIM_READ_DELAY_MS = 1000;
const idOf = Object.fromEntries(Object.entries(MEMBERS).map(([id, member]) => [member.name, id]));

export async function createLive({ pool, model }) {
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
  async function waitForClaim(memberId) {
    for (let attempt = 0; attempt < CLAIM_READ_ATTEMPTS; attempt++) {
      if (await view(pool, "get_claim", { member: memberId, week: CLAIM_WEEK.start })) return;
      await sleep(CLAIM_READ_DELAY_MS);
    }
    throw new Error("The claim transaction passed, but its record is not readable yet");
  }

  // Calls onStep for each finished step. Returns what the state file keeps. Throws if any check fails.
  async function runClaim(name, onStep, upload = null) {
    // Two claims can start in the same millisecond on the host.
    const stamp = `${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
    const memberId = `${name.toLowerCase()}-${stamp}.${rootId}`;

    await root.createSubAccount({ accountOrPrefix: memberId, publicKey: keyPair.getPublicKey(), nearToTransfer: MEMBER_DEPOSIT });
    const member = accountWith(memberId, keyPair);
    await waitForAccount(member);
    onStep("account", `New member account ${memberId}.`);

    const claim = await requestClaim(name, memberId, upload);
    const result = { days_met: claim.days_met, pattern_matches_owner: claim.pattern_matches_owner };
    onStep(
      "wearable",
      `${upload ? "This demo's key" : "The wearable service"} applied the rule in code and signed the result. Decision: ${decide(result)}.`,
    );

    const { hash, failure } = await call(member, pool, "claim_wearable", {
      week: CLAIM_WEEK.start,
      request_hash: claim.request_hash,
      days_met: claim.days_met,
      pattern_matches_owner: claim.pattern_matches_owner,
      wearable_signature: claim.wearable_signature,
    });
    if (failure) throw new Error(`claim failed: ${failure}`);
    await waitForClaim(memberId);
    onStep("chain", `The contract checked the signature. ${EXPLORER}/${hash}`);

    return {
      account: memberId,
      tx: hash,
      recorded_on: new Date().toISOString().slice(0, 10),
      explanation: explainResult(result),
    };
  }

  const resolveHeld = (memberId, week, approve) => mustCall(root, pool, "resolve_held", { member: memberId, week, approve });

  return { runClaim, resolveHeld };
}
