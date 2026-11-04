# Can you add a NEAR AI Cloud API key to the .env file?

Decided: 2026-11-03 · Case: c_501e5102-c36c-436b-99ac-17e2563091cf

## Question and choice
The day 1 spike needs a NEAR AI Cloud API key, and only the owner can create it. The owner chose: "I put the key in the .env file. Run the live spike now."

## Why
The signature format came from the docs only. A live run is the one check that can still change the go or no-go.

## Constraints
- The owner creates keys and accounts. The agent never prints or commits them.
- `.env` stays ignored by git.

## Ruled out
- "I add the key later": the owner added the key at once.
- "Do not continue with the NEAR build": the owner wants to build.

## Comments
- "where i can find the": the message stopped there. The owner then asked for the .env file to be opened, and it was opened. The answer also gives the place to create a key.

## Open questions
- The key works, but the account has no credits (HTTP 402). A live completion waits for credits.

## Sources
- Case c_501e5102-c36c-436b-99ac-17e2563091cf
- https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md
- [spike-day-1.md](../spike-day-1.md)
