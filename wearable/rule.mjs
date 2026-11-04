// The rebate rule: 7,000+ steps with a raised heart rate, and 7+ hours of sleep, on 5 of 7 days.
export const RULE = {
  minSteps: 7000,
  // "Raised heart rate": moderate plus vigorous intensity minutes, which wearables derive from heart rate.
  minRaisedHeartRateMinutes: 20,
  minSleepMinutes: 420,
  minDays: 5,
  days: 7,
};

export function dayMeetsRule(activity, sleep, rule = RULE) {
  const raised = (activity?.intensity_minutes?.moderate ?? 0) + (activity?.intensity_minutes?.vigorous ?? 0);
  return (
    (activity?.steps ?? 0) >= rule.minSteps &&
    raised >= rule.minRaisedHeartRateMinutes &&
    (sleep?.duration_minutes ?? 0) >= rule.minSleepMinutes
  );
}

// A missing day does not meet the rule.
export function countDaysMet(activityDays, sleepDays, rule = RULE) {
  const sleepByDate = new Map(sleepDays.map((day) => [day.date, day]));
  return activityDays.filter((day) => dayMeetsRule(day, sleepByDate.get(day.date), rule)).length;
}
