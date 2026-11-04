# Which titles do you want on the member and insurer screens?

Decided: 2026-11-04 · Case: c_89622b51-a78b-4d3d-b052-628d74eefbc6

## Question and choice

The owner chose these titles:

- Member: "Health that pays," / "without giving up your data."
- Insurer: "Health that pays," / "without holding health data."

The owner also chose "Remove the good-day line too" for the member ticket. The good-day line and the summary now open from "Why this result".

## Why

- The owner wrote the title idea: "Health that pays", then "health that pays, without ...".
- The owner asked for the insurer title to be "more based also on the first decision". I read this as a request to follow the member title.
- The owner marked the ticket text: "too much text maybe?"
- My reason: the two screens show one idea from two sides, which is simple to follow in a short demo video.

## Constraints

- The title stays the same for each member and each result. The ticket shows paid, not paid or held.
- Do not claim that nobody saw any data. The good-day count and the pattern result are public, under a made-up name.
- The text beside the member title keeps the exact fact: the insurer never sees steps or sleep.
- The member can still read the good-day rule and the summary, one tap away.
- All constraints in `docs/decisions/2026-11-04-screen-layout.md` stay true.

## Ruled out

- Member "Your good week paid off." / "Your data stayed yours.": the owner asked for a different direction.
- Member "You earned your rebate." and "Healthy week. Rebate paid.": the owner did not choose them.
- Member "Get your rebate." / "Keep your data.": the owner moved from this idea to "Health that pays".
- Member "You got your rebate." and "Your rebate is here.": the owner did not choose them.
- Member "without sharing your steps or sleep.": longer, and it repeats the text beside the title.
- Member "without sharing your health data.": less exact, because the good-day count is public.
- A different member title for each result: the owner did not choose it.
- Insurer "One paid. One missed. One for you to review.": it did not follow the member title.
- Insurer "Two of three members met the goal.": it did not say that one member needs a review.
- Insurer "Reward health," and "Pay for results,": they follow the member title less closely.

## Comments

- "Get your rebate... or something like that": I sent options in this direction.
- "too much text maybe?", on the rule and the summary: I moved both behind "Why this result".
- "or \"Health that pays\"?": I tried it in the real app and sent new screenshots.
- "health that pays, without ...": I sent three endings.
- "more based also on the first decision": I sent insurer titles that follow the member title.

## Open questions

- On member B, the title says "pays" and the ticket says "Not paid". The owner saw this in the screenshots and accepted the same title for each member.
- The comps in `docs/design/rebates.op` still show the earlier layout and titles.

## Sources

- Case c_89622b51-a78b-4d3d-b052-628d74eefbc6, which follows c_5f2902fb-530f-42a7-945d-f9b847904738.
- `PRODUCT.md`, `web/public/app.js`, `web/public/styles.css`.
- Real-app screenshots at 1440, 1100 and 390 px.
