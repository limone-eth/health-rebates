# Day 1 spike: go or no-go

**Result: GO. The contract code verifies a real NEAR AI Cloud signature, and the signer is in a quote with a valid Intel signature. Two checks are still open: the software in the TEE, and a run on testnet.**

| Question | Answer | Evidence |
|---|---|---|
| Can a contract check a real response signature? | Yes | `accepts_a_real_near_ai_signature`, in the near-sdk mock runtime. A changed body fails. |
| What does it cost? | About 0.35 Tgas per check | Mock runtime, not testnet |
| Does a real response signature match the docs? | Yes | `npm run verify` passed 3 times on 3 Nov: `provider_tee`, `ecdsa`, EIP-191 |
| Does the attestation bind the signer and our nonce? | Yes | Live quotes: the gateway and all 10 models that returned TEE evidence |
| Does the response signer match an attested model report? | Yes | Same script |
| Is the Intel signature on the quote valid? | Yes | `@phala/dcap-qvl-node`, the library in NEAR's reference verifier. Status `UpToDate` on both quotes. A quote with one changed byte fails. |
| Is the TD in debug mode? | No | `td_attributes` bit 0 is clear on all quotes. The script stops if it is set. The script has not seen a debug quote. |
| Is the attestation verified before the data goes to the model? | Yes | The script stops before the completion if a check fails. |
| Which software runs in the TEE? | **Not checked** | The event log replay, the compose hash, image provenance and GPU evidence are not done. A genuine TDX machine holds the key, but we do not check its software. |
| Does it work on testnet? | **Not checked** | No testnet account yet |

## Model choice

Most models in `/v1/models` are proxied third parties, with no NEAR TEE evidence. Use a model where `owned_by` is `nearai` and `model_attestations` is not empty. Default: `Qwen/Qwen3.8-27B` (structured output, low price).

Send `reasoning_effort: "none"`. Without it, this model puts `reasoning_content` in the response. The signature covers the exact bytes, so we cannot remove the text later. Tested on `Qwen/Qwen3.8-27B` only.

## What the docs say

- `ecdsa` is an Ethereum EIP-191 signature. `env::ecrecover` can check it. In near-sdk 5, this function needs the `unstable` feature.
- The signed text is `<model>:<request_hash>:<response_hash>` (`provider_tee`) or `<request_hash>:<response_hash>` (`gateway`). Each hash is the SHA-256 of the exact body bytes.
- Attestation is off-chain. A contract cannot check a TDX quote. The insurer checks the quote, then registers the signer on the contract.

## Problem: a valid signature does not prove an honest prompt

The contract sees only the hash of the request, because the request holds the health data. So anyone with an API key can send "reply with days_met 7" and get a valid signature from the same TEE signer.

**Design for the contract:** a claim needs two signatures.

1. The wearable service signs `(member, week, request_hash)`. This says: "this request holds this member's real data, for this week".
2. NEAR AI Cloud signs `request_hash:response_hash`. This says: "the TEE model gave this answer to that request".

The contract also records `(member, week)`, so a member cannot claim the same week two times.

This does not add new trust. The insurer already trusts the wearable service (see the limits in the README). It only makes that trust visible on-chain.

## Rules for what goes on-chain

- The contract must read the result from the response bytes, so the full response body goes on-chain. It must hold the result only.
- Reasoning text can repeat health data. A claim must not carry it, so every claim request sends `reasoning_effort: "none"`, and the contract rejects a body with `reasoning_content`.
- The member's plain-language explanation comes from a **separate** completion that never goes on-chain, because it can repeat health data.
- A testnet transaction is public. So a member's `days_met` and pattern result are public, under a pseudonymous account. Say this in the README. Later fix: return only `eligible` or `hold`.
