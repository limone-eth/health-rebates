import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { checkGpu, checkSoftware, replayRtmr3 } from "./software.mjs";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const NONCE = "ab".repeat(32);
const compose = JSON.stringify({ docker_compose_file: "services:\n  a:\n    image: x/y@sha256:11\n  b:\n    image: x/y@sha256:11\n" });
const event = (name, payload) => ({ imr: 3, event_type: 134217729, digest: "", event: name, event_payload: payload });
const log = [{ imr: 0, event_type: 1, digest: "00", event: "", event_payload: "" }, event("app-id", "aa"), event("compose-hash", sha256(compose)), event("system-ready", "")];
const report = { event_log: log, info: { tcb_info: JSON.stringify({ app_compose: compose }) } };
const td = { rt_mr3: replayRtmr3(log), mr_config_id: `01${sha256(compose)}`.padEnd(96, "0") };

test("a report that matches its quote passes, and the images come back once", () => {
  assert.deepEqual(checkSoftware(report, td), { composeHash: sha256(compose), images: ["x/y@sha256:11"] });
});

test("the replay reads RTMR3 events only, and a changed event changes the result", () => {
  const empty = "0".repeat(96);
  assert.notEqual(replayRtmr3(log), empty);
  assert.equal(replayRtmr3([log[0]]), empty);
  assert.notEqual(replayRtmr3([log[0], event("app-id", "ab"), log[2], log[3]]), replayRtmr3(log));
});

test("a changed event log fails", () => {
  assert.throws(() => checkSoftware({ ...report, event_log: [...log, event("extra", "")] }, td), /does not replay/);
});

test("a compose file that is not in the event log fails", () => {
  const other = JSON.stringify({ docker_compose_file: "" });
  assert.throws(() => checkSoftware({ ...report, info: { tcb_info: { app_compose: other } } }, td), /does not match the event log/);
});

test("a quote with another MRCONFIGID fails", () => {
  assert.throws(() => checkSoftware(report, { ...td, mr_config_id: "0".repeat(96) }), /MRCONFIGID/);
});

const gpuReport = { nvidia_payload: JSON.stringify({ nonce: NONCE, evidence_list: [{}, {}] }) };
const tokenWith = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const answer = (claims, ok = true) => async () => ({ ok, status: ok ? 200 : 400, json: async () => [["JWT", tokenWith(claims)]] });

test("the GPU check passes when NVIDIA accepts the evidence with our nonce", async () => {
  const fetchFn = answer({ "x-nvidia-overall-att-result": true, eat_nonce: NONCE });
  assert.deepEqual(await checkGpu(gpuReport, NONCE, fetchFn), { gpus: 2 });
});

test("the GPU check fails on a refusal, another nonce, an HTTP error or no evidence", async () => {
  await assert.rejects(checkGpu(gpuReport, NONCE, answer({ "x-nvidia-overall-att-result": false, eat_nonce: NONCE })), /did not accept/);
  await assert.rejects(checkGpu(gpuReport, NONCE, answer({ "x-nvidia-overall-att-result": true, eat_nonce: "ff" })), /our nonce/);
  await assert.rejects(checkGpu(gpuReport, NONCE, answer({}, false)), /HTTP 400/);
  await assert.rejects(checkGpu(gpuReport, "cd".repeat(32), answer({})), /does not hold our nonce/);
  await assert.rejects(checkGpu({}, NONCE, answer({})), /no GPU evidence/);
});
