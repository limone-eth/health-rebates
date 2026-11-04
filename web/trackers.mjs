// Reads a visitor's days from a device maker, in the shape of a CSV upload. It keeps no token and no data.
import { randomBytes } from "node:crypto";

export class TrackerError extends Error {}

const FETCH_DAYS = 36;
const MAX_PAGES = 12;
const DAY_MS = 86400000;
const STATE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Whoop asks for a state of exactly 8 characters.
export const newState = () => Array.from(randomBytes(8), (byte) => STATE_CHARS[byte % STATE_CHARS.length]).join("");

const addOffset = (iso, offset) => {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset ?? "");
  const minutes = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(new Date(iso).getTime() + minutes * 60000);
};
const localDate = (date) => date.toISOString().slice(0, 10);
const localClock = (date) => date.toISOString().slice(11, 16);

// A Whoop cycle starts when the member falls asleep. So 12 hours later is in the day that the cycle measures.
export function whoopDays({ cycles, sleeps, recoveries, workouts }) {
  const sleepByCycle = new Map();
  for (const sleep of sleeps) {
    if (sleep.nap || sleep.score_state !== "SCORED") continue;
    const stages = sleep.score?.stage_summary;
    if (!stages) continue;
    const minutes = (stages.total_light_sleep_time_milli + stages.total_slow_wave_sleep_time_milli + stages.total_rem_sleep_time_milli) / 60000;
    if (!(minutes <= sleepByCycle.get(sleep.cycle_id)?.minutes)) sleepByCycle.set(sleep.cycle_id, { minutes, sleep });
  }
  const recoveryByCycle = new Map(recoveries.filter((item) => item.score_state === "SCORED").map((item) => [item.cycle_id, item.score]));

  // Whoop gives heart rate zones for workouts only. Zones two to five stand for moderate and vigorous minutes.
  const raised = new Map();
  for (const workout of workouts) {
    const zones = workout.score?.zone_durations;
    if (workout.score_state !== "SCORED" || !zones) continue;
    const date = localDate(addOffset(workout.start, workout.timezone_offset));
    const minutes = (zones.zone_two_milli + zones.zone_three_milli + zones.zone_four_milli + zones.zone_five_milli) / 60000;
    raised.set(date, (raised.get(date) ?? 0) + minutes);
  }

  return cycles.flatMap((cycle) => {
    const found = sleepByCycle.get(cycle.id);
    const recovery = recoveryByCycle.get(cycle.id);
    if (cycle.score_state !== "SCORED" || !cycle.end || !found || !recovery) return [];
    const date = localDate(new Date(addOffset(cycle.start, cycle.timezone_offset).getTime() + DAY_MS / 2));
    return [
      {
        date,
        steps: cycle.step_count,
        raised_heart_rate_minutes: Math.round(raised.get(date) ?? 0),
        sleep_minutes: Math.round(found.minutes),
        // Whoop has no average for the sleep. Its resting heart rate is measured during the sleep.
        sleep_bpm: recovery.resting_heart_rate,
        hrv_rmssd_ms: Math.round(recovery.hrv_rmssd_milli),
        bedtime: localClock(addOffset(found.sleep.start, found.sleep.timezone_offset)),
        day_bpm: Math.round(cycle.score.average_heart_rate),
      },
    ];
  });
}

export function ouraDays({ activity, sleeps, heart }) {
  const sleepByDay = new Map();
  for (const sleep of sleeps) {
    if (sleep.type !== "long_sleep" || !sleep.total_sleep_duration) continue;
    if (!(sleep.total_sleep_duration <= sleepByDay.get(sleep.day)?.total_sleep_duration)) sleepByDay.set(sleep.day, sleep);
  }
  const awake = new Map();
  for (const row of heart) {
    if (row.source === "sleep") continue;
    const date = row.timestamp.slice(0, 10);
    const sum = awake.get(date) ?? { total: 0, count: 0 };
    awake.set(date, { total: sum.total + row.bpm, count: sum.count + 1 });
  }
  return activity.flatMap((day) => {
    const sleep = sleepByDay.get(day.day);
    const beats = awake.get(day.day);
    if (!sleep || !beats || sleep.average_heart_rate == null || sleep.average_hrv == null) return [];
    return [
      {
        date: day.day,
        steps: day.steps,
        raised_heart_rate_minutes: Math.round((day.medium_activity_time + day.high_activity_time) / 60),
        sleep_minutes: Math.round(sleep.total_sleep_duration / 60),
        sleep_bpm: Math.round(sleep.average_heart_rate),
        hrv_rmssd_ms: sleep.average_hrv,
        // The string holds the member's own time zone.
        bedtime: sleep.bedtime_start.slice(11, 16),
        day_bpm: Math.round(beats.total / beats.count),
      },
    ];
  });
}

async function getJson(fetchFn, name, url, token) {
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  // The page shows this text, so it names no value from the device maker.
  if (!res.ok) throw new TrackerError(`${name} did not give the data (HTTP ${res.status}).`);
  return res.json();
}

async function allPages(fetchFn, name, baseUrl, params, token, { list, nextParam }) {
  const rows = [];
  let next = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (next) url.searchParams.set(nextParam, next);
    const body = await getJson(fetchFn, name, url, token);
    rows.push(...body[list]);
    next = body.next_token;
    if (!next) return rows;
  }
  return rows;
}

const WHOOP_API = "https://api.prod.whoop.com/developer/v2";
const OURA_API = "https://api.ouraring.com/v2/usercollection";

export const TRACKERS = {
  whoop: {
    name: "Whoop",
    authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    scope: "read:cycles read:recovery read:sleep read:workout",
    async read(fetchFn, token, now) {
      const params = { start: new Date(now - FETCH_DAYS * DAY_MS).toISOString(), end: new Date(now).toISOString(), limit: "25" };
      const pages = (path) => allPages(fetchFn, "Whoop", `${WHOOP_API}/${path}`, params, token, { list: "records", nextParam: "nextToken" });
      const [cycles, sleeps, recoveries, workouts] = await Promise.all([pages("cycle"), pages("activity/sleep"), pages("recovery"), pages("activity/workout")]);
      return whoopDays({ cycles, sleeps, recoveries, workouts });
    },
  },
  oura: {
    name: "Oura",
    authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
    tokenUrl: "https://api.ouraring.com/oauth/token",
    scope: "daily heartrate",
    async read(fetchFn, token, now) {
      const pages = (path, params) => allPages(fetchFn, "Oura", `${OURA_API}/${path}`, params, token, { list: "data", nextParam: "next_token" });
      const days = { start_date: new Date(now - FETCH_DAYS * DAY_MS).toISOString().slice(0, 10), end_date: new Date(now + DAY_MS).toISOString().slice(0, 10) };
      // Oura limits one heart rate request to 30 days, so this makes two.
      const middle = now - (FETCH_DAYS / 2) * DAY_MS;
      const span = (from, to) => ({ start_datetime: new Date(from).toISOString(), end_datetime: new Date(to).toISOString() });
      const [activity, sleeps, first, second] = await Promise.all([
        pages("daily_activity", days),
        pages("sleep", days),
        pages("heartrate", span(now - FETCH_DAYS * DAY_MS, middle)),
        pages("heartrate", span(middle, now)),
      ]);
      return ouraDays({ activity, sleeps, heart: [...first, ...second] });
    },
  },
};

export function authorizeUrl(maker, { clientId, redirectUri, state }) {
  const tracker = TRACKERS[maker];
  const url = new URL(tracker.authorizeUrl);
  url.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: tracker.scope, state }).toString();
  return url.toString();
}

// The token stays in this function. Nothing saves it, and the provider's own text never reaches the page.
export async function readTrackerDays(maker, { code, clientId, clientSecret, redirectUri, fetchFn = fetch, now = Date.now() }) {
  const tracker = TRACKERS[maker];
  const res = await fetchFn(tracker.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }).toString(),
  });
  if (!res.ok) throw new TrackerError(`${tracker.name} did not accept the connection. Try again.`);
  const { access_token: token } = await res.json();
  if (!token) throw new TrackerError(`${tracker.name} did not accept the connection. Try again.`);
  const today = new Date(now).toISOString().slice(0, 10);
  // Today is not finished, so it cannot be a claim day.
  return (await tracker.read(fetchFn, token, now)).filter((day) => day.date < today);
}
