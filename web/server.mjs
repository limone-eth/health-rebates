// The demo web app. With keys, it runs live claims. With no keys, it reads the last real results from the chain.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXPLORER, view } from "../chain/view.mjs";
import { summarizeBaseline } from "../tee/claim.mjs";
import { loadMembers } from "../tee/members.mjs";
import { insurerView, memberView } from "./views.mjs";

const STATE_FILE = new URL("./state.json", import.meta.url);
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const MEMBER_NAMES = ["A", "B", "C"];
const MAX_BODY = 256;
export const DEFAULT_MODEL = "Qwen/Qwen3.8-27B";
export const HELD_REASON = "Approve and Decline are off on this shared copy, so the demo stays the same for each visitor.";

const readState = () => JSON.parse(readFileSync(STATE_FILE, "utf8"));

async function readClaim(state, name) {
  const stored = state.members[name];
  const [record, signerRegistered] = await Promise.all([
    view(state.pool, "get_claim", { member: stored.account, week: state.week }),
    stored.signer ? view(state.pool, "is_registered_signer", { signer: stored.signer }) : null,
  ]);
  return { name, stored, record, signerRegistered };
}

// `hosted` is the shared copy: claims stop at `claimCap`, results go back to the page only, and the shared state never changes.
export async function createApp({
  live = null,
  liveReason = "",
  hosted = false,
  claimCap = null,
  capReason = "",
  members = null,
  state: getState = readState,
  saveState = null,
  read = readClaim,
  viewFn = view,
} = {}) {
  const save = saveState ?? ((state) => writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`));
  const data = Object.fromEntries((members ?? (await loadMembers())).map((member) => [member.name, member]));
  let running = false;

  const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const readBody = async (req) => {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (text.length > MAX_BODY) throw new Error("Body is too large");
    }
    return text ? JSON.parse(text) : {};
  };

  // Only this page can start a claim. Another site in the same browser cannot.
  const sameSite = (req) => {
    const host = req.headers.host ?? "";
    if (hosted) return req.headers.origin === `https://${host}`;
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host)) return false;
    const { origin } = req.headers;
    return !origin || origin === `http://${host}`;
  };

  // The count comes from the chain, so it stays correct across restarts and across instances of the function.
  const capReached = async (state) => {
    if (!hosted) return false;
    const { paid, not_paid: notPaid, held, rejected } = await viewFn(state.pool, "get_totals");
    return paid + notPaid + held + rejected >= claimCap;
  };

  const status = async (state) => {
    const off = !live ? liveReason : (await capReached(state)) ? capReason : null;
    return {
      mode: off ? "read_only" : "live",
      reason: off,
      can_decide: Boolean(live) && !hosted,
      held_reason: hosted ? HELD_REASON : null,
      pool: state.pool,
      explorer: EXPLORER,
    };
  };

  const insurer = async (state) => {
    const [config, totals, claims] = await Promise.all([
      viewFn(state.pool, "get_config"),
      viewFn(state.pool, "get_totals"),
      Promise.all(MEMBER_NAMES.map((name) => read(state, name))),
    ]);
    return insurerView({ pool: state.pool, config, totals, claims });
  };

  const member = async (state, name) => {
    const [config, claim] = await Promise.all([viewFn(state.pool, "get_config"), read(state, name)]);
    return memberView({
      claim,
      config,
      rows: data[name].claimRows,
      baseline: summarizeBaseline(data[name].baselineRows),
    });
  };

  async function finishClaim(res, name, stored) {
    const state = getState();
    const shown = { ...state, members: { ...state.members, [name]: stored } };
    if (!hosted) {
      save(shown);
      return { type: "done", member: name };
    }
    const [memberData, insurerData] = await Promise.all([member(shown, name), insurer(shown)]);
    const insurerRow = insurerData.members.find((row) => row.member === name);
    return { type: "done", member: name, session: { member: memberData, insurer_row: insurerRow } };
  }

  async function runClaim(req, res, name) {
    if (running) return send(res, 409, { detail: "A claim is running. Try again in a minute." });
    running = true;
    try {
      if (await capReached(getState())) return send(res, 403, { detail: capReason });
      res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
      const write = (event) => res.write(`${JSON.stringify(event)}\n`);
      try {
        const stored = await live.runClaim(name, (step, text) => write({ type: "step", step, text }));
        write(await finishClaim(res, name, stored));
      } catch (error) {
        // A public page must not show text from a service. The log keeps it.
        if (hosted) console.error("claim failed:", error);
        write({ type: "error", message: hosted ? "The claim did not finish. Try again." : String(error.message).slice(0, 400) });
      }
      res.end();
    } finally {
      running = false;
    }
  }

  async function resolve(req, res, name) {
    const { approve } = await readBody(req);
    if (typeof approve !== "boolean") return send(res, 422, { detail: "approve must be true or false" });
    const state = getState();
    await live.resolveHeld(state.members[name].account, state.week, approve);
    return send(res, 200, { ok: true });
  }

  function serveFile(res, pathname) {
    const relative = pathname === "/" ? "index.html" : normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
    const path = join(PUBLIC_DIR, relative);
    if (!path.startsWith(PUBLIC_DIR)) return send(res, 404, { detail: "Not found" });
    try {
      const body = readFileSync(path);
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" });
      return res.end(body);
    } catch {
      return send(res, 404, { detail: "Not found" });
    }
  }

  return createServer(async (req, res) => {
    try {
      if (!URL.canParse(req.url, "http://localhost")) return send(res, 400, { detail: "Invalid URL" });
      const { pathname } = new URL(req.url, "http://localhost");
      const state = getState();

      if (req.method === "POST") {
        if (!sameSite(req)) return send(res, 403, { detail: "Request from another site" });
        const match = pathname.match(/^\/api\/(claims|held)\/([ABC])$/);
        if (!match) return send(res, 404, { detail: "Not found" });
        if (!live) return send(res, 403, { detail: liveReason });
        if (hosted && match[1] === "held") return send(res, 403, { detail: HELD_REASON });
        return match[1] === "claims" ? await runClaim(req, res, match[2]) : await resolve(req, res, match[2]);
      }
      if (req.method !== "GET") return send(res, 405, { detail: "Method not allowed" });

      if (pathname === "/api/status") return send(res, 200, await status(state));
      if (pathname === "/api/insurer") return send(res, 200, await insurer(state));
      const match = pathname.match(/^\/api\/members\/([ABC])$/);
      if (match) return send(res, 200, await member(state, match[1]));
      if (pathname.startsWith("/api/")) return send(res, 404, { detail: "Not found" });
      return serveFile(res, pathname);
    } catch (error) {
      if (res.headersSent) return res.end();
      return send(res, 502, { detail: String(error.message).slice(0, 400) });
    }
  });
}

// The screen shows this text. A missing package must not show a path from this machine.
export function liveOffReason(error) {
  if (error.code === "ERR_MODULE_NOT_FOUND") return "Live claims are off: run npm install in chain/ and tee/";
  return `Live claims are off: ${String(error.message).split("\n")[0].slice(0, 160)}`;
}

// Live mode needs keys and npm install in chain/ and tee/. Anything missing gives the read-only view.
async function loadLive(state) {
  try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
  } catch {
    // No .env file: read-only.
  }
  const model = process.env.NEARAI_MODEL || DEFAULT_MODEL;
  try {
    const { createLive } = await import("./live.mjs");
    return { live: await createLive({ pool: state.pool, model }) };
  } catch (error) {
    return { liveReason: liveOffReason(error) };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const app = await createApp(await loadLive(readState()));
  app.listen(port, "127.0.0.1", () => console.log(`Web app: http://localhost:${port}`));
}
