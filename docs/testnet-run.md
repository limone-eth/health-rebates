# Testnet run

**Result: real TEE claims on NEAR testnet gave the expected payouts on 3 Nov. All 26 checks passed on the current contract, in one run. An earlier contract version also passed in one run.**

Pool: `pool-mw1317o0.rebates-demo-mw12j3o6.testnet`

| Member | `days_met` | `pattern_matches_owner` | Outcome | Rebate | Transaction |
|---|---|---|---|---|---|
| A | 6 | true | Paid | received | [BxeMwoYV…](https://testnet.nearblocks.io/txns/BxeMwoYVVGmZUnLci6Svwu5nQUvriX5AJ3QNYRnrjz15) |
| B | 3 | true | NotPaid | none | [9CMnwFK7…](https://testnet.nearblocks.io/txns/9CMnwFK7hqzba6BpTWyKwSys6YQdEtXSo4Hy8yMNacAu) |
| C | 6 | false | Held | none | [31Z5ujU6…](https://testnet.nearblocks.io/txns/31Z5ujU6tdzZtzTi4EdRBnQX2uNFx7CsULebWTncm1Zb) |

## Rejected on testnet

Each of these is a failed transaction with the expected error text:

- a wearable signature from another key
- a wearable signature for another member
- a NEAR AI signer that is not registered
- a signature for a model that is not published
- a response body from another model
- a request hash that is not 64 hex characters
- a body with reasoning text
- a signer that the insurer removed
- a second claim for the same week
- a held claim resolved by a member

The first 8 use signatures from local test keys, with a test signer that the insurer registers and then removes before the real claims. They do not show that NEAR AI Cloud would sign such content.

## Limits

- This script signs for the wearable service, and it signs the hash of the request that it built. A member could then send many requests and claim with the best one. The web app's live claims do not have this gap: the wearable service builds the request and signs only that request. In the demo, one server holds the member, insurer and wearable keys.
- The contract takes the last value of a duplicate JSON key. The TEE signs the body, so a member cannot add one.
- The insurer registers a signer after the off-chain attestation passes. The contract does not check the attestation, and it trusts a registered signer until the insurer removes it.
- The attestation does not prove that the software in the TEE is safe. See [the limits](spike-day-1.md#limits-of-the-software-check).
- These paths are tested in the mock runtime only: the insurer approves or rejects a held claim, and the pool has too few funds.
- If a transfer fails after a claim is recorded, the claim stays `Paid` and nothing pays again. The member is the caller, so the account exists, but no test covers this.
- The transaction arguments are public. So each member's `days_met`, pattern result, model response and `request_hash` are public, under a pseudonymous account.
- All accounts in one run use one key, because this is a demo.

## Run it

Needs Rust, Node 20.6 or newer and an API key in `.env`. The first run creates a dev account from the testnet helper, and saves its key in `chain/.env.testnet`, which git ignores. Each run deploys a new pool and new members, which uses about 4.5 free testnet NEAR. The dev account now has less than one more run needs, so a further run needs more free tokens. `node chain/top-up.mjs` moves free tokens to the dev account, and it saves no new key.

```sh
(cd contract && npx cargo-near@0.22.0 near build non-reproducible-wasm)
(cd tee && npm install)
cd chain && npm install && npm run run-testnet
```
