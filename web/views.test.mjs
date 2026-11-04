import assert from "node:assert/strict";
import { test } from "node:test";
import { loadMembers } from "../tee/members.mjs";
import { insurerView, memberView } from "./views.mjs";

const config = { insurer: "i.testnet", rule: "the rule", model: "m", min_days: 5, total_days: 7, rebate: "100000000000000000000000" };
const totals = { paid: 1, not_paid: 1, held: 1, rejected: 0 };
const claim = (name, days, pattern, outcome, extra = {}) => ({
  name,
  signerRegistered: true,
  stored: { account: `${name}.testnet`, tx: "tx", recorded_on: "2026-11-03", signer: "0xabc", explanation: "Your sleep was 480 minutes.", ...extra },
  record: { days_met: days, pattern_matches_owner: pattern, outcome, request_hash: "ab".repeat(32) },
});
const claims = [claim("A", 6, true, "Paid"), claim("B", 3, true, "NotPaid"), claim("C", 6, false, "Held")];
const view = (input = claims) => insurerView({ pool: "p.testnet", config, totals, claims: input });

const allKeys = (value) =>
  value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)])
    : [];

test("the insurer view holds only the listed fields", () => {
  const allowed = new Set([
    ...["pool", "insurer", "rule", "model", "rebate", "min_days", "total_days", "pool_totals", "met_rule", "members_total", "members"],
    ...["paid", "not_paid", "held", "rejected"],
    ...["member", "account", "tx", "recorded_on", "signer", "signer_registered", "days_met", "pattern_matches_owner"],
    ...["outcome", "outcome_text", "request_hash", "payout"],
    ...["0", "1", "2"],
  ]);
  assert.deepEqual(allKeys(view()).filter((key) => !allowed.has(key)), []);
});

test("health data in a stored claim does not reach the insurer view", async () => {
  const [{ claimRows, baselineRows }] = await loadMembers();
  const text = JSON.stringify(
    view([claim("A", 6, true, "Paid", { rows: claimRows, baseline: baselineRows, steps: 1234567 })]),
  );
  for (const word of ["steps", "sleep_", "bpm", "hrv", "bedtime", "explanation", "1234567", "480 minutes"]) {
    assert.equal(text.includes(word), false, word);
  }
});

test("the insurer view counts members who met the rule, and pays only the paid member", () => {
  const result = view();
  assert.equal(result.met_rule, 2);
  assert.equal(result.members_total, 3);
  assert.deepEqual(result.members.map((member) => member.payout), ["0.1 NEAR", null, null]);
});

test("a member with no claim on-chain shows as no claim", () => {
  const result = view([{ ...claim("A", 6, true, "Paid"), record: null }]);
  assert.equal(result.met_rule, 0);
  assert.equal(result.members[0].outcome_text, "No claim");
});

test("the member view holds the member's data and explanation", () => {
  const result = memberView({ claim: claims[0], config, rows: [{ steps: 9000 }], baseline: { days: 28 } });
  assert.equal(result.explanation, "Your sleep was 480 minutes.");
  assert.equal(result.rows[0].steps, 9000);
});
