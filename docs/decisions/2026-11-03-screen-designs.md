# Do you approve the member and insurer screen designs?

Decided: 2026-11-03 · Case: c_dadd3a91-1dd7-4e1d-8aef-97e03ae6baa7

## Question and choice

I asked the owner to approve the member and insurer screens. The owner chose "Approve": "Approve the shorter copy and the real app screens. Then I update the comps and continue with the docs and the PR."

The owner added: "we can revisit tomorrow". So this approval is for now, and the owner can change the screens tomorrow.

## Why

- The owner asked for less text about how it works: "i think it should be shorter? focuss on the benefit, not the feature".
- My reason: the first lines now give the benefit, and the proof stays one tap away, under Verified. This follows "Plain words first, proof one tap away" in `PRODUCT.md`.

## Constraints

- First lines give the benefit: "Rebate paid. Your data stayed yours." and "You pay for results, and hold no health data."
- Words about the model, signatures and keys stay under Verified, and do not go in the headline or the intro.
- The Verified panel keeps each check and each limit, in short words.
- All facts in `PRODUCT.md` stay true. The good-day count is public, so the copy does not say that the insurer or the public saw none of the data.
- A result from an earlier run says so: "Earlier real run, 3 Nov 2026".

## Ruled out

- "Request changes": the owner did not choose it, and can revisit tomorrow.
- "Your insurer paid, and never saw your health data." and the three-sentence intro: the owner asked for shorter copy about the benefit.
- "Rebate paid. Your insurer saw none of your data." and "Paid, and private.": not exact, because the good-day count is public.
- "Pay for results. Hold no health data.": stronger, but it reads like an advertisement.
- "You see the result and the proof. Nothing else.": it describes a feature.

## Comments

- "use /copywriting": I ran the copywriting skill and sent new copy.
- "i think it should be shorter? focuss on the benefit, not the feature": I shortened the copy on all screens, and moved the model's summary to the left column.
- "we can revisit tomorrow": I recorded the approval as open to change, and I continue with the comps, the docs and the PR.

## Open questions

- What does the owner want to revisit tomorrow?
- The model's summary is still long, because it comes from earlier runs. A shorter prompt needs new runs. Does the owner want that?
- Product name. "Good Week" is only a placeholder.

## Sources

- Case c_dadd3a91-1dd7-4e1d-8aef-97e03ae6baa7.
- `web/public/app.js`, `web/public/styles.css`, `PRODUCT.md`, `docs/design/rebates.op`.
