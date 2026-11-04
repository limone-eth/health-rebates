import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASELINE_WEEK, CLAIM_WEEK, MEMBERS } from "./data.mjs";
import { countDaysMet, dayMeetsRule, RULE } from "./rule.mjs";
import { createWearableServer } from "./server.mjs";

const KEY = "test-key";
const byName = Object.fromEntries(Object.entries(MEMBERS).map(([id, member]) => [member.name, id]));
let server;
let base;

before(async () => {
  server = createWearableServer({ apiKey: KEY });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const get = (path, key = KEY) => fetch(`${base}${path}`, { headers: key ? { "X-Open-Wearables-API-Key": key } : {} });

async function days(name, kind, { start, end }) {
  const res = await get(`/api/v1/users/${byName[name]}/summaries/${kind}?start_date=${start}&end_date=${end}`);
  assert.equal(res.status, 200);
  return (await res.json()).data;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

test("a fetch returns 7 days per member for the claim week", async () => {
  for (const name of ["A", "B", "C"]) {
    assert.equal((await days(name, "activity", CLAIM_WEEK)).length, 7);
    assert.equal((await days(name, "sleep", CLAIM_WEEK)).length, 7);
  }
});

test("the baseline has 28 days per member", async () => {
  for (const name of ["A", "B", "C"]) {
    assert.equal((await days(name, "sleep", BASELINE_WEEK)).length, 28);
  }
});

test("the rule gives the expected result for each member", async () => {
  const met = async (name) => countDaysMet(await days(name, "activity", CLAIM_WEEK), await days(name, "sleep", CLAIM_WEEK));
  assert.equal(await met("A"), 6);
  assert.equal(await met("B"), 3);
  assert.equal(await met("C"), 6);
  assert.ok((await met("A")) >= RULE.minDays);
  assert.ok((await met("B")) < RULE.minDays);
});

test("only C's claim week differs from the member's own baseline", async () => {
  for (const [name, shouldDiffer] of [["A", false], ["B", false], ["C", true]]) {
    const baseline = await days(name, "sleep", BASELINE_WEEK);
    const claim = await days(name, "sleep", CLAIM_WEEK);
    const bpmGap = Math.abs(mean(claim.map((d) => d.avg_heart_rate_bpm)) - mean(baseline.map((d) => d.avg_heart_rate_bpm)));
    const hrvGap = Math.abs(mean(claim.map((d) => d.avg_hrv_rmssd_ms)) - mean(baseline.map((d) => d.avg_hrv_rmssd_ms)));
    assert.equal(bpmGap > 8, shouldDiffer, `${name} sleep heart rate gap ${bpmGap}`);
    assert.equal(hrvGap > 15, shouldDiffer, `${name} HRV gap ${hrvGap}`);
  }
});

test("the data is the same on each run", async () => {
  const first = await days("A", "activity", CLAIM_WEEK);
  const second = await days("A", "activity", CLAIM_WEEK);
  assert.deepEqual(first, second);
  assert.equal(first[0].date, CLAIM_WEEK.start);
});

test("the response has the Open Wearables envelope, and pages with a cursor", async () => {
  const path = `/api/v1/users/${byName.A}/summaries/activity?start_date=${CLAIM_WEEK.start}&end_date=${CLAIM_WEEK.end}&limit=4`;
  const first = await (await get(path)).json();
  assert.equal(first.data.length, 4);
  assert.deepEqual(first.pagination, { next_cursor: "4", previous_cursor: null, has_more: true, total_count: 7 });
  assert.equal(first.metadata.sample_count, 4);
  const second = await (await get(`${path}&cursor=${first.pagination.next_cursor}`)).json();
  assert.equal(second.data.length, 3);
  assert.equal(second.pagination.has_more, false);
});

test("the service rejects bad requests", async () => {
  const path = `/api/v1/users/${byName.A}/summaries/sleep`;
  const range = `start_date=${CLAIM_WEEK.start}&end_date=${CLAIM_WEEK.end}`;
  assert.equal((await get(`${path}?${range}`, null)).status, 401);
  assert.equal((await get(`${path}?${range}`, "wrong")).status, 401);
  assert.equal((await get(path)).status, 422);
  assert.equal((await get(`${path}?start_date=nope&end_date=${CLAIM_WEEK.end}`)).status, 422);
  assert.equal((await get(`${path}?${range}&limit=0`)).status, 422);
  assert.equal((await get(`/api/v1/users/unknown/summaries/sleep?${range}`)).status, 404);
  assert.equal((await get(`${path}?start_date=2026-02-31&end_date=${CLAIM_WEEK.end}`)).status, 422);
});

test("a path that is not a valid URL gets 400, and the service keeps running", async () => {
  assert.equal((await get("//")).status, 400);
  assert.equal((await get("/mock/members")).status, 200);
});

test("the rule applies each limit at its exact value", () => {
  const day = (steps, moderate, vigorous, sleep) => [
    { steps, intensity_minutes: { moderate, vigorous } },
    { duration_minutes: sleep },
  ];
  assert.equal(dayMeetsRule(...day(RULE.minSteps, 10, 10, RULE.minSleepMinutes)), true);
  assert.equal(dayMeetsRule(...day(RULE.minSteps - 1, 10, 10, RULE.minSleepMinutes)), false);
  assert.equal(dayMeetsRule(...day(RULE.minSteps, 10, 9, RULE.minSleepMinutes)), false);
  assert.equal(dayMeetsRule(...day(RULE.minSteps, 10, 10, RULE.minSleepMinutes - 1)), false);
  assert.deepEqual(
    [RULE.minSteps, RULE.minRaisedHeartRateMinutes, RULE.minSleepMinutes, RULE.minDays, RULE.days],
    [7000, 20, 420, 5, 7],
  );
});

test("a day with no sleep summary does not meet the rule", () => {
  const activity = { date: "2026-11-02", steps: 9000, intensity_minutes: { moderate: 30, vigorous: 10 } };
  assert.equal(countDaysMet([activity], []), 0);
});

test("the member list does not hold health data", async () => {
  const members = await (await get("/mock/members", null)).json();
  assert.deepEqual(members.map((m) => m.name), ["A", "B", "C"]);
  assert.deepEqual(Object.keys(members[0]), ["id", "name", "expected"]);
});
