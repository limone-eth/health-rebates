import assert from "node:assert/strict";
import { test } from "node:test";
import { BASELINE_WEEK, CLAIM_WEEK, daysInRange, MEMBERS } from "../wearable/data.mjs";
import { buildClaimRequest, buildExplanationRequest, decide, evaluateWeek, explainResult, parseResult, summarizeBaseline, toRows } from "./claim.mjs";

const idOf = (name) => Object.keys(MEMBERS).find((id) => MEMBERS[id].name === name);
const rows = (name, { start, end }) =>
  toRows(daysInRange(idOf(name), "activity", start, end), daysInRange(idOf(name), "sleep", start, end));

test("a row adds moderate and vigorous minutes and reads bedtime after noon", () => {
  const [row] = toRows(
    [{ date: "2026-11-02", steps: 8000, intensity_minutes: { moderate: 15, vigorous: 7 }, heart_rate: { avg_bpm: 70 } }],
    [{ date: "2026-11-02", duration_minutes: 450, avg_heart_rate_bpm: 55, avg_hrv_rmssd_ms: 60, start_time: "2026-11-01T22:30:00.000Z" }],
  );
  assert.equal(row.raised_heart_rate_minutes, 22);
  assert.equal(row.bedtime_minutes_after_noon, 630);
});

test("a bedtime after midnight sorts later than one before midnight", () => {
  const bedtime = (start_time) =>
    toRows([{ date: "d" }], [{ date: "d", start_time }])[0].bedtime_minutes_after_noon;
  assert.ok(bedtime("2026-11-02T01:00:00.000Z") > bedtime("2026-11-01T23:00:00.000Z"));
});

test("meets_rule on each row gives the expected count for each member", () => {
  const count = (name) => rows(name, CLAIM_WEEK).filter((row) => row.meets_rule).length;
  assert.deepEqual([count("A"), count("B"), count("C")], [6, 3, 6]);
});

test("a day with no sleep summary gives no row", () => {
  assert.deepEqual(toRows([{ date: "2026-11-02" }], []), []);
});

test("the baseline summary covers each body signal", () => {
  const summary = summarizeBaseline(rows("A", BASELINE_WEEK));
  assert.equal(summary.days, 28);
  assert.ok(summary.sleep_bpm.min <= summary.sleep_bpm.mean && summary.sleep_bpm.mean <= summary.sleep_bpm.max);
});

test("C's claim week is outside the baseline, and A's is inside", () => {
  const outside = (name) => {
    const baseline = summarizeBaseline(rows(name, BASELINE_WEEK));
    return rows(name, CLAIM_WEEK).filter((row) =>
      ["sleep_bpm", "hrv_rmssd_ms", "bedtime_minutes_after_noon", "day_bpm"].filter(
        (key) => row[key] < baseline[key].min || row[key] > baseline[key].max,
      ).length >= 2,
    ).length;
  };
  assert.equal(outside("A"), 0);
  assert.equal(outside("C"), 7);
});

test("the claim request sends no member ID or device, and no reasoning", () => {
  const request = buildClaimRequest("m", rows("A", BASELINE_WEEK), rows("A", CLAIM_WEEK));
  const text = JSON.stringify(request);
  assert.equal(request.reasoning_effort, "none");
  assert.equal(request.response_format.json_schema.strict, true);
  assert.ok(!text.includes(idOf("A")));
  assert.ok(!text.includes("Mock Watch"));
  assert.ok(!text.includes("mock-aa"));
});

test("parseResult accepts only the exact shape", () => {
  assert.deepEqual(parseResult('{"days_met":5,"pattern_matches_owner":true}'), {
    days_met: 5,
    pattern_matches_owner: true,
  });
  assert.throws(() => parseResult('{"days_met":8,"pattern_matches_owner":true}'));
  assert.throws(() => parseResult('{"days_met":5.5,"pattern_matches_owner":true}'));
  assert.throws(() => parseResult('{"days_met":5,"pattern_matches_owner":"yes"}'));
  assert.throws(() => parseResult('{"days_met":5,"pattern_matches_owner":true,"note":"x"}'));
  assert.throws(() => parseResult('{"days_met":5}'));
});

test("decide pays, refuses and holds", () => {
  assert.equal(decide({ days_met: 5, pattern_matches_owner: true }), "paid");
  assert.equal(decide({ days_met: 4, pattern_matches_owner: true }), "not paid");
  assert.equal(decide({ days_met: 6, pattern_matches_owner: false }), "held for review");
  assert.equal(decide({ days_met: 3, pattern_matches_owner: false }), "not paid");
});

test("the explanation request is plain text, not a claim", () => {
  const request = buildExplanationRequest("m", [], { days_met: 5, pattern_matches_owner: true });
  assert.equal(request.response_format, undefined);
  assert.equal(request.reasoning_effort, "none");
});

// Plain code decides a wearable claim. These cases follow the rules that the model prompt gave.
const base = { sleep_bpm: 55, hrv_rmssd_ms: 60, bedtime_minutes_after_noon: 630, day_bpm: 70 };
const baselineRows = [
  { ...base, sleep_bpm: 50, hrv_rmssd_ms: 50, bedtime_minutes_after_noon: 600, day_bpm: 65 },
  { ...base, sleep_bpm: 60, hrv_rmssd_ms: 70, bedtime_minutes_after_noon: 660, day_bpm: 75 },
];
const day = (overrides = {}) => ({ meets_rule: true, steps: 9000, sleep_minutes: 450, ...base, ...overrides });
const week = (count, make) => Array.from({ length: 7 }, (_, index) => (index < count ? make() : day()));

test("evaluateWeek counts the rows where meets_rule is true", () => {
  const rows = week(3, () => day({ meets_rule: false }));
  assert.equal(evaluateWeek(baselineRows, rows).days_met, 4);
});

test("evaluateWeek gives the exact result shape", () => {
  assert.deepEqual(parseResult(JSON.stringify(evaluateWeek(baselineRows, week(0)))), {
    days_met: 7,
    pattern_matches_owner: true,
  });
});

test("two body signals out on most days sets pattern_matches_owner to false", () => {
  const out = () => day({ sleep_bpm: 70, hrv_rmssd_ms: 30 });
  assert.equal(evaluateWeek(baselineRows, week(4, out)).pattern_matches_owner, false);
});

test("two body signals out on three of seven days is not most days", () => {
  const out = () => day({ sleep_bpm: 70, hrv_rmssd_ms: 30 });
  assert.equal(evaluateWeek(baselineRows, week(3, out)).pattern_matches_owner, true);
});

test("one body signal out on each day keeps pattern_matches_owner true", () => {
  assert.equal(evaluateWeek(baselineRows, week(7, () => day({ day_bpm: 90 }))).pattern_matches_owner, true);
});

test("steps and sleep length do not count as body signals", () => {
  const rows = week(7, () => day({ steps: 30000, sleep_minutes: 600, sleep_bpm: 70 }));
  assert.equal(evaluateWeek(baselineRows, rows).pattern_matches_owner, true);
});

test("a value equal to the baseline min or max is inside", () => {
  const rows = week(7, () => day({ sleep_bpm: 60, hrv_rmssd_ms: 50, bedtime_minutes_after_noon: 600, day_bpm: 75 }));
  assert.equal(evaluateWeek(baselineRows, rows).pattern_matches_owner, true);
});

test("each signal can be out above the max or below the min", () => {
  for (const [low, high] of [
    [{ sleep_bpm: 40 }, { hrv_rmssd_ms: 90 }],
    [{ bedtime_minutes_after_noon: 500 }, { day_bpm: 99 }],
  ]) {
    assert.equal(evaluateWeek(baselineRows, week(7, () => day({ ...low, ...high }))).pattern_matches_owner, false);
  }
});

test("evaluateWeek gives the expected result for each demo member", () => {
  const result = (name) => evaluateWeek(rows(name, BASELINE_WEEK), rows(name, CLAIM_WEEK));
  assert.deepEqual(result("A"), { days_met: 6, pattern_matches_owner: true });
  assert.deepEqual(result("B"), { days_met: 3, pattern_matches_owner: true });
  assert.deepEqual(result("C"), { days_met: 6, pattern_matches_owner: false });
  assert.deepEqual([result("A"), result("B"), result("C")].map(decide), ["paid", "not paid", "held for review"]);
});

test("explainResult gives the days and the decision in plain words", () => {
  assert.match(explainResult({ days_met: 6, pattern_matches_owner: true }), /6 of 7 days.*enough for the rebate/);
  assert.match(explainResult({ days_met: 3, pattern_matches_owner: true }), /3 of 7 days.*needs 5.*not paid/);
  assert.match(explainResult({ days_met: 6, pattern_matches_owner: false }), /a person will review it/);
  for (const result of [{ days_met: 6, pattern_matches_owner: false }, { days_met: 2, pattern_matches_owner: true }]) {
    assert.match(explainResult(result), /not your steps or sleep/);
  }
});
