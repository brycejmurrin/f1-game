#!/usr/bin/env node
// mem-census.mjs — memory across track loads and races, after forced GC.
// @doc Memory census: heap after GC, live tracks, three render objects and decoded audio per track load (picker or race path).
// @skill mcp-probe / check-changes
//
// The instrument behind docs/plans/2026-10-03-perf-memory.md and the
// track-switch leak fix (#773, docs/notes/TRACK-SWITCH-LEAKS-2026-10-02.md).
// Every number it prints is a COUNT or a retained-bytes reading, valid on this
// software-GL box: it never reports a frame rate (PERF-FINDINGS §0).
//
//   node tools/gfx/mem-census.mjs [--backend three|webgl2] [--mode picker|race]
//        [--tracks monza,monaco,spa] [--cycles 3] [--settle 10]
//        [--snapshot DIR] [--json PATH] [--max-growth-mb N] [--quiet]
//
// --mode picker  the player's path: RACE → tap a circuit (the picker pre-builds
//                it), tap the next. This is where the #773 leak lived.
// --mode race    __apex.race(id) for each circuit (state count/race), settle.
// --cycles N     repeat the circuit list N times. Cycle 1 is warm-up (lazy
//                chunked copies, program caches); compare the LAST two cycles.
// --snapshot DIR write a heap snapshot after each cycle (open with the DevTools
//                MCP compare_heapsnapshots / get_heapsnapshot_retaining_paths).
// --max-growth-mb N  requires >=3 cycles; exit 1 when any circuit grew more than N MiB
//                between the last two cycles, or when more than one built track
//                is still reachable after GC at any step.
//
// One JSON row per step on stdout (and the whole run in --json): heapMB,
// aliveTracks (observed successful build roots), three resource bookkeeping,
// and observed decoded AudioBuffer PCM. MB-named compatibility fields use MiB.
// These hooks are not a census of all native audio, GPU or process storage.
// Interpretation: https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots
// Three fields: https://threejs.org/docs/pages/Info.html (checked against installed r186).
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, sleep } from "../lib/harness.mjs";
import { censusInitScript, censusAfterGc, pickTrack, waitFrames, waitUntilDrawn } from "../lib/mem-census.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function parseArgs(argv) {
  const o = { backend: "three", mode: "picker", tracks: ["monza", "monaco", "spa"], cycles: 3, settle: 10,
    snapshot: null, json: null, maxGrowthMb: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => {
      const value = argv[++i];
      if (value == null || value === "" || value.startsWith("--")) throw new Error("missing value for " + a);
      return value;
    };
    if (a === "--backend") o.backend = next();
    else if (a === "--mode") o.mode = next();
    else if (a === "--tracks") o.tracks = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--cycles") o.cycles = +next();
    else if (a === "--settle") o.settle = +next();
    else if (a === "--snapshot") o.snapshot = next();
    else if (a === "--json") o.json = next();
    else if (a === "--max-growth-mb") o.maxGrowthMb = +next();
    else if (a === "--quiet") o.quiet = true;
    else if (a === "-h" || a === "--help") { console.log(readUsage()); process.exit(0); }
    else throw new Error("unknown argument " + a);
  }
  if (!["three", "webgl2"].includes(o.backend)) throw new Error("--backend must be three or webgl2");
  if (!["picker", "race"].includes(o.mode)) throw new Error("--mode must be picker or race");
  if (!o.tracks.length || new Set(o.tracks).size !== o.tracks.length || o.tracks.some((id) => !/^[a-z0-9_]+$/.test(id))) throw new Error("--tracks needs unique circuit ids");
  if (!Number.isInteger(o.cycles) || o.cycles < 1) throw new Error("--cycles must be a positive integer");
  if (!Number.isFinite(o.settle) || o.settle < 0) throw new Error("--settle must be finite and nonnegative");
  if (o.maxGrowthMb != null && (!Number.isFinite(o.maxGrowthMb) || o.maxGrowthMb < 0 || o.cycles < 3)) throw new Error("--max-growth-mb must be finite and nonnegative, with >=3 cycles (first cycle warms)");
  return o;
}
function readUsage() {
  return "usage: node tools/gfx/mem-census.mjs [--backend three|webgl2] [--mode picker|race] [--tracks a,b,c] [--cycles N] [--settle S] [--snapshot DIR] [--json PATH] [--max-growth-mb N] [--quiet]";
}

/** A diagnostic budget is not a leak verdict. Missing evidence cannot pass it. */
export function summariseCensus(o, rows, errors, { completed = true, failure = null, failureDetails = null } = {}) {
  const incomplete = [], incorrect = [], growth = {}, growthBytes = {}, heapSeriesBytes = {};
  const finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const visits = rows.filter((r) => r.cycle != null);
  if (!completed) incomplete.push(failure || "run did not complete");
  if (errors.length) incorrect.push(`${errors.length} page error(s)`);
  if (visits.length !== o.cycles * o.tracks.length) incomplete.push("unexpected number of visit samples");
  for (let cycle = 1; cycle <= o.cycles; cycle++) for (const id of o.tracks) {
    const matches = visits.filter((r) => r.cycle === cycle && r.track === id);
    if (matches.length !== 1) { incomplete.push(`${cycle}:${id}: expected one sample`); continue; }
    const r = matches[0], step = `${cycle}:${id}`;
    if (!finite(r.heapBytes)) incomplete.push(`${step}: heap bytes unavailable`);
    if (r.instrumentation?.tracksReady !== true) incomplete.push(`${step}: track hooks not ready`);
    if (!Array.isArray(r.aliveTracks)) incomplete.push(`${step}: observed track roots unavailable`);
    else if (r.aliveTracks.length !== 1 || r.aliveTracks[0] !== id) incorrect.push(`${step}: expected only the current observed track root`);
    if (!r.backend?.renderer || !["webgl2", "webgpu"].includes(r.backend.api)) incomplete.push(`${step}: actual renderer/API unavailable`);
    else if (r.backend.renderer !== o.backend || (o.backend === "webgl2" && r.backend.api !== "webgl2")) incorrect.push(`${step}: requested ${o.backend}, observed ${r.backend.renderer}/${r.backend.api}`);
    if (o.backend === "three" && ![r.three?.geometries, r.three?.textures, r.three?.renderObjects, r.three?.programs].every(finite)) incomplete.push(`${step}: Three counters unavailable`);
  }
  for (const id of o.tracks) {
    const series = Array.from({ length: o.cycles }, (_, i) => visits.filter((r) => r.cycle === i + 1 && r.track === id));
    heapSeriesBytes[id] = series.map((xs) => xs.length === 1 && finite(xs[0].heapBytes) ? xs[0].heapBytes : null);
    if (o.cycles >= 3 && heapSeriesBytes[id].every(finite)) {
      const xs = heapSeriesBytes[id];
      growthBytes[id] = xs.at(-1) - xs.at(-2);
      growth[id] = +(growthBytes[id] / 1048576).toFixed(1);
    }
  }
  const complete = incomplete.length === 0, correct = incorrect.length === 0;
  const growthAvailable = complete && correct && o.tracks.every((id) => Object.hasOwn(growthBytes, id));
  const worst = growthAvailable ? Math.max(0, ...Object.values(growthBytes)) / 1048576 : null;
  const budget = o.maxGrowthMb == null ? "not-requested" : !growthAvailable ? "unavailable" : worst > o.maxGrowthMb ? "fail" : "pass";
  const ok = complete && correct && !["unavailable", "fail"].includes(budget);
  return { backend: o.backend, requestedBackend: o.backend, mode: o.mode, cycles: o.cycles,
    actualBackends: [...new Set(visits.map((r) => r.backend?.renderer && r.backend?.api ? `${r.backend.renderer}/${r.backend.api}` : "unavailable"))],
    units: { heapBytes: "bytes", heapMB: "MiB", growthMbLastCycle: "MiB" },
    completed, completeness: { status: complete ? "pass" : "fail", issues: incomplete },
    correctness: { status: correct ? "pass" : "fail", issues: incorrect },
    growthMbLastCycle: growth, growthBytesLastCycle: growthBytes, heapSeriesBytes,
    growthAvailable, growthPolicy: "last minus penultimate visit; first visit excluded; >=3 cycles required; not proof of leak absence",
    budget: { status: budget, maxGrowthMiB: o.maxGrowthMb, worstGrowthMiB: worst },
    ...(o.maxGrowthMb == null ? {} : { maxGrowthMb: o.maxGrowthMb }),
    presentation: { status: failureDetails?.presentation || visits.some((r) => r.presentation?.ok === false) ? "failed"
      : o.mode === "picker" && completed && visits.length === o.cycles * o.tracks.length && visits.length > 0
        && visits.every((r) => r.presentation?.ok === true && r.presentation.id === r.track) ? "verified" : "unverified",
      boundary: "renderer display completion; not physical scanout",
      reason: "picker receipts identify the final warm submission; race mode and legacy samples remain unverified" },
    pageErrors: errors.length, verdict: ok ? "ok" : "failed", ok };
}

async function snapshot(cdp, file) {
  mkdirSync(dirname(file), { recursive: true });
  const ws = createWriteStream(file);
  const onChunk = (e) => ws.write(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try { await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false }); }
  finally {
    cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
    await new Promise((r) => ws.end(r));
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let srv, browser, completed = false, failure = null, failureDetails = null, activeVisit = null;
  const args = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--enable-precise-memory-info", "--use-angle=swiftshader"];
  const rows = [], errors = [];
  try {
    srv = await startStaticServer(ROOT);
    browser = await launchChromium({ args });
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript((be) => {
      window.__TEST_MODE = true;
      try { localStorage.setItem("apex26.gfxBackend", be); localStorage.setItem("apex26.tyreWear", JSON.stringify("off")); } catch (_) {}
    }, o.backend);
    await ctx.addInitScript(censusInitScript);
    // The data hub's live APIs are not under test and must not stall a build.
    await ctx.route("https://api.jolpi.ca/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("https://api.openf1.org/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("HeapProfiler.enable");
    // TLX exposes window.renderer only behind this flag (tools/lib/mem-census reads it).
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1", { waitUntil: "load" });
    await page.waitForFunction(() => window.__apex && window.__apex.info && typeof Tracks !== "undefined", null, { polling: 100, timeout: 120000 });
    await page.evaluate(() => window.__apex.agentHelp());
    const emit = (row) => { rows.push(row); if (!o.quiet) console.log(JSON.stringify(row)); };
    emit({ step: "boot", ...(await censusAfterGc(page, cdp)) });
    for (let cycle = 1; cycle <= o.cycles; cycle++) {
      for (const id of o.tracks) {
        activeVisit = { cycle, track: id };
        const t0 = Date.now();
        if (o.mode === "picker") await pickTrack(page, id);
        else {
          await page.evaluate((tid) => { window.__apex.race(tid); }, id);
          await page.waitForFunction((tid) => { try { const i = window.__apex.info(); return i.track === tid && (i.state === "race" || i.state === "count"); } catch (_) { return false; } }, id, { polling: 100, timeout: 240000 });
        }
        const presentation = o.mode === "picker" ? await waitUntilDrawn(page, id) : null;
        await waitFrames(page, 15);
        await sleep(o.settle * 1000);
        const r = await censusAfterGc(page, cdp);
        const row = { step: `${cycle}:${id}`, cycle, track: id, buildS: +((Date.now() - t0) / 1000 - o.settle).toFixed(1), ...r,
          ...(presentation ? { presentation } : {}) };
        if (r.aliveTracks.length > 1) {
          row.observation = "more than one observed built track reachable after GC; inspect owners";
          // The moment to look: a snapshot now has the stale world in it, and
          // get_heapsnapshot_retaining_paths on its track object names the holder.
          if (o.snapshot) { row.snapshot = join(o.snapshot, `leak-${o.backend}-${cycle}-${id}.heapsnapshot`); await snapshot(cdp, row.snapshot); }
        }
        emit(row);
        activeVisit = null;
      }
      if (o.snapshot) {
        const file = join(o.snapshot, `${o.backend}-${o.mode}-cycle${cycle}.heapsnapshot`);
        await snapshot(cdp, file);
        if (!o.quiet) console.log(JSON.stringify({ snapshot: file }));
      }
    }
    completed = true;
  } catch (e) {
    failure = String(e && e.stack || e);
    failureDetails = { visit: activeVisit, presentation: e?.presentation ?? null };
  } finally {
    const summary = summariseCensus(o, rows, errors, { completed, failure, failureDetails });
    console.log("= mem-census " + JSON.stringify(summary));
    if (errors.length && !o.quiet) console.log("page errors: " + JSON.stringify(errors.slice(0, 5)));
    try {
      if (o.json) { mkdirSync(dirname(o.json), { recursive: true }); writeFileSync(o.json, JSON.stringify({ summary, rows, errors, failure, failureDetails }, null, 2)); }
    } finally {
      await shutdown();
    }
    process.exitCode = completed ? (summary.ok ? 0 : 1) : 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(async (e) => { console.error(e && e.stack || e); await shutdown(); process.exitCode = 2; });
}
