// The member screen, the insurer screen and the Verified panel. Plain JavaScript with no build step.
const NAMES = ["A", "B", "C"];
const YOU = "You";
const COUNT_UP_MS = 1200;
// Steps can arrive together. This gap lets each tick show. The last tick holds a moment before the result lands.
const STEP_GAP_MS = 280;
const STEP_SETTLE_MS = 420;
const HELD_POLL_ATTEMPTS = 12;
const HELD_POLL_MS = 1500;

// A wearable claim needs no model: code applies the rule and the wearable service signs the result.
const STEPS = [
  ["account", "Test account opened"],
  ["wearable", "Good days counted and signed"],
  ["chain", "Signature checked"],
];

const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M7 7h10v10M7 17 17 7"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  minus: '<path d="M5 12h14"/>',
};

const TRACKER_NAMES = { whoop: "Whoop", oura: "Oura" };
const WHOOP_NOTE = "Whoop gives heart rate zones for workouts only, so active minutes count workouts only.";

const app = {
  status: null,
  view: "member",
  name: "A",
  members: {},
  insurer: null,
  proof: { member: false, insurer: "A" },
  run: null,
  runError: null,
  justRan: new Set(),
  // Claims from this visit on the shared copy. The server does not keep them.
  session: {},
  heldBusy: false,
  heldError: null,
  loadError: null,
};

const main = document.getElementById("main");
const views = document.getElementById("views");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const dayOf = (iso) => new Date(`${iso}T00:00:00Z`);
const longDate = (iso) => dayOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDay = (iso) => {
  const date = dayOf(iso);
  return `${date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${date.getUTCDate()}`;
};
const sleepText = (minutes) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

// The contract holds the rule as one line of text. This gives the plain sentence, or that line if its form changes.
function readRule(rule) {
  const match = /(\d+)\+ steps with (\d+)\+ raised heart rate minutes, and (\d+)\+ sleep minutes, on (\d+) of (\d+) days/.exec(rule ?? "");
  if (!match) return { sentence: rule, goal: null };
  const [, steps, active, sleep, goal, total] = match.map(Number);
  const hours = sleep % 60 === 0 ? `${sleep / 60} hours` : sleepText(sleep);
  return {
    sentence: `A good day: ${steps.toLocaleString("en-US")} steps, ${active} active minutes, ${hours} of sleep.`,
    goal,
  };
}

const rebateText = (m) =>
  ({ Paid: "Paid", NotPaid: "Not paid", Held: "Held for review", Rejected: "Declined" })[m.outcome] ?? "No claim";
const insurerResult = (m) => (m.outcome === "Held" ? "Held for your review" : rebateText(m));
const patternText = (m) => (m.pattern_matches_owner === null ? "Not known" : m.pattern_matches_owner ? "Yes" : "No");

const runNote = (name, date) => (app.justRan.has(name) ? "From the claim you just ran" : `Earlier real run, ${longDate(date)}`);
const offNote = () => (app.status?.mode === "live" ? "" : `<p class="reason">${esc(app.status?.reason || "Live claims are off.")}</p>`);

async function getJson(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
  return body;
}

async function loadAll() {
  const [status, insurer, ...members] = await Promise.all([
    getJson("/api/status"),
    getJson("/api/insurer"),
    ...NAMES.map((name) => getJson(`/api/members/${name}`)),
  ]);
  app.status = status;
  app.insurer = insurer;
  NAMES.forEach((name, index) => (app.members[name] = members[index]));
  for (const [name, { member, insurer_row: row }] of Object.entries(app.session)) {
    app.members[name] = member;
    const known = app.insurer.members.some((m) => m.member === name);
    app.insurer.members = known ? app.insurer.members.map((m) => (m.member === name ? row : m)) : [...app.insurer.members, row];
  }
  app.loadError = null;
}

function fieldsHtml(items) {
  return `<dl class="fields">${items.map(([label, value]) => `<div class="field"><dt class="lab">${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
}

// Wide screens read the week across, and phones read it down.
function weekColumns(m) {
  const row = (label, cell, numeric) =>
    `<tr><th class="lab" scope="row">${label}</th>${m.rows.map((r) => `<td class="${numeric ? "n" : ""} ${r.meets_rule ? "" : "missed"}">${esc(cell(r))}</td>`).join("")}</tr>`;
  const days = m.rows.map((r) => `<th class="${r.meets_rule ? "" : "missed"}" scope="col">${esc(shortDay(r.date))}</th>`).join("");
  return `<table class="week across">
    <caption class="sr-only">Your week, day by day</caption>
    <thead><tr><th class="lab" scope="col">Day</th>${days}</tr></thead>
    <tbody>
      ${row("Steps", (r) => r.steps.toLocaleString("en-US"), true)}
      ${row("Active min", (r) => r.raised_heart_rate_minutes, true)}
      ${row("Sleep", (r) => sleepText(r.sleep_minutes), true)}
      ${row("Goal", (r) => (r.meets_rule ? "Met" : "Missed"))}
    </tbody>
  </table>`;
}

function weekRows(m) {
  const rows = m.rows
    .map((r) => `<tr class="${r.meets_rule ? "" : "missed"}">
        <td>${esc(shortDay(r.date))}</td>
        <td class="n">${r.steps.toLocaleString("en-US")}</td>
        <td class="n">${r.raised_heart_rate_minutes}</td>
        <td class="n">${sleepText(r.sleep_minutes)}</td>
        <td>${r.meets_rule ? "Met" : "Missed"}</td>
      </tr>`)
    .join("");
  return `<table class="week down">
    <caption class="sr-only">Your week, day by day</caption>
    <thead><tr><th class="lab" scope="col">Day</th><th class="lab" scope="col">Steps</th><th class="lab" scope="col">Active</th><th class="lab" scope="col">Sleep</th><th class="lab" scope="col">Goal</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function memberHtml(m, { arrive, landed }) {
  const rule = readRule(m.rule);
  const running = Boolean(app.run);
  const live = app.status.mode === "live";
  const shown = running ? { ...m, days_met: null, outcome: null, pattern_matches_owner: null } : m;
  const daysLabel = running ? "Counting" : m.days_met === null ? "No result yet" : `Of ${m.rows.length} good days`;
  const goalLabel = !running && m.days_met !== null && rule.goal ? `Goal ${rule.goal}` : "";

  return `<section class="intro">
      <h1 class="display" tabindex="-1">
        <span>Health that pays,</span>
        <span class="ctx">without giving up your data.</span>
      </h1>
      <p class="lede">Healthy weeks earn you a rebate. Your insurer sees the result, never your steps or sleep.</p>
    </section>

    <article class="pass ${arrive ? "arrive" : ""} ${landed ? "landed" : ""} ${running ? "running" : ""}" aria-label="Your ticket for this week">
      <div class="keep">
        <div class="stamp">
          <p class="lab">Week of ${esc(longDate(m.rows[0].date))}</p>
          <p class="lab">Yours to keep</p>
        </div>
        <div class="keep-main">
          <div class="readout-col">
            <p class="readout" data-count="${shown.days_met ?? ""}">${shown.days_met ?? "–"}</p>
            <p class="lab">${esc(daysLabel)}${goalLabel ? `<br>${esc(goalLabel)}` : ""}</p>
          </div>
          ${weekColumns(m)}
          ${weekRows(m)}
        </div>
        ${m.explanation && !running
          ? `<details class="why"><summary>Why this result</summary><p class="rule">${esc(rule.sentence)}</p><p class="explain">${esc(m.explanation)}</p></details>`
          : `<p class="rule">${esc(rule.sentence)}</p>`}
      </div>
      <div class="stub-part" style="view-transition-name: stub-${m.member}">
        <div class="tear" aria-hidden="true"></div>
        <p class="lab stub-title">All your insurer sees</p>
        ${running
          ? fieldsHtml([["Good days", "Working"], ["Usual week", "Working"], ["Rebate", "Working"]])
          : fieldsHtml([
              ["Good days", m.days_met === null ? "None yet" : `${m.days_met} of ${m.rows.length}`],
              ["Usual week", patternText(m)],
              ["Rebate", rebateText(m)],
            ])}
        ${shown.outcome ? `<button type="button" class="link" data-action="proof-member" aria-expanded="${app.proof.member}" aria-controls="proof">${icon("check")}Verified</button>` : running ? `<span class="link link-slot" aria-hidden="true">${icon("check")}Verified</span>` : ""}
      </div>
    </article>

    <section class="bar">
      <div class="pick">
        <p class="lab" id="pick-label">${app.members[YOU] ? "Whose week" : "Sample member"}</p>
        <div class="seg seg-letters" id="members" role="group" aria-labelledby="pick-label">
          <span class="lens" aria-hidden="true"></span>
          ${pickNames().map((name) => `<button type="button" data-member="${name}" class="${name === YOU ? "pick-you" : ""}" aria-pressed="${name === m.member}" aria-label="${name === YOU ? "Your data" : `Member ${name}`}" ${running ? "disabled" : ""}>${name}</button>`).join("")}
        </div>
      </div>
      ${m.member === YOU && !running ? "" : `<button type="button" class="btn btn-primary" data-action="claim" ${live && !running && !app.lab.run ? "" : "disabled"}>${running ? "Running the claim" : "Run a live claim"}</button>`}
      <p class="lab">${esc(running ? `About 15 seconds. ${app.run.name === YOU ? "Your data" : `Member ${app.run.name}`}.` : runNote(m.member, m.recorded_on))}</p>
      ${m.source === "whoop" && !running ? `<p class="rule">${esc(WHOOP_NOTE)}</p>` : ""}
      ${offNote()}
      ${app.runError ? `<p class="alert" role="alert">The claim stopped. ${esc(app.runError)} The last result is still here.</p>` : ""}
      ${uploadHtml()}
      <div id="steps" aria-live="polite">${stepsHtml()}</div>
    </section>
  <div id="proof">${app.proof.member && m.outcome ? proofHtml(m, "your claim") : ""}</div>
  ${labHtml()}`;
}

// The preview shows an upload before its claim ends, so the picker needs the name from that point.
const pickNames = () => (app.members[YOU] ? [...NAMES, YOU] : NAMES);
const who = (name) => (name === YOU ? "you" : `member ${name}`);

function uploadHtml() {
  if (!app.status || app.status.mode !== "live" || app.run) return "";
  if (app.connect) return connectHtml(app.connect);
  if (!app.upload) {
    return `<div class="upload-open">
      <button type="button" class="link" data-action="upload-pick">Try your own data</button>
      <a class="link" href="/sample-data.csv" download>Get the CSV template</a>
      ${(app.status.trackers ?? []).map((maker) => `<button type="button" class="link" data-action="connect-pick" data-maker="${esc(maker)}">Connect ${esc(TRACKER_NAMES[maker])}</button>`).join("")}
      <input type="file" id="upload-file" accept=".csv,text/csv" hidden>
    </div>`;
  }
  return `<div class="upload-panel" role="group" aria-label="Run a claim with your data">
    <p class="lab">${esc(app.upload.fileName)}</p>
    <ul class="rule">
      <li>This server reads your file during the claim and keeps nothing.</li>
      <li>Code on this server counts your good days. No model reads your week.</li>
      <li>Your good days and the result stay public on a test network, under a made-up name.</li>
      <li>This week has no proof from a wearable service, so anyone could type these numbers.</li>
    </ul>
    <div class="held-actions">
      <button type="button" class="btn btn-primary btn-small" data-action="upload-run">Run with my data</button>
      <button type="button" class="btn btn-secondary btn-small" data-action="upload-cancel">Cancel</button>
    </div>
  </div>`;
}

function connectHtml(maker) {
  const name = TRACKER_NAMES[maker];
  return `<div class="upload-panel" role="group" aria-label="Run a claim with your ${esc(name)} data">
    <p class="lab">Connect ${esc(name)}</p>
    <ul class="rule">
      <li>${esc(name)} sends this server your last 36 days during the claim. The server keeps no data and no token.</li>
      <li>Code on this server counts your good days. No model reads your week.</li>
      <li>Your good days and the result stay public on a test network, under a made-up name.</li>
      <li>This server signs your week with its own key. ${esc(name)} does not sign it.</li>
      ${maker === "whoop" ? `<li>${esc(WHOOP_NOTE)}</li>` : ""}
    </ul>
    <div class="held-actions">
      <a class="btn btn-primary btn-small" href="/api/trackers/${esc(maker)}/start">Continue to ${esc(name)}</a>
      <button type="button" class="btn btn-secondary btn-small" data-action="connect-cancel">Cancel</button>
    </div>
  </div>`;
}

function stepStates() {
  const done = new Set(app.run.done);
  const nextId = STEPS.find(([id]) => !done.has(id))?.[0];
  return (id) => (done.has(id) ? "done" : id === nextId ? "now" : "");
}

function stepsHtml() {
  if (!app.run) return "";
  const stateOf = stepStates();
  const enter = app.run.done.length === 0;
  return `<ol class="steps ${enter ? "enter" : ""}">${STEPS.map(([id, text], index) => {
    const state = stateOf(id);
    return `<li data-step="${id}" class="${state}" style="--i:${index}"><span class="mark"><span class="dot"></span>${icon("check")}</span><span>${esc(text)}<span class="sr-only">${state === "done" ? " Done." : ""}</span></span></li>`;
  }).join("")}</ol>`;
}

// Changes the rows in place, so that each tick animates and the running animations do not restart.
function updateSteps() {
  const rows = document.querySelectorAll("#steps li[data-step]");
  if (!rows.length || !app.run) return;
  const stateOf = stepStates();
  rows.forEach((row) => {
    const id = row.dataset.step;
    const state = stateOf(id);
    row.className = state;
    row.querySelector(".sr-only").textContent = state === "done" ? " Done." : "";
  });
}

function insurerHtml(data, { arrive }) {
  const countOf = (outcome) => data.members.filter((m) => m.outcome === outcome).length;
  const paid = countOf("Paid");
  const withClaim = data.members.filter((m) => m.days_met !== null);
  const dates = withClaim.map((m) => m.recorded_on).sort();
  const latest = dates.at(-1);
  const justRan = data.members.some((m) => app.justRan.has(m.member));
  const note = justRan ? "Includes the claim you just ran" : latest ? `Earlier real run, ${longDate(latest)}` : "";
  const open = app.proof.insurer;
  const opened = data.members.find((m) => m.member === open && m.outcome);

  return `<section class="summary">
    <div class="head">
      <h1 class="display" tabindex="-1">
        <span>Reward healthy customers,</span>
        <span class="ctx">without holding health data.</span>
      </h1>
      ${note ? `<p class="lab">${esc(note)}</p>` : ""}
      ${offNote()}
    </div>
    <div class="paid">
      <p class="readout" data-count="${paid}">${paid}</p>
      <p class="lab">${paid === 1 ? "Rebate" : "Rebates"} paid this week</p>
    </div>
  </section>
  <section class="stubs" aria-label="Claims for this week">
    ${data.members.map((m, index) => stubHtml(m, index, data, arrive)).join("")}
  </section>
  <div id="proof">${opened ? proofHtml(opened, who(opened.member)) : ""}</div>
  ${labInsurerHtml()}`;
}

function stubHtml(m, index, data, arrive) {
  const live = app.status.can_decide;
  const held = m.outcome === "Held";
  return `<article class="row ${arrive ? "arrive" : ""}" style="--i:${index}" aria-label="Claim from ${esc(who(m.member))}">
    <div class="closed"><p class="lab">Health data stays with ${esc(who(m.member))}</p></div>
    <div class="open" style="view-transition-name: stub-${m.member}">
      <div class="tear" aria-hidden="true"></div>
      ${fieldsHtml([
        ["Good days", m.days_met === null ? "None yet" : `${m.days_met} of ${data.total_days}`],
        ["Usual week", patternText(m)],
        ["Result", insurerResult(m)],
      ])}
      <div class="row-side">
        ${m.outcome ? `<button type="button" class="link" data-action="proof-insurer" data-member="${m.member}" aria-expanded="${app.proof.insurer === m.member}" aria-controls="proof" aria-label="Verified: what was checked for ${esc(who(m.member))}">${icon("check")}Verified</button>` : ""}
        ${
          held
            ? `<div class="held">
                <p class="rule">Unusual week for this member. You decide.</p>
                <div class="held-actions">
                  <button type="button" class="btn btn-primary btn-small" data-action="approve" data-member="${m.member}" ${live && !app.heldBusy ? "" : "disabled"}>${app.heldBusy ? "Sending" : "Approve and pay"}</button>
                  <button type="button" class="btn btn-secondary btn-small" data-action="reject" data-member="${m.member}" ${live && !app.heldBusy ? "" : "disabled"}>Decline</button>
                </div>
                ${app.status.held_reason ? `<p class="reason">${esc(app.status.held_reason)}</p>` : ""}
                ${app.heldError ? `<p class="alert" role="alert">${esc(app.heldError)}</p>` : ""}
              </div>`
            : ""
        }
      </div>
    </div>
  </article>`;
}

function signedBy(m) {
  if (m.member !== YOU) return "The wearable service read the week, applied the rule in code and signed the result";
  const name = TRACKER_NAMES[m.source];
  if (!name) return "This demo's key signed the result. An uploaded week has no proof from a wearable service.";
  return `This server read the week from ${name}, applied the rule and signed the result. ${name} did not sign it.`;
}

// An older claim went through the model, and keeps the checks that it had.
function modelProofRows(m, row, accepted) {
  const signerKnown = accepted && m.signer_registered === true;
  return `
      ${row(signerKnown, "The model ran in a sealed machine", "Intel signed a report on it")}
      ${row(signerKnown, "The key belongs to that machine", "Intel's report names it")}
      ${row(accepted, "The answer is unchanged", "Its signature matches")}
      ${row(accepted, "Two signatures passed", "The model and the wearable service")}`;
}

// Real checks only: each row reads what the chain holds for this claim.
function proofHtml(m, who) {
  const accepted = Boolean(m.outcome);
  const row = (ok, point, context) =>
    `<li>${icon(ok ? "check" : "minus")}<span>${esc(point)}</span><span class="ctx">${esc(context)}</span><span class="lab status ${ok ? "" : "off"}">${ok ? "Passed" : "Not shown"}</span></li>`;
  const publicFacts = `Good days, usual week and ${m.payout ? "payment" : "outcome"}, under a made-up name`;
  const txUrl = `${app.status.explorer}/${encodeURIComponent(m.tx)}`;
  const viaModel = Boolean(m.signer);

  return `<section class="proof" aria-label="What was checked">
    <h2 tabindex="-1">What was checked for ${esc(who)}</h2>
    <p class="lab when">Checked on ${esc(longDate(m.recorded_on))}</p>
    <ul class="checks">
      ${viaModel ? modelProofRows(m, row, accepted) : `
      ${row(accepted, "The result is signed", signedBy(m))}
      ${row(accepted, "The result is unchanged", "The contract checked the signature before it paid")}`}
      <li>${icon("arrow")}<span>Some facts are public</span><span class="ctx">${esc(publicFacts)}</span><a class="lab status" href="${esc(txUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open the public record, in a new tab">See record</a></li>
      ${viaModel ? "" : `<li>${icon("info")}<span>No model saw the week</span><span class="ctx">The rule is plain code, so the wearable service needs no model to apply it.</span><span class="lab status">Code</span></li>`}
      <li>${icon("minus")}<span>Who you trust</span><span class="ctx">${viaModel ? "Code outside the sealed machine marks each day. No one has confirmed that the model's software is safe." : "The wearable service sees your week and signs the result. The insurer does not see the week."}</span><span class="lab status off">Not proven</span></li>
    </ul>
    <details class="tech">
      <summary>Technical details</summary>
      <dl>
        <dt class="lab">Network</dt><dd>NEAR testnet</dd>
        ${m.payout ? `<dt class="lab">Rebate amount</dt><dd>${esc(m.payout)} (tUSD, a test token with no value)</dd>` : ""}
        <dt class="lab">Member account</dt><dd>${esc(m.account)}</dd>
        <dt class="lab">Pool</dt><dd>${esc(app.status.pool)}</dd>
        ${viaModel && app.insurer?.model ? `<dt class="lab">Model</dt><dd>${esc(app.insurer.model)}</dd>` : ""}
        ${viaModel ? `<dt class="lab">Model signer</dt><dd>${esc(m.signer)}</dd>` : ""}
        <dt class="lab">${viaModel ? "Request hash" : "Input hash"}</dt><dd>${esc(m.request_hash)}</dd>
      </dl>
    </details>
  </section>`;
}

// Lab rebate, once a year. The model in the TEE reads the HbA1c values, and code on the server applies the rule.
const LAB_STEPS = [
  ["account", "Test account opened"],
  ["attestation", "Sealed model checked"],
  ["model", "Report read by the sealed model"],
  ["rule", "Lab rule applied in code"],
  ["chain", "Both signatures checked"],
];
const LAB_SAMPLES = [
  ["pass-mmol", "Under 5.7%, in mmol/mol"],
  ["pass-percent-better", "0.4 points better"],
  ["fail-percent", "Only 0.1 points better"],
  ["fail-mmol", "Over 5.7%, in mmol/mol"],
  ["old-test", "Test older than a year"],
  ["no-hba1c", "No HbA1c on the report"],
];
const LAB_RULE_TEXT = "An HbA1c test in the last 12 months, with HbA1c under 5.7% or 0.3 points better than the last test.";
// pdf.js renders page 1 of a PDF in the browser. The server takes images only.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/";
const LAB_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LAB_MAX_BYTES = 3 * 1024 * 1024;
const LAB_MAX_SIDE = 2000;

app.lab = { file: null, preparing: false, run: null, error: null, result: null };
// Lab claims from this visit, for the insurer screen. The server does not keep them.
app.labRows = [];

const yesNo = (value) => (value ? "Yes" : "No");
const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Draws the image at most LAB_MAX_SIDE pixels on its long side. A PNG stays sharp for text; a large one becomes a JPEG.
async function drawImage(source, width, height) {
  const scale = Math.min(1, LAB_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const png = await canvasBlob(canvas, "image/png");
  if (png && png.size <= LAB_MAX_BYTES) return { blob: png, type: "image/png" };
  return { blob: await canvasBlob(canvas, "image/jpeg", 0.9), type: "image/jpeg" };
}

async function pdfPage(file) {
  const pdfjs = await import(`${PDFJS}pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, LAB_MAX_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return drawImage(canvas, canvas.width, canvas.height);
  } finally {
    pdf.destroy();
  }
}

async function labImage(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return pdfPage(file);
  if (!file.type.startsWith("image/")) throw new Error("Choose a PDF or a photo of the report.");
  const bitmap = await createImageBitmap(file);
  try {
    const small = Math.max(bitmap.width, bitmap.height) <= LAB_MAX_SIDE;
    if (small && LAB_TYPES.includes(file.type) && file.size <= LAB_MAX_BYTES) return { blob: file, type: file.type };
    return await drawImage(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function labStepsHtml() {
  const run = app.lab.run;
  if (!run) return "";
  const done = new Set(run.done);
  const nextId = LAB_STEPS.find(([id]) => !done.has(id))?.[0];
  return `<ol class="steps ${run.done.length ? "" : "enter"}">${LAB_STEPS.map(([id, text], index) => {
    const state = done.has(id) ? "done" : id === nextId ? "now" : "";
    return `<li data-step="${id}" class="${state}" style="--i:${index}"><span class="mark"><span class="dot"></span>${icon("check")}</span><span>${esc(text)}<span class="sr-only">${state === "done" ? " Done." : ""}</span></span></li>`;
  }).join("")}</ol>`;
}

function updateLabSteps() {
  const holder = document.getElementById("lab-steps");
  if (holder) holder.innerHTML = labStepsHtml().replace(' class="steps enter"', ' class="steps"');
}

const testText = (test) => (test ? `${test.value}${test.unit === "%" ? "%" : ` ${test.unit}`}, ${longDate(test.date)}` : "None");

function labResultHtml(lab) {
  const { member } = lab;
  const paid = member.result.rule_met;
  const values = member.answer?.values ?? {};
  return `<div class="lab-result">
    ${fieldsHtml([
      ["Recent test", yesNo(member.result.test_found)],
      ["Rule met", yesNo(paid)],
      ["Rebate", paid ? (app.insurer?.rebate ?? "Paid") : "None"],
    ])}
    <p class="explain">${esc(member.explanation)}</p>
    <details class="why">
      <summary>What the model read</summary>
      <p class="rule">Latest HbA1c: ${esc(testText(values.latest))}. Earlier HbA1c: ${esc(testText(values.earlier))}.</p>
      <p class="rule">Only you see these values. The test network has the hashes and the result.</p>
    </details>
    <div class="upload-open">
      <a class="link" href="${esc(`${app.status.explorer}/${encodeURIComponent(member.tx)}`)}" target="_blank" rel="noopener noreferrer">See the public record</a>
      <button type="button" class="link" data-action="lab-download">Download the signed answer</button>
    </div>
    <details class="tech">
      <summary>Technical details</summary>
      <dl>
        <dt class="lab">Member account</dt><dd>${esc(member.account)}</dd>
        <dt class="lab">Request hash</dt><dd>${esc(member.request_hash)}</dd>
        <dt class="lab">Answer hash</dt><dd>${esc(member.response_hash)}</dd>
        ${member.answer?.signing_address ? `<dt class="lab">Model signer</dt><dd>${esc(member.answer.signing_address)}</dd>` : ""}
        ${member.answer?.model ? `<dt class="lab">Model</dt><dd>${esc(member.answer.model)}</dd>` : ""}
      </dl>
    </details>
  </div>`;
}

function labChooserHtml(live) {
  const busy = Boolean(app.run || app.lab.run || app.lab.preparing);
  if (app.lab.file) {
    return `<div class="upload-panel" role="group" aria-label="Run a lab claim with this report">
      <p class="lab">${esc(app.lab.file.name)}</p>
      <ul class="rule">
        <li>The report goes to a model in a sealed machine on NEAR AI Cloud. The model reads the HbA1c values only.</li>
        <li>Code on this server applies the rule to those values. This server keeps no report and no value.</li>
        <li>The test network gets hashes and the result, under a made-up name. No value and no date.</li>
        <li>Use a sample, or a report that you are happy to send to NEAR AI Cloud.</li>
      </ul>
      <div class="held-actions">
        <button type="button" class="btn btn-primary btn-small" data-action="lab-run" ${busy ? "disabled" : ""}>Run the lab claim</button>
        <button type="button" class="btn btn-secondary btn-small" data-action="lab-cancel">Cancel</button>
      </div>
    </div>`;
  }
  return `<div class="lab-samples" role="group" aria-label="Sample lab reports">
      ${LAB_SAMPLES.map(([id, label]) => `<button type="button" class="btn btn-secondary btn-small" data-action="lab-sample" data-sample="${id}" data-label="${esc(label)}" ${live && !busy ? "" : "disabled"}>${esc(label)}</button>`).join("")}
    </div>
    <div class="upload-open">
      ${live ? `<button type="button" class="link" data-action="lab-pick" ${busy ? "disabled" : ""}>${app.lab.preparing ? "Preparing the report" : "Use your own report"}</button>` : ""}
      <a class="link" href="/lab-samples/pass-percent-better.pdf" target="_blank" rel="noopener noreferrer">See a sample report</a>
      <input type="file" id="lab-file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" hidden>
    </div>`;
}

function labHtml() {
  const live = app.status.mode === "live";
  const { run, error, result } = app.lab;
  return `<section class="lab-panel" aria-labelledby="lab-title">
    <div class="lab-head">
      <p class="lab">Once a year</p>
      <h2 id="lab-title">Lab rebate</h2>
      <p class="rule">${esc(LAB_RULE_TEXT)}</p>
    </div>
    ${result && !run ? labResultHtml(result) : ""}
    ${run ? `<p class="lab">About 20 seconds. ${esc(run.name)}.</p>` : labChooserHtml(live)}
    ${error ? `<p class="alert" role="alert">The lab claim stopped. ${esc(error)}</p>` : ""}
    <div id="lab-steps" aria-live="polite">${labStepsHtml()}</div>
  </section>`;
}

function labInsurerHtml() {
  if (!app.labRows.length) return "";
  return `<section class="lab-panel" aria-labelledby="lab-insurer-title">
    <div class="lab-head">
      <p class="lab">From this visit</p>
      <h2 id="lab-insurer-title">Lab claims</h2>
      <p class="rule">You see the result and the proof. You do not see the report, its values or its dates.</p>
    </div>
    ${app.labRows.map((row) => `<article class="lab-row">
      ${fieldsHtml([
        ["Recent test", yesNo(row.result.test_found)],
        ["Rule met", yesNo(row.result.rule_met)],
        ["Result", row.outcome === "Paid" ? `Paid ${app.insurer?.rebate ?? ""}`.trim() : "Not paid"],
      ])}
      <a class="link" href="${esc(`${app.status.explorer}/${encodeURIComponent(row.tx)}`)}" target="_blank" rel="noopener noreferrer" aria-label="See the public record of this lab claim, in a new tab">See record</a>
    </article>`).join("")}
  </section>`;
}

async function runLab() {
  const file = app.lab.file;
  app.lab = { ...app.lab, file: null, run: { name: file.name, done: [] }, error: null };
  render();
  announce("Lab claim started.");
  const pause = (ms) => (reducedMotion.matches ? null : new Promise((resolve) => setTimeout(resolve, ms)));
  try {
    const res = await fetch("/api/labs", { method: "POST", headers: { "Content-Type": file.type }, body: file.blob });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${res.status}`);
    }
    const run = app.lab.run;
    let shown = Promise.resolve();
    let result = null;
    await readEvents(res, (event) => {
      if (event.type === "step") {
        shown = shown.then(() => {
          run.done.push(event.step);
          updateLabSteps();
          return pause(STEP_GAP_MS);
        });
      }
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "done") result = event.lab;
    });
    await shown;
    await pause(STEP_SETTLE_MS);
    if (!result) throw new Error("The claim ended with no result.");
    app.labRows.push(result.insurer_row);
    app.lab = { ...app.lab, run: null, result };
    // The totals on the insurer screen count the new claim.
    await loadAll().catch(() => {});
    render();
    announce(`Lab claim finished. Rebate: ${result.member.result.rule_met ? "paid" : "not paid"}.`);
  } catch (error) {
    app.lab = { ...app.lab, run: null, error: error.message };
    render();
  }
  main.querySelector(".lab-panel h2")?.scrollIntoView({ block: "start", behavior: reducedMotion.matches ? "auto" : "smooth" });
}

async function chooseLabFile(file) {
  app.lab = { ...app.lab, preparing: true, error: null };
  render();
  try {
    const image = await labImage(file);
    app.lab = { ...app.lab, preparing: false, file: { name: file.name, ...image } };
  } catch (error) {
    app.lab = { ...app.lab, preparing: false, error: error.message?.startsWith("Choose") ? error.message : "Could not read this file. Try a PDF, PNG or JPEG." };
  }
  render();
  main.querySelector('[data-action="lab-run"]')?.focus({ preventScroll: true });
}

async function chooseLabSample(id, label) {
  try {
    const res = await fetch(`/lab-samples/${id}.png`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    app.lab = { ...app.lab, error: null, file: { name: `Sample report: ${label}`, blob: await res.blob(), type: "image/png" } };
  } catch (error) {
    app.lab = { ...app.lab, error: `Could not load the sample. ${error.message}` };
  }
  render();
  main.querySelector('[data-action="lab-run"]')?.focus({ preventScroll: true });
}

// The member keeps the model's signed answer. An auditor can check it against the hashes on the test network.
function downloadLabAnswer() {
  const { member } = app.lab.result;
  const proof = { pool: app.status.pool, member: member.account, year: member.year, request_hash: member.request_hash, response_hash: member.response_hash, result: member.result, tx: member.tx, ...member.answer };
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(proof, null, 2)}\n`], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `lab-answer-${member.year}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setLens(seg, animate) {
  const lens = seg?.querySelector(".lens");
  const chosen = seg?.querySelector('[aria-current="page"], [aria-pressed="true"]');
  if (!lens || !chosen) return;
  if (!animate) seg.classList.remove("ready");
  lens.style.setProperty("--x", `${chosen.offsetLeft}px`);
  lens.style.setProperty("--w", `${chosen.offsetWidth}px`);
  if (!animate) {
    lens.getBoundingClientRect();
    seg.classList.add("ready");
  }
}

// The render builds a new letter bar, so the lens starts at the old letter and slides to the new one.
let letterLensX = null;
function placeLetterLens() {
  const seg = document.getElementById("members");
  if (!seg) return;
  const lens = seg.querySelector(".lens");
  const chosen = seg.querySelector('[aria-pressed="true"]');
  lens.style.setProperty("--w", `${chosen.offsetWidth}px`);
  lens.style.setProperty("--x", `${letterLensX ?? chosen.offsetLeft}px`);
  lens.getBoundingClientRect();
  seg.classList.add("ready");
  lens.style.setProperty("--x", `${chosen.offsetLeft}px`);
  letterLensX = chosen.offsetLeft;
}

function countUp() {
  const el = main.querySelector(".readout[data-count]");
  if (!el || el.dataset.count === "" || reducedMotion.matches) return;
  const target = Number(el.dataset.count);
  const decimals = Number(el.dataset.decimals ?? 0);
  const start = performance.now();
  const tick = (now) => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - start) / COUNT_UP_MS);
    const eased = 1 - (1 - t) ** 4;
    el.textContent = (target * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = target.toFixed(decimals);
  };
  el.textContent = (0).toFixed(decimals);
  requestAnimationFrame(tick);
}

function render({ arrive = false, landed = false, count = false, focus = false } = {}) {
  // The link keeps the chosen member, so that a reload shows the same ticket.
  views.querySelector('[data-view="member"]').setAttribute("href", `#member/${app.name}`);
  document.title = app.view === "insurer" ? "Insurer · Good Week" : `Member ${app.name} · Good Week`;
  views.querySelectorAll("[data-view]").forEach((link) => {
    if (link.dataset.view === app.view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (!app.status) {
    main.innerHTML = app.loadError
      ? `<div class="loading"><div><p class="alert" role="alert">Could not read the results. ${esc(app.loadError)}</p><p><button type="button" class="link" data-action="reload">Try again</button></p></div></div>`
      : `<div class="loading"><p class="lab" role="status">Reading the results</p></div>`;
  } else if (app.view === "member") {
    main.innerHTML = memberHtml(app.members[app.name], { arrive, landed });
  } else {
    main.innerHTML = insurerHtml(app.insurer, { arrive });
  }
  setLens(views, views.classList.contains("ready"));
  placeLetterLens();
  if (count) countUp();
  if (focus) main.querySelector("h1")?.focus({ preventScroll: true });
}

// Moves between screens. The member's stub flies to the same member's stub on the other screen.
function go(change) {
  const apply = () => {
    change();
    render({ count: true, focus: true });
    scrollTo(0, 0);
  };
  if (document.startViewTransition && !reducedMotion.matches) document.startViewTransition(apply);
  else apply();
}

function readRoute() {
  const [view, name] = location.hash.replace(/^#/, "").split("/");
  app.view = view === "insurer" ? "insurer" : "member";
  if (NAMES.includes(name)) app.name = name;
}

// With no `send`, this runs the sample member on the screen. A `send` starts a claim with the visitor's own data.
async function runClaim(send = null) {
  const name = send ? YOU : app.name;
  app.run = { name, done: [] };
  app.runError = null;
  render();
  announce(`Claim started for ${who(name)}.`);
  try {
    const res = await (send ? send() : fetch(`/api/claims/${name}`, { method: "POST" }));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${res.status}`);
    }
    let shown = Promise.resolve();
    const run = app.run;
    const pause = (ms) => (reducedMotion.matches ? null : new Promise((resolve) => setTimeout(resolve, ms)));
    await readEvents(res, (event) => {
      if (event.type === "step") {
        shown = shown.then(() => {
          if (app.run !== run) return null;
          run.done.push(event.step);
          updateSteps();
          return pause(STEP_GAP_MS);
        });
      }
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "preview") {
        app.previous = app.name;
        app.members[YOU] = event.session.member;
        app.name = YOU;
        render();
      }
      if (event.type === "done" && event.session) app.session[name] = event.session;
    });
    await shown;
    await pause(STEP_SETTLE_MS);
    await loadAll();
    app.justRan.add(name);
    app.run = null;
    // The ticket is already on the member screen, so only its new values land. The insurer screen brings in its rows.
    render({ arrive: app.view !== "member", landed: app.view === "member", count: true });
    announce(`Claim finished. Rebate: ${rebateText(app.members[name])}.`);
    main.querySelector('[data-action="claim"], [data-action="upload-pick"]')?.focus({ preventScroll: true });
  } catch (error) {
    // A failed upload must not leave its preview on the screen. An earlier upload that finished stays.
    if (app.previous && app.session[YOU]) {
      app.members[YOU] = app.session[YOU].member;
    } else if (app.previous) {
      app.name = app.previous;
      delete app.members[YOU];
    }
    app.previous = null;
    app.run = null;
    app.runError = error.message;
    render();
    main.querySelector('[data-action="claim"], [data-action="upload-pick"]')?.focus({ preventScroll: true });
  }
}

const announce = (text) => {
  document.getElementById("announce").textContent = text;
};

async function readEvents(res, onEvent) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
  }
}

async function resolveHeld(name, approve) {
  app.heldBusy = true;
  app.heldError = null;
  render();
  try {
    const res = await fetch(`/api/held/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${res.status}`);
    }
    // Views read final state, which comes some seconds after the transaction.
    for (let attempt = 0; attempt < HELD_POLL_ATTEMPTS; attempt++) {
      await loadAll();
      if (app.members[name].outcome !== "Held") break;
      await new Promise((resolve) => setTimeout(resolve, HELD_POLL_MS));
    }
    app.heldBusy = false;
    render({ count: true });
  } catch (error) {
    app.heldBusy = false;
    app.heldError = `The decision did not go through. ${error.message}`;
    render();
  }
}

// The panel opens below the tickets, so it comes into view and takes the focus.
function replaceProof(html) {
  const holder = document.getElementById("proof");
  holder.innerHTML = html;
  const panel = holder.querySelector(".proof");
  if (!panel) return;
  panel.classList.add("arrive");
  panel.querySelector("h2").focus({ preventScroll: true });
  panel.scrollIntoView({ block: "start", behavior: reducedMotion.matches ? "auto" : "smooth" });
}

main.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target || target.disabled) return;
  const { action, member } = target.dataset;

  if (member && !action) {
    if (member === app.name) return;
    history.replaceState(null, "", `#member/${member}`);
    app.name = member;
    app.runError = null;
    render({ arrive: true, count: true });
    main.querySelector(`#members [data-member="${member}"]`)?.focus({ preventScroll: true });
    announce(`Member ${member}. Rebate: ${rebateText(app.members[member])}.`);
  } else if (action === "upload-pick") {
    document.getElementById("upload-file").click();
  } else if (action === "upload-cancel") {
    app.upload = null;
    render();
  } else if (action === "upload-run") {
    const { text } = app.upload;
    app.upload = null;
    runClaim(() => fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "text/csv" }, body: text }));
  } else if (action === "connect-pick") {
    app.runError = null;
    app.connect = target.dataset.maker;
    render();
  } else if (action === "connect-cancel") {
    app.connect = null;
    render();
  } else if (action === "claim") {
    runClaim();
  } else if (action === "proof-member") {
    app.proof.member = !app.proof.member;
    target.setAttribute("aria-expanded", String(app.proof.member));
    replaceProof(app.proof.member ? proofHtml(app.members[app.name], "your claim") : "");
  } else if (action === "proof-insurer") {
    app.proof.insurer = app.proof.insurer === member ? null : member;
    main.querySelectorAll('[data-action="proof-insurer"]').forEach((button) => {
      button.setAttribute("aria-expanded", String(button.dataset.member === app.proof.insurer));
    });
    const chosen = app.insurer.members.find((m) => m.member === app.proof.insurer);
    replaceProof(chosen ? proofHtml(chosen, who(chosen.member)) : "");
  } else if (action === "approve" || action === "reject") {
    resolveHeld(member, action === "approve");
  } else if (action === "lab-sample") {
    chooseLabSample(target.dataset.sample, target.dataset.label);
  } else if (action === "lab-pick") {
    document.getElementById("lab-file").click();
  } else if (action === "lab-cancel") {
    app.lab = { ...app.lab, file: null };
    render();
  } else if (action === "lab-run") {
    runLab();
  } else if (action === "lab-download") {
    downloadLabAnswer();
  } else if (action === "reload") {
    start();
  }
});

addEventListener("hashchange", () => go(readRoute));

// The hash holds the route, so the skip link moves the focus and leaves the hash alone.
main.addEventListener("change", async (event) => {
  if (event.target.id === "lab-file" && event.target.files[0]) return chooseLabFile(event.target.files[0]);
  if (event.target.id !== "upload-file" || !event.target.files[0]) return;
  const file = event.target.files[0];
  app.runError = null;
  app.upload = { fileName: file.name, text: await file.text() };
  render();
});

document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});

// The device maker sends the visitor back with a code in the fragment. The page takes it out of the address at once.
function takeTrackerReturn() {
  const match = /^#tracker\/([a-z]+)\/(.+)$/.exec(location.hash);
  if (!match) return null;
  history.replaceState(null, "", location.pathname);
  const [code, state] = match[2].split("/").map(decodeURIComponent);
  return { maker: match[1], code, state };
}

function finishConnection({ maker, code, state }) {
  if (code === "denied") {
    app.runError = `${TRACKER_NAMES[maker] ?? "The device maker"} did not connect. You can try again or use a CSV.`;
    render();
    return;
  }
  runClaim(() => fetch(`/api/trackers/${maker}/claims`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, state }) }));
}

async function start() {
  app.loadError = null;
  render();
  try {
    await loadAll();
    render({ arrive: true, count: true });
    if (trackerReturn) {
      const connection = trackerReturn;
      trackerReturn = null;
      finishConnection(connection);
    }
  } catch (error) {
    app.loadError = error.message;
    render();
  }
}

let trackerReturn = takeTrackerReturn();
readRoute();
start();
