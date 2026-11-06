// The wearable service applies the rule in plain code and signs the result. No model decides a wearable claim.
// This test is here because it needs viem, and the wearable service has no dependencies.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { recoverMessageAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CLAIM_WEEK, MEMBERS } from "../wearable/data.mjs";
import { BASELINE_WEEK, daysInRange } from "../wearable/data.mjs";
import { createWearableServer } from "../wearable/server.mjs";
import { evaluateWeek, summarizeBaseline, toRows } from "./claim.mjs";

const KEY = "test-key";
const POOL = "pool.testnet";
const MEMBER = "a-1.pool.testnet";
const signer = privateKeyToAccount(generatePrivateKey());
const idOf = Object.fromEntries(Object.entries(MEMBERS).map(([id, member]) => [member.name, id]));
let server;
let base;

before(async () => {
  server = createWearableServer({
    apiKey: KEY,
    claims: { contract: POOL, signMessage: (message) => signer.signMessage({ message }) },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const post = (body, { key = KEY, target = "/mock/claims" } = {}) =>
  fetch(`${base}${target}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "X-Open-Wearables-API-Key": key } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const goodBody = (overrides = {}) => ({ user_id: idOf.A, near_account: MEMBER, week: CLAIM_WEEK.start, ...overrides });

const rowsFor = (name, { start, end }) =>
  toRows(daysInRange(idOf[name], "activity", start, end), daysInRange(idOf[name], "sleep", start, end));

test("the service signs the result that its code decided, and the hash of the input rows", async () => {
  const res = await post(goodBody());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ["days_met", "pattern_matches_owner", "request_hash", "wearable_signature"]);

  const input = JSON.stringify({ owner_baseline: summarizeBaseline(rowsFor("A", BASELINE_WEEK)), claim_week: rowsFor("A", CLAIM_WEEK) });
  assert.equal(body.request_hash, createHash("sha256").update(input).digest("hex"));
  assert.deepEqual(
    { days_met: body.days_met, pattern_matches_owner: body.pattern_matches_owner },
    evaluateWeek(rowsFor("A", BASELINE_WEEK), rowsFor("A", CLAIM_WEEK)),
  );

  const message = `rebate-result:${POOL}:${MEMBER}:${CLAIM_WEEK.start}:${body.request_hash}:6:true`;
  const recovered = await recoverMessageAddress({ message, signature: body.wearable_signature });
  assert.equal(recovered.toLowerCase(), signer.address.toLowerCase());
});

test("the service returns no health data", async () => {
  const text = await (await post(goodBody())).text();
  for (const word of ["steps", "sleep", "bpm", "hrv", "bedtime", "claim_week"]) assert.ok(!text.includes(word), word);
});

test("each sample member gets the expected result", async () => {
  const result = async (name) => {
    const { days_met: days, pattern_matches_owner: pattern } = await (await post(goodBody({ user_id: idOf[name] }))).json();
    return [days, pattern];
  };
  assert.deepEqual([await result("A"), await result("B"), await result("C")], [[6, true], [3, true], [6, false]]);
});

test("two calls for one member and week give the same signature", async () => {
  const first = await (await post(goodBody())).json();
  const second = await (await post(goodBody())).json();
  assert.equal(first.wearable_signature, second.wearable_signature);
});

test("the service ignores a hash or a result from the caller", async () => {
  const plain = await (await post(goodBody())).json();
  const forced = await (await post(goodBody({ request_hash: "ab".repeat(32), days_met: 7, pattern_matches_owner: true, user_id: idOf.B }))).json();
  assert.equal(forced.days_met, 3);
  assert.notEqual(forced.request_hash, "ab".repeat(32));
  assert.notEqual(forced.request_hash, plain.request_hash);
});

test("the service refuses a bad claim", async () => {
  assert.equal((await post(goodBody(), { key: "wrong" })).status, 401);
  assert.equal((await post(goodBody(), { key: null })).status, 401);
  assert.equal((await post(goodBody({ user_id: "nobody" }))).status, 404);
  assert.equal((await post(goodBody({ week: "2026-11-09" }))).status, 422);
  assert.equal((await post(goodBody({ near_account: "NOT VALID!" }))).status, 422);
  assert.equal((await post(goodBody({ near_account: undefined }))).status, 422);
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post("x".repeat(5000))).status, 413);
});

test("a server with no signing setup has no claims route", async () => {
  const plain = createWearableServer({ apiKey: KEY });
  await new Promise((resolve) => plain.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${plain.address().port}/mock/claims`, {
      method: "POST",
      headers: { "X-Open-Wearables-API-Key": KEY },
      body: JSON.stringify(goodBody()),
    });
    assert.equal(res.status, 405);
  } finally {
    plain.close();
  }
});
