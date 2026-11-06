# Demo video script

Target: 1:50. The limit is 2 minutes. Speak about 250 words.

## Before you record

1. Run the app on your machine with keys: `cd web && npm start`. The top of the member screen must not say that live claims are off.
2. Open http://localhost:3000/#insurer. Check that member C says "Held for your review". If not, run a claim for C on the member screen.
3. Set the browser to 1440 by 900, with no other tabs or bookmarks in view.
4. Close any window that shows `.env` or a key.

## Script

| Time | On screen | Say |
|---|---|---|
| 0:00 | Member A, top of the page | "Programs like Vitality already pay for healthy habits, but the program collects your steps, sleep and lab results. This demo pays the rebate, and no one stores that data." |
| 0:15 | Point at the week, then at "All your insurer sees" | "This is A's ticket. Only A sees the week. The insurer gets the right side: six good days, a usual week, and the rebate." |
| 0:28 | Press "Run a live claim". Let the steps show. | "The wearable service applies the rule in plain code and signs the result. A's new account has 0 NEAR: A signs the claim, and the insurer relays it and pays the gas." |
| 0:45 | The result arrives | "The NEAR contract checks the signature and pays 10 test dollars." |
| 0:52 | Scroll to "Lab rebate". Choose "0.4 points better", then "Run the lab claim". | "Once a year, there is a lab rebate. The report goes to a model in a sealed machine on NEAR AI Cloud. The model only reads the HbA1c values, and signs its answer. Plain code applies the rule." |
| 1:10 | The lab result arrives. Open "What the model read". | "Only A sees the values. The chain gets two hashes and the result. The contract checks the model's signature and the service's signature, then pays." |
| 1:22 | Press "Insurer" at the top. Scroll to "Lab claims". | "Here is the insurer's side. It has the results and the proof. It has no health data and no report." |
| 1:32 | Open "What you trust" | "This table says what each party sees and can fake. A lab PDF can be edited, and trackers do not sign their data. Signed lab reports and zkTLS are the next steps." |
| 1:45 | Scroll to member C on the insurer screen | "C's numbers meet the goal, but the week does not look like C's own. The contract holds the claim for a person to review. Synthetic data, test tokens, a simulated insurer. The code and the limits are in the README." |

## After you record

If you approved or declined C's claim, run a new claim for C on the member screen. Then C is held again. A new live run changes `web/state.json`: commit that file, then run `vercel deploy --prod` again so that the hosted copy names the new accounts.

## Words to avoid

- Do not say "the TEE checks the rule". Plain code applies both rules, outside the sealed machine. The model only reads the lab values.
- Do not say that the data is fully private. Testnet transaction arguments are public: good days, the pattern result and the lab result, under a made-up name.
- Do not say that insurers see raw data today. The sources say that the program collects it. In one case, the insurer got only a status level.
- Do not say that the software is verified.
