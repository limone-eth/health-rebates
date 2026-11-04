// Reads each member's baseline and claim week through the Open Wearables API shape.
import { BASELINE_WEEK, CLAIM_WEEK } from "../wearable/data.mjs";
import { countDaysMet } from "../wearable/rule.mjs";
import { createWearableServer } from "../wearable/server.mjs";
import { toRows } from "./claim.mjs";

const WEARABLE_KEY = "demo-key";

export const EXPECTED = {
  A: { days_met: 6, pattern_matches_owner: true, decision: "paid" },
  B: { days_met: 3, pattern_matches_owner: true, decision: "not paid" },
  C: { days_met: 6, pattern_matches_owner: false, decision: "held for review" },
};

export async function loadMembers() {
  const server = createWearableServer({ apiKey: WEARABLE_KEY });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const fetchDays = async (memberId, kind, { start, end }) => {
    const query = new URLSearchParams({ start_date: start, end_date: end, limit: "1000" });
    const res = await fetch(`${base}/api/v1/users/${memberId}/summaries/${kind}?${query}`, {
      headers: { "X-Open-Wearables-API-Key": WEARABLE_KEY },
    });
    if (!res.ok) throw new Error(`wearable: HTTP ${res.status}`);
    return (await res.json()).data;
  };

  try {
    const members = await (await fetch(`${base}/mock/members`)).json();
    return await Promise.all(
      members.map(async ({ id, name }) => {
        const [baselineActivity, baselineSleep, claimActivity, claimSleep] = await Promise.all([
          fetchDays(id, "activity", BASELINE_WEEK),
          fetchDays(id, "sleep", BASELINE_WEEK),
          fetchDays(id, "activity", CLAIM_WEEK),
          fetchDays(id, "sleep", CLAIM_WEEK),
        ]);
        return {
          name,
          baselineRows: toRows(baselineActivity, baselineSleep),
          claimRows: toRows(claimActivity, claimSleep),
          ruleCount: countDaysMet(claimActivity, claimSleep),
        };
      }),
    );
  } finally {
    server.close();
  }
}
