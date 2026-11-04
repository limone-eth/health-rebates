// Synthetic data only. All members and numbers are made up, and the same on each run.
// The shapes follow the ActivitySummary and SleepSummary schemas of Open Wearables
// (https://github.com/the-momentum/open-wearables, MIT).

export const BASELINE_WEEK = { start: "2026-09-28", end: "2026-10-25" };
export const CLAIM_WEEK = { start: "2026-10-26", end: "2026-11-01" };

// Bedtime is in minutes after midnight of the day before the wake date (1440 = midnight).
const OWNER_A = { sleepBpm: 54, rmssd: 62, bedtime: 1365, dayBpm: 68 };
const OWNER_B = { sleepBpm: 60, rmssd: 44, bedtime: 1410, dayBpm: 74 };
const OWNER_C = { sleepBpm: 51, rmssd: 72, bedtime: 1350, dayBpm: 64 };
const SOMEONE_ELSE = { sleepBpm: 68, rmssd: 31, bedtime: 1545, dayBpm: 82 };

export const MEMBERS = {
  "6f0a1c52-3b7e-4d11-9a01-0000000000aa": {
    name: "A",
    expected: "meets the rule",
    baseline: { body: OWNER_A, met: 0.85 },
    claim: { body: OWNER_A, metDays: [1, 1, 1, 0, 1, 1, 1] },
  },
  "6f0a1c52-3b7e-4d11-9a01-0000000000bb": {
    name: "B",
    expected: "misses the rule",
    baseline: { body: OWNER_B, met: 0.45 },
    claim: { body: OWNER_B, metDays: [1, 0, 0, 1, 0, 0, 1] },
  },
  // C lent the watch: the claim week meets the rule, but the body is not C's.
  "6f0a1c52-3b7e-4d11-9a01-0000000000cc": {
    name: "C",
    expected: "meets the rule, but the pattern does not match the owner",
    baseline: { body: OWNER_C, met: 0.3 },
    claim: { body: SOMEONE_ELSE, metDays: [1, 1, 0, 1, 1, 1, 1] },
  },
};

// mulberry32, seeded from the member and the date.
function randomFor(seedText) {
  let seed = 0;
  for (const char of seedText) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

function datesBetween(start, end) {
  const dates = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function source(userId) {
  return {
    provider: "mock",
    source: "mock-wearable",
    device: "Mock Watch",
    device_type: "watch",
    device_id: `mock-${userId.slice(-2)}`,
    device_name: "Mock Watch",
  };
}

function buildDay(userId, date, body, met) {
  const random = randomFor(`${userId}|${date}`);
  const between = (low, high) => Math.round(low + random() * (high - low));

  // A day that misses the rule misses on one cause. The numbers near the limit stay clear of it.
  const miss = met ? null : ["steps", "heart", "sleep"][between(0, 2)];
  const steps = miss === "steps" ? between(3000, 6400) : between(7600, 12500);
  const moderate = miss === "heart" ? between(2, 9) : between(18, 45);
  const vigorous = miss === "heart" ? between(0, 5) : between(6, 25);
  const sleepMinutes = miss === "sleep" ? between(320, 395) : between(435, 510);

  const inBed = sleepMinutes + between(12, 35);
  const start = new Date(`${addDays(date, -1)}T00:00:00Z`);
  start.setUTCMinutes(body.bedtime + between(-20, 20));
  const end = new Date(start.getTime() + inBed * 60000);
  const deep = Math.round(sleepMinutes * 0.2);
  const rem = Math.round(sleepMinutes * 0.22);

  return {
    activity: {
      date,
      source: source(userId),
      steps,
      distance_meters: Math.round(steps * 0.74),
      floors_climbed: between(2, 14),
      elevation_meters: between(6, 42),
      active_calories_kcal: Math.round(steps * 0.045),
      total_calories_kcal: 1650 + Math.round(steps * 0.045),
      active_minutes: moderate + vigorous + between(20, 60),
      sedentary_minutes: between(480, 660),
      intensity_minutes: { light: between(60, 150), moderate, vigorous },
      heart_rate: {
        avg_bpm: body.dayBpm + between(-3, 3),
        max_bpm: body.dayBpm + between(55, 85),
        min_bpm: body.sleepBpm + between(-4, 0),
      },
    },
    sleep: {
      date,
      source: source(userId),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      zone_offset: "+00:00",
      duration_minutes: sleepMinutes,
      total_duration_minutes: sleepMinutes,
      time_in_bed_minutes: inBed,
      efficiency_percent: Math.round((sleepMinutes / inBed) * 1000) / 10,
      stages: {
        awake_minutes: inBed - sleepMinutes,
        light_minutes: sleepMinutes - deep - rem,
        deep_minutes: deep,
        rem_minutes: rem,
      },
      interruptions_count: between(0, 4),
      nap_count: 0,
      nap_duration_minutes: 0,
      avg_heart_rate_bpm: body.sleepBpm + between(-2, 2),
      avg_hrv_rmssd_ms: body.rmssd + between(-5, 5),
      avg_respiratory_rate: 12 + between(0, 30) / 10,
      avg_spo2_percent: 95 + between(0, 30) / 10,
    },
  };
}

function buildMember(userId, member) {
  const baseline = datesBetween(BASELINE_WEEK.start, BASELINE_WEEK.end).map((date) =>
    buildDay(userId, date, member.baseline.body, randomFor(`${userId}|met|${date}`)() < member.baseline.met),
  );
  const claim = datesBetween(CLAIM_WEEK.start, CLAIM_WEEK.end).map((date, index) =>
    buildDay(userId, date, member.claim.body, member.claim.metDays[index] === 1),
  );
  return [...baseline, ...claim];
}

const DAYS = new Map(Object.entries(MEMBERS).map(([id, member]) => [id, buildMember(id, member)]));

export const hasMember = (userId) => DAYS.has(userId);

export function daysInRange(userId, kind, startDate, endDate) {
  return DAYS.get(userId)
    .map((day) => day[kind])
    .filter((day) => day.date >= startDate && day.date <= endDate);
}
