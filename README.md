# Private insurer rebates

An insurer pays health rebates for healthy weeks, and never sees the member's health data.

Built for the [NEAR Hackathon](https://nearhackathon.com/) (tracks: Privacy & Private AI, Real-World Money).

**Status: day 1 spike.** The demo does not exist yet. See [docs/PLAN.md](docs/PLAN.md).

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

## NEAR tools used

- NEAR AI Cloud: model inference in a TEE, attestation, response signatures.
- NEAR testnet contract (`near-sdk`): `env::ecrecover`, `env::keccak256`, `env::sha256`.

## Limits

- NEAR AI Cloud runs the model in a TEE, not our code. A small service fetches the wearable data outside the TEE. The insurer never sees the data, but it trusts that service.
- A response signature proves that the TEE gave an answer. It does not prove which prompt the TEE got. See [docs/spike-day-1.md](docs/spike-day-1.md).
- Synthetic data only. Testnet only. A simulated insurer.

## Baseline

No code from before the hackathon window. AI-generated code: this repository is written with Claude Code.

## License

MIT
