# Product

## Register

Operate: a person runs a claim and reads a result. It is an app, not a marketing page.

## Users

- **Hackathon judges**, who watch a video under 2 minutes or run the app from the README. They must understand the idea in seconds, and they check the claims.
- **A simulated insurer**, who sees results, proof, payouts and totals, and no health data.
- **Three synthetic members (A, B, C)**, who see their own week, the result and an explanation.

## Product purpose

An insurer pays health rebates for healthy weeks and never sees the member's health data. A TEE-hosted model on NEAR AI Cloud returns a signed result. A NEAR testnet contract checks two signatures, then pays, refuses or holds the claim.

Success: a judge sees the same week from two sides. The member sees the data. The insurer sees only the result and the proof.

## Brand personality

Warm, plain and easy to understand: a consumer product, not a technical tool. A person understands each screen with no knowledge of TEEs or blockchains. It stays honest: it says what it proved and what it did not prove.

Premium, polished and editorial, as the owner asked. The look follows the owner's brand guidelines, with no name or logo from that brand. See [the record](docs/decisions/2026-11-03-brand-look.md).

## Anti-references

- Crypto dashboards: dark ground, neon accent, glowing edges.
- Generic wellness apps: soft pastels, rings and streaks with no personality.
- Developer tools: hashes, addresses and jargon on the first screen.
- Insurance portals: stock photos and blue forms.

## Design principles

1. Show the wall between the two views. What the insurer does not see is the product.
2. Plain words first, proof one tap away. "Verified" opens to each check that passed, and the checks that did not run stay visible.
3. Real results only. A result from an earlier run says so.
4. A claim takes time. Each step of a live claim shows as it finishes.
5. Synthetic data and testnet are labelled wherever a person can mistake them for real.

## Design tools

Impeccable, Better UI and OpenPencil, as the owner asked.

## Facts that must stay true

- Do not say "the TEE checks the rule". Code outside the TEE marks each day. The model counts the marks and does the pattern check.
- We check which compose file the TEE started and that its GPUs are genuine. We do not prove that the software in it is safe: we have no trusted list of images, and the compose file starts a manager that can start other containers later.
- Transaction arguments are public: `days_met` and the pattern result are public, under a pseudonymous account.
- Synthetic data, testnet tokens, a simulated insurer.

## Platform

web

## Stack

A Node server with no framework, and plain HTML, CSS and JavaScript with no build step. Live claims run on one machine with keys, or on the hosted copy on Vercel, up to a claim cap. With no keys, the hosted copy is read-only. It is deployed from the CLI, and `.vercelignore` is an allow-list of the files that it can upload.

## Accessibility & Inclusion

WCAG 2.2 AA. Outcomes do not depend on color alone. Motion respects `prefers-reduced-motion`.
