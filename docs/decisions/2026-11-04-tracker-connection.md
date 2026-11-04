# Should we build a tracker connection before the deadline?

Decided: 2026-11-04 · Case: c_9f082008-dac2-4d2c-93d4-f3ddfc2d1cf1

Closes the tracker question in [the own data record](2026-11-04-own-data.md).

## Question and choice

A tracker connection needs a real Open Wearables instance and accounts with device makers.

The owner chose: "Build the tracker connection now. You create the Open Wearables instance and the device maker accounts."

## Why

- The owner gave no other reason.
- I recommended CSV only. The owner did not choose it.

## Constraints

- The agent does not create accounts or sign in for the owner. The ask addressed "You" to the owner, but its other option used "I" for the owner. So the agent must confirm who does this.
- The agent never prints or commits a key from these accounts.
- The deadline stays 14 Nov 2026, 23:59 UTC. The CSV upload stays the fallback.
- Each claim counts toward the cap of 65.

## Ruled out

- "Keep CSV only, and mark the tracker as later work": the owner did not choose it.

## Comments

none

## Open questions

- Which device maker to start with.
- Where the Open Wearables instance runs. It is self-hosted, and Vercel functions cannot run it.
- Whether tracker data can get a real wearable proof, or has the same limit as an upload.

## Sources

- Case c_9f082008-dac2-4d2c-93d4-f3ddfc2d1cf1.
- https://github.com/the-momentum/open-wearables
- `README.md:38`, `wearable/server.mjs`.
