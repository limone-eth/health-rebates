# Which design do we use for the web app?

Decided: 2026-11-03 · Case: c_694e5360-2763-4c6b-814a-b939c277945f

## Question and choice

I asked if the owner likes the mail-in rebate coupon as the design. The owner did not choose the coupon. The owner asked me to use the owner's own brand guidelines, and wrote: "make it very premium polished editorial?"

I then asked how much of that brand to use. The owner chose the look only: its type, color and layout rules, with no name or logo in the app.

The owner also wrote: "instantiate design system in open pencil".

## Why

- The owner wants a "very premium polished editorial" look.
- The owner said earlier that this is a separate project from that brand. So judges must see one product, with no link to a company that is not in the entry.
- My reason: the guidelines already hold a paper ticket "torn at the middle". The perforation can show the wall between the member and the insurer, so the idea and the brand use one shape.

## Constraints

- No name, logo, wordmark, characters, member stories or photographs from that brand, anywhere in the repo. See [the release record](2026-11-04-release-for-judges.md).
- Copy only design values to the repo: colors, type, spacing and timing. Do not copy guideline text or images, because that site is behind a login.
- Type: Switzer for words, Geist Mono for data labels, Doto for one live number per view.
- No bold for emphasis. Two tones: ink for the point, grey for the context.
- Paper page, ink text, hairlines. One accent in each view. There is no photograph here to give the accent, so the accent is ember and it marks only the tear line and errors.
- One primary button in each view. Chosen items use the glass lens, not ink.
- Never under 44 px to touch. No bounce, spin, glow, scan effects or medical blue.
- The app stays consumer friendly and easy to understand, from "PRODUCT.md".
- WCAG 2.2 AA. Grey `#686B72` is for large text; small text on paper uses `#55575D`.
- All facts in "PRODUCT.md" stay true.

## Ruled out

- Coupon with Bricolage Grotesque and Figtree: it is not the requested look.
- The brand's look and name: the project is separate from that brand.
- Photographs of life under the system layer, as the guidelines ask for heroes: we have no licensed images, and the guidelines say that a stand-in is not permitted.

## Comments

- "for brand and design use /impeccable /better-ui and OpenPencil": still in force. The design system goes in OpenPencil first.

## Open questions

- Does the owner approve the ticket screens? I send them for review.
- The repo copies some design values from that brand. The owner accepted this for a public repo. See [the release record](2026-11-04-release-for-judges.md).
- Product name. "Good Week" is only a placeholder.

## Sources

- Case c_694e5360-2763-4c6b-814a-b939c277945f.
- The owner's brand guidelines, which are behind a login.
- `PRODUCT.md`.
