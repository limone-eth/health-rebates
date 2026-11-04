# Which NEAR testnet account do we use for the contract?

Decided: 2026-11-03 · Case: c_72c89418-87e3-428b-8629-7e89465ab019

## Question and choice
The contract work needs a NEAR testnet account for the deploy and the payouts. The owner chose: "I create a new testnet account only for this project. Its key stays in a local file that git ignores. It has only free testnet tokens."

## Why
The owner gave no reason in words. The agent's reasons: the tokens have no value, the account is only for this demo, and the testnet work does not stop.

## Constraints
- This is an exception to the rule "the owner creates wallet keys". It covers this testnet work only. It does not cover a mainnet account or any other project.
- The key stays in a local file that git ignores. The agent never prints or commits it.
- Free testnet tokens only.

## Ruled out
- "You create the testnet account and put its credentials on this machine": it needs the owner's time, and the testnet run waits until then.

## Comments
none

## Open questions
none

## Sources
- Case c_72c89418-87e3-428b-8629-7e89465ab019
- [TASKS.md](../TASKS.md), task 3
- [PLAN.md](../PLAN.md), the 10–11 Nov row
