# Private insurer rebates

An insurer pays health rebates for healthy weeks, and never sees the member's health data.

Built for the [NEAR Hackathon](https://nearhackathon.com/) (tracks: Privacy & Private AI, Real-World Money).

**Status: the demo runs end to end, on NEAR testnet.** A fresh clone passes the steps below. See [docs/PLAN.md](docs/PLAN.md).

**Try it:** [health-rebates.vercel.app](https://health-rebates.vercel.app) shows the last real results from the chain. This hosted copy has no keys, so its live buttons are off. To run a live claim, run the web app on your own machine with keys.

## What runs today

Contract signature check. Needs Rust only, no API key:

```sh
cd contract && cargo test -- --nocapture
```

You see: all tests pass, and the gas cost of one signature check.

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

You see: all tests pass, then 5 runs of A, B and C, each with a verified signature. A is paid, B is not paid, and C is held for review. See [docs/tee-check.md](docs/tee-check.md).

Testnet run. It deploys the rebate pool, then sends real TEE claims. See [docs/testnet-run.md](docs/testnet-run.md) for the commands, the results and the limits.

Web app. It has a member screen, an insurer screen and a Verified panel. Needs Node 20.6 or newer:

```sh
cd web && npm test && npm start
```

Open http://localhost:3000. With no keys, the app reads the last real results from NEAR testnet and says that they are from an earlier run. The live claim and the insurer's decision are off, and the screen says why. For live claims, add an API key in `.env`, run `npm install` in `chain/` and `tee/`, and have a dev account in `chain/.env.testnet` (see [docs/testnet-run.md](docs/testnet-run.md)).

## NEAR tools used

- NEAR AI Cloud: model inference in a TEE, attestation, response signatures.
- NEAR testnet contract (`near-sdk`): `env::ecrecover`, `env::keccak256`, `env::sha256`.

## Limits

- We check which compose file the TEE started, and that NVIDIA accepts its GPU evidence. We do not prove that the software is safe: we have no trusted list of images, and a manager in the TEE can start other containers later. See [the limits](docs/spike-day-1.md#limits-of-the-software-check).
- NEAR AI Cloud runs the model in a TEE, not our code. A small service fetches the wearable data outside the TEE. The insurer never sees the data, but it trusts that service.
- The TEE does not apply the rebate rule. Code outside the TEE marks each day, and the model counts the marks and does the pattern check. See [docs/tee-check.md](docs/tee-check.md).
- A response signature proves that the TEE gave an answer. It does not prove which prompt the TEE got. See [docs/spike-day-1.md](docs/spike-day-1.md).
- The insurer does not see the wearable data, but some results are public. Testnet transaction arguments are public, so each member's `days_met`, pattern result, model response and `request_hash` are public, under a pseudonymous account. A later fix: return only `eligible` or `hold`.
- For the demo, one server holds the member, insurer and wearable keys. A real service keeps them apart.
- Each live claim uses a new account, so one member can claim one week more than once. A real service links one NEAR account to each member.
- Synthetic data only. Testnet only. A simulated insurer.

## Baseline

No code from before the hackathon window. AI-generated code: this repository is written with Claude Code.

## License

MIT
