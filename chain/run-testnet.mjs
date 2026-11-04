// Runs the rebate pool on NEAR testnet with real TEE claims. Free testnet tokens and synthetic data only.
//
// The first run creates a dev account and saves its key in chain/.env.testnet, which git ignores.
// Each run deploys a new pool and new member accounts, because a member can claim a week one time.
// This script does not print a key. It signs for the wearable service: a real service would hold that key itself.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { actions, Account, JsonRpcProvider, KeyPair, KeyPairSigner, teraToGas } from "near-api-js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CLAIM_WEEK } from "../wearable/data.mjs";
import { RULE } from "../wearable/rule.mjs";
import { buildClaimRequest, decide, parseResult } from "../tee/claim.mjs";
import { EXPECTED, loadMembers } from "../tee/members.mjs";
import { createNearAi } from "../tee/near-ai.mjs";

const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const HELPER = "https://helper.testnet.near.org/account";
const EXPLORER = "https://testnet.nearblocks.io/txns";
const KEY_FILE = new URL("./.env.testnet", import.meta.url);
const WASM = new URL("../contract/target/near/rebate_pool.wasm", import.meta.url);
const MODEL = process.env.NEARAI_MODEL || "Qwen/Qwen3.8-27B";
const WEEK = CLAIM_WEEK.start;
const OTHER_WEEK = "2026-11-09";
const NEAR = 10n ** 24n;
const REBATE = NEAR / 10n; // 0.1 NEAR
const RULE_TEXT = `${RULE.minSteps}+ steps with ${RULE.minRaisedHeartRateMinutes}+ raised heart rate minutes, and ${RULE.minSleepMinutes}+ sleep minutes, on ${RULE.minDays} of ${RULE.days} days`;

const provider = new JsonRpcProvider({ url: RPC });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function loadOrCreateDevAccount() {
  if (existsSync(KEY_FILE)) return JSON.parse(readFileSync(KEY_FILE, "utf8"));
  const keyPair = KeyPair.fromRandom("ed25519");
  const accountId = `rebates-demo-${Date.now().toString(36)}.testnet`;
  const res = await fetch(HELPER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: keyPair.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`helper: HTTP ${res.status}`);
  const saved = { accountId, nearKey: keyPair.toString(), wearableKey: generatePrivateKey() };
  writeFileSync(KEY_FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
  console.log(`Created dev account ${accountId}. Its key is in chain/.env.testnet.`);
  return saved;
}

const { accountId: rootId, nearKey, wearableKey } = await loadOrCreateDevAccount();
const keyPair = KeyPair.fromString(nearKey);
const accountFor = (id) => new Account(id, provider, new KeyPairSigner(keyPair));
const root = accountFor(rootId);
const wearable = privateKeyToAccount(wearableKey);

for (let attempt = 0; attempt < 10; attempt++) {
  try {
    await root.getState();
    break;
  } catch (error) {
    if (attempt === 9) throw error;
    await sleep(2000);
  }
}
console.log(`Dev account ${rootId}: ${Number((await root.getBalance()) / (NEAR / 1000n)) / 1000} NEAR`);

async function view(contractId, method, args = {}) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "view",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const { result, error } = await res.json();
  if (error || result?.error) throw new Error(`view ${method}: ${JSON.stringify(error ?? result.error)}`);
  return JSON.parse(Buffer.from(result.result).toString());
}

// Returns the transaction hash and the failure text, if any. A failed call does not throw.
async function call(account, contractId, method, args, deposit = 0n) {
  const outcome = await account.signAndSendTransaction({
    receiverId: contractId,
    actions: [actions.functionCall(method, args, teraToGas(50), deposit)],
    throwOnFailure: false,
  });
  const failure = outcome.status?.Failure ?? outcome.receipts_outcome?.find((r) => r.outcome.status?.Failure)?.outcome.status.Failure;
  return { hash: outcome.transaction.hash, failure: failure ? JSON.stringify(failure) : null };
}

const mustCall = async (...args) => {
  const result = await call(...args);
  if (result.failure) throw new Error(`${args[2]} failed: ${result.failure}`);
  return result;
};

// 1. Deploy a new pool and new members.
const stamp = Date.now().toString(36);
const poolId = `pool-${stamp}.${rootId}`;
const memberIds = Object.fromEntries(["A", "B", "C"].map((name) => [name, `${name.toLowerCase()}-${stamp}.${rootId}`]));

await root.createSubAccount({ accountOrPrefix: poolId, publicKey: keyPair.getPublicKey(), nearToTransfer: (NEAR * 5n) / 2n });
for (const id of Object.values(memberIds)) {
  await root.createSubAccount({ accountOrPrefix: id, publicKey: keyPair.getPublicKey(), nearToTransfer: (NEAR * 3n) / 10n });
}
const pool = accountFor(poolId);
const members = Object.fromEntries(Object.entries(memberIds).map(([name, id]) => [name, accountFor(id)]));

// One transaction, so nobody can act between the deploy and the setup.
await pool.signAndSendTransaction({
  receiverId: poolId,
  actions: [
    actions.deployContract(readFileSync(WASM)),
    actions.functionCall(
      "new",
      {
        insurer: rootId,
        wearable_signer: wearable.address,
        rule: RULE_TEXT,
        model: MODEL,
        min_days: RULE.minDays,
        total_days: RULE.days,
        rebate: REBATE.toString(),
      },
      teraToGas(50),
      0n,
    ),
  ],
});
await mustCall(root, poolId, "fund", {}, NEAR);
console.log(`Pool ${poolId} is deployed and funded.`);

// 2. Rejections, with signatures from local test keys. No member data goes anywhere.
const testAi = privateKeyToAccount(generatePrivateKey());
const otherKey = privateKeyToAccount(generatePrivateKey());
await mustCall(root, poolId, "register_signer", { signer: testAi.address });

const fakeHash = sha256("synthetic test request");
const responseBody = (message, model = MODEL) =>
  JSON.stringify({ model, choices: [{ message: { role: "assistant", ...message } }] });
const goodBody = responseBody({ content: JSON.stringify({ days_met: 7, pattern_matches_owner: true }) });
const wearableSign = (signer, memberId, week, hash) =>
  signer.signMessage({ message: `rebate-claim:${poolId}:${memberId}:${week}:${hash}` });
const aiSign = (signer, body, hash = fakeHash, model = MODEL) =>
  signer.signMessage({ message: `${model}:${hash}:${sha256(body)}` });

async function expectRejected(name, account, args, expected, method = "claim") {
  const { failure, hash } = await call(account, poolId, method, args);
  check(`testnet rejects: ${name}`, Boolean(failure?.includes(expected)), failure ? `tx ${hash}` : "the call passed");
}

const claimer = members.B;
const claimArgs = async ({ body = goodBody, hash = fakeHash, ai = testAi, aiModel = MODEL, wearableBy = wearable, wearableFor = claimer.accountId }) => ({
  week: OTHER_WEEK,
  request_hash: hash,
  response_body: body,
  ai_signature: await aiSign(ai, body, hash, aiModel),
  wearable_signature: await wearableSign(wearableBy, wearableFor, OTHER_WEEK, hash),
});

await expectRejected("a wearable signature from another key", claimer, await claimArgs({ wearableBy: otherKey }), "wearable service did not sign");
await expectRejected("a wearable signature for another member", claimer, await claimArgs({ wearableFor: members.A.accountId }), "wearable service did not sign");
await expectRejected("a NEAR AI signer that is not registered", claimer, await claimArgs({ ai: otherKey }), "signer is not registered");
await expectRejected("a signature for a model that is not published", claimer, await claimArgs({ aiModel: "other/model" }), "signer is not registered");
await expectRejected("a response body from another model", claimer, await claimArgs({ body: responseBody({ content: "{}" }, "other/model") }), "another model");
await expectRejected("a request hash that is not 64 hex characters", claimer, await claimArgs({ hash: "abc" }), "64 lowercase hex");
await expectRejected(
  "a body with reasoning text",
  claimer,
  await claimArgs({ body: responseBody({ content: JSON.parse(goodBody).choices[0].message.content, reasoning_content: "synthetic" }) }),
  "reasoning text",
);
await mustCall(root, poolId, "remove_signer", { signer: testAi.address });
await expectRejected("a signer that the insurer removed", claimer, await claimArgs({}), "signer is not registered");

// 3. Real claims. The attestation passes first, or this throws before member data goes to the model.
const memberData = await loadMembers();
const nearAi = createNearAi({ apiKey: process.env.NEARAI_CLOUD_API_KEY, model: MODEL });
const attested = await nearAi.attest();
console.log(`Attestation verified: ${attested.length} model signers.`);

const registered = new Set();
const OUTCOME = { paid: "Paid", "not paid": "NotPaid", "held for review": "Held" };
const links = {};
let firstClaim;

for (const { name, baselineRows, claimRows } of memberData) {
  const expected = EXPECTED[name];
  const member = members[name];
  const completion = await nearAi.complete(buildClaimRequest(MODEL, baselineRows, claimRows));
  const signature = await nearAi.verifySignature(completion, attested);
  const decision = decide(parseResult(completion.content));

  // The insurer registers a signer only after its attestation passes.
  if (!registered.has(signature.signing_address)) {
    await mustCall(root, poolId, "register_signer", { signer: signature.signing_address });
    registered.add(signature.signing_address);
  }

  const requestHash = sha256(completion.requestBody);
  const args = {
    week: WEEK,
    request_hash: requestHash,
    response_body: completion.responseBody.toString("utf8"),
    ai_signature: signature.signature,
    wearable_signature: await wearableSign(wearable, member.accountId, WEEK, requestHash),
  };
  firstClaim ??= { member, args };

  // Gas refunds arrive after a call returns. Wait, so that a refund does not count as a rebate.
  await sleep(5000);
  const before = await member.getBalance();
  const { hash, failure } = await call(member, poolId, "claim", args);
  links[name] = `${EXPLORER}/${hash}`;
  check(`${name}: the claim transaction succeeds`, !failure, failure ?? `tx ${hash}`);
  await sleep(5000);

  const record = await view(poolId, "get_claim", { member: member.accountId, week: WEEK });
  const received = (await member.getBalance()) - before;
  check(`${name}: days_met on-chain`, record?.days_met === expected.days_met, `${record?.days_met}`);
  check(`${name}: pattern on-chain`, record?.pattern_matches_owner === expected.pattern_matches_owner, `${record?.pattern_matches_owner}`);
  check(`${name}: outcome on-chain is ${OUTCOME[expected.decision]}`, record?.outcome === OUTCOME[expected.decision] && decision === expected.decision, record?.outcome);
  const paid = received > (REBATE * 9n) / 10n;
  check(`${name}: ${expected.decision === "paid" ? "received the rebate" : "received no rebate"}`, paid === (expected.decision === "paid"));
}

// 4. Rejections that need a recorded claim.
await expectRejected("a second claim for the same week", firstClaim.member, firstClaim.args, "already claimed");
await expectRejected("a held claim resolved by a member", members.C, { member: members.C.accountId, week: WEEK, approve: true }, "Only the insurer", "resolve_held");

const totals = await view(poolId, "get_totals");
check("totals on-chain", totals.paid === 1 && totals.not_paid === 1 && totals.held === 1, JSON.stringify(totals));

console.log(`\nPool: ${poolId}`);
for (const [name, link] of Object.entries(links)) console.log(`${name}: ${link}`);
console.log("\nNOTE: this does not check the event log, the compose hash, image provenance or GPU evidence.");
console.log(failures ? `\nRESULT: FAILED (${failures} failures)` : "\nRESULT: testnet payouts match A, B and C");
process.exit(failures ? 1 : 0);
