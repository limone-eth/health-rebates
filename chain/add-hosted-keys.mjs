// The owner runs this once for each target: node chain/add-hosted-keys.mjs <preview|production> <claim cap>
// It reads each value from the local key files and passes it to the Vercel CLI on stdin. It prints only the names.
// To give the host its own NEAR AI key, add HOSTED_NEARAI_CLOUD_API_KEY to .env.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [target, cap] = process.argv.slice(2);
if (!["preview", "production"].includes(target) || !/^\d+$/.test(cap ?? "")) {
  console.error("Use: node chain/add-hosted-keys.mjs <preview|production> <claim cap>");
  process.exit(1);
}

process.loadEnvFile(new URL("../.env", import.meta.url));
const { accountId, nearKey, wearableKey } = JSON.parse(readFileSync(new URL("./.env.testnet", import.meta.url), "utf8"));
const nearAiKey = process.env.HOSTED_NEARAI_CLOUD_API_KEY || process.env.NEARAI_CLOUD_API_KEY;
if (!nearAiKey) throw new Error("No NEAR AI key in .env");

const values = {
  NEARAI_CLOUD_API_KEY: nearAiKey,
  DEV_ACCOUNT_ID: accountId,
  DEV_NEAR_KEY: nearKey,
  DEV_WEARABLE_KEY: wearableKey,
  CLAIM_CAP: cap,
};
for (const [name, value] of Object.entries(values)) {
  const { status } = spawnSync("vercel", ["env", "add", name, target, "--force", "--yes", "--sensitive"], {
    input: value,
    stdio: ["pipe", "ignore", "ignore"],
    cwd: new URL("..", import.meta.url),
  });
  console.log(`${name}: ${status === 0 ? "added" : "FAILED"}`);
}
