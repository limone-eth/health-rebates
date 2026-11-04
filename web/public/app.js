// The member screen, the insurer screen and the Verified panel. Plain JavaScript with no build step.
const NAMES = ["A", "B", "C"];
const YOU = "You";
const COUNT_UP_MS = 1200;
// Steps can arrive together. This gap lets each tick show. The last tick holds a moment before the result lands.
const STEP_GAP_MS = 280;
const STEP_SETTLE_MS = 420;
const HELD_POLL_ATTEMPTS = 12;
const HELD_POLL_MS = 1500;

const STEPS = [
  ["attestation", "Intel confirmed the sealed machine"],
  ["account", "Test account opened"],
  ["wearable", "Your week signed"],
  ["tee", "Good days counted"],
  ["explanation", "Summary written"],
  ["signer", "Model's key registered"],
  ["chain", "Both signatures checked"],
];

const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M7 7h10v10M7 17 17 7"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  minus: '<path d="M5 12h14"/>',
};

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
      ${m.member === YOU && !running ? "" : `<button type="button" class="btn btn-primary" data-action="claim" ${live && !running ? "" : "disabled"}>${running ? "Running the claim" : "Run a live claim"}</button>`}
      <p class="lab">${esc(running ? `About 15 seconds. ${app.run.name === YOU ? "Your data" : `Member ${app.run.name}`}.` : runNote(m.member, m.recorded_on))}</p>
      ${offNote()}
      ${app.runError ? `<p class="alert" role="alert">The claim stopped. ${esc(app.runError)} The last result is still here.</p>` : ""}
      ${uploadHtml()}
      <div id="steps" aria-live="polite">${stepsHtml()}</div>
    </section>
  <div id="proof">${app.proof.member && m.outcome ? proofHtml(m, "your claim") : ""}</div>`;
}

// The preview shows an upload before its claim ends, so the picker needs the name from that point.
const pickNames = () => (app.members[YOU] ? [...NAMES, YOU] : NAMES);
const who = (name) => (name === YOU ? "you" : `member ${name}`);

function uploadHtml() {
  if (!app.status || app.status.mode !== "live" || app.run) return "";
  if (!app.upload) {
    return `<div class="upload-open">
      <button type="button" class="link" data-action="upload-pick">Try your own data</button>
      <a class="link" href="/sample-data.csv" download>Get the CSV template</a>
      <input type="file" id="upload-file" accept=".csv,text/csv" hidden>
    </div>`;
  }
  return `<div class="upload-panel" role="group" aria-label="Run a claim with your data">
    <p class="lab">${esc(app.upload.fileName)}</p>
    <ul class="rule">
      <li>This server reads your file during the claim and keeps nothing.</li>
      <li>A model in a sealed machine reads your week.</li>
      <li>Your good days and the result stay public on a test network, under a made-up name.</li>
      <li>This week has no proof from a wearable service, so anyone could type these numbers.</li>
    </ul>
    <div class="held-actions">
      <button type="button" class="btn btn-primary btn-small" data-action="upload-run">Run with my data</button>
      <button type="button" class="btn btn-secondary btn-small" data-action="upload-cancel">Cancel</button>
    </div>
  </div>`;
}

function stepStates() {
  const done = new Set(app.run.done);
  const list = STEPS.filter(([id]) => id !== "signer" || done.has("signer"));
  const nextId = list.find(([id]) => !done.has(id))?.[0];
  return (id) => (done.has(id) ? "done" : id === nextId ? "now" : "");
}

function stepsHtml() {
  if (!app.run) return "";
  const stateOf = stepStates();
  const enter = app.run.done.length === 0;
  // The signer step runs only for a new signer, so it shows only when it happens.
  return `<ol class="steps ${enter ? "enter" : ""}">${STEPS.map(([id, text], index) => {
    const state = stateOf(id);
    const hidden = id === "signer" && state !== "done";
    return `<li data-step="${id}" class="${state}" style="--i:${index}" ${hidden ? "hidden" : ""}><span class="mark"><span class="dot"></span>${icon("check")}</span><span>${esc(text)}<span class="sr-only">${state === "done" ? " Done." : ""}</span></span></li>`;
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
    if (id === "signer") row.hidden = state !== "done";
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
  <div id="proof">${opened ? proofHtml(opened, who(opened.member)) : ""}</div>`;
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

// Real checks only: each row reads what the chain holds for this claim.
function proofHtml(m, who) {
  const accepted = Boolean(m.outcome);
  const signerKnown = accepted && m.signer_registered === true;
  const row = (ok, point, context) =>
    `<li>${icon(ok ? "check" : "minus")}<span>${esc(point)}</span><span class="ctx">${esc(context)}</span><span class="lab status ${ok ? "" : "off"}">${ok ? "Passed" : "Not shown"}</span></li>`;
  const publicFacts = `Good days, usual week and ${m.payout ? "payment" : "outcome"}, under a made-up name`;
  const txUrl = `${app.status.explorer}/${encodeURIComponent(m.tx)}`;
  const model = app.insurer?.model;

  return `<section class="proof" aria-label="What was checked">
    <h2 tabindex="-1">What was checked for ${esc(who)}</h2>
    <p class="lab when">Checked on ${esc(longDate(m.recorded_on))}</p>
    <ul class="checks">
      ${row(signerKnown, "The model ran in a sealed machine", "Intel signed a report on it")}
      ${row(signerKnown, "The key belongs to that machine", "Intel's report names it")}
      ${row(accepted, "The answer is unchanged", "Its signature matches")}
      ${row(accepted, "Two signatures passed", m.member === YOU ? "The model and this demo's key. An uploaded week has no proof from a wearable service." : "The model and the wearable service")}
      <li>${icon("arrow")}<span>Some facts are public</span><span class="ctx">${esc(publicFacts)}</span><a class="lab status" href="${esc(txUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open the public record, in a new tab">See record</a></li>
      <li>${icon("info")}<span>Who marks each day</span><span class="ctx">Code outside the sealed machine. The model counts the marks.</span><span class="lab status">Not sealed</span></li>
      <li>${icon("minus")}<span>The software in the sealed machine</span><span class="ctx">Its start-up file matches Intel's report. No one has confirmed that the software is safe.</span><span class="lab status off">Not proven</span></li>
    </ul>
    <details class="tech">
      <summary>Technical details</summary>
      <dl>
        <dt class="lab">Network</dt><dd>NEAR testnet</dd>
        ${m.payout ? `<dt class="lab">Rebate amount</dt><dd>${esc(m.payout)} (test tokens)</dd>` : ""}
        <dt class="lab">Member account</dt><dd>${esc(m.account)}</dd>
        <dt class="lab">Pool</dt><dd>${esc(app.status.pool)}</dd>
        ${model ? `<dt class="lab">Model</dt><dd>${esc(model)}</dd>` : ""}
        <dt class="lab">Model signer</dt><dd>${esc(m.signer)}</dd>
        <dt class="lab">Request hash</dt><dd>${esc(m.request_hash)}</dd>
      </dl>
    </details>
  </section>`;
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

async function runClaim(csv = null) {
  const name = csv === null ? app.name : YOU;
  app.run = { name, done: [] };
  app.runError = null;
  render();
  announce(`Claim started for member ${name}.`);
  try {
    const res = csv === null ? await fetch(`/api/claims/${name}`, { method: "POST" }) : await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv });
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
    runClaim(text);
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
  } else if (action === "reload") {
    start();
  }
});

addEventListener("hashchange", () => go(readRoute));

// The hash holds the route, so the skip link moves the focus and leaves the hash alone.
main.addEventListener("change", async (event) => {
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

async function start() {
  app.loadError = null;
  render();
  try {
    await loadAll();
    render({ arrive: true, count: true });
  } catch (error) {
    app.loadError = error.message;
    render();
  }
}

readRoute();
start();
