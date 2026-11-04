// The hosted copy on Vercel. With its keys and a claim cap, anyone with the link can run a live claim. With no keys, it only reads results from the chain.
import { readFileSync } from "node:fs";
import { createApp, DEFAULT_MODEL } from "../web/server.mjs";

export const HOSTED_REASON = "This hosted copy shows the last real results. To run a live claim, run the app on your own machine.";
export const CAP_REASON = "This demo has used all of its live claims. It shows the last real results.";
const REQUIRED = ["NEARAI_CLOUD_API_KEY", "DEV_ACCOUNT_ID", "DEV_NEAR_KEY", "DEV_WEARABLE_KEY", "CLAIM_CAP"];

// A missing key, or a cap that is not a whole number, gives the read-only view. The code that needs keys loads only after this check.
export async function hostedLive(pool, env = process.env) {
  const claimCap = Number(env.CLAIM_CAP);
  if (REQUIRED.some((name) => !env[name]) || !Number.isInteger(claimCap)) return { liveReason: HOSTED_REASON };
  try {
    const { createLive } = await import("../web/live.mjs");
    return { live: await createLive({ pool, model: env.NEARAI_MODEL || DEFAULT_MODEL }), claimCap, capReason: CAP_REASON };
  } catch (error) {
    console.error("live claims are off:", error);
    return { liveReason: HOSTED_REASON };
  }
}

// The host does not let a function open a local server, so it reads the synthetic weeks from a file. A test keeps the file equal to the source.
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const app = await createApp({
  hosted: true,
  members: readJson("../web/members.json"),
  ...(await hostedLive(readJson("../web/state.json").pool)),
});

export default function handler(req, res) {
  app.emit("request", req, res);
}
