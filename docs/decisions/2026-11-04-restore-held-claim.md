# How do you want to put member C back on hold for the video?

Decided: 2026-11-04 · Case: c_f3d4ba66-2e23-4c24-9365-d41eeebb4c4f

## Question and choice

The live test approved member C on testnet, so the insurer screen showed no held claim. The owner chose "Test Decline, then restore hold": "Run a live claim for C, click Decline, then run one more live claim for C. C ends on hold, and all buttons are tested."

## Why

- The owner gave no reason in words, and chose the recommended option.
- My reason: it closes the last open button test before the video, and C ends in the state that the video needs.

## Constraints

- `web/state.json` must end with member C held, so that the insurer screen shows the review buttons.
- A click on "Approve and pay" or "Decline" changes C's result on testnet. To show the hold again, run a new live claim for C.
- Synthetic data and testnet only.

## Ruled out

- "Restore hold only": Decline could fail for the first time during the video.
- "Leave C as paid for now": a clean copy shows no held claim until the hold is restored.

## Comments

none

## Open questions

none

## Sources

- Case c_f3d4ba66-2e23-4c24-9365-d41eeebb4c4f.
- Browser run on 2026-11-04: A was paid, C was approved, C was declined, and C ended held, with no console errors.
- The app's insurer API after the run: A Paid, B NotPaid, C Held. Pool totals: 4 paid, 2 not paid, 3 held, 1 rejected.
