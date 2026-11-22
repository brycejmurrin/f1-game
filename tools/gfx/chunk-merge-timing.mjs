#!/usr/bin/env node
// @doc Measure Three.js chunk-merge factors on hardware with isolated boots and matched parked scenes.
// @skill mcp-probe
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { launchChromium, startStaticServer } from "../lib/harness.mjs";
import { raceGate } from "../lib/census-entry.mjs";
import { acquirePresentationResource, presentationDeadline, presentationDiagnostics } from "../lib/presentation.mjs";
import { chromiumLaunchOptionsForBackend, gotoGame, requireHardwareWebGpu } from "../shot/probe-page.mjs";

const TRACKS = ["monza", "spa"];
const VIEWS = [0.1, 0.45, 0.8];
const FACTORS = [2, 3, 4];
const VIEWPORT = { width: 1280, height: 720 };
const WINDOW_MS = 8000;
const REPEATS = 3;

export function timingPlan() {
  const rows = [];
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const factors = [...FACTORS.slice(repeat), ...FACTORS.slice(0, repeat)];
    for (let i = 0; i < factors.length; i++) {
      rows.push({ track: TRACKS[0], factor: factors[i], repeat });
      rows.push({ track: TRACKS[1], factor: factors[factors.length - 1 - i], repeat });
    }
  }
  return rows;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function compareTimings(baseline, candidate) {
  const valid = (group) => group.length === REPEATS && group.every((x) => Number.isFinite(x) && x > 0);
  if (!valid(baseline) || !valid(candidate)) return { verdict: "inconclusive", reason: "missing valid repeats" };
  const stats = (group) => ({ min: Math.min(...group), max: Math.max(...group), median: median(group) });
  const base = stats(baseline), trial = stats(candidate);
  const delta = trial.median - base.median;
  const spread = Math.max(base.max - base.min, trial.max - trial.min);
  let verdict = "inconclusive";
  if (Math.abs(delta) > spread) {
    if (trial.max < base.min) verdict = "faster";
    if (trial.min > base.max) verdict = "slower";
  }
  return { verdict, delta, spread, baseline: base, candidate: trial };
}

function readLiveCell() {
  const state = presentationDiagnostics();
  const api = window.__apex;
  return {
    state: api.info().state, track: api.info().track, camera: api.camera().mode, hidden: document.hidden,
    api: state.backend?.api, softAdapter: state.backend?.softAdapter, softBlit: state.backend?.softBlit,
    skipBatches: state.backend?.skipBatches, presents: state.backend?.presents,
    lost: GLX.ctxLost(), errors: state.gpuErrors, canvas: state.canvas,
    factor: GLX.trackPrepareConfig()?.merge, effective: api.renderScale({ lite: true }).effective,
    tier: PerfGov.tier(), calls: state.backend?.calls, healed: state.backend?.healed,
  };
}

export function validateLiveCell(cell, track, factor) {
  if (cell.state !== "race" || cell.track !== track || cell.factor !== factor || cell.camera !== "helmet") {
    throw new Error("wrong live track, camera, or merge factor");
  }
  if (cell.api !== "webgpu" || cell.softAdapter !== false || cell.softBlit !== false || cell.skipBatches !== false) {
    throw new Error("Three.js did not use the full hardware rendering path");
  }
  if (cell.hidden || cell.lost || cell.healed || cell.errors !== 0 || !(cell.calls > 0) ||
      !Number.isFinite(cell.presents) || cell.canvas?.id !== "game" || !cell.canvas.visible) {
    throw new Error("no healthy native scene presentation");
  }
}

export function validateTimingWindow({ initial, final, cpu }) {
  const frames = final - initial;
  if (!Number.isSafeInteger(frames) || frames < 60 || frames !== cpu.length ||
      !cpu.every((ms) => Number.isFinite(ms) && ms > 0)) {
    throw new Error("fewer than 60 native frames or incomplete synchronous present timings");
  }
  return frames;
}

async function runCell(page, cell, bounded) {
  // Keep the same camera and geometry across repeats, including when the previous view was dense.
  await bounded("park camera", () => page.evaluate((at) => {
    const A = window.__apex;
    A.govHold(true); A.renderScale(1); A.camera("helmet");
    A.jump(at, 0, 0); A.snapCam(); A.freeze(true);
  }, cell.at));
  cell.pose = await bounded("settle camera", () => page.evaluate(async () => {
    const A = window.__apex;
    const pose = () => { const c = A.cameraState(); return JSON.stringify([c.eye, c.target, c.fov]); };
    let previous = pose(), stable = 0;
    while (stable < 4) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const next = pose();
      stable = next === previous ? stable + 1 : 0;
      previous = next;
    }
    return JSON.parse(previous);
  }));
  cell.before = await bounded("initial native present", () => page.evaluate(readLiveCellInPage));
  validateLiveCell(cell.before, cell.track, cell.factor);
  cell.timing = await bounded("hardware timing window", () => page.evaluate(async (windowMs) => {
    const first = GLX.gpuTimer(true);
    const cpu = [], gpu = [];
    const native = () => GLX.__tlx.backendState().presents;
    const original = GLX.present;
    const initial = native();
    GLX.present = function (...args) {
      const start = performance.now();
      const result = original.apply(this, args);
      cpu.push(performance.now() - start);
      return result;
    };
    const start = performance.now();
    let previous = first.samples;
    try {
      do {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!first.on) continue;
        const next = GLX.gpuTimer();
        const ms = GLX.gpuMs();
        if (next.samples > previous && ms > 0 && Number.isFinite(ms)) gpu.push(ms);
        previous = next.samples;
      } while (performance.now() - start < windowMs);
      // This renderer counter increases for every frame. Unlike telemetry rings,
      // its delta remains valid at any lifetime sample count.
      return { cpu, gpu, initial, final: native(), timestampSupported: first.supported && first.on };
    } finally {
      GLX.present = original;
      GLX.gpuTimer(false);
    }
  }, WINDOW_MS));
  cell.after = await bounded("final native present", () => page.evaluate(readLiveCellInPage));
  validateLiveCell(cell.after, cell.track, cell.factor);
  if (await bounded("native draw completion", () => page.evaluate(() => GLX.awaitSoftPresent(3000, "frame"))) !== "frame") {
    throw new Error("the native renderer never completed a draw");
  }
  cell.nativePresents = validateTimingWindow(cell.timing);
  if (cell.before.tier !== cell.after.tier || cell.before.tier !== 2 ||
      cell.before.effective?.buffer?.join() !== cell.after.effective?.buffer?.join() ||
      cell.after.effective?.buffer?.join() !== [VIEWPORT.width, VIEWPORT.height].join()) {
    throw new Error("render quality or drawing-buffer size differs from the fixed measurement settings");
  }
  cell.cpuMs = median(cell.timing.cpu);
  cell.gpuMs = cell.timing.gpu.length >= 20 ? median(cell.timing.gpu) : null;
}

// Serialize the existing presentation diagnostics and the compact cell reader together.
// Playwright page functions cannot capture imports or module variables.
const readLiveCellInPage = `(() => {
  const presentationDiagnostics = ${presentationDiagnostics.toString()};
  return (${readLiveCell.toString()})();
})()`;

export function buildSummary(rows) {
  const results = [];
  for (const track of TRACKS) for (const at of VIEWS) {
    const sample = (factor) => rows.filter((r) => r.track === track && r.at === at && r.factor === factor && !r.error).map((r) => r.cpuMs);
    for (const factor of FACTORS.filter((n) => n !== 3)) {
      results.push({ track, at, factor, ...compareTimings(sample(3), sample(factor)) });
    }
  }
  return results;
}

async function run(out) {
  mkdirSync(dirname(out), { recursive: true });
  const report = {
    runner: process.env.ImageOS || process.platform, sha: process.env.GITHUB_SHA || null,
    windowMs: WINDOW_MS, viewport: VIEWPORT, camera: "helmet",
    measurement: "Synchronous Three.js present() wall time on the verified hardware adapter; optional GPU timestamps are separate",
    rows: [],
  };
  const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  save();
  const server = await startStaticServer(process.cwd());
  let identity, invalid = false;
  try {
    for (const boot of timingPlan()) {
      const bounded = presentationDeadline(115000);
      const rows = [...VIEWS.slice(boot.repeat), ...VIEWS.slice(0, boot.repeat)].map((at) => ({ ...boot, at }));
      report.rows.push(...rows);
      let browser;
      try {
        browser = await acquirePresentationResource(bounded, "browser launch",
          () => launchChromium(chromiumLaunchOptionsForBackend("three", { gpu: "hardware" })), (late) => late.close());
        const page = await bounded("new isolated page", () => browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 }));
        await bounded("arm merge factor", () => page.addInitScript((factor) => {
          window.__TEST_MODE = true;
          localStorage.setItem("apex26.gfxBackend", "three");
          localStorage.setItem("apex26.tlxForceGL", "0");
          localStorage.setItem("apex26.gfxPreset", '"medium"');
          localStorage.setItem("apex26.wgxCapture", "0");
          localStorage.setItem("apex26.tlxChunkMerge", String(factor));
        }, boot.factor));
        await bounded("game boot", () => gotoGame(page, server.url + "?inspector=0", 70000));
        const adapter = await bounded("hardware adapter", () => requireHardwareWebGpu(page));
        const fingerprint = JSON.stringify(adapter.info);
        if (identity && fingerprint !== identity) throw new Error("GPU adapter identity changed between boots");
        identity = fingerprint;
        report.adapter = adapter;
        report.browser = browser.version();
        await bounded("race entry", () => page.evaluate(async (track) => {
          const A = window.__apex;
          A.seed(4680);
          await A.race(track, "day", "dry");
          A.govHold(true); A.renderScale(1); A.go(); A.freeze(true);
        }, boot.track));
        await bounded("warm renderer", () => page.waitForFunction(raceGate, null, { polling: 500, timeout: 70000 }));
        for (const row of rows) {
          await runCell(page, row, bounded);
          console.log(boot.track, row.at, boot.factor, boot.repeat + 1, row.cpuMs.toFixed(3), "ms synchronous");
          save();
        }
      } catch (error) {
        invalid = true;
        for (const row of rows) if (row.cpuMs == null) row.error = String(error.message || error);
        save();
        console.error(boot.track, boot.factor, boot.repeat + 1, error.message);
        // A missing or changed hardware adapter makes the remaining measurements invalid.
        if (!identity || /adapter identity changed/.test(error.message)) break;
      } finally {
        if (browser) await presentationDeadline(5000)("close browser", () => browser.close());
      }
    }
  } finally { await server.close(); }
  report.comparisons = buildSummary(report.rows);
  invalid ||= report.rows.filter((row) => row.cpuMs != null).length !== TRACKS.length * VIEWS.length * FACTORS.length * REPEATS;
  save();
  const result = [
    "## TLX chunk-merge hardware timings",
    "",
    "Three.js synchronous renderer submission medians. GPU execution samples, where supported, are separate in the artifact.",
    "GitHub macOS paravirtual timing cannot determine handset cadence or GPU fill cost.",
    "",
    "| Track | View | Factor vs 3 | Median difference (ms) | Largest repeat spread (ms) | Result |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.comparisons.map((r) => `| ${r.track} | ${r.at} | ${r.factor} | ${r.delta?.toFixed(3) ?? "—"} | ${r.spread?.toFixed(3) ?? "—"} | ${r.verdict} |`),
    "",
  ];
  if (invalid) result.push("Incomplete evidence. See the artifact for invalid arms.", "");
  console.log(result.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.join("\n"));
  if (invalid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2] || "artifacts/chunk-merge-timing/census.json").catch((error) => {
    console.error(basename(process.argv[1]) + ": " + error.message);
    process.exitCode = 1;
  });
}
