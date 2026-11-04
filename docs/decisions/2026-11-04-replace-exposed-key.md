# How do we replace the two testnet keys that I exposed?

Decided: 2026-11-04 · Case: c_37ff3ea6-3b0c-43f1-93b4-e3d34f0fa902

## Question and choice

The agent printed the dev testnet key and the wearable signing key in a session by mistake. Neither key went into git.

The owner chose: "Replace the dev account key and keep the pool. The exposed wearable key stays valid on this pool."

## Why

- The owner gave no other reason.
- My reasons for the option: the pool and the current results stay.

## Constraints

- The agent replaced the key on the dev account and on the pool account, because both held the same key. Each account now holds only the new key.
- The new key was not printed.
- The wearable key stays the same on this pool. The contract fixes it when the pool is created.
- Anyone with the wearable key can sign wearable data for this pool. So this pool cannot prove that the data came from the wearable service.
- The agent does not read the key file, even with a mask.

## Ruled out

- "New account and new pool": the owner did not choose it. It remains the way to replace the wearable key.
- "Keep both keys": the owner did not choose it.

## Comments

none

## Open questions

- The old member accounts still hold the old key. They hold only small test balances, and they cannot pay from the pool or approve a held claim.

## Sources

- Case c_37ff3ea6-3b0c-43f1-93b4-e3d34f0fa902.
- `contract/src/pool.rs:66`, `contract/src/pool.rs:215`.
