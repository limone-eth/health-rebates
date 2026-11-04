import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, test } from "node:test";
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

test("the upload list for the host names no key file", () => {
  const list = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8").split("\n");
  assert.equal(list.find((line) => line && !line.startsWith("#")), "*");
  for (const line of list.filter((item) => item.startsWith("!"))) assert.doesNotMatch(line, /\.env|add-hosted-keys/);
});

test("the host installs the same package versions as chain/ and tee/", () => {
  const dependencies = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).dependencies;
  const hosted = dependencies("../package.json");
  for (const [name, version] of Object.entries({ ...dependencies("../chain/package.json"), ...dependencies("../tee/package.json") })) {
    assert.equal(hosted[name], version, name);
  }
});

test("the host stays read-only if a key or the cap is missing", async () => {
  const { hostedLive, HOSTED_REASON } = await import("../api/index.mjs");
  const all = { NEARAI_CLOUD_API_KEY: "x", DEV_ACCOUNT_ID: "x", DEV_NEAR_KEY: "x", DEV_WEARABLE_KEY: "x", CLAIM_CAP: "20" };
  for (const name of Object.keys(all)) {
    assert.deepEqual(await hostedLive("pool", { ...all, [name]: "" }), { liveReason: HOSTED_REASON });
  }
  assert.deepEqual(await hostedLive("pool", { ...all, CLAIM_CAP: "many" }), { liveReason: HOSTED_REASON });
});

describe("the hosted copy with keys", () => {
  const CAP_TEXT = "No claims left";
  const stored = { account: "a-new.dev.testnet", tx: "newtx", signer: "0xabc", recorded_on: "2026-11-04", explanation: "Six good days." };
  let hosted;
  let url;
  let totals;
  let runs;
  let saves;
  const origin = () => ({ Origin: url.replace("http:", "https:") });

  before(async () => {
    const live = {
      runClaim: async (name, onStep) => {
        runs += 1;
        onStep("attestation", "ok");
        return stored;
      },
    };
    hosted = await createApp({
      live,
      hosted: true,
      claimCap: 10,
      capReason: CAP_TEXT,
      state: () => state,
      saveState: () => (saves += 1),
      read: fakeRead,
      viewFn: async (pool, method) => (method === "get_totals" ? totals : fakeView(pool, method)),
    });
    await new Promise((resolve) => hosted.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${hosted.address().port}`;
  });
  beforeEach(() => {
    totals = { paid: 2, not_paid: 2, held: 2, rejected: 1 };
    runs = 0;
    saves = 0;
  });
  after(() => hosted.close());

  test("a claim runs, returns its result to the page, and does not change the shared state", async () => {
    const shared = JSON.stringify(state);
    const status = await (await fetch(`${url}/api/status`)).json();
    assert.equal(status.mode, "live");
    assert.equal(status.can_decide, false);
    const res = await fetch(`${url}/api/claims/A`, { method: "POST", headers: origin() });
    const events = (await res.text()).trim().split("\n").map((line) => JSON.parse(line));
    const done = events.at(-1);
    assert.equal(events[0].type, "step");
    assert.equal(done.type, "done");
    assert.equal(done.session.member.account, stored.account);
    assert.equal(done.session.member.explanation, stored.explanation);
    assert.equal(done.session.insurer_row.account, stored.account);
    for (const field of HEALTH_FIELDS) assert.equal(field in done.session.insurer_row, false, field);
    assert.equal(saves, 0);
    assert.equal(JSON.stringify(state), shared);
  });

  test("a request from another site or with no origin gets a 403 and does not run", async () => {
    for (const headers of [{}, { Origin: "https://example.com" }, { Origin: url }]) {
      assert.equal((await fetch(`${url}/api/claims/A`, { method: "POST", headers })).status, 403);
    }
    assert.equal(runs, 0);
  });

  test("the app refuses a claim at the cap, and the status says why", async () => {
    totals = { paid: 4, not_paid: 3, held: 2, rejected: 1 };
    const res = await fetch(`${url}/api/claims/A`, { method: "POST", headers: origin() });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).detail, CAP_TEXT);
    assert.equal(runs, 0);
    const status = await (await fetch(`${url}/api/status`)).json();
    assert.equal(status.mode, "read_only");
    assert.equal(status.reason, CAP_TEXT);
  });

  test("Approve and Decline stay off", async () => {
    const res = await fetch(`${url}/api/held/C`, { method: "POST", headers: origin(), body: JSON.stringify({ approve: true }) });
    assert.equal(res.status, 403);
  });

  test("an upload runs a claim, returns its result to the page, and saves nothing", async () => {
    const shared = JSON.stringify(state);
    const csv = readFileSync(new URL("./public/sample-data.csv", import.meta.url), "utf8");
    const res = await fetch(`${url}/api/uploads`, { method: "POST", headers: origin(), body: csv });
    const events = (await res.text()).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events[0].type, "preview");
    assert.equal(events[0].session.member.member, "You");
    assert.equal(events[0].session.member.rows.length, 7);
    const done = events.at(-1);
    assert.equal(done.type, "done");
    assert.equal(done.session.member.rows.length, 7);
    assert.equal(done.session.insurer_row.member, "You");
    for (const field of HEALTH_FIELDS) assert.equal(field in done.session.insurer_row, false, field);
    assert.equal(saves, 0);
    assert.equal(JSON.stringify(state), shared);
  });

  test("a bad upload gets a 422 and does not run", async () => {
    const res = await fetch(`${url}/api/uploads`, { method: "POST", headers: origin(), body: "not,a,file" });
    assert.equal(res.status, 422);
    assert.equal(runs, 0);
  });

  test("the app refuses an upload at the cap, and from another site", async () => {
    const csv = readFileSync(new URL("./public/sample-data.csv", import.meta.url), "utf8");
    assert.equal((await fetch(`${url}/api/uploads`, { method: "POST", body: csv })).status, 403);
    totals = { paid: 4, not_paid: 3, held: 2, rejected: 1 };
    assert.equal((await fetch(`${url}/api/uploads`, { method: "POST", headers: origin(), body: csv })).status, 403);
    assert.equal(runs, 0);
  });

  test("a failed claim shows no text from a service", async () => {
    const failing = await createApp({
      live: { runClaim: async () => { throw new Error("secret upstream detail"); } },
      hosted: true,
      claimCap: 10,
      state: () => state,
      read: fakeRead,
      viewFn: async (pool, method) => (method === "get_totals" ? totals : fakeView(pool, method)),
    });
    await new Promise((resolve) => failing.listen(0, "127.0.0.1", resolve));
    const failUrl = `http://127.0.0.1:${failing.address().port}`;
    const logged = console.error;
    console.error = () => {};
    try {
      const res = await fetch(`${failUrl}/api/claims/A`, { method: "POST", headers: { Origin: failUrl.replace("http:", "https:") } });
      const text = await res.text();
      assert.doesNotMatch(text, /secret/);
      assert.match(text, /did not finish/);
    } finally {
      console.error = logged;
      failing.close();
    }
  });
});

test("on one machine, a live claim saves its result in the state", async () => {
  const shared = structuredClone(state);
  const saved = [];
  const local = await createApp({
    live: { runClaim: async () => ({ ...shared.members.A, tx: "newtx" }) },
    state: () => shared,
    saveState: (next) => saved.push(next),
    read: fakeRead,
    viewFn: fakeView,
  });
  await new Promise((resolve) => local.listen(0, "127.0.0.1", resolve));
  try {
    const res = await fetch(`http://localhost:${local.address().port}/api/claims/A`, { method: "POST" });
    const done = JSON.parse((await res.text()).trim().split("\n").at(-1));
    assert.deepEqual(done, { type: "done", member: "A" });
    assert.equal(saved[0].members.A.tx, "newtx");
    assert.equal(saved[0].members.B.tx, "tx");
  } finally {
    local.close();
  }
});

test("the app serves its page", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
});
