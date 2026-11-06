import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// .vercelignore is an allow-list. A local module that is not on it is not uploaded, and the hosted function crashes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowed = new Set(
  readFileSync(join(root, ".vercelignore"), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("!"))
    .map((line) => line.slice(1)),
);
const IMPORT = /(?:from|import\()\s*["'](\.{1,2}\/[^"']+)["']/g;

function localModules(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) localModules(resolve(dirname(file), spec), seen);
  return seen;
}

test("each local module of the hosted function is on the upload allow-list", () => {
  const files = [...localModules(join(root, "api/index.mjs"))].map((file) => relative(root, file));
  assert.ok(files.includes("tee/lab.mjs"));
  assert.deepEqual(files.filter((file) => !allowed.has(file)), []);
});
