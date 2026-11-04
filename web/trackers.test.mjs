import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeUrl, newState, ouraDays, readTrackerDays, TrackerError, whoopDays } from "./trackers.mjs";
import { UploadError, uploadFromTracker } from "./upload.mjs";

// These shapes come from the OpenAPI files of Whoop and Oura.
const whoopData = () => ({
  cycles: [
    { id: 7, start: "2026-11-02T23:10:00.000Z", end: "2026-11-03T22:40:00.000Z", timezone_offset: "+01:00", score_state: "SCORED", step_count: 9120, score: { strain: 9.1, kilojoule: 8000, average_heart_rate: 68.4, max_heart_rate: 150 } },
  ],
  sleeps: [
    { id: "nap", cycle_id: 7, start: "2026-11-03T13:00:00.000Z", timezone_offset: "+01:00", nap: true, score_state: "SCORED", score: { stage_summary: { total_light_sleep_time_milli: 600000, total_slow_wave_sleep_time_milli: 0, total_rem_sleep_time_milli: 0 } } },
    { id: "main", cycle_id: 7, start: "2026-11-02T23:10:00.000Z", timezone_offset: "+01:00", nap: false, score_state: "SCORED", score: { stage_summary: { total_light_sleep_time_milli: 14400000, total_slow_wave_sleep_time_milli: 5400000, total_rem_sleep_time_milli: 6000000 } } },
  ],
  recoveries: [{ cycle_id: 7, score_state: "SCORED", score: { resting_heart_rate: 52, hrv_rmssd_milli: 61.7 } }],
  workouts: [
    { start: "2026-11-03T17:00:00.000Z", timezone_offset: "+01:00", score_state: "SCORED", score: { zone_durations: { zone_zero_milli: 60000, zone_one_milli: 60000, zone_two_milli: 600000, zone_three_milli: 600000, zone_four_milli: 300000, zone_five_milli: 300000 } } },
    { start: "2026-11-03T20:00:00.000Z", timezone_offset: "+01:00", score_state: "PENDING_SCORE" },
  ],
});

const ouraData = () => ({
  activity: [{ day: "2026-11-03", steps: 8421, medium_activity_time: 1500, high_activity_time: 600 }],
  sleeps: [
    { day: "2026-11-03", type: "late_nap", total_sleep_duration: 1800, average_heart_rate: 60, average_hrv: 40, bedtime_start: "2026-11-03T14:00:00+01:00" },
    { day: "2026-11-03", type: "long_sleep", total_sleep_duration: 26100, average_heart_rate: 54.4, average_hrv: 48, bedtime_start: "2026-11-02T22:45:00+01:00" },
  ],
  heart: [
    { bpm: 70, source: "awake", timestamp: "2026-11-03T09:00:00+00:00" },
    { bpm: 80, source: "workout", timestamp: "2026-11-03T18:00:00+00:00" },
    { bpm: 50, source: "sleep", timestamp: "2026-11-03T03:00:00+00:00" },
  ],
});

test("Whoop data maps to one claim day", () => {
  assert.deepEqual(whoopDays(whoopData()), [
    { date: "2026-11-03", steps: 9120, raised_heart_rate_minutes: 30, sleep_minutes: 430, sleep_bpm: 52, hrv_rmssd_ms: 62, bedtime: "00:10", day_bpm: 68 },
  ]);
});

test("a Whoop cycle with no score, sleep or recovery gives no day", () => {
  for (const change of [(d) => (d.cycles[0].score_state = "PENDING_SCORE"), (d) => (d.cycles[0].end = undefined), (d) => (d.sleeps = []), (d) => (d.recoveries = [])]) {
    const data = whoopData();
    change(data);
    assert.deepEqual(whoopDays(data), []);
  }
});

test("Oura data maps to one claim day", () => {
  assert.deepEqual(ouraDays(ouraData()), [
    { date: "2026-11-03", steps: 8421, raised_heart_rate_minutes: 35, sleep_minutes: 435, sleep_bpm: 54, hrv_rmssd_ms: 48, bedtime: "22:45", day_bpm: 75 },
  ]);
});

test("an Oura day with no main sleep or no awake heart rate gives no day", () => {
  for (const change of [(d) => (d.sleeps = [d.sleeps[0]]), (d) => (d.heart = [d.heart[2]]), (d) => (d.sleeps[1].average_hrv = null)]) {
    const data = ouraData();
    change(data);
    assert.deepEqual(ouraDays(data), []);
  }
});

test("the state has the 8 characters that Whoop asks for, and differs each time", () => {
  assert.match(newState(), /^[A-Za-z0-9]{8}$/);
  assert.notEqual(newState(), newState());
});

test("the sign-in address holds the scope, the state and no secret", () => {
  const url = new URL(authorizeUrl("oura", { clientId: "id", clientSecret: "secret", redirectUri: "https://x/cb", state: "abcd1234" }));
  assert.equal(url.origin, "https://cloud.ouraring.com");
  assert.equal(url.searchParams.get("scope"), "daily heartrate");
  assert.equal(url.searchParams.get("state"), "abcd1234");
  assert.equal(url.href.includes("secret"), false);
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const OPTIONS = { code: "c", clientId: "id", clientSecret: "shh", redirectUri: "https://x/cb" };

test("a refused code gives a clear error with no text from the device maker", async () => {
  const fetchFn = async () => json({ error: "maker text" }, 400);
  await assert.rejects(readTrackerDays("whoop", { ...OPTIONS, fetchFn }), (error) => error instanceof TrackerError && !error.message.includes("maker text"));
});

test("a failed data request gives a clear error", async () => {
  const fetchFn = async (url) => (String(url).includes("/oauth/") ? json({ access_token: "t" }) : json({}, 500));
  await assert.rejects(readTrackerDays("oura", { ...OPTIONS, fetchFn }), /Oura did not give the data \(HTTP 500\)/);
});

test("the reader follows each page, and leaves out today", async () => {
  const now = Date.parse("2026-11-04T10:00:00Z");
  const asked = [];
  const fetchFn = async (url, init) => {
    if (String(url).includes("/oauth/")) {
      assert.match(init.body, /grant_type=authorization_code/);
      return json({ access_token: "t" });
    }
    assert.equal(init.headers.Authorization, "Bearer t");
    const { pathname, searchParams } = new URL(url);
    asked.push(`${pathname.split("/").pop()}:${searchParams.get("nextToken")}`);
    const first = !searchParams.get("nextToken");
    if (pathname.endsWith("/cycle")) {
      const { cycles } = whoopData();
      const today = { ...cycles[0], id: 8, start: "2026-11-03T23:30:00.000Z" };
      return json(first ? { records: [cycles[0]], next_token: "more" } : { records: [today] });
    }
    if (pathname.endsWith("/sleep")) {
      const { sleeps } = whoopData();
      return json({ records: [...sleeps, { ...sleeps[1], id: "today", cycle_id: 8 }] });
    }
    if (pathname.endsWith("/recovery")) {
      const { recoveries } = whoopData();
      return json({ records: [...recoveries, { ...recoveries[0], cycle_id: 8 }] });
    }
    return json({ records: [] });
  };
  const days = await readTrackerDays("whoop", { ...OPTIONS, fetchFn, now });
  assert.deepEqual(days.map((day) => day.date), ["2026-11-03"]);
  assert.ok(asked.includes("cycle:more"));
});

const day = (index) => ({ date: new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10), steps: 9000, raised_heart_rate_minutes: 30, sleep_minutes: 430, sleep_bpm: 52, hrv_rmssd_ms: 60, bedtime: "23:00", day_bpm: 68 });

test("a tracker day with an empty field is dropped, and the rest must still pass", () => {
  const days = Array.from({ length: 15 }, (_, index) => day(index));
  days[0].steps = null;
  days[1].steps = undefined;
  assert.throws(() => uploadFromTracker(days), (error) => error instanceof UploadError && /at least 14 days/.test(error.message));
  days[1] = day(1);
  assert.equal(uploadFromTracker(days).claimRows.length, 7);
});
