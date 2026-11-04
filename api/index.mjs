// The hosted copy on Vercel. It gets no keys and never loads web/live.mjs, so it only reads results from the chain.
import { readFileSync } from "node:fs";
import { createApp } from "../web/server.mjs";

export const HOSTED_REASON = "This hosted copy shows the last real results. To run a live claim, run the app on your own machine.";

// The host does not let a function open a local server, so it reads the synthetic weeks from a file. A test keeps the file equal to the source.
const members = JSON.parse(readFileSync(new URL("../web/members.json", import.meta.url), "utf8"));
const app = await createApp({ liveReason: HOSTED_REASON, members });

export default function handler(req, res) {
  app.emit("request", req, res);
}
