import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The page and the README show the same "What you trust" table.
test("the trust table on the page matches the README", () => {
  const app = readFileSync(new URL("./public/app.js", import.meta.url), "utf8");
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const source = app.slice(app.indexOf("const TRUST = ["), app.indexOf("];", app.indexOf("const TRUST = [")) + 2);
  const rows = JSON.parse(source.replace("const TRUST = ", "").replace(/;$/, "").replace(/,\s*\]$/, "]"));
  assert.equal(rows.length, 5);
  for (const row of rows) assert.ok(readme.includes(`| ${row.join(" | ")} |`), `README misses the row for ${row[0]}`);
});
