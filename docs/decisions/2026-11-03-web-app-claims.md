# Must the web app send real claims when a person clicks?

Decided: 2026-11-03 · Case: c_3ce88316-db0b-4985-8e70-018f985af900

## Question and choice
The web app must run a claim in one of three ways. The owner chose: "A click sends a real TEE claim to the deployed pool, with a new member account. With no keys, the app shows the last real results from the chain, and it says that they are from an earlier run."

## Why
The owner gave no reason in words. The owner asked: "which more tokens we need? how can we get them". The answer is in Comments.

The agent's reasons: the video shows the real flow. A judge with no keys still sees real results on the chain.

## Constraints
- A live claim uses the deployed pool and a new member account, because a member can claim a week one time.
- The read-only view shows only real results from the chain, and it says they are from an earlier run.
- Free testnet tokens only. The agent never prints or commits a key.
- The insurer screen gets no health data.
- Do not say "the TEE checks the rule". Code outside the TEE marks each day.

## Ruled out
- "Live only": a judge needs a NEAR AI key and testnet tokens to see anything.
- "Replay only": the app does not do the work, and the Verified panel shows old checks.

## Comments
- "which more tokens we need? how can we get them": the agent answered on the case. Only free testnet NEAR is necessary. The testnet helper gave the dev account 9.998 NEAR, with no sign-in and no payment. A new helper account can send its tokens to the dev account. Live claims also use the NEAR AI Cloud credits that the owner bought. The agent does not know the cost per claim yet.

## Open questions
- Hosting. A host needs the NEAR AI key and the testnet key. The agent will ask later.

## Sources
- Case c_3ce88316-db0b-4985-8e70-018f985af900
- [PLAN.md](../PLAN.md), the 12 Nov row
- [tee-check.md](../tee-check.md), the wearable signing gap
- [testnet-run.md](../testnet-run.md), the token use
- Testnet balances read on 3 Nov: the pool has 3.398 NEAR with 1.832 NEAR locked for storage. The dev account has 0.875 NEAR.
