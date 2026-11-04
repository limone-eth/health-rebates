# Build plan

Submit by 14 Nov 2026, 23:59 UTC.

## The demo

1. A simulated insurer funds a rebate pool on NEAR testnet and publishes a rule: 7,000+ steps with a raised heart rate, and 7+ hours of sleep, on 5 of 7 days.
2. Three synthetic members link a mock wearable:
   - **A** meets the rule.
   - **B** misses the rule.
   - **C** "lent the watch": the numbers meet the rule, but heart rate and sleep do not match C's own baseline.
3. Each week of data goes to a TEE-hosted model on NEAR AI Cloud. It returns signed JSON only, for example `{ "days_met": 5, "pattern_matches_owner": true }`.
4. The app verifies the attestation and the response signature, and shows a "Verified" panel.
5. The contract pays A, does not pay B, and holds C for review.
6. Two screens: the member sees their data and an explanation. The insurer sees the result, the proof, the payout and totals ("2 of 3 members met the rule"), and no health data.

## Days

| Date | Work | Done when |
|---|---|---|
| 4 Nov | Spike: completion, attestation, signature, contract check. Go or no-go. | A script prints a verified completion. Written result in [spike-day-1.md](spike-day-1.md). |
| 5 Nov | Mock wearable service in the shape of the Open Wearables API, synthetic week for A, B, C | A fetch returns 7 days per member |
| 6–7 Nov | TEE check: prompt, structured output, baseline check, explanation | A, B, C give the expected results 5 times in a row |
| 10–11 Nov | Contract: fund pool, publish rule, register signers, claim, pay; tests | Testnet payouts match A, B, C |
| 12 Nov | Web app: member screen, insurer screen, "Verified" panel | The demo runs end to end from the README |
| 13 Nov | README, demo video under 2 minutes | A fresh clone runs from the README |
| 14 Nov | Buffer. Post the demo on X, send the form. | Submitted before 23:59 UTC |

## Not in scope

Real wearable accounts, real members, a real insurer, mainnet, stablecoin payouts, Apple Health, a confidential-compute host for the fetch.
