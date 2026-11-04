// The wearable service builds the claim request and signs only that request.
// This test is here because it needs viem, and the wearable service has no dependencies.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { recoverMessageAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CLAIM_WEEK, MEMBERS } from "../wearable/data.mjs";
import { createWearableServer } from "../wearable/server.mjs";

const KEY = "test-key";
const MODEL = "test/model";
const POOL = "pool.testnet";
const MEMBER = "a-1.pool.testnet";
const signer = privateKeyToAccount(generatePrivateKey());
const idOf = Object.fromEntries(Object.entries(MEMBERS).map(([id, member]) => [member.name, id]));
let server;
let base;

before(async () => {
  server = createWearableServer({
    apiKey: KEY,
    claims: { model: MODEL, contract: POOL, signMessage: (message) => signer.signMessage({ message }) },
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

test("the service returns a request that it built, and signs the hash of those bytes", async () => {
  const res = await post(goodBody());
  assert.equal(res.status, 200);
  const { request_body: requestBody, request_hash: requestHash, wearable_signature: signature } = await res.json();

  assert.equal(requestHash, createHash("sha256").update(requestBody).digest("hex"));
  const message = `rebate-claim:${POOL}:${MEMBER}:${CLAIM_WEEK.start}:${requestHash}`;
  assert.equal((await recoverMessageAddress({ message, signature })).toLowerCase(), signer.address.toLowerCase());

  const request = JSON.parse(requestBody);
  assert.equal(request.model, MODEL);
  assert.equal(JSON.parse(request.messages[1].content).claim_week.length, 7);
});

test("two calls for one member and week give the same request bytes", async () => {
  const first = await (await post(goodBody())).json();
  const second = await (await post(goodBody())).json();
  assert.equal(first.request_body, second.request_body);
  assert.equal(first.wearable_signature, second.wearable_signature);
});

test("the service ignores a hash, a request or a model from the caller", async () => {
  const plain = await (await post(goodBody())).json();
  const forced = await (await post(goodBody({ request_hash: "ab".repeat(32), request_body: "{}", model: "other/model" }))).json();
  assert.equal(forced.request_hash, plain.request_hash);
  assert.equal(forced.request_body, plain.request_body);
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
