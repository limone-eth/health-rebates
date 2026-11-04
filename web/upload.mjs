// Reads a CSV that a visitor uploads. An error names a line and a column, and never repeats a value from the file.
import { toRows } from "../tee/claim.mjs";

export const MAX_UPLOAD_BYTES = 16 * 1024;
const COLUMNS = ["date", "steps", "raised_heart_rate_minutes", "sleep_minutes", "sleep_bpm", "hrv_rmssd_ms", "bedtime", "day_bpm"];
const LIMITS = {
  steps: [0, 200000],
  raised_heart_rate_minutes: [0, 1440],
  sleep_minutes: [0, 1440],
  sleep_bpm: [20, 200],
  hrv_rmssd_ms: [1, 500],
  day_bpm: [20, 250],
};
const CLAIM_DAYS = 7;
const MIN_BASELINE_DAYS = 7;
const MAX_BASELINE_DAYS = 28;
const DAY_MS = 86400000;

export class UploadError extends Error {}

// The round trip rejects a date that does not exist, such as 2026-02-31.
const isDate = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
};

function readLine(cells, line) {
  if (cells.length !== COLUMNS.length) throw new UploadError(`Line ${line}: expected ${COLUMNS.length} columns.`);
  const row = Object.fromEntries(COLUMNS.map((name, index) => [name, cells[index].trim()]));
  if (!isDate(row.date)) throw new UploadError(`Line ${line}: date must be YYYY-MM-DD.`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.bedtime)) throw new UploadError(`Line ${line}: bedtime must be HH:MM.`);
  for (const [name, [min, max]] of Object.entries(LIMITS)) {
    const value = Number(row[name]);
    if (row[name] === "" || !Number.isFinite(value) || value < min || value > max) {
      throw new UploadError(`Line ${line}: ${name} must be a number from ${min} to ${max}.`);
    }
    row[name] = value;
  }
  return row;
}

// The same conversion as the sample members, so that one piece of code marks each day.
function toClaimRows(days) {
  const activity = days.map((day) => ({
    date: day.date,
    steps: day.steps,
    intensity_minutes: { moderate: day.raised_heart_rate_minutes, vigorous: 0 },
    heart_rate: { avg_bpm: day.day_bpm },
  }));
  const sleep = days.map((day) => ({
    date: day.date,
    duration_minutes: day.sleep_minutes,
    avg_heart_rate_bpm: day.sleep_bpm,
    avg_hrv_rmssd_ms: day.hrv_rmssd_ms,
    start_time: `${day.date}T${day.bedtime}:00Z`,
  }));
  return toRows(activity, sleep);
}

// The last 7 days are the claim week. The earlier days are the baseline.
export function parseUpload(text) {
  if (Buffer.byteLength(text) > MAX_UPLOAD_BYTES) throw new UploadError("The file is too large.");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((name) => name.trim().toLowerCase());
  if (header.join() !== COLUMNS.join()) throw new UploadError(`The first line must be: ${COLUMNS.join(",")}`);

  const days = lines
    .map((content, index) => ({ content, line: index + 1 }))
    .slice(1)
    .filter(({ content }) => content.trim() !== "")
    .map(({ content, line }) => readLine(content.split(","), line))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (new Set(days.map((day) => day.date)).size !== days.length) throw new UploadError("Each date can appear only once.");
  if (days.length < CLAIM_DAYS + MIN_BASELINE_DAYS) {
    throw new UploadError(`The file needs at least ${CLAIM_DAYS + MIN_BASELINE_DAYS} days: ${MIN_BASELINE_DAYS} usual days and a ${CLAIM_DAYS}-day claim week.`);
  }
  const week = days.slice(-CLAIM_DAYS);
  const spread = (new Date(week.at(-1).date) - new Date(week[0].date)) / DAY_MS;
  if (spread !== CLAIM_DAYS - 1) throw new UploadError("The last 7 days must be consecutive.");

  return {
    baselineRows: toClaimRows(days.slice(0, -CLAIM_DAYS).slice(-MAX_BASELINE_DAYS)),
    claimRows: toClaimRows(week),
  };
}
