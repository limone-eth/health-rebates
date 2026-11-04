import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { loadMembers } from "../tee/members.mjs";
import { createApp, liveOffReason } from "./server.mjs";

const HEALTH_FIELDS = ["rows", "baseline", "steps", "sleep_minutes", "raised_heart_rate_minutes", "sleep_bpm", "hrv_rmssd_ms", "day_bpm", "bedtime_minutes_after_noon", "explanation"];
const REASON = "Live claims are off: NEARAI_CLOUD_API_KEY is not set";

const state = {
  pool: "pool.testnet",
  week: "2026-11-02",
  members: Object.fromEntries(["A", "B", "C"].map((name) => [name, { account: `${name}.testnet`, tx: "tx", recorded_on: "2026-11-03", signer: "0xabc", explanation: "A private sentence." }])),
};
const config = { insurer: "i.testnet", rule: "the rule", model: "m", min_days: 5, total_days: 7, rebate: "100000000000000000000000" };
const totals = { paid: 1, not_paid: 1, held: 1, rejected: 0 };
const fakeView = async (_pool, method) => (method === "get_config" ? config : totals);
const fakeRead = async (current, name) => ({
  name,
  stored: current.members[name],
  signerRegistered: true,
  record: { days_met: 6, pattern_matches_owner: true, outcome: "Paid", request_hash: "aa" },
});

let server;
let base;

before(async () => {
  server = await createApp({ liveReason: REASON, state: () => state, read: fakeRead, viewFn: fakeView });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function keysOf(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      found.add(key);
      keysOf(inner, found);
    }
  }
  return found;
}

test("the insurer API response holds no health fields", async () => {
  const body = await (await fetch(`${base}/api/insurer`)).json();
  const keys = keysOf(body);
  for (const field of HEALTH_FIELDS) assert.equal(keys.has(field), false, `insurer response holds ${field}`);
  assert.equal(body.members.length, 3);
});

test("the member API response holds the member's own week", async () => {
  const body = await (await fetch(`${base}/api/members/A`)).json();
  assert.ok(body.rows.length > 0);
  assert.equal(body.explanation, "A private sentence.");
});

test("with no keys, the status says read-only and gives the reason", async () => {
  const body = await (await fetch(`${base}/api/status`)).json();
  assert.equal(body.mode, "read_only");
  assert.equal(body.reason, REASON);
});

test("a missing package gives a reason with no path from this machine", () => {
  const error = Object.assign(new Error("Cannot find package 'near-api-js' imported from /home/someone/web/live.mjs"), { code: "ERR_MODULE_NOT_FOUND" });
  assert.equal(liveOffReason(error), "Live claims are off: run npm install in chain/ and tee/");
  assert.equal(liveOffReason(new Error("NEARAI_CLOUD_API_KEY is not set")), REASON);
});

test("with no keys, the app reads results from the chain, and claim and held actions are off", async () => {
  const insurer = await (await fetch(`${base}/api/insurer`)).json();
  assert.equal(insurer.members[0].outcome, "Paid");
  for (const path of ["/api/claims/A", "/api/held/C"]) {
    const res = await fetch(`${base}${path}`, { method: "POST", body: "{}" });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).detail, REASON);
  }
});

test("the hosted entry point is read-only and refuses claim and held actions", async () => {
  const { default: handler, HOSTED_REASON } = await import("../api/index.mjs");
  const hosted = createServer(handler);
  await new Promise((resolve) => hosted.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${hosted.address().port}`;
  try {
    const status = await (await fetch(`${url}/api/status`)).json();
    assert.equal(status.mode, "read_only");
    assert.equal(status.reason, HOSTED_REASON);
    for (const path of ["/api/claims/A", "/api/held/C"]) {
      assert.equal((await fetch(`${url}${path}`, { method: "POST", body: "{}" })).status, 403);
    }
  } finally {
    hosted.close();
  }
});

test("the hosted copy of the synthetic weeks equals the source", async () => {
  const stored = JSON.parse(readFileSync(new URL("./members.json", import.meta.url), "utf8"));
  assert.deepEqual(stored, JSON.parse(JSON.stringify(await loadMembers())));
});

test("the upload list for the host names no key file and no live code", () => {
  const list = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8").split("\n");
  assert.equal(list.find((line) => line && !line.startsWith("#")), "*");
  for (const line of list.filter((item) => item.startsWith("!"))) assert.doesNotMatch(line, /\.env|live\.mjs|near\.mjs/);
});

test("the app serves its page", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
});
