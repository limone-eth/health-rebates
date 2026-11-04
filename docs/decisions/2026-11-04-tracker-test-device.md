# Which tracker can the owner test, and who adds the keys?

Decided: 2026-11-04 · Case: c_00db7c29-803b-4e24-8db2-0b79d2c0d7f8

Follows [the tracker setup record](2026-11-04-tracker-setup.md). Closes its open question on devices.

## Question and choice

The connection needs developer apps and keys, and a real test needs a device.

The owner chose: "I own a Whoop. I create the Whoop app and add its keys. Oura stays hidden unless I also add its keys."

## Why

- The owner gave no other reason.
- My reason for the rule: a link shows in production only for a device maker that passes a real test.

## Constraints

- The owner creates the Whoop app and adds `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET` to Vercel production.
- The agent never sees or prints these keys.
- The owner signs in to Whoop for the real test. The agent does not sign in for the owner.
- The Oura link stays hidden unless the owner adds the Oura keys. The Oura code stays in the repo, with tests only.
- The owner runs the merge and the production deploy. The safety check blocks the agent from both.

## Ruled out

- "I own both": the owner did not choose it.
- "I own an Oura ring": the owner did not choose it.
- "I own neither device": the owner has a Whoop.

## Comments

none

## Open questions

- Whether the Sandbox limit of 10 Whoop members is enough for the judges. The CSV upload stays the fallback.
- Whether the owner's Whoop account has at least 14 days that pass the checks. Whoop's API marks `step_count` as optional, and a day with no steps is dropped.

## Sources

- Case c_00db7c29-803b-4e24-8db2-0b79d2c0d7f8.
- https://github.com/limone-eth/health-rebates/pull/9
- `web/trackers.mjs`, `web/upload.mjs`.
