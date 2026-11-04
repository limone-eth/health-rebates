# Which tracker setup should I build first?

Decided: 2026-11-04 · Case: c_a449e831-2f3e-43d1-addf-116c0b70ce24

Follows [the tracker record](2026-11-04-tracker-connection.md). Changes its "Open Wearables instance" part.

## Question and choice

The owner chose two options:

- "Build Whoop and Oura. Leave Garmin out, because a new connection has no history."
- "Connect the app to each device maker by OAuth, on Vercel, with no Open Wearables instance."

## Why

- The owner said: "Whoop + Oura + Garmin, if they are easy tos etup".
- The owner asked: "why garmin waits 14 days?". The rule needs 14 days. Garmin's Starter tier has "no historical data", so a device connected today reaches 14 days on 18 Nov, after the deadline. I did not confirm this reading in a detailed doc.
- My reason for direct OAuth: two small adapters are less work than 8 services.

## Constraints

- The owner creates each developer app and adds its keys. The agent never sees or prints them.
- The server keeps no tracker data and no tracker token after the claim.
- The Verified panel says what the second signature proves for tracker data.
- Whoop gives heart rate zones for workouts only, so "raised heart rate minutes" counts workouts only. The screen says this.
- A connection with fewer than 14 days gets a clear error, and the CSV stays available.
- Each claim counts toward the cap of 65.

## Ruled out

- "Build all three": a new Garmin connection cannot reach 14 days before the deadline.
- "Whoop only": the owner also wants Oura.
- "Run a real Open Wearables instance": the owner did not choose it. The README line about a real instance stays "not tried".

## Comments

- "Whoop + Oura + Garmin, if they are easy tos etup": I checked the docs and sent the result. Garmin is not easy.
- "why garmin waits 14 days?": I answered with the reason above.

## Open questions

- Which devices the owner has for a real test.
- Whether Whoop's first tier limit of 10 members is enough for the judges.

## Sources

- Case c_a449e831-2f3e-43d1-addf-116c0b70ce24.
- https://developer.whoop.com/docs/developing/app-approval
- https://developer.whoop.com/api
- https://developer.garmin.com/gc-developer-program/overview/
- https://support.ouraring.com/hc/en-us/articles/4415266939155-The-Oura-API
