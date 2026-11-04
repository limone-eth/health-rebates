// A mock of two Open Wearables endpoints, for synthetic members only.
// A real Open Wearables instance can replace it: change the base URL and the API key.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { daysInRange, hasMember, MEMBERS } from "./data.mjs";

const ROUTE = /^\/api\/v1\/users\/([^/]+)\/summaries\/(activity|sleep)$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

const parseDate = (value) => {
  const date = value?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  // The round trip rejects a date that does not exist, such as 2026-02-31.
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
};

export function createWearableServer({ apiKey = "demo-key" } = {}) {
  return createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    // A path such as "//" is not a valid URL. Without this check, it stops the process.
    if (!URL.canParse(req.url, "http://localhost")) return send(400, { detail: "Invalid URL" });
    const url = new URL(req.url, "http://localhost");
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8787);
  createWearableServer({ apiKey: process.env.MOCK_WEARABLE_API_KEY ?? "demo-key" }).listen(port, () => {
    console.log(`Mock wearable service: http://localhost:${port}/mock/members`);
  });
}
