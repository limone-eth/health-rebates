// Runs the rebate pool on NEAR testnet with real wearable and lab claims, paid in tUSD. Free testnet tokens and synthetic data only.
// The wearable service decides each wearable claim in plain code and signs the result. No model call decides a wearable claim.
// For a lab claim, the attested NEAR AI model reads the HbA1c values of a synthetic report, and plain code applies the lab rule.
//
// The first run creates a dev account and saves its key in chain/.env.testnet, which git ignores.
// Each run deploys a new tUSD token, a new pool and new member accounts, because a member can claim a week one time.
// This script does not print a key. It signs for the wearable service: a real service would hold that key itself.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { actions, KeyPair, teraToGas } from "near-api-js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { accountWith, call, createDevAccount, hasDevAccount, loadDevAccount, mustCall, NEAR, sleep, waitForAccount } from "./near.mjs";
import { EXPLORER, view } from "./view.mjs";
import { CLAIM_WEEK } from "../wearable/data.mjs";
import { RULE } from "../wearable/rule.mjs";
import { decide, explainResult } from "../tee/claim.mjs";
import { labClaimArgs, labResultText, readLabReport } from "../tee/lab.mjs";
import { LAB_SAMPLES } from "../tee/lab-samples.mjs";
import { createNearAi } from "../tee/near-ai.mjs";
import { EXPECTED, loadMembers } from "../tee/members.mjs";
import { signRows } from "../wearable/server.mjs";

const WASM = new URL("../contract/target/near/rebate_pool.wasm", import.meta.url);
const TOKEN_WASM = new URL("../token/target/near/test_usd.wasm", import.meta.url);
const MODEL = process.env.NEARAI_MODEL || "Qwen/Qwen3.8-27B";
const WEEK = CLAIM_WEEK.start;
const OTHER_WEEK = "2026-11-09";
const TUSD = 1_000_000n; // 6 decimals, like USDC
const REBATE = 10n * TUSD;
const SUPPLY = 1_000_000n * TUSD;
const POOL_FUNDS = 1_000n * TUSD;
const TOKEN_STORAGE = NEAR / 800n; // 0.00125 NEAR, the NEP-145 registration
const RULE_TEXT = `${RULE.minSteps}+ steps with ${RULE.minRaisedHeartRateMinutes}+ raised heart rate minutes, and ${RULE.minSleepMinutes}+ sleep minutes, on ${RULE.minDays} of ${RULE.days} days`;

// The synthetic reports have fixed dates, so the lab claims use the date that the samples were written for.
const LAB_TODAY = "2026-11-06";
const LAB_YEAR = 2026;
if (!process.env.NEARAI_CLOUD_API_KEY) throw new Error("Set NEARAI_CLOUD_API_KEY in .env: the lab claims use the NEAR AI model");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

if (!hasDevAccount()) {
  const { accountId } = await createDevAccount();
  console.log(`Created dev account ${accountId}. Its key is in chain/.env.testnet.`);
}
const { accountId: rootId, nearKey, wearableKey } = loadDevAccount();
const keyPair = KeyPair.fromString(nearKey);
const accountFor = (id) => accountWith(id, keyPair);
const root = accountFor(rootId);
const wearable = privateKeyToAccount(wearableKey);

await waitForAccount(root);
console.log(`Dev account ${rootId}: ${Number((await root.getBalance()) / (NEAR / 1000n)) / 1000} NEAR`);

// 1. Deploy a new tUSD token, a new pool and new members.
const stamp = Date.now().toString(36);
const poolId = `pool-${stamp}.${rootId}`;
const tokenId = `tusd-${stamp}.${rootId}`;
const memberIds = Object.fromEntries(["A", "B", "C"].map((name) => [name, `${name.toLowerCase()}-${stamp}.${rootId}`]));

await root.createSubAccount({ accountOrPrefix: tokenId, publicKey: keyPair.getPublicKey(), nearToTransfer: NEAR * 2n });
await root.createSubAccount({ accountOrPrefix: poolId, publicKey: keyPair.getPublicKey(), nearToTransfer: (NEAR * 5n) / 2n });
for (const id of Object.values(memberIds)) {
  await root.createSubAccount({ accountOrPrefix: id, publicKey: keyPair.getPublicKey(), nearToTransfer: (NEAR * 3n) / 10n });
}
const pool = accountFor(poolId);
const token = accountFor(tokenId);
await token.signAndSendTransaction({
  receiverId: tokenId,
  actions: [
    actions.deployContract(readFileSync(TOKEN_WASM)),
    actions.functionCall("new", { owner: rootId, total_supply: SUPPLY.toString() }, teraToGas(50), 0n),
  ],
});
const tusdOf = async (accountId) => BigInt(await view(tokenId, "ft_balance_of", { account_id: accountId }));
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
        token: tokenId,
      },
      teraToGas(50),
      0n,
    ),
  ],
});
// The pool must be registered with the token before it can receive tUSD.
await mustCall(root, tokenId, "storage_deposit", { account_id: poolId, registration_only: true }, TOKEN_STORAGE);
await mustCall(root, tokenId, "ft_transfer_call", { receiver_id: poolId, amount: POOL_FUNDS.toString(), msg: "" }, 1n, 100);
await sleep(3000); // Views read final state.
check("the pool holds the tUSD it was sent", BigInt(await view(poolId, "get_balance")) === POOL_FUNDS);
console.log(`Token ${tokenId} and pool ${poolId} are deployed. The pool holds ${POOL_FUNDS / TUSD} tUSD.`);

// 2. Rejections, with signatures from local test keys. No member data goes anywhere.
const resultSign = (signer, memberId, days, pattern, hash = fakeHashFor("result")) =>
  signer.signMessage({ message: `rebate-result:${poolId}:${memberId}:${OTHER_WEEK}:${hash}:${days}:${pattern}` });
const fakeHashFor = (text) => sha256(`synthetic ${text}`);
const testAi = privateKeyToAccount(generatePrivateKey());
const otherKey = privateKeyToAccount(generatePrivateKey());
await mustCall(root, poolId, "register_signer", { signer: testAi.address });

async function expectRejected(name, account, args, expected, method) {
  const { failure, hash } = await call(account, poolId, method, args);
  check(`testnet rejects: ${name}`, Boolean(failure?.includes(expected)), failure ? `tx ${hash}` : "the call passed");
}

// A lab claim by B with fake hashes. The test AI key stands in for a registered NEAR AI signer.
const labRequest = fakeHashFor("lab request");
const labAnswer = fakeHashFor("lab answer");
const labArgs = async ({ requestHash = labRequest, responseHash = labAnswer, testFound = true, ruleMet = true, ai = testAi, aiModel = MODEL, aiAnswer = responseHash, by = wearable, forId = members.B.accountId, signedRuleMet = ruleMet } = {}) => ({
  year: LAB_YEAR,
  request_hash: requestHash,
  response_hash: responseHash,
  test_found: testFound,
  rule_met: ruleMet,
  ai_signature: await ai.signMessage({ message: `${aiModel}:${requestHash}:${aiAnswer}` }),
  service_signature: await by.signMessage({
    message: labResultText({ contract: poolId, member: forId, year: LAB_YEAR, requestHash, responseHash, testFound, ruleMet: signedRuleMet }),
  }),
});

const resultArgs = async ({ days = 6, signedDays = days, by = wearable, forId = members.B.accountId, signature } = {}) => ({
  week: OTHER_WEEK,
  request_hash: fakeHashFor("result"),
  days_met: days,
  pattern_matches_owner: true,
  wearable_signature: signature ?? (await resultSign(by, forId, signedDays, true)),
});
await expectRejected("a result signed by another key", members.B, await resultArgs({ by: otherKey }), "did not sign this result", "claim_wearable");
await expectRejected("a result signed for another member", members.B, await resultArgs({ forId: members.A.accountId }), "did not sign this result", "claim_wearable");
await expectRejected("a changed result", members.B, await resultArgs({ days: 7, signedDays: 3 }), "did not sign this result", "claim_wearable");
await expectRejected(
  "a lab result signature in place of a wearable result signature",
  members.B,
  await resultArgs({ signature: (await labArgs({ requestHash: fakeHashFor("result") })).service_signature }),
  "did not sign this result",
  "claim_wearable",
);

await expectRejected("a lab result signed by another key", members.B, await labArgs({ by: otherKey }), "did not sign this lab result", "claim_lab");
await expectRejected("a lab result signed for another member", members.B, await labArgs({ forId: members.A.accountId }), "did not sign this lab result", "claim_lab");
await expectRejected("a lab result changed to paid", members.B, await labArgs({ signedRuleMet: false }), "did not sign this lab result", "claim_lab");
await expectRejected("a NEAR AI signer that is not registered", members.B, await labArgs({ ai: otherKey }), "signer is not registered", "claim_lab");
await expectRejected("a NEAR AI signature for another answer", members.B, await labArgs({ aiAnswer: fakeHashFor("other answer") }), "signer is not registered", "claim_lab");
await expectRejected("a signature for a model that is not published", members.B, await labArgs({ aiModel: "other/model" }), "signer is not registered", "claim_lab");
await expectRejected("a response hash that is not 64 hex characters", members.B, await labArgs({ responseHash: "HbA1c 5.4%" }), "64 lowercase hex", "claim_lab");
await expectRejected("rule_met with no test found", members.B, await labArgs({ testFound: false }), "rule_met needs test_found", "claim_lab");
await mustCall(root, poolId, "remove_signer", { signer: testAi.address });
await expectRejected("a signer that the insurer removed", members.B, await labArgs(), "signer is not registered", "claim_lab");

// 3. Real claims. The wearable service decides each one in code and signs the result. No model sees the rows.
const memberData = await loadMembers();
const claims = { contract: poolId, signMessage: (message) => wearable.signMessage({ message }) };
const OUTCOME = { paid: "Paid", "not paid": "NotPaid", "held for review": "Held" };
const links = {};
const webMembers = {};
let firstClaim;

for (const { name, baselineRows, claimRows } of memberData) {
  const expected = EXPECTED[name];
  const member = members[name];
  const started = Date.now();
  const signed = await signRows(claims, baselineRows, claimRows, member.accountId, WEEK);
  const result = { days_met: signed.days_met, pattern_matches_owner: signed.pattern_matches_owner };
  const args = { week: WEEK, ...signed };
  firstClaim ??= { member, args };

  const { hash, failure } = await call(member, poolId, "claim_wearable", args);
  links[name] = `${EXPLORER}/${hash}`;
  webMembers[name] = {
    account: member.accountId,
    tx: hash,
    recorded_on: new Date().toISOString().slice(0, 10),
    explanation: explainResult(result),
  };
  check(`${name}: the claim transaction succeeds`, !failure, failure ?? `tx ${hash}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  // The payout runs in later receipts. Views read final state.
  await sleep(5000);

  const record = await view(poolId, "get_claim", { member: member.accountId, week: WEEK });
  const received = await tusdOf(member.accountId);
  check(`${name}: days_met on-chain`, record?.days_met === expected.days_met, `${record?.days_met}`);
  check(`${name}: pattern on-chain`, record?.pattern_matches_owner === expected.pattern_matches_owner, `${record?.pattern_matches_owner}`);
  check(`${name}: outcome on-chain is ${OUTCOME[expected.decision]}`, record?.outcome === OUTCOME[expected.decision] && decide(result) === expected.decision, record?.outcome);
  check(`${name}: ${expected.decision === "paid" ? "received 10 tUSD" : "received no tUSD"}`, received === (expected.decision === "paid" ? REBATE : 0n), `${received}`);
}

// 4. Real lab claims. The attested model reads a synthetic report. Code applies the rule. Only hashes and the result go on-chain.
const ai = createNearAi({ apiKey: process.env.NEARAI_CLOUD_API_KEY, model: MODEL });
const signers = await ai.attest();
check("the NEAR AI attestation passes", signers.length > 0, `${signers.length} model signers`);
for (const signer of signers) await mustCall(root, poolId, "register_signer", { signer });

const LAB_CLAIMS = [
  ["A", "pass-percent-better"],
  ["B", "fail-mmol"],
];
let firstLab;
for (const [name, sampleId] of LAB_CLAIMS) {
  const sample = LAB_SAMPLES.find(({ id }) => id === sampleId);
  const member = members[name];
  const started = Date.now();
  const image = { type: "image/png", bytes: readFileSync(new URL(`../web/public/lab-samples/${sampleId}.png`, import.meta.url)) };
  const read = await readLabReport({ ai, signers, model: MODEL, image, today: LAB_TODAY });
  const args = await labClaimArgs({ contract: poolId, member: member.accountId, year: LAB_YEAR, read, signMessage: claims.signMessage });
  firstLab ??= { member, args };
  const before = await tusdOf(member.accountId);
  const { hash, failure } = await call(member, poolId, "claim_lab", args);
  links[`${name} lab`] = `${EXPLORER}/${hash}`;
  check(`${name}: the lab claim for ${sampleId} succeeds`, !failure, failure ?? `tx ${hash}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await sleep(5000);

  const record = await view(poolId, "get_claim", { member: member.accountId, week: `lab-${LAB_YEAR}` });
  const paid = sample.expected.rule_met;
  check(`${name}: the lab result on-chain matches the sample`, record?.test_found === sample.expected.test_found && record?.rule_met === paid, JSON.stringify(read.result));
  // The record has these fields only: hashes and booleans, and no HbA1c value or date.
  const fields = Object.entries(record ?? {}).filter(([, value]) => value !== null).map(([key]) => key).sort().join();
  check(
    `${name}: the lab record holds the hashes and the result only`,
    fields === "outcome,request_hash,response_hash,rule_met,test_found" && record.request_hash === read.requestHash && record.response_hash === read.responseHash,
    fields,
  );
  check(`${name}: ${paid ? "received 10 tUSD for the lab claim" : "received no tUSD for the lab claim"}`, (await tusdOf(member.accountId)) - before === (paid ? REBATE : 0n));
}

// 5. Rejections that need a recorded claim.
await expectRejected("a second lab claim for the same year", firstLab.member, firstLab.args, "already claimed", "claim_lab");
await expectRejected("a second claim for the same week", firstClaim.member, firstClaim.args, "already claimed", "claim_wearable");
await expectRejected("a held claim resolved by a member", members.C, { member: members.C.accountId, week: WEEK, approve: true }, "Only the insurer", "resolve_held");

const totals = await view(poolId, "get_totals");
check("totals on-chain", totals.paid === 2 && totals.not_paid === 2 && totals.held === 1, JSON.stringify(totals));
const spent = 2n * REBATE;
check("the pool paid two rebates", BigInt(await view(poolId, "get_balance")) === POOL_FUNDS - spent && (await tusdOf(poolId)) === POOL_FUNDS - spent);

// The web app reads this pool and these members.
if (!failures) {
  const stateFile = new URL("../web/state.json", import.meta.url);
  writeFileSync(stateFile, `${JSON.stringify({ pool: poolId, week: WEEK, members: webMembers }, null, 2)}\n`);
}

console.log(`\nToken: ${tokenId}\nPool: ${poolId}`);
for (const [name, link] of Object.entries(links)) console.log(`${name}: ${link}`);
console.log(failures ? `\nRESULT: FAILED (${failures} failures)` : "\nRESULT: testnet payouts match A, B and C, and the lab claims");
process.exit(failures ? 1 : 0);
