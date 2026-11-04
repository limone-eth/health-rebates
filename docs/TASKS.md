# Tasks

From: [decisions/2026-11-03-near-ai-cloud-key.md](decisions/2026-11-03-near-ai-cloud-key.md) and [spike-day-1.md](spike-day-1.md).

## 1. Finish the live spike (done)

From: "A live run is the one check that can still change the go or no-go."

- [x] `npm run verify` in `spike/` prints `RESULT: signature and bindings verified`.
- [x] `signature_kind` is `provider_tee`.
- [x] The response body holds no reasoning text.
- [x] A real signature from the run passes `verify_provider_response` in a contract test.
- [x] `spike-day-1.md` has the final go or no-go.

## 2. Check the Intel signature on the quote (done)

From: "Is the Intel signature on the quote valid? Not checked."

- [x] The script verifies the quote with `@phala/dcap-qvl-node`.
- [x] A changed quote fails the check.

## 2b. Check which software runs in the TEE

From: "A genuine TDX machine holds the key, but we do not check its software."

- [ ] The script replays the event log against RTMR3.
- [ ] The script checks the compose hash against MRCONFIGID.
- [ ] The script checks the GPU evidence.
- [ ] If this does not fit in the time, the README says so as a limit.

## 3. Build the claim with two signatures

From: "a claim needs two signatures."

- [ ] The contract rejects a claim with no wearable service signature.
- [ ] The contract rejects a claim with a NEAR AI signature from a signer that is not registered.
- [ ] The contract rejects a second claim for the same member and week.
- [ ] The contract rejects a `model` that the insurer did not publish, and a `request_hash` that is not 64 hex characters.
- [ ] The claim response holds the result only. The contract rejects a body with `reasoning_content`.
- [ ] The same checks pass on NEAR testnet, not only in the mock runtime.

## 4. Mock wearable service (done)

From PLAN.md: "A fetch returns 7 days per member".

- [x] `npm test` in `wearable/` passes.
- [x] A meets the rule on 6 days, B on 3 days, C on 6 days.
- [x] Only C's claim week differs from the member's own baseline.
- [x] The activity and sleep responses match the Open Wearables OpenAPI schema (a one-time check, not in the tests).

## 5. Remaining plan

See the table in [PLAN.md](PLAN.md): TEE check, contract, web app, README and video.
