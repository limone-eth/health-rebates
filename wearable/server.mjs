// A mock of two Open Wearables endpoints, for synthetic members only.
// A real Open Wearables instance can replace it: change the base URL and the API key.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { evaluateWeek, summarizeBaseline, toRows } from "../tee/claim.mjs";
import { BASELINE_WEEK, CLAIM_WEEK, daysInRange, hasMember, MEMBERS } from "./data.mjs";

const ROUTE = /^\/api\/v1\/users\/([^/]+)\/summaries\/(activity|sleep)$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
const MAX_CLAIM_BODY = 1024;
const NEAR_ACCOUNT = /^(?=.{2,64}$)[a-z0-9]+([-_.][a-z0-9]+)*$/;

const rowsFor = (userId, { start, end }) =>
  toRows(daysInRange(userId, "activity", start, end), daysInRange(userId, "sleep", start, end));

// Reads the caller's fields, and uses no hash or result from them.
// The caller's API key stands in for a member login. A real service must link one NEAR account to each member.
export async function buildClaim({ contract, signMessage }, { user_id: userId, near_account: nearAccount, week } = {}) {
  if (!hasMember(userId)) return [404, { detail: "User not found" }];
  if (week !== CLAIM_WEEK.start) return [422, { detail: "Only the current claim week can be claimed" }];
  if (typeof nearAccount !== "string" || !NEAR_ACCOUNT.test(nearAccount)) return [422, { detail: "Bad near_account" }];

  return [200, await signRows({ contract, signMessage }, rowsFor(userId, BASELINE_WEEK), rowsFor(userId, CLAIM_WEEK), nearAccount, week)];
}

// No HTTP route gives this function rows from a caller. Only the demo's own upload path in web/live.mjs does, and the screen says that an upload has no proof.
// Plain code decides the result, so no model sees the rows. The hash binds the result to the exact input rows.
export async function signRows({ contract, signMessage }, baselineRows, claimRows, nearAccount, week) {
  const input = JSON.stringify({ owner_baseline: summarizeBaseline(baselineRows), claim_week: claimRows });
  const requestHash = createHash("sha256").update(input).digest("hex");
  const { days_met: daysMet, pattern_matches_owner: patternMatches } = evaluateWeek(baselineRows, claimRows);
  const signature = await signMessage(`rebate-result:${contract}:${nearAccount}:${week}:${requestHash}:${daysMet}:${patternMatches}`);
  return { request_hash: requestHash, days_met: daysMet, pattern_matches_owner: patternMatches, wearable_signature: signature };
}

async function createClaim(req, claims) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_CLAIM_BODY) return [413, { detail: "Body is too large" }];
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return [400, { detail: "Body is not JSON" }];
  }
  return buildClaim(claims, body ?? {});
}

const parseDate = (value) => {
  const date = value?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  // The round trip rejects a date that does not exist, such as 2026-02-31.
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
};

// With `claims` ({ contract, signMessage }), the service also decides and signs claim results.
export function createWearableServer({ apiKey = "demo-key", claims } = {}) {
  return createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    // A path such as "//" is not a valid URL. Without this check, it stops the process.
    if (!URL.canParse(req.url, "http://localhost")) return send(400, { detail: "Invalid URL" });
    const url = new URL(req.url, "http://localhost");

    if (claims && req.method === "POST" && url.pathname === "/mock/claims") {
      if (req.headers["x-open-wearables-api-key"] !== apiKey) return send(401, { detail: "Invalid API key" });
      try {
        const [status, body] = await createClaim(req, claims);
        return send(status, body);
      } catch {
        return send(500, { detail: "Could not build the claim" });
      }
    }
    if (req.method !== "GET") return send(405, { detail: "Method not allowed" });

    if (url.pathname === "/mock/members") {
      return send(
        200,
        Object.entries(MEMBERS).map(([id, { name, expected }]) => ({ id, name, expected })),
      );
    }

    const match = url.pathname.match(ROUTE);
    if (!match) return send(404, { detail: "Not found" });
    if (req.headers["x-open-wearables-api-key"] !== apiKey) return send(401, { detail: "Invalid API key" });

    const [, userId, kind] = match;
    const start = parseDate(url.searchParams.get("start_date"));
    const end = parseDate(url.searchParams.get("end_date"));
    if (!start || !end) return send(422, { detail: "start_date and end_date are required" });
    if (!hasMember(userId)) return send(404, { detail: "User not found" });

    const limit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
    const offset = Number(url.searchParams.get("cursor") ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return send(422, { detail: "Invalid limit" });
    if (!Number.isInteger(offset) || offset < 0) return send(422, { detail: "Invalid cursor" });

    const days = daysInRange(userId, kind, start, end);
    if (url.searchParams.get("sort_order") === "desc") days.reverse();
    const data = days.slice(offset, offset + limit);
    const hasMore = offset + limit < days.length;

    return send(200, {
      data,
      pagination: {
        next_cursor: hasMore ? String(offset + limit) : null,
        previous_cursor: offset > 0 ? String(Math.max(offset - limit, 0)) : null,
        has_more: hasMore,
        total_count: days.length,
      },
      metadata: { resolution: null, sample_count: data.length, start_time: start, end_time: end },
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8787);
  createWearableServer({ apiKey: process.env.MOCK_WEARABLE_API_KEY ?? "demo-key" }).listen(port, () => {
    console.log(`Mock wearable service: http://localhost:${port}/mock/members`);
  });
}
