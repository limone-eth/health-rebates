# What claim cap and which NEAR AI key should the hosted demo use?

Decided: 2026-11-04 · Case: c_cee4b251-142a-4ee2-9320-e24d1e2ccbea

Closes the open question on the cap in [the hosted claims record](2026-11-04-hosted-live-claims.md).

## Question and choice

The owner chose two things:

- "50 more claims. The CLAIM_CAP value is 65. I move 3 NEAR of free testnet tokens from the dev account to the pool."
- "The hosted demo uses the NEAR AI key that is in .env now."

## Why

- The owner gave no other reason.
- My reason for the cap: it gives judges room, and the current free tokens cover it.

## Constraints

- `CLAIM_CAP` is 65. The cap counts all claims on the pool, and the pool had 15 claims at this decision.
- The agent moved 3 NEAR from the dev account to the pool.
- The owner adds the keys to Vercel with `node chain/add-hosted-keys.mjs <preview|production> 65`.
- The hosted copy uses the same NEAR AI key as local runs.

## Ruled out

- "25 more claims": the owner did not choose it.
- "100 more claims": the owner did not choose it. It also needs more test tokens.
- "A new key with a spend limit": the owner did not choose it. So the cap is the only limit on the cost.

## Comments

none

## Open questions

- The price per claim on the NEAR AI key. Each claim makes 2 model calls.
- A failed claim does not count toward the cap, but its model calls still cost money. Nothing limits this cost.

## Sources

- Case c_cee4b251-142a-4ee2-9320-e24d1e2ccbea.
- `chain/add-hosted-keys.mjs`, `api/index.mjs`.
