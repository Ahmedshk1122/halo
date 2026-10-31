#!/usr/bin/env node
// Acceptance test: plays samples/rehearsal_onboarding.txt in rehearsal mode
// through the real pipeline (control + stage windows, director, grounding,
// stage) and checks the nine expected outcomes from the brief.
//
//   npm run acceptance                      # Claude if the server has a key, else replay
//   npm run acceptance -- --director claude # require Claude
//   npm run acceptance -- --director replay --speed 1.5
//   npm run acceptance -- --headed
//
// Needs `npm run dev` running. On macOS it drives your installed Chrome.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:5173");
const HEADED = args.includes("--headed");
const OUT = join(root, "artifacts", "acceptance");
mkdirSync(OUT, { recursive: true });

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
if (!health) {
  console.error(`Cannot reach ${BASE}/api/health. Start the app with: npm run dev`);
  process.exit(2);
}
const director = arg("director", health.hasKey ? "claude" : "replay");
if (director === "claude" && !health.hasKey) {
  console.error("The server has no API key. Add it to .env and restart npm run dev, or use --director replay.");
  process.exit(2);
}
const speed = arg("speed", director === "claude" ? "1" : "1.5");

const launch = {
  headless: !HEADED,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
};
if (process.platform === "darwin" && !process.env.HALO_BROWSER) launch.channel = "chrome";
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const control = await context.newPage();
const errors = [];
control.on("pageerror", (e) => errors.push(`control: ${e.message}`));
await control.goto(`${BASE}/control`);
const stage = await context.newPage();
await stage.setViewportSize({ width: 1280, height: 720 });
stage.on("pageerror", (e) => errors.push(`stage: ${e.message}`));
await stage.goto(`${BASE}/stage`);
await control.bringToFront();
await control.waitForFunction(() => window.halo?.store);

// Fresh run: sample data, chosen director, rehearsal at the chosen pace.
await control.getByRole("button", { name: "Data" }).click();
await control.getByRole("button", { name: "Load sample data" }).click();
// Hand tracking is off: this test measures the speech → director → stage pipeline,
// and MediaPipe on a CPU-only headless browser would skew the latency numbers.
await control.evaluate(
  (p) => window.halo.store.set((s) => ({ prepared: [], director: { ...s.director, provider: p, proactivity: "balanced" }, hands: { ...s.hands, enabled: false } })),
  director,
);
await control.getByRole("button", { name: "Rehearsal" }).click();
await control.getByRole("radio", { name: `${speed}×` }).click();
await control.getByRole("button", { name: "Play script" }).click();
const label = director === "replay" ? "replay" : `${health.provider ?? "anthropic"} (${health.directorModel})`;
console.log(`Rehearsing with the ${label} director at ${speed}×…`);

// Sample the stage continuously, tagged with the beat being spoken.
const timeline = [];
const shots = new Map();
const started = Date.now();
let lastLabel = null;
let doneAt = null;
for (;;) {
  const snap = await control.evaluate(() => {
    const s = window.halo.store.get();
    const label = s.interim?.label ?? s.transcript[s.transcript.length - 1]?.label ?? null;
    const vis = (id) => {
      const v = s.visuals[id];
      const items = v.visual.points ?? v.visual.items ?? v.visual.steps ?? null;
      return { id, template: v.visual.template, title: v.title, reveal: v.reveal, items: items ? items.length : 0 };
    };
    return { label, onStage: s.onStage.map(vis), chips: s.chips.map(vis), speaking: s.speech.source === "rehearsal" && s.speech.status !== "idle" };
  });
  const t = (Date.now() - started) / 1000;
  timeline.push({ t, ...snap });
  if (snap.label !== lastLabel) {
    if (lastLabel) shots.set(lastLabel, await stageText(lastLabel));
    lastLabel = snap.label;
  }
  if (!snap.speaking && lastLabel && doneAt === null) doneAt = Date.now();
  if (doneAt && Date.now() - doneAt > 6000) break;
  if (Date.now() - started > 12 * 60 * 1000) {
    errors.push("timed out");
    break;
  }
  await control.waitForTimeout(200);
}
shots.set(lastLabel, await stageText(lastLabel));

async function stageText(label) {
  await stage.screenshot({ path: join(OUT, `${label}.png`) });
  return stage.evaluate(() => document.querySelector(".stage-canvas")?.innerText ?? "");
}

const state = await control.evaluate(() => {
  const s = window.halo.store.get();
  return { decisions: s.decisions, visuals: Object.values(s.visuals).map((v) => ({ id: v.id, template: v.visual.template, title: v.title })) };
});
await control.screenshot({ path: join(OUT, "control.png") });
await browser.close();

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
const byId = Object.fromEntries(state.visuals.map((v) => [v.id, v]));
const applied = (label, pred) =>
  state.decisions.filter((d) => d.label === label && d.outcome === "applied" && (!pred || pred(d)));
const shows = (label, template) => applied(label, (d) => d.action === "show" && (!template || byId[d.visualId]?.template === template));
const during = (label) => timeline.filter((s) => s.label === label);
const lastOf = (label) => during(label).at(-1);
const has = (snap, template, where = "onStage") => !!snap?.[where].some((v) => v.template === template);

const checks = [];
const check = (name, pass, evidence) => checks.push({ name, pass: !!pass, evidence });

check("1. Nothing during the greeting", shows("greeting").length === 0 && during("greeting").every((s) => s.onStage.length === 0), `${shows("greeting").length} shows`);
check("2. A pinned activation metric card", shows("headline", "metric").length > 0 && has(lastOf("headline"), "metric"), `on stage at end of beat: ${lastOf("headline")?.onStage.map((v) => v.title).join(", ")}`);
check(
  "3. A funnel, with the metric card tucked into a chip",
  shows("drop-off", "funnel").length > 0 && has(lastOf("drop-off"), "funnel") && has(lastOf("drop-off"), "metric", "chips"),
  `stage: ${lastOf("drop-off")?.onStage.map((v) => v.title).join(", ")}; chips: ${lastOf("drop-off")?.chips.map((v) => v.title).join(", ")}`,
);
check("4. Nothing during the anecdote", shows("anecdote").length === 0, `${shows("anecdote").length} shows`);
const strategyLevels = [];
for (const s of [...during("proposal"), ...during("picture")]) {
  const v = s.onStage.find((x) => x.template === "strategy");
  if (!v) continue;
  const visible = Math.min(v.reveal, v.items);
  if (visible !== strategyLevels.at(-1)) strategyLevels.push(visible);
}
check(
  "5. A three-moves strategy card revealed point by point",
  strategyLevels.includes(1) && strategyLevels.includes(2) && strategyLevels.at(-1) === 3 && strategyLevels.every((n, i) => i === 0 || n > strategyLevels[i - 1]),
  `visible points over time: ${strategyLevels.join(" → ") || "never shown"}`,
);
check("6. A template-screen UI sketch", shows("picture", "ui_sketch").length > 0, shows("picture", "ui_sketch").map((d) => d.title).join(", ") || "none");
check("7. A roadmap", shows("rollout", "roadmap").length > 0 && has(lastOf("rollout"), "roadmap"), shows("rollout", "roadmap").map((d) => d.title).join(", ") || "none");
const recalls = applied("recall", (d) => d.action === "recall" && byId[d.visualId]?.template === "funnel");
check("8. The funnel recalled on command", recalls.length > 0 && has(lastOf("recall"), "funnel"), recalls.map((d) => `${d.source}: ${d.reason}`).join("; ") || "no recall");
check("9. A closing statement card", shows("close", "statement").length > 0, shows("close", "statement").map((d) => d.title).join(", ") || "none");

// Every number on screen must trace back to the sample files: a value, a row
// label, or a difference between two values of the same column.
const allowed = new Set();
for (const file of ["q3_metrics.csv", "onboarding_funnel.csv"]) {
  const [header, ...rows] = readFileSync(join(root, "samples", file), "utf8").trim().split(/\r?\n/).map((l) => l.split(","));
  header.forEach((_, ci) => {
    const col = rows.map((r) => r[ci]);
    const nums = col.map((c) => parseFloat(c.replace(/[%$,]/g, ""))).filter((n) => Number.isFinite(n));
    col.forEach((c) => (c.match(/\d+(\.\d+)?/g) ?? []).forEach((n) => allowed.add(String(Number(n)))));
    for (const a of nums) for (const b of nums) allowed.add(String(Math.round(Math.abs(a - b) * 10) / 10));
  });
}
for (const d of ["29", "6", "13", "20", "27", "3", "10", "17", "24", "31", "7", "14", "21"]) allowed.add(d); // day-of-month labels of week_start
const strays = [];
for (const [label, text] of shots) {
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = String(Number(m[0].replace(/,/g, "")));
    if (!allowed.has(n)) strays.push(`${label}: ${m[0]}`);
  }
}
check("Every number on screen traces back to the sample files", strays.length === 0, strays.length ? `untraced: ${strays.join(", ")}` : "all numbers traced");

const latencies = state.decisions.filter((d) => d.onScreenMs !== undefined && d.source !== "command").map((d) => d.onScreenMs).sort((a, b) => a - b);
const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;

console.log("");
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}\n      ${c.evidence}`);
console.log(`\nDirector: ${label} · median end of speech to visual on stage: ${median === null ? "n/a" : `${median} ms`} (target 2500 ms)`);
if (errors.length) console.log(`Errors: ${errors.join("; ")}`);
console.log(`Screenshots and report: ${OUT}`);
writeFileSync(join(OUT, "report.json"), JSON.stringify({ director, speed, checks, medianLatencyMs: median, decisions: state.decisions, timeline }, null, 2));
process.exit(checks.every((c) => c.pass) && errors.length === 0 ? 0 : 1);
