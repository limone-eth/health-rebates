// What each screen gets. The insurer view is built field by field, so that no health data can pass through it.
const YOCTO_PER_MILLI = 10n ** 21n;
const nearText = (yocto) => `${Number(BigInt(yocto) / YOCTO_PER_MILLI) / 1000} NEAR`;

const OUTCOME_TEXT = { Paid: "Paid", NotPaid: "Not paid", Held: "Held for review", Rejected: "Rejected" };

// A claim as the chain and the state file give it. It holds no health data.
function claimFacts({ name, stored, record, signerRegistered, config }) {
  return {
    member: name,
    account: stored.account,
    tx: stored.tx,
    recorded_on: stored.recorded_on,
    signer: stored.signer,
    signer_registered: signerRegistered,
    days_met: record?.days_met ?? null,
    pattern_matches_owner: record?.pattern_matches_owner ?? null,
    outcome: record?.outcome ?? null,
    outcome_text: OUTCOME_TEXT[record?.outcome] ?? "No claim",
    request_hash: record?.request_hash ?? null,
    payout: record?.outcome === "Paid" ? nearText(config.rebate) : null,
  };
}

export function insurerView({ pool, config, totals, claims }) {
  const members = claims.map((claim) => claimFacts({ ...claim, config }));
  const withClaim = members.filter((member) => member.days_met !== null);
  return {
    pool,
    insurer: config.insurer,
    rule: config.rule,
    model: config.model,
    rebate: nearText(config.rebate),
    min_days: config.min_days,
    total_days: config.total_days,
    pool_totals: { paid: totals.paid, not_paid: totals.not_paid, held: totals.held, rejected: totals.rejected },
    met_rule: withClaim.filter((member) => member.days_met >= config.min_days).length,
    members_total: members.length,
    members,
  };
}

export function memberView({ claim, config, rows, baseline }) {
  return {
    ...claimFacts({ ...claim, config }),
    rule: config.rule,
    rebate: nearText(config.rebate),
    explanation: claim.stored.explanation ?? null,
    rows,
    baseline,
  };
}
