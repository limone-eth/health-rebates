# How does the new pool contract sign and pay claims?

Decided: 2026-11-06 · Case: c_6194ebfa-0591-462b-b06b-15046935d356

Follows [the private AI record](2026-11-06-private-ai-role.md). Closes its open questions on the wearable signer and the test stablecoin.

## Question and choice

1. Who signs the result of a wearable claim when no model decides it? The owner chose "The wearable service signs": the wearable service runs the plain-code rule and signs the result.
2. Which test stablecoin pays the rebate? The owner chose "Our own test token": deploy our own NEP-141 token named tUSD on testnet.

## Why

- The owner asked: "can we send it to the model as well?" The agent answered that the model adds an attested signature, but no privacy and no input trust. The wearable service sees the data and signs the data hash in both cases. The owner then chose the service.
- The service signer is half a day of work and keeps wearable claims fast.
- Our own token cannot run dry while judges test. A faucet has daily limits.

## Constraints

- A wearable claim has one signature: the wearable service signs the contract, member, week, request hash and result. No model call decides it.
- A lab claim keeps the NEAR AI signature check, with a signer that the insurer registered.
- The trust table says that the wearable service sees wearable data and decides wearable claims.
- The README says that tUSD is a test token, and that a real insurer pays in USDC.
- The pool pays tUSD with `ft_transfer`. The member account must be registered with the token first.

## Ruled out

- "Code and model must agree": same privacy and input trust, half a day more, and claims can be slow again.
- "Our code in a TEE" on Phala: 2 to 3 days and new hosting, too large a risk before 14 Nov.
- "Circle testnet USDC": faucet limits, so the pool can run dry during judging.

## Comments

- "can we send it to the model as well?": the agent explained what the model adds and what it does not add, and added the option "Code and model must agree". The owner chose the service signer.

## Open questions

- How a relayer pays gas for the member's meta transaction. This comes with the meta transaction task.

## Sources

- Case c_6194ebfa-0591-462b-b06b-15046935d356.
- `contract/src/pool.rs:199-240`: today `claim` checks the wearable signature and the NEAR AI signature.
- `spike/lab/image-check.mjs`: a signed image call answered in 1.3 s.
