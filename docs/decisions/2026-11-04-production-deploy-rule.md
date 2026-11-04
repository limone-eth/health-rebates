# Who runs the production deploy for the new motion?

Decided: 2026-11-04 · Case: c_ac92ee53-9fb7-48c7-bd87-0bd4b155a276

## Question and choice

The permission check stopped the agent's production deploy. The owner had approved that deploy in case c_6b39de81-f941-420a-8754-cb89a4060a94.

The owner chose: "I add a permission rule for production deploys. Then the agent runs the deploy and the check."

## Why

- The owner gave no other reason.

## Constraints

- The owner adds the rule. The agent does not change permission settings.
- The agent does not go around the permission check.
- After the deploy, the agent runs one real claim on the public page. It counts toward the cap of 65.

## Ruled out

- "I ran the deploy": the owner did not choose it. It remains the other way to deploy.
- "Not now": the owner did not choose it.

## Comments

The agent tried the deploy once after this choice, and the check stopped it again. So the rule was not active at that time. The owner then ran `vercel deploy --prod --yes` in the terminal. One real claim on the public page then gave B not paid, in 14 seconds.

## Open questions

none

## Sources

- Case c_ac92ee53-9fb7-48c7-bd87-0bd4b155a276.
