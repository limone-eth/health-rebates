# Demo video script

Target: 1:50. The limit is 2 minutes. Speak about 240 words.

## Before you record

1. Run the app on your machine with keys: `cd web && npm start`. The top of the member screen must not say that live claims are off.
2. Open http://localhost:3000/#insurer. Check that member C says "Held for your review". If not, run a claim for C on the member screen.
3. Set the browser to 1440 by 900, with no other tabs or bookmarks in view.
4. Close any window that shows `.env` or a key.

## Script

| Time | On screen | Say |
|---|---|---|
| 0:00 | Member A, top of the page | "An insurer wants to reward your healthy weeks. Today, that means it gets your steps, your sleep and your heart rate. This demo pays the rebate, and the insurer never gets that data." |
| 0:15 | Point at the week, then at "All your insurer sees" | "This is A's ticket. On the left: the real week, which only A sees. On the right: the part that the insurer gets. Six good days, a usual week, and the rebate." |
| 0:30 | Press "Run a live claim". Let the steps show. Cut the wait in the edit, and show the cut. | "This is a real claim. A model runs on NEAR AI Cloud, in a sealed machine. Intel confirms the machine before any data goes in. The model counts the good days and signs its answer." |
| 0:55 | The result arrives | "A NEAR contract checks two signatures: the model's and the wearable service's. Then it pays, with no person in the loop." |
| 1:05 | Press "Insurer" at the top. The ticket stub moves across. | "Here is the same week from the insurer's side. It has the result and the proof. It has no health data. A test checks this on each insurer response." |
| 1:18 | Press "Verified" on member A | "Verified opens each check. It also says what we did not prove. We do not prove that the software in the machine is safe. And some facts are public, under a made-up name." |
| 1:32 | Scroll to member C | "C's numbers meet the goal, but the week does not look like C's own. C maybe lent the watch. The contract holds the claim, and the insurer decides, still with no health data." |
| 1:44 | Press "Approve and pay", if you have the time. Otherwise stay on C. | "Synthetic data, test tokens, a simulated insurer. The code and the limits are in the README." |

## After you record

If you approved or declined C's claim, run a new claim for C on the member screen. Then C is held again. A new live run changes `web/state.json`: commit that file, then run `vercel deploy --prod` again so that the hosted copy names the new accounts.

## Words to avoid

- Do not say "the TEE checks the rule". Code outside the sealed machine marks each day. The model counts the marks and does the pattern check.
- Do not say that the data is fully private. Testnet transaction arguments are public: good days and the pattern result, under a made-up name.
- Do not say that the software is verified.
