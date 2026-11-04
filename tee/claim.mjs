// What goes to the TEE model for one claim, and what comes back. No network here.
import { dayMeetsRule, RULE } from "../wearable/rule.mjs";

const SYSTEM = `You check one week of synthetic wearable data for a health rebate. Reply with JSON only.

days_met: the number of rows in claim_week where meets_rule is true.

pattern_matches_owner: compare the body signals in claim_week with owner_baseline.
The body signals are sleep_bpm, hrv_rmssd_ms, bedtime_minutes_after_noon and day_bpm.
Set it to false only if, on most days of claim_week, two or more body signals are outside the baseline min to max.
Otherwise set it to true. Do not use steps or sleep length for this check: a member can improve these.`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    days_met: { type: "integer" },
    pattern_matches_owner: { type: "boolean" },
  },
  required: ["days_met", "pattern_matches_owner"],
  additionalProperties: false,
};

const bedtimeAfterNoon = (startTime) => {
  const start = new Date(startTime);
  return (start.getUTCHours() * 60 + start.getUTCMinutes() + 720) % 1440;
};

// One row per day that has both summaries. Leaves out the member ID and the device, which the model does not need.
export function toRows(activityDays, sleepDays) {
  const sleepByDate = new Map(sleepDays.map((day) => [day.date, day]));
  return activityDays.flatMap((activity) => {
    const sleep = sleepByDate.get(activity.date);
    if (!sleep) return [];
    const { moderate = 0, vigorous = 0 } = activity.intensity_minutes ?? {};
    return [
      {
        date: activity.date,
        // From the rule code: with reasoning off, the model miscounted when it applied the limits itself.
        meets_rule: dayMeetsRule(activity, sleep),
        steps: activity.steps,
        raised_heart_rate_minutes: moderate + vigorous,
        sleep_minutes: sleep.duration_minutes,
        sleep_bpm: sleep.avg_heart_rate_bpm,
        hrv_rmssd_ms: sleep.avg_hrv_rmssd_ms,
        bedtime_minutes_after_noon: bedtimeAfterNoon(sleep.start_time),
        day_bpm: activity.heart_rate?.avg_bpm,
      },
    ];
  });
}

// A summary, not the 28 raw days: the model needs no more than this.
export function summarizeBaseline(rows) {
  const summary = { days: rows.length };
  for (const key of ["sleep_bpm", "hrv_rmssd_ms", "bedtime_minutes_after_noon", "day_bpm"]) {
    const values = rows.map((row) => row[key]);
    summary[key] = {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
    };
  }
  return summary;
}

export function buildClaimRequest(model, baselineRows, claimRows) {
  return {
    model,
    temperature: 0,
    // The signature covers the exact response bytes, so the model must not produce reasoning text.
    reasoning_effort: "none",
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({ owner_baseline: summarizeBaseline(baselineRows), claim_week: claimRows }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "claim_result", strict: true, schema: RESULT_SCHEMA },
    },
  };
}

// Throws on anything other than the exact result shape.
export function parseResult(content) {
  const result = JSON.parse(content);
  const keys = Object.keys(result).sort().join();
  if (keys !== "days_met,pattern_matches_owner") throw new Error(`Unexpected keys: ${keys}`);
  if (!Number.isInteger(result.days_met) || result.days_met < 0 || result.days_met > RULE.days) {
    throw new Error(`Bad days_met: ${result.days_met}`);
  }
  if (typeof result.pattern_matches_owner !== "boolean") throw new Error("Bad pattern_matches_owner");
  return result;
}

export function decide({ days_met: daysMet, pattern_matches_owner: patternMatches }) {
  if (daysMet < RULE.minDays) return "not paid";
  return patternMatches ? "paid" : "held for review";
}

// A separate completion for the member only. It can repeat health data, so it never goes on-chain.
export function buildExplanationRequest(model, claimRows, result) {
  return {
    model,
    temperature: 0,
    reasoning_effort: "none",
    messages: [
      {
        role: "system",
        content: `Explain a weekly health rebate result to the member, in at most 4 short sentences of plain language.
The rule: ${RULE.minSteps} or more steps, ${RULE.minRaisedHeartRateMinutes} or more raised heart rate minutes, and ${RULE.minSleepMinutes} or more sleep minutes, on ${RULE.minDays} of ${RULE.days} days.
State the exact value of days_met. Say the insurer does not see this data.
If pattern_matches_owner is false, say the week looks different from the member's usual pattern, so a person will review it. Do not accuse the member of anything.
Do not give medical advice.`,
      },
      { role: "user", content: JSON.stringify({ result, decision: decide(result), claim_week: claimRows }) },
    ],
  };
}
