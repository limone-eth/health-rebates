# TEE check

**Result: A, B and C gave the expected results 5 times in a row, on 3 Nov, with `Qwen/Qwen3.8-27B`. All 15 claim signatures passed.**

| Member | `days_met` | `pattern_matches_owner` | Decision |
|---|---|---|---|
| A | 6 | true | paid |
| B | 3 | true | not paid |
| C | 6 | false | held for review |

Each run verifies a new attestation before it sends member data. Then, for each member, it verifies the response signature against a signer from that attestation, and gets a separate explanation for the member.

## The rule code marks each day, not the model

The first version asked the model to apply the three limits. It failed on the first live run: B got `days_met` 4 (correct: 3), and C got 5 (correct: 6). Reasoning must stay off, because the signature covers the exact response bytes and reasoning text can repeat health data.

Now `wearable/rule.mjs` sets `meets_rule` on each row, and the model counts these marks. **So the TEE does not apply the rule. The code outside the TEE does.** The model does the pattern check and writes the explanation.

The insurer already trusts this service for the data. In the claim design, the wearable service signs the request hash. This protects the marks only if the service builds the request itself and signs only that request. If a service signs any hash, a member can send many requests and claim with the best one. **The web app's claims now do this: `POST /mock/claims` in `wearable/server.mjs` builds the request and signs its hash, and it has no route that signs a hash from the caller. `chain/run-testnet.mjs` still signs the hash of the request that the script built.** Do not say "the TEE checks the rule" in the README, the video or the form.

## Limits of this result

- 5 runs on one fixed data set, at `temperature: 0`. It does not measure accuracy on other data.
- The members are far apart. C's week is outside the baseline on 7 of 7 days, and A's on 0 of 7. Nothing tests a case near the limit of the pattern check.
- Simple code can also do this pattern check. The test in `tee/claim.test.mjs` counts the same thing without a model. The model is not needed for this data.
- The check for the explanation is small: it is not empty, and it holds the day count. Its signature is not checked. The run prints the first run's explanations for a person to read.
- The attestation now checks the event log, the compose hash and the GPU evidence. It does not prove that the software is safe. See [the limits](spike-day-1.md#limits-of-the-software-check).
