# Testnet run

**Result: on 6 Nov, wearable claims on NEAR testnet gave the expected tUSD payouts. All checks passed in one run. Each claim took about 4 s.**

Pool: `pool-mw4vw9nx.rebates-demo-mw12j3o6.testnet`
Token: `tusd-mw4vw9nx.rebates-demo-mw12j3o6.testnet` (tUSD, a test token with no value, 6 decimals)

| Member | `days_met` | `pattern_matches_owner` | Outcome | Rebate | Transaction |
|---|---|---|---|---|---|
| A | 6 | true | Paid | 10 tUSD | [GDjdG7Mf…](https://testnet.nearblocks.io/txns/GDjdG7Mf4fC28MiHekJXE9BAQkfaVmwYcHig3DxTM5hY) |
| B | 3 | true | NotPaid | none | [7jPqgkFW…](https://testnet.nearblocks.io/txns/7jPqgkFWmf8wutDXVxFaJnSVn1vs9jc8JDM2sBzKudpJ) |
| C | 6 | false | Held | none | [58rWnxok…](https://testnet.nearblocks.io/txns/58rWnxokBK8aoHUszPgZ1Z4rkhPoMRat8vXsnZbR8YSi) |

## What the run does

1. It deploys the tUSD token and a new pool. The pool registers with the token, and the insurer sends the pool 1000 tUSD with `ft_transfer_call`.
2. It sends claims that the contract must reject.
3. For A, B and C, the wearable service applies the rule in plain code and signs the result. No model reads the week. Each member sends the signed result to `claim_wearable`.
4. For a paid claim, the contract registers the member with the token (`storage_deposit`), then sends 10 tUSD with `ft_transfer`. If the transfer fails, the callback puts the claim back to `Held` and returns the funds to the pool balance.
5. It reads the records, the totals and the tUSD balances from the chain.

An earlier version sent the week to a model on NEAR AI Cloud, and a claim took about 196 s. That version passed on 3 Nov on `pool-mw1317o0.rebates-demo-mw12j3o6.testnet`.

## Rejected on testnet

Each of these is a failed transaction with the expected error text.

Wearable claims (`claim_wearable`):

- a result signed by another key
- a result signed for another member
- a changed result
- a request signature in place of a result signature

Claims with a NEAR AI signature (`claim`, kept for lab reports):

- a wearable signature from another key
- a wearable signature for another member
- a NEAR AI signer that is not registered
- a signature for a model that is not published
- a response body from another model
- a request hash that is not 64 hex characters
- a body with reasoning text
- a signer that the insurer removed

Both:

- a second claim for the same week
- a held claim resolved by a member

These use signatures from local test keys. The NEAR AI checks use a test signer that the insurer registers and then removes before the real claims. They do not show that NEAR AI Cloud would sign such content.

## Limits

- In the demo, one server holds the member, insurer and wearable keys. The wearable service signs a result. The contract cannot check the rule, so it trusts that service.
- The insurer registers a NEAR AI signer after the off-chain attestation passes. The contract does not check the attestation, and it trusts a registered signer until the insurer removes it.
- These paths are tested in the mock runtime only: the insurer approves or rejects a held claim, the pool has too few tUSD, and a failed `ft_transfer`.
- The transaction arguments are public. So each member's `days_met`, pattern result and input hash are public, under a pseudonymous account.
- tUSD is a test token with no value. A real insurer pays in a stablecoin such as USDC.
- All accounts in one run use one key, because this is a demo.

## Run it

Needs Rust and Node 20.6 or newer. Wearable claims need no API key, but the script reads `.env`, so copy `.env.example` first. The first run creates a dev account from the testnet helper, and saves its key in `chain/.env.testnet`, which git ignores. Each run deploys a new token, a new pool and new members, which uses about 5.5 free testnet NEAR. `node chain/top-up.mjs` moves free tokens to the dev account, and it saves no new key.

```sh
(cd contract && npx cargo-near@0.22.0 near build non-reproducible-wasm)
(cd token && npx cargo-near@0.22.0 near build non-reproducible-wasm)
(cd tee && npm install)
cd chain && npm install && npm run run-testnet
```
