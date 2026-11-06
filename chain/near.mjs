// Dev account and transactions on NEAR testnet. Free testnet tokens only. Nothing here prints a key.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { actions, Account, JsonRpcProvider, KeyPair, KeyPairSigner, teraToGas } from "near-api-js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { RPC } from "./view.mjs";

// web/live.mjs has no node_modules of its own, so it takes these from here.
export { KeyPair, privateKeyToAccount };

export const HELPER = "https://helper.testnet.near.org/account";
export const KEY_FILE = new URL("./.env.testnet", import.meta.url);
export const NEAR = 10n ** 24n;
export const provider = new JsonRpcProvider({ url: RPC });
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks the testnet helper for a new account. The helper funds it with free tokens.
export async function createHelperAccount(accountId, keyPair) {
  const res = await fetch(HELPER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: keyPair.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`helper: HTTP ${res.status}`);
}

// The host has no key file, so it gets the same three values as environment variables.
function devAccountFromEnv() {
  const { DEV_ACCOUNT_ID: accountId, DEV_NEAR_KEY: nearKey, DEV_WEARABLE_KEY: wearableKey } = process.env;
  return accountId && nearKey && wearableKey ? { accountId, nearKey, wearableKey } : null;
}
export const hasDevAccount = () => existsSync(KEY_FILE) || devAccountFromEnv() !== null;
export const loadDevAccount = () => (existsSync(KEY_FILE) ? JSON.parse(readFileSync(KEY_FILE, "utf8")) : devAccountFromEnv());

export async function createDevAccount() {
  const keyPair = KeyPair.fromRandom("ed25519");
  const accountId = `rebates-demo-${Date.now().toString(36)}.testnet`;
  await createHelperAccount(accountId, keyPair);
  const saved = { accountId, nearKey: keyPair.toString(), wearableKey: generatePrivateKey() };
  writeFileSync(KEY_FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
  return saved;
}

export const accountWith = (id, keyPair) => new Account(id, provider, new KeyPairSigner(keyPair));

// A new account can take some seconds to appear on the RPC.
export async function waitForAccount(account) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await account.getState();
    } catch (error) {
      if (attempt === 9) throw error;
      await sleep(2000);
    }
  }
}

// Returns the transaction hash and the failure text, if any. A failed call does not throw.
export async function call(account, contractId, method, args, deposit = 0n, tgas = 50) {
  const outcome = await account.signAndSendTransaction({
    receiverId: contractId,
    actions: [actions.functionCall(method, args, teraToGas(tgas), deposit)],
    throwOnFailure: false,
  });
  const failure =
    outcome.status?.Failure ?? outcome.receipts_outcome?.find((r) => r.outcome.status?.Failure)?.outcome.status.Failure;
  return { hash: outcome.transaction.hash, failure: failure ? JSON.stringify(failure) : null };
}

export async function mustCall(account, contractId, method, args, deposit = 0n, tgas = 50) {
  const result = await call(account, contractId, method, args, deposit, tgas);
  if (result.failure) throw new Error(`${method} failed: ${result.failure}`);
  return result;
}
