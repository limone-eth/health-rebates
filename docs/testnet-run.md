# Testnet run

**Result: on 6 Nov, wearable claims and lab claims on NEAR testnet gave the expected tUSD payouts. All checks passed in one run. A wearable claim took about 4 s.**

Pool: `pool-mw4x0ixq.rebates-demo-mw12j3o6.testnet`
Token: `tusd-mw4x0ixq.rebates-demo-mw12j3o6.testnet` (tUSD, a test token with no value, 6 decimals)

Wearable claims:

| Member | `days_met` | `pattern_matches_owner` | Outcome | Rebate | Transaction |
|---|---|---|---|---|---|
| A | 6 | true | Paid | 10 tUSD | [HWV73yj5…](https://testnet.nearblocks.io/txns/HWV73yj5qQP3HEoejxctWN8j93mmQYJB6jsJKqjM9P36) |
| B | 3 | true | NotPaid | none | [Gbaoqt85…](https://testnet.nearblocks.io/txns/Gbaoqt858MSZv2Yz1nrF8ztnehxyiQw1SqLqVi2U7pbW) |
| C | 6 | false | Held | none | [3MyPsGci…](https://testnet.nearblocks.io/txns/3MyPsGciCeR8vtzBqkomWTT3Va7wnaGQqLgtU6qNFeBq) |

Lab claims, with synthetic sample reports read by the attested model on NEAR AI Cloud:

| Sample report | `test_found` | `rule_met` | Outcome | Rebate | Transaction |
|---|---|---|---|---|---|
| 0.4 points better, in % | true | true | Paid | 10 tUSD | [28F2d9QY…](https://testnet.nearblocks.io/txns/28F2d9QYveqsnWECvMFYgLmgMZmvPdGL5Hh14nyouzB5) |
| Over 5.7%, in mmol/mol | true | false | NotPaid | none | [8xANSbbM…](https://testnet.nearblocks.io/txns/8xANSbbMHCwL6Pu8tUPniPRQYp5iF82km9PyYiHNTNGw) |

## What the run does

1. It deploys the tUSD token and a new pool. The pool registers with the token, and the insurer sends the pool 1000 tUSD with `ft_transfer_call`.
2. It sends claims that the contract must reject.
3. For A, B and C, the wearable service applies the rule in plain code and signs the result. No model reads the week. Each member sends the signed result to `claim_wearable`.
4. For a paid claim, the contract registers the member with the token (`storage_deposit`), then sends 10 tUSD with `ft_transfer`. If the transfer fails, the callback puts the claim back to `Held` and returns the funds to the pool balance.
5. For two sample lab reports, it checks the NEAR AI attestation, and the insurer registers the model signer. The attested model reads the HbA1c values from the report image, and the NEAR AI signature on its answer is checked. Plain code applies the lab rule to the values, and the service signs the result. The member sends `claim_lab` with the request hash, the response hash, the result and both signatures. No value and no date go on-chain.
6. It reads the records, the totals and the tUSD balances from the chain.

An earlier version sent the week to a model on NEAR AI Cloud, and a claim took about 196 s. That version passed on 3 Nov on `pool-mw1317o0.rebates-demo-mw12j3o6.testnet`.

## Rejected on testnet

Each of these is a failed transaction with the expected error text.

Wearable claims (`claim_wearable`):

- a result signed by another key
- a result signed for another member
- a changed result

Lab claims (`claim_lab`):

- a lab result signed by another key
- a lab result signed for another member
- a lab result changed to paid
- a NEAR AI signer that is not registered
- a NEAR AI signature for another answer
- a signature for a model that is not published
- a response hash that is not 64 hex characters
- `rule_met` with no test found
- a signer that the insurer removed
- a second lab claim for the same year

Both:

- a second claim for the same week
- a held claim resolved by a member

These use signatures from local test keys. The NEAR AI checks use a test signer that the insurer registers and then removes before the real claims. They do not show that NEAR AI Cloud would sign such content.

## Limits

- In the demo, one server holds the member, insurer and wearable keys. The wearable service signs a result. The contract cannot check the rule, so it trusts that service.
- For a lab claim, the contract checks that a registered NEAR AI signer signed the request hash and the response hash. It cannot read the answer, so it trusts the service to apply the lab rule to that signed answer. The member keeps the signed answer, so an auditor can check it later.
- The insurer registers a NEAR AI signer after the off-chain attestation passes. The contract does not check the attestation, and it trusts a registered signer until the insurer removes it.
- These paths are tested in the mock runtime only: the insurer approves or rejects a held claim, the pool has too few tUSD, and a failed `ft_transfer`.
- The transaction arguments are public. So each member's `days_met`, pattern result and input hash are public, under a pseudonymous account. For a lab claim, `test_found`, `rule_met` and the two hashes are public, but no value and no date.
- tUSD is a test token with no value. A real insurer pays in a stablecoin such as USDC.
- All accounts in one run use one key, because this is a demo.

## Run it

Needs Rust and Node 20.6 or newer. The lab claims need `NEARAI_CLOUD_API_KEY` in `.env` (see `.env.example`). The first run creates a dev account from the testnet helper, and saves its key in `chain/.env.testnet`, which git ignores. Each run deploys a new token, a new pool and new members, which uses about 5.5 free testnet NEAR. `node chain/top-up.mjs` moves free tokens to the dev account, and it saves no new key.

```sh
(cd contract && npx cargo-near@0.22.0 near build non-reproducible-wasm)
(cd token && npx cargo-near@0.22.0 near build non-reproducible-wasm)
(cd tee && npm install)
cd chain && npm install && npm run run-testnet
```
