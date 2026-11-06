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

## 2b. Check which software runs in the TEE (done, with a limit)

From: "A genuine TDX machine holds the key, but we do not check its software."

- [x] The script replays the event log against RTMR3.
- [x] The script checks the compose hash against MRCONFIGID.
- [x] The script checks the GPU evidence with NVIDIA's service.
- [x] The README states the limit: these checks do not prove that the images are safe.

## 3. Build the claim with two signatures (done)

From: "a claim needs two signatures."

- [x] The contract rejects a claim with no wearable service signature.
- [x] The contract rejects a claim with a NEAR AI signature from a signer that is not registered.
- [x] The contract rejects a second claim for the same member and week.
- [x] The contract rejects a `model` that the insurer did not publish, and a `request_hash` that is not 64 hex characters.
- [x] The claim response holds the result only. The contract rejects a body with `reasoning_content`.
- [x] The same checks pass on NEAR testnet, not only in the mock runtime.

## 3b. Run the contract on testnet with a dev account (done)

From [decisions/2026-11-03-testnet-account.md](decisions/2026-11-03-testnet-account.md): "I create a new testnet account only for this project. Its key stays in a local file that git ignores."

- [x] A new testnet account exists only for this project, with free testnet tokens only.
- [x] Each key is in a file that git ignores. The script output does not show a key.
- [x] The contract deploys, the pool is funded, and the signer is registered after the attestation passes.
- [x] Real TEE claims on testnet give the expected payouts: A paid, B not paid, C held. See [testnet-run.md](testnet-run.md).

## 4. Mock wearable service (done)

From PLAN.md: "A fetch returns 7 days per member".

- [x] `npm test` in `wearable/` passes.
- [x] A meets the rule on 6 days, B on 3 days, C on 6 days.
- [x] Only C's claim week differs from the member's own baseline.
- [x] The activity and sleep responses match the Open Wearables OpenAPI schema (a one-time check, not in the tests).

## 5. TEE check (done)

From PLAN.md: "A, B, C give the expected results 5 times in a row".

- [x] `npm run check` in `tee/` passes 5 runs: A paid, B not paid, C held for review.
- [x] Each run verifies the attestation before it sends member data, and verifies each claim signature.
- [x] The explanation is a separate completion, and it does not go on-chain.

## 6. Wearable service signs only the request that it builds

From [decisions/2026-11-03-web-app-claims.md](decisions/2026-11-03-web-app-claims.md): "A click sends a real TEE claim to the deployed pool". A real claim needs this gap closed. See [tee-check.md](tee-check.md).

- [x] The service builds the claim request from its own data and returns the request with its signature.
- [x] The service has no route that signs a hash from the caller.
- [x] Two calls for one member and week give the same request bytes.
- [x] The TEE client sends these exact bytes, and the request hash matches them.

## 7. Live claim on the deployed pool

From the same record: "with a new member account".

- [x] One action creates a new member account and sends a real claim to the deployed pool.
- [x] The attestation passes before member data goes to the model.
- [x] A top-up script moves free tokens from a new helper account to the dev account, and keeps no new key.
- [x] A member account with the new deposit completes a claim on testnet.

## 8. Read-only view with no keys

From the same record: "With no keys, the app shows the last real results from the chain, and it says that they are from an earlier run."

- [x] With no keys, the app starts and shows results that it reads from the chain.
- [x] The screen says that the results are from an earlier run.
- [x] With no keys, the live claim action is off, and the screen says why.

## 9. Member screen, insurer screen, Verified panel

From PLAN.md: "Two screens: the member sees their data and an explanation. The insurer sees the result, the proof, the payout and totals".

From the record: "The insurer screen gets no health data."

- [x] The member screen shows the week of data, the rule, the result and the explanation.
- [x] The insurer screen shows the result, the proof, the payout and the totals.
- [x] A test checks that the insurer API responses hold no health fields.
- [x] The insurer can approve or reject C's held claim. Both are tested in the browser ([record](decisions/2026-11-04-restore-held-claim.md): "`web/state.json` must end with member C held").
- [x] The Verified panel shows each check that passed, and says that the software in the TEE is not proven safe.

## 9b. The brand look, with no brand name

From [the record](decisions/2026-11-03-brand-look.md): the look only, and "instantiate design system in open pencil".

- [x] OpenPencil holds the design system: colors, type, buttons, ticket.
- [x] OpenPencil holds the member and insurer screens, and the owner reviewed them.
- [x] `web/public/` uses the same tokens, with Switzer, Geist Mono and Doto.
- [x] The repo shows no name, logo, character or photograph from that brand.
- [x] Each view has one primary button and one Doto number.

## 9c. Finish the approved screens

From [the record](decisions/2026-11-03-screen-designs.md): "we can revisit tomorrow", and "Then I update the comps and continue with the docs and the PR."

- [x] OpenPencil holds the approved copy.
- [x] One live claim runs from the button in the browser, and each step shows.
- [ ] The owner says what to revisit, or says that nothing needs a change.
- [ ] The model's summary is shorter on new runs, if the owner wants this.

## 9d. The wide ticket and the new titles

From [the layout record](decisions/2026-11-04-screen-layout.md): "The member sees one landscape ticket, with a vertical tear". From [the titles record](decisions/2026-11-04-screen-titles.md): "The title stays the same for each member and each result."

- [x] The member sees one landscape ticket, and the insurer sees one wide ticket for each member.
- [x] First-view words have no "NEAR", "testnet" or token amount. Those stay in Technical details.
- [x] Both screens show the chosen titles.
- [x] The good-day line and the summary open from "Why this result".
- [x] No sideways scroll at 1440, 1100 and 390 px.
- [x] `docs/design/README.md` says that the app is now the screen reference. We did not update the screens in `rebates.op`: they still show the earlier layout.

## 9e. Hosted read-only copy

The owner said: "let's use vercel anyways".

- [x] A public URL shows the last real results from the chain.
- [x] With no keys, the hosted copy does not load the live code. Claim and held requests get a 403.
- [x] `.vercelignore` is an allow-list, so no key file can be uploaded. A test checks the list.
- [x] `web/members.json` equals the synthetic source. A test checks this. To change the synthetic weeks, write this file again.
- [ ] After a new live run changes `web/state.json`, deploy again with `vercel deploy --prod`, so that the hosted copy names the new accounts.

## 9e2. Live claims on the hosted copy

From [the record](decisions/2026-11-04-hosted-live-claims.md): "Anyone with the link can run a live claim, up to a claim cap. There is no code."

- [x] The Intel quote module runs in a Vercel function, and a real quote gives `UpToDate`. A root `package.json` is necessary: installs in `chain/` and `tee/` do not reach the function.
- [x] The live path needs no local server. `web/live.mjs` builds the wearable request in its own process.
- [x] The dev account loads from environment variables when the key file does not exist.
- [x] The server refuses a claim at the cap. The count comes from `get_totals` on the chain. A test checks this.
- [x] With a missing key or cap, the host gives the read-only view. A test checks this.
- [x] A hosted claim returns its result to the page, and the shared state does not change. A test checks this. A real claim through the hosted handler on one machine gave A paid.
- [x] Approve and Decline stay off on the host. Requests from another site get a 403. A test checks both.
- [x] The upload list is still an allow-list, and it names no key file. A test checks this.
- [x] The cap is 65 ([record](decisions/2026-11-04-claim-cap-and-key.md): "The CLAIM_CAP value is 65").
- [x] The pool holds enough tokens for the cap. The agent moved 3 NEAR to it.
- [x] The owner adds the keys with `node chain/add-hosted-keys.mjs <preview|production> 65`.
- [x] Real claims pass on a preview URL: A paid, B not paid, C held, in 11 to 13 seconds each. The steps arrive one at a time.
- [x] A real claim passes on the production URL, from a click in a headless browser: A paid, in 11 seconds. After a reload, the page shows the shared results.

## 9e3. Motion of the live claim

From [the record](decisions/2026-11-04-claim-motion.md): "I run emil-design-eng on the claim steps and the arriving result only."

- [x] Each step ticks in place, and steps that arrive together still show one at a time.
- [x] The ticket keeps its height from the start of a claim to the result.
- [x] A real claim passes on the production URL with this code: B not paid, in 14 seconds.

## 9e4. Claims with a visitor's own data

From [the record](decisions/2026-11-04-own-data.md): "Let judges upload a CSV or connect a tracker with their real data."

- [x] A CSV upload with 14 to 60 days runs a real claim. The last 7 days are the claim week.
- [x] One piece of code marks each day for sample members and uploads. A test shows that the template gives the same rows as member A.
- [x] A bad file gets a 422, and its error repeats no value from the file. A test checks this.
- [x] The server saves no upload, and the failure log holds only the type of error. A test checks that the state does not change.
- [x] Before the run, the screen says what the server sees, what stays public, and that an upload has no wearable proof. The Verified panel says this too.
- [x] A real upload passes on a preview URL: paid, in 11 seconds. A bad file gets a 422.
- [x] A real upload passes on the production URL: paid, in 196 seconds, [tx 9yLJznmi](https://testnet.nearblocks.io/txns/9yLJznmi4XAWdRt1V1QTGP6SNuBRcHioVHe2TaonYMGL). The model took 189 of those seconds. An earlier try stopped when my client's 200-second limit ended it.

## 9e5. Claims from a connected tracker

From [the record](decisions/2026-11-04-tracker-setup.md): "Connect the app to each device maker by OAuth, on Vercel, with no Open Wearables instance."

- [x] Whoop data maps to the claim rows. A test with Whoop's documented shapes checks this. From: "Build Whoop and Oura."
- [x] Oura data maps to the claim rows. A test with Oura's documented shapes checks this. From: "Build Whoop and Oura."
- [ ] A visitor connects by OAuth and a real claim runs. The state value is checked. From: "Connect the app to each device maker by OAuth".
- [x] The server keeps no tracker data and no token. A test checks this. From: "The server keeps no tracker data and no tracker token after the claim."
- [x] Fewer than 14 days gives a clear error, and the CSV stays available. A test checks this. From: "A connection with fewer than 14 days gets a clear error".
- [x] The Verified panel says what the second signature proves for tracker data. From: "The Verified panel says what the second signature proves".
- [ ] The owner creates the Whoop app and adds its keys to Vercel production. Criteria: `/api/status` lists `whoop`, and the page shows "Connect Whoop". From [the device record](decisions/2026-11-04-tracker-test-device.md): "I create the Whoop app and add its keys."
- [ ] A real Whoop connection passes on the production URL. Criteria: the owner signs in, a real claim finishes, the record is on testnet, and the address holds no code after the return. From: "I own a Whoop."
- [ ] The Oura link stays hidden with no Oura keys. Criteria: `/api/status` on production does not list `oura`. From: "Oura stays hidden unless I also add its keys."

## 9f. Release for the judges

From [the record](decisions/2026-11-04-release-for-judges.md): "I merge PRs 1 to 5 in order". From [the publish record](decisions/2026-11-04-publish-from-clean-main.md): "Make a new public repo named health-rebates that holds only the clean main."

- [x] The repo names no other brand.
- [x] PRs 1 to 5 are merged into main.
- [x] The repo `health-rebates` is public, and it holds only main.
- [x] A clone of main with no login passes the tests.
- [x] The owner deletes the first repo, after the two checks above pass.

From [the hosted copy record](decisions/2026-11-04-hosted-copy-name.md): "Deploy the hosted copy under a new project named health-rebates."

- [x] The project `health-rebates` is live, and it passes the checks in the record.
- [x] The README links to the new URL.
- [x] The owner deletes the old Vercel project, after the two checks above pass.

## 9g. Credible private AI

From [the private AI record](decisions/2026-11-06-private-ai-role.md). Deadline 14 Nov 2026, 23:59 UTC.

- [x] An image call to the attested model passes the response signature check. Result: a sample report in mmol/mol gave `rule_met: true` in 1.5 s, and a failing copy gave `rule_met: false`. Both signatures passed. The request needs `reasoning_effort: "none"`. Run it from `tee/` with `node --env-file=../.env ../spike/lab/image-check.mjs`. Criteria: a sample lab report photo goes to Qwen/Qwen3.8-27B, the attestation and signature checks in `tee/near-ai.mjs` pass, and the answer is valid JSON. Do this first. From: Open questions, "An image call with the response signature check is not tested yet."
- [x] Wearable claims use plain code for the rule. Result: `evaluateWeek` in `tee/claim.mjs` decides both values, and the wearable service signs the result. On a preview, a live claim for A took 8.4 s from the request to the paid record. A testnet claim takes about 4 s, against 196 s with the model. Criteria: one function decides `days_met` and `pattern_matches_owner`; tests cover the rules in `tee/claim.mjs:8-19`; no model call decides a wearable claim; a sample claim finishes in under 20 s on a preview. From: "Wearables as plain code".
- [x] The contract accepts a wearable claim that the wearable service signs. Result: `claim_wearable` checks the one wearable signature. `claim_lab` checks the NEAR AI signature on the request and response hashes, and the service signature on the lab result. Contract and testnet tests cover a valid claim, a bad key, another member, a changed result and a replay, for both. Criteria: the service signs contract, member, week, request hash and result; the contract checks this one signature for a wearable claim and the NEAR AI signature for a lab claim; contract tests cover a valid claim, a bad signature, a changed result and a replay. From [the pool record](decisions/2026-11-06-pool-signer-and-token.md): "The owner chose \"The wearable service signs\"".
- [ ] A visitor uploads a lab report and gets a result. Progress: on the local server, a sample report and an uploaded PDF each gave a paid claim on testnet, and the insurer screen showed only the result and the proof. Not done: a run on a preview. Changed by [the lab rule record](decisions/2026-11-06-lab-rule-in-code.md): the model returns the values, and plain code applies the rule. Criteria: PDF and photo both work; the model returns only the HbA1c values and dates, and the response body does not go on-chain; the server stores no report; the insurer screen shows only the result and the proof; a real run passes on a preview. From: "Lab report reader".
- [x] The lab rule rewards a test and an improvement. Result: the model only reads the values, and `applyLabRule` in `tee/lab.mjs` applies the rule in plain code. `npm run lab-check` with two runs of six sample reports gave 12 of 12, each with a good NEAR AI signature. Tests cover reports in % and in mmol/mol. Criteria: the page and the code state "a test in the last 12 months, and HbA1c under 5.7% or 0.3 points better than the last test"; tests use reports in % and in mmol/mol. From: Constraints, the lab rule line, changed by [the lab rule record](decisions/2026-11-06-lab-rule-in-code.md).
- [x] Rebates pay in our test token tUSD. Result: `tusd-mw4vw9nx.rebates-demo-mw12j3o6.testnet` is deployed, and the testnet run paid A 10 tUSD (see [the testnet run](testnet-run.md)). A failed transfer puts the claim back to Held. The screens show `$10.00`. Criteria: a NEP-141 token named tUSD is on testnet; the pool pays it with `ft_transfer` and registers the member with the token first; the insurer screen shows the amount in dollars; the README says that tUSD is a test token and a real insurer pays in USDC; contract tests cover the payout. From [the pool record](decisions/2026-11-06-pool-signer-and-token.md): "deploy our own NEP-141 token named tUSD on testnet".
- [ ] The member claims with no NEAR for gas. Criteria: the claim goes as a meta transaction and a relayer pays the gas; the member account holds no NEAR after the claim. From: "Stablecoin and meta transaction".
- [ ] The README, page and video script compare with Vitality-style programs. Criteria: one short paragraph says that these programs hold raw data today and this demo pays without it; no claim without a source. From: "Real-world frame".
- [ ] A "What you trust" table is in the README and on the page. Criteria: it names each party (device maker, lab, wearable service, NEAR AI Cloud, contract) and what each can see or fake; it says that a lab PDF can be edited and Whoop does not sign data; it names zkTLS and signed lab reports as next steps. From: "What you trust table".

## 10. Remaining plan

See the table in [PLAN.md](PLAN.md): README and video.

- [x] A fresh clone passes the tests of the contract, the wearable service, the TEE check and the web app, and the web app starts with no keys. The web app reads results from the chain.
- [x] [The video script](video-script.md) is written.
- [x] The design review and the technical audit are done. Both found a skip link that left the screen, and the audit found a week table cut at some widths. These are fixed. Not tested: real screen readers, Safari, Firefox, touch devices.
- [x] The claim week ended after the date on its results. It now runs from 26 Oct to 1 Nov 2026, and new live claims gave the same results: A paid, B not paid, C held.
- [ ] The owner records the video.
- [ ] The owner posts on X and sends the form.
