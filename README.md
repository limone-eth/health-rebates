# Private insurer rebates

An insurer pays health rebates for healthy weeks, and never sees the member's health data.

Built for the [NEAR Hackathon](https://nearhackathon.com/) (tracks: Privacy & Private AI, Real-World Money).

**Status: the demo runs end to end, on NEAR testnet.** A fresh clone passes the steps below. See [docs/PLAN.md](docs/PLAN.md).

**Try it:** [health-rebates.vercel.app](https://health-rebates.vercel.app) shows the last real results from the chain. Press "Run a live claim" to send a real claim to NEAR testnet, with no setup. You see the result on your screen only. You can also upload your own data as a CSV, from the template on the page. For the once-a-year lab rebate, choose a sample lab report or upload your own (PDF or photo): a model on NEAR AI Cloud reads the HbA1c values, and code applies the rule. When the Whoop or Oura keys are set, you can also connect that tracker. A claim cap limits the hosted copy, and Approve and Decline stay off. At the cap, the page shows the last real results only.

## What runs today

Contract and token. Needs Rust only, no API key:

```sh
(cd contract && cargo test -- --nocapture)
(cd token && cargo test)
```

You see: all tests pass, and the gas cost of one signature check. The token is tUSD, a NEP-141 test token with no value. A real insurer pays in a stablecoin such as USDC.

NEAR AI Cloud check. Needs Node 20.6 or newer and an API key in `.env` (copy `.env.example`):

```sh
cd spike && npm install && npm run verify
```

You see: one structured completion, the checks on its response signature, and the checks on the attestation: the Intel signature on each quote, the event log, the compose file and the GPU evidence.

Mock wearable service. Needs Node only, no API key:

```sh
cd wearable && npm test && npm start
curl http://localhost:8787/mock/members
```

You see: all tests pass, then synthetic members A, B and C. Each member has 28 baseline days and a 7-day claim week (26 Oct to 1 Nov 2026). To read a member, send the `X-Open-Wearables-API-Key: demo-key` header to `/api/v1/users/<id>/summaries/activity?start_date=2026-10-26&end_date=2026-11-01`. The `sleep` path works the same way.

The service copies the API shape of [Open Wearables](https://github.com/the-momentum/open-wearables) (MIT): the paths, the header and the activity and sleep summary schemas. It holds no Open Wearables code. A real instance can replace it, which brings Garmin, Oura, Whoop and other devices. We have not tried this.

TEE check. Needs Node 20.6 or newer and an API key in `.env`. It starts the mock wearable service itself:

```sh
cd tee && npm install && npm test && npm run check
```

You see: all tests pass, then 5 runs of A, B and C, each with a verified signature. A is paid, B is not paid, and C is held for review. See [docs/tee-check.md](docs/tee-check.md). This check is from the first version, where a model read the week. Wearable claims now use plain code, and the attested model is for lab reports.

Testnet run. It deploys tUSD and the rebate pool, then sends real wearable claims and two lab claims as meta transactions, and the pool pays in tUSD. The members hold 0 NEAR. See [docs/testnet-run.md](docs/testnet-run.md) for the commands, the results and the limits.

Web app. It has a member screen, an insurer screen and a Verified panel. Needs Node 20.6 or newer:

```sh
cd web && npm test && npm start
```

Open http://localhost:3000. With no keys, the app reads the last real results from NEAR testnet and says that they are from an earlier run. The live claim and the insurer's decision are off, and the screen says why. For live claims, add an API key in `.env`, run `npm install` in `chain/` and `tee/`, and have a dev account in `chain/.env.testnet` (see [docs/testnet-run.md](docs/testnet-run.md)).

## NEAR tools used

- NEAR AI Cloud: model inference in a TEE, attestation, response signatures. For lab reports.
- NEAR testnet contract (`near-sdk`): `env::ecrecover`, `env::keccak256`, `env::sha256`, cross-contract calls with a callback.
- Meta transactions (NEP-366) and zero-balance accounts (NEP-448): each member account holds 0 NEAR. The member signs the claim, and the insurer's account relays it and pays the gas.
- NEP-141 token (`near-contract-standards`): tUSD, paid with `storage_deposit` and `ft_transfer`, and funded with `ft_transfer_call`.

## What you trust

The page has the same table, under "What you trust".

| Who | Sees | Can fake or get wrong | Next step |
|---|---|---|---|
| Your tracker (Whoop, Oura) | Your steps, active minutes and sleep. | Whoop and Oura do not sign their data. A changed CSV or tracker answer looks the same to us. | zkTLS on the tracker's API. |
| Your lab | Your full report. | The lab does not sign the report, so anyone can edit a PDF or photo before the upload. | Lab reports with the lab's signature, or zkTLS on the lab portal. |
| The rebate service (this demo) | Your week, and the HbA1c values that the model read. It keeps neither. | It can sign a wrong result. The contract checks its signature, not its rule. For a lab claim, you keep the model's signed answer, so an auditor can check the result against the hashes on-chain. | Run the service in a TEE with a public image. |
| NEAR AI Cloud | The lab report image. | The model can misread a value. Each answer has a signature from the TEE. The attestation shows the GPU and the compose file that started, not that all its software is safe. | A trusted list of model images. |
| The rebate contract | Hashes, results and payouts. No health data. | Nothing: its code and its transactions are public. The insurer adds and removes the model signers. | Check the attestation on-chain. |

## Limits

- We check which compose file the TEE started, and that NVIDIA accepts its GPU evidence. We do not prove that the software is safe: we have no trusted list of images, and a manager in the TEE can start other containers later. See [the limits](docs/spike-day-1.md#limits-of-the-software-check).
- The wearable service applies the rebate rule in plain code and signs the result. No model reads the week, and no TEE runs this code. The insurer never sees the data, but it trusts that service.
- NEAR AI Cloud runs the model in a TEE, not our code. The model only reads the HbA1c values from a lab report. Our code applies the lab rule to them, outside the TEE.
- The contract checks the NEAR AI signature on the request hash and the response hash, and the service signature on the lab result. It cannot read the model's answer, so it trusts the service to apply the rule to that signed answer. The member keeps the signed answer (a download on the page), so an auditor can check it against the hashes later.
- A lab report can be edited before upload, and the lab does not sign it. A real service needs signed lab reports or zkTLS.
- A report that a visitor uploads goes to NEAR AI Cloud. Our server keeps no report and no value. Use the samples, or a report that you are happy to send.
- A response signature proves that the TEE gave an answer. It does not prove which prompt the TEE got. See [docs/spike-day-1.md](docs/spike-day-1.md).
- The insurer does not see the wearable data, but some results are public. Testnet transaction arguments are public, so each member's `days_met`, pattern result and input hash are public, under a pseudonymous account. A later fix: return only `eligible` or `hold`.
- For the demo, one server holds the member, insurer and wearable keys. A real service keeps them apart.
- The hosted copy has no login. Anyone with the link can use its live claims, up to the cap. Two claims that start at the same time can pass the cap by a few. A claim that fails does not count.
- Each hosted claim stays on the chain, so the pool's totals and balance change. The results that visitors see first stay the same.
- Each live claim uses a new account, so one member can claim one week more than once. A real service links one NEAR account to each member.
- An uploaded CSV has no proof from a wearable service: the demo's key signs it, so anyone can type a week that gets paid. The server reads the file during the claim and keeps nothing. Code on the server counts the good days, and no model reads the week. The good days and the result stay public on testnet, under a made-up account. Do not upload data that you want to keep private.
- A connected Whoop or Oura has no proof from the device maker: this server reads the week by OAuth and signs it with the demo's key. The server keeps no data and no token. The good days and the result stay public on testnet, as with a CSV. Whoop gives heart rate zones for workouts only, so its active minutes count workouts only.
- tUSD is a test token with no value. A real insurer pays in a stablecoin such as USDC.
- The sample members are synthetic. Testnet only. A simulated insurer.

## Baseline

No code from before the hackathon window. AI-generated code: this repository is written with Claude Code.

## License

MIT
