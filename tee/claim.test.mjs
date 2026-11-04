import assert from "node:assert/strict";
import { test } from "node:test";
import { BASELINE_WEEK, CLAIM_WEEK, daysInRange, MEMBERS } from "../wearable/data.mjs";
import { buildClaimRequest, buildExplanationRequest, decide, parseResult, summarizeBaseline, toRows } from "./claim.mjs";

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
