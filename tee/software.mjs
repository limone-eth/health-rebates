// Checks what a verified quote says about the software in the TEE. See docs/spike-day-1.md.
// These checks show which compose file the machine started and that its GPUs are genuine.
// They do not show that the images are safe: we have no trusted list to compare with, and
// the compose file starts a manager that can start other containers later.
import { createHash } from "node:crypto";

const NRAS_URL = "https://nras.attestation.nvidia.com/v3/attest/gpu";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha384 = (bytes) => createHash("sha384").update(bytes).digest();

const parsed = (value) => (typeof value === "string" ? JSON.parse(value) : value);

// dstack digest of one RTMR3 event: sha384(type (little endian) + ":" + name + ":" + payload).
function eventDigest({ event_type: type, event, event_payload: payload }) {
  const head = Buffer.alloc(4);
  head.writeUInt32LE(type);
  return sha384(Buffer.concat([head, Buffer.from(`:${event}:`), Buffer.from(payload, "hex")]));
}

export function replayRtmr3(eventLog) {
  let register = Buffer.alloc(48);
  for (const entry of eventLog.filter(({ imr }) => imr === 3)) {
    register = sha384(Buffer.concat([register, eventDigest(entry)]));
  }
  return register.toString("hex");
}

// `td` is the TD10 report from the verified quote: never read these values from the report JSON.
// Returns the compose hash and the container images in the compose file.
export function checkSoftware(report, td) {
  const eventLog = parsed(report.event_log);
  if (replayRtmr3(eventLog) !== td.rt_mr3) throw new Error("Event log does not replay to RTMR3");

  const appCompose = parsed(parsed(report.info)?.tcb_info)?.app_compose;
  if (!appCompose) throw new Error("Report holds no compose file");
  const composeHash = sha256(appCompose);
  const logged = eventLog.filter(({ imr, event }) => imr === 3 && event === "compose-hash");
  if (logged.length !== 1 || logged[0].event_payload !== composeHash) {
    throw new Error("Compose file does not match the event log");
  }
  if (!td.mr_config_id.startsWith(`01${composeHash}`)) throw new Error("Compose file does not match MRCONFIGID");

  const file = JSON.parse(appCompose).docker_compose_file ?? "";
  const images = [...new Set([...file.matchAll(/image:\s*(\S+)/g)].map((match) => match[1]))];
  return { composeHash, images };
}

// NVIDIA checks the GPU evidence. We trust the HTTPS connection for its answer, and we do not check the signature on the token.
export async function checkGpu(report, nonce, fetchFn = fetch) {
  const payload = parsed(report.nvidia_payload);
  if (!payload?.evidence_list?.length) throw new Error("Report holds no GPU evidence");
  if (payload.nonce !== nonce) throw new Error("GPU evidence does not hold our nonce");

  const res = await fetchFn(NRAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`GPU check: HTTP ${res.status}`);
  const token = (await res.json())?.[0]?.[1];
  const claims = JSON.parse(Buffer.from(String(token).split(".")[1] ?? "", "base64url").toString() || "{}");
  if (claims["x-nvidia-overall-att-result"] !== true) throw new Error("NVIDIA did not accept the GPU evidence");
  if (claims.eat_nonce !== nonce) throw new Error("NVIDIA's answer does not hold our nonce");
  return { gpus: payload.evidence_list.length };
}
