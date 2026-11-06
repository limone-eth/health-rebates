// Spike: can a member with 0 NEAR send a claim through a relayer (NEP-366), on a zero-balance account (NEP-448)?
// Run from chain/: node ../spike/relay/relay-check.mjs. Prints no key.
import { accountWith, actions, KeyPair, teraToGas, loadDevAccount, waitForAccount } from "../../chain/near.mjs";
import { readFileSync } from "node:fs";

const { pool } = JSON.parse(readFileSync(new URL("../../web/state.json", import.meta.url), "utf8"));
const { accountId: rootId, nearKey } = loadDevAccount();
const keyPair = KeyPair.fromString(nearKey);
const root = accountWith(rootId, keyPair);

const memberId = `relay-${Date.now().toString(36)}.${rootId}`;
await root.createSubAccount({ accountOrPrefix: memberId, publicKey: keyPair.getPublicKey(), nearToTransfer: 0n });
const member = accountWith(memberId, keyPair);
const before = await waitForAccount(member);
console.log("member", memberId, "balance before", before.balance?.total ?? before.amount ?? JSON.stringify(before));

const { signedDelegate } = await member.createSignedMetaTransaction({
  receiverId: pool,
  actions: [actions.functionCall("claim_wearable", { week: "2026-10-26", request_hash: "0".repeat(64), days_met: 6, pattern_matches_owner: true, wearable_signature: "0x" + "11".repeat(65) }, teraToGas(50), 0n)],
});
const outcome = await root.signAndSendTransaction({ receiverId: memberId, actions: [actions.signedDelegate(signedDelegate)], throwOnFailure: false });
const failure = outcome.receipts_outcome?.find((r) => r.outcome.status?.Failure)?.outcome.status.Failure;
console.log("tx", outcome.transaction.hash, "signer", outcome.transaction.signer_id);
console.log("failure (expected: bad signature)", JSON.stringify(failure)?.slice(0, 200));
const after = await member.getState();
console.log("balance after", after.balance?.total ?? after.amount ?? JSON.stringify(after));
