import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseUpload, UploadError } from "./upload.mjs";

const sample = readFileSync(new URL("./public/sample-data.csv", import.meta.url), "utf8");
const members = JSON.parse(readFileSync(new URL("./members.json", import.meta.url), "utf8"));
const lines = sample.trim().split("\n");

test("the template gives the same rows as sample member A", () => {
  const { baselineRows, claimRows } = parseUpload(sample);
  assert.deepEqual(claimRows, members[0].claimRows);
  assert.deepEqual(baselineRows, members[0].baselineRows);
});

test("the last 7 days are the claim week, in any line order and with Windows line ends", () => {
  const shuffled = [lines[0], ...lines.slice(1).reverse()].join("\r\n");
  const { claimRows } = parseUpload(`﻿${shuffled}\r\n`);
  assert.deepEqual(claimRows.map((row) => row.date), members[0].claimRows.map((row) => row.date));
});

test("bad files give an error with no value from the file", () => {
  const change = (cell, value) => {
    const parts = lines[1].split(",");
    parts[cell] = value;
    return [lines[0], parts.join(","), ...lines.slice(2)].join("\n");
  };
  const cases = [
    "not,a,header\n1,2,3",
    lines.slice(0, 10).join("\n"),
    change(0, "SECRET"),
    change(1, "SECRET"),
    change(6, "SECRET"),
    `${sample}${lines[1]}\n`,
    [...lines.slice(0, -2), lines.at(-1)].join("\n"),
    "x".repeat(20000),
  ];
  for (const text of cases) {
    assert.throws(() => parseUpload(text), (error) => error instanceof UploadError && !/SECRET/.test(error.message));
  }
});
