# Private insurer rebates

An insurer pays health rebates for healthy weeks, and never sees the member's health data.

Built for the [NEAR Hackathon](https://nearhackathon.com/) (tracks: Privacy & Private AI, Real-World Money).

**Status: in progress.** The spike, the mock wearable service and the TEE check run. The contract flow and the web app do not exist yet. See [docs/PLAN.md](docs/PLAN.md).

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

You see: one structured completion, the checks on its response signature, and the checks on the attestation, with the Intel signature on each quote.

Mock wearable service. Needs Node only, no API key:

```sh
cd wearable && npm test && npm start
curl http://localhost:8787/mock/members
```

You see: all tests pass, then synthetic members A, B and C. Each member has 28 baseline days and a 7-day claim week (2 to 8 Nov 2026). To read a member, send the `X-Open-Wearables-API-Key: demo-key` header to `/api/v1/users/<id>/summaries/activity?start_date=2026-11-02&end_date=2026-11-08`. The `sleep` path works the same way.

The service copies the API shape of [Open Wearables](https://github.com/the-momentum/open-wearables) (MIT): the paths, the header and the activity and sleep summary schemas. It holds no Open Wearables code. A real instance can replace it, which brings Garmin, Oura, Whoop and other devices. We have not tried this.

TEE check. Needs Node 20.6 or newer and an API key in `.env`. It starts the mock wearable service itself:

```sh
cd tee && npm install && npm test && npm run check
```

You see: all tests pass, then 5 runs of A, B and C, each with a verified signature. A is paid, B is not paid, and C is held for review. See [docs/tee-check.md](docs/tee-check.md).

## NEAR tools used

- NEAR AI Cloud: model inference in a TEE, attestation, response signatures.
- NEAR testnet contract (`near-sdk`): `env::ecrecover`, `env::keccak256`, `env::sha256`.

## Limits

- NEAR AI Cloud runs the model in a TEE, not our code. A small service fetches the wearable data outside the TEE. The insurer never sees the data, but it trusts that service.
- The TEE does not apply the rebate rule. Code outside the TEE marks each day, and the model counts the marks and does the pattern check. See [docs/tee-check.md](docs/tee-check.md).
- A response signature proves that the TEE gave an answer. It does not prove which prompt the TEE got. See [docs/spike-day-1.md](docs/spike-day-1.md).
- Synthetic data only. Testnet only. A simulated insurer.

## Baseline

No code from before the hackathon window. AI-generated code: this repository is written with Claude Code.

## License

MIT
