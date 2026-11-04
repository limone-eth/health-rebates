// Moves free testnet tokens to the dev account: it asks the helper for a new account, then deletes that account.
// Deleting an account sends its balance to the beneficiary. The new key stays in memory and is never saved.
import { KeyPair } from "near-api-js";
import { accountWith, createHelperAccount, loadDevAccount, NEAR, sleep, waitForAccount } from "./near.mjs";

const { accountId: rootId, nearKey } = loadDevAccount();
const root = accountWith(rootId, KeyPair.fromString(nearKey));
const nearText = (yocto) => `${Number(yocto / (NEAR / 1000n)) / 1000} NEAR`;

console.log(`Dev account before: ${nearText(await root.getBalance())}`);
const keyPair = KeyPair.fromRandom("ed25519");
const tempId = `rebates-topup-${Date.now().toString(36)}.testnet`;
await createHelperAccount(tempId, keyPair);
const temp = accountWith(tempId, keyPair);
await waitForAccount(temp);
await temp.deleteAccount(rootId);
await sleep(3000);
console.log(`Dev account after: ${nearText(await root.getBalance())}`);
