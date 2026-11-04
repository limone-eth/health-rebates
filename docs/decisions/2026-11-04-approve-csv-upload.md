# Do you approve PR 8, the CSV upload, for production?

Decided: 2026-11-04 · Case: c_90a7a11a-9134-44d9-a683-382fcd9df785

## Question and choice

The owner reviewed PR 8, which lets a judge upload a CSV and run a real claim.

The owner chose: "Approve PR 8. I run the merge and the production deploy, and then you test one real upload on production."

## Why

- The owner gave no other reason.
- My reasons for the option: a real upload passed on a preview, and the web tests pass.

## Constraints

- The owner runs `gh pr merge 8 --squash` and `vercel deploy --prod --yes`. The safety check blocks the agent from both.
- The agent does not go around this check.
- The agent runs one real upload on production after the deploy, and then ticks the task.

## Ruled out

- "Do not merge PR 8": the owner did not choose it.

## Comments

none

## Open questions

- One real run took 152 seconds, and the next runs took 11 and 12 seconds. The cause is not known.
- The browser tests are not in the repo, so no test in the repo covers the bug in the picker.

## Sources

- Case c_90a7a11a-9134-44d9-a683-382fcd9df785.
- https://github.com/limone-eth/health-rebates/pull/8
