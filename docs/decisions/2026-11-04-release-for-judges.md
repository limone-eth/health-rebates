# How do we make the repo ready for the judges?

Decided: 2026-11-04 · Case: c_98ff9788-1b57-4238-892f-840dd176f338

## Question and choice

The repo was private, and main held only the first commit. So the judges could not read or clone the code.

The owner chose "Merge and publish now": "I merge PRs 1 to 5 in order, then make the repo public. Later fixes go in as new PRs."

The docs named the brand that the look comes from. The owner chose to remove the name, and to squash each PR at the merge. The look stays.

## Why

- The owner chose these options in Waggle, and gave no other reason.
- My reasons: judges must be able to use the code from the README, and the owner wants one product with no link to another company.

## Constraints

- The repo names no other brand. This covers the files, the commits on main and the PR text.
- The look and the design values stay public, in `web/public/styles.css` and `docs/design/rebates.op`.
- Later fixes go in as new PRs.
- No key goes in the repo. The check of all history before the release found none.

## Ruled out

- "Merge now, publish later": the owner wants it public now.
- "Wait for your review": it leaves less buffer before the deadline.
- "Keep the records as is": it names the brand in a public hackathon repo.
- "Also remove rebates.op": the CSS holds the same values, and the repo loses its design source.

## Comments

none

## Open questions

- Product name. "Good Week" is only a placeholder.

## Sources

- Case c_98ff9788-1b57-4238-892f-840dd176f338.
- `docs/decisions/2026-11-03-brand-look.md`, `docs/TASKS.md`, `PRODUCT.md`.
