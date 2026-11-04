# How should judges run a live claim on the hosted demo?

Decided: 2026-11-04 · Case: c_e1d9b025-1a80-466b-8c3f-168a4ea4f175

Changes the "no keys" rule of the hosted copy in `docs/TASKS.md` section 9e. Closes the Hosting question in [the claims record](2026-11-03-web-app-claims.md).

## Question and choice

The owner asked: "can we build a way for them to run a live claim without having to run on their own machine?"

The owner chose: "Anyone with the link can run a live claim, up to a claim cap. There is no code."

## Why

- The owner said: "i'm happy to subsidize testnet tokens if needed". Testnet tokens are free. The real cost is the NEAR AI key.
- My reason for the option: it has the fewest steps for a judge.

## Constraints

- The owner adds the keys to Vercel. The agent never enters a key.
- The server refuses a claim at the cap. The cap comes from the pool's claim totals on the chain.
- With no keys or at the cap, the app shows the read-only view.
- A hosted claim does not change the shared results. Member C stays held, and Approve and Decline stay off on the host.
- Synthetic data and testnet only. The insurer screen gets no health data.
- A hosted claim stays on the chain, so the pool's totals and balance change. Only the three member results stay the same.

## Ruled out

- "Access code, plus a cap": the owner chose fewer steps for judges. A bot can use all claims in a short time, and judges can then find the button off.
- "Keep it read-only": judges cannot run a claim with no setup.

## Comments

none

## Open questions

- The cap value, and the price per claim on the NEAR AI key.
- Answered: the Intel quote module runs on Vercel. It is WebAssembly, not native code. A real quote gave `UpToDate` on a preview.

## Sources

- Case c_e1d9b025-1a80-466b-8c3f-168a4ea4f175.
- `web/live.mjs`, `web/server.mjs`, `api/index.mjs`, `vercel.json`, `.vercelignore`.
