# Where does the private AI earn its place in Good Week?

Decided: 2026-11-06 · Case: c_346488d8-315e-48e6-9f1c-c7d6685af727

## Question and choice

The owner asked: "for structured data like whoop or so, building a zkproof would be enough?" The agent agreed for the current rule. The question was which changes to build before 14 Nov 2026.

The owner chose all five:

1. "Wearables as plain code": the wearable rule runs as plain code. Claims take seconds.
2. "Lab report reader": a lab report PDF or photo goes to the attested model. The insurer sees only met or not met.
3. "Stablecoin and meta transaction": pay the rebate in a test stablecoin. The member claims with no NEAR for gas.
4. "Real-world frame": compare with Vitality-style programs in the README, page and video.
5. "What you trust table": show the limits in the README and on the page.

## Why

- The owner: "i'm worried the private AI use case here is not relevant". Then: "how else we can make this idea credible, useful and aligned with what NEAR is asking?" Then: "is it a real use case in your opinion? or forced?"
- The model now applies two exact rules from its prompt (`tee/claim.mjs:8-19`). Plain code does this faster and with no mistakes. A production claim took 196 s, and the model used 189 s of it.
- Reading a lab report needs a model. Labs use different formats, names, units and languages. This fits the track text "Build intelligence without exposure".
- The Real-World Money track asks for "Something a normal company could use tomorrow", with stablecoins and meta transactions. No insurer pays rebates in NEAR.
- The agent's view on real or forced: the problem is real (insurers pay health rewards now and hold raw data). The pitch is "data minimisation for insurers", not "AI checks your steps". The chain payout is a public record that the insurer paid by its own rule.

## Constraints

- The wearable path (sample members, CSV upload, Whoop) uses plain code for the rule. No model call decides a wearable claim.
- The lab report goes only to an attested NEAR AI model. The server does not store it, and no value leaves the model in the result.
- The lab rule rewards a test and an improvement, not a good value: a test in the last 12 months, and HbA1c under 5.7% or 0.3 points better than the last test.
- The README and the page state the limits. A lab PDF can be edited, and Whoop does not sign its data.
- Do not say "the TEE checks the rule". NEAR AI Cloud runs the model in a TEE, not our code.
- The deadline is 14 Nov 2026, 23:59 UTC. Keep 1 to 2 days for the video, the X post and the form.

## Ruled out

- "Code for rule, AI for appeals": a smaller demo than lab reports.
- "Keep build, change pitch": a judge can say plain code does the same, and claims stay slow.
- "Plain code only, no AI": loses the Privacy and Private AI track.
- "ZK proof with zkTLS": too large for 8 days, and it leaves no AI. The trust table names zkTLS as a next step.
- NEAR Intents for a cross-chain payout: not needed for one insurer on one chain.

## Comments

- "would it make more sense if it's about blood tests values or other?": the agent proposed the lab report reader. The owner chose it.

## Open questions

- An image call with the response signature check is not tested yet. Day 1 tests it.
- Which test stablecoin on NEAR testnet: an existing token, or our own NEP-141 token.
- How a wearable claim is signed on chain when no model signs it. The contract now checks a NEAR AI signature.
- Whether PR 9 merges before this work, or this work builds on it.

## Sources

- Case c_346488d8-315e-48e6-9f1c-c7d6685af727.
- https://nearhackathon.com/ (tracks and judging).
- https://cloud-api.near.ai/v1/models: Qwen/Qwen3.8-27B, hosted by nearai, takes text and image.
- `tee/claim.mjs:8-19`, `web/live.mjs:53-104`.
- Production upload timing: [tx 9yLJznmi](https://testnet.nearblocks.io/txns/9yLJznmi4XAWdRt1V1QTGP6SNuBRcHioVHe2TaonYMGL).
