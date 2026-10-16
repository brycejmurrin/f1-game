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
//        [--tracks monza,monaco,spa] [--cycles 2] [--settle 10]
//        [--snapshot DIR] [--json PATH] [--max-growth-mb N] [--quiet]
//
// --mode picker  the player's path: RACE → tap a circuit (the picker pre-builds
//                it), tap the next. This is where the #773 leak lived.
// --mode race    __apex.race(id) for each circuit (state count/race), settle.
// --cycles N     repeat the circuit list N times. Cycle 1 is warm-up (lazy
//                chunked copies, program caches); compare the LAST two cycles.
// --snapshot DIR write a heap snapshot after each cycle (open with the DevTools
//                MCP compare_heapsnapshots / get_heapsnapshot_retaining_paths).
// --max-growth-mb N  exit 1 when any circuit's heap grew more than N MB
//                between the last two cycles, or when more than one built track
//                is still reachable after GC at any step.
//
// One JSON row per step on stdout (and the whole run in --json): heapMB,
// aliveTracks (WeakRef census — exactly one expected), three {geometries,
// textures, renderObjects}, audioMB (decoded AudioBuffer PCM still reachable:
// external memory that usedJSHeapSize never shows).
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, sleep } from "../lib/harness.mjs";
import { censusInitScript, censusAfterGc, pickTrack, waitFrames, waitUntilDrawn } from "../lib/mem-census.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const o = { backend: "three", mode: "picker", tracks: ["monza", "monaco", "spa"], cycles: 2, settle: 10,
    snapshot: null, json: null, maxGrowthMb: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--backend") o.backend = next();
    else if (a === "--mode") o.mode = next();
    else if (a === "--tracks") o.tracks = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--cycles") o.cycles = Math.max(1, +next() | 0);
    else if (a === "--settle") o.settle = Math.max(0, +next());
    else if (a === "--snapshot") o.snapshot = next();
    else if (a === "--json") o.json = next();
    else if (a === "--max-growth-mb") o.maxGrowthMb = +next();
    else if (a === "--quiet") o.quiet = true;
    else if (a === "-h" || a === "--help") { console.log(readUsage()); process.exit(0); }
    else throw new Error("unknown argument " + a);
  }
  if (!["three", "webgl2"].includes(o.backend)) throw new Error("--backend must be three or webgl2");
  if (!["picker", "race"].includes(o.mode)) throw new Error("--mode must be picker or race");
  return o;
}
function readUsage() {
  return "usage: node tools/gfx/mem-census.mjs [--backend three|webgl2] [--mode picker|race] [--tracks a,b,c] [--cycles N] [--settle S] [--snapshot DIR] [--json PATH] [--max-growth-mb N] [--quiet]";
}

async function snapshot(cdp, file) {
  mkdirSync(dirname(file), { recursive: true });
  const ws = createWriteStream(file);
  const onChunk = (e) => ws.write(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await new Promise((r) => ws.end(r));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const srv = await startStaticServer(ROOT);
  const args = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--enable-precise-memory-info", "--use-angle=swiftshader"];
  const browser = await launchChromium({ args });
  const rows = [], errors = [];
  let failed = false;
  try {
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
    const emit = (row) => { rows.push(row); if (!o.quiet) console.log(JSON.stringify(row)); };
    emit({ step: "boot", ...(await censusAfterGc(page, cdp)) });
    for (let cycle = 1; cycle <= o.cycles; cycle++) {
      for (const id of o.tracks) {
        const t0 = Date.now();
        if (o.mode === "picker") await pickTrack(page, id);
        else {
          await page.evaluate((tid) => { window.__apex.race(tid); }, id);
          await page.waitForFunction((tid) => { try { const i = window.__apex.info(); return i.track === tid && (i.state === "race" || i.state === "count"); } catch (_) { return false; } }, id, { polling: 100, timeout: 240000 });
        }
        if (o.mode === "picker") await waitUntilDrawn(page, id);   // race mode warms at the lights, in front of the player
        await waitFrames(page, 15);
        await sleep(o.settle * 1000);
        const r = await censusAfterGc(page, cdp);
        const row = { step: `${cycle}:${id}`, cycle, track: id, buildS: +((Date.now() - t0) / 1000 - o.settle).toFixed(1), ...r };
        if (r.aliveTracks.length > 1) {
          row.leak = "more than one built track reachable after GC"; failed = true;
          // The moment to look: a snapshot now has the stale world in it, and
          // get_heapsnapshot_retaining_paths on its track object names the holder.
          if (o.snapshot) { row.snapshot = join(o.snapshot, `leak-${o.backend}-${cycle}-${id}.heapsnapshot`); await snapshot(cdp, row.snapshot); }
        }
        emit(row);
      }
      if (o.snapshot) {
        const file = join(o.snapshot, `${o.backend}-${o.mode}-cycle${cycle}.heapsnapshot`);
        await snapshot(cdp, file);
        if (!o.quiet) console.log(JSON.stringify({ snapshot: file }));
      }
    }
    // Growth between the last two cycles, per circuit (cycle 1 is warm-up).
    const growth = {};
    if (o.cycles >= 2) {
      for (const id of o.tracks) {
        const a = rows.find((r) => r.cycle === o.cycles - 1 && r.track === id);
        const b = rows.find((r) => r.cycle === o.cycles && r.track === id);
        if (a && b && a.heapMB != null && b.heapMB != null) growth[id] = +(b.heapMB - a.heapMB).toFixed(1);
      }
    }
    const summary = { backend: o.backend, mode: o.mode, cycles: o.cycles, growthMbLastCycle: growth, pageErrors: errors.length };
    if (o.maxGrowthMb != null) {
      const worst = Math.max(0, ...Object.values(growth));
      summary.maxGrowthMb = o.maxGrowthMb;
      if (worst > o.maxGrowthMb) { summary.verdict = `heap grew ${worst} MB > ${o.maxGrowthMb} MB between the last two cycles`; failed = true; }
    }
    summary.verdict = summary.verdict || (failed ? "leak: more than one built track reachable" : "ok");
    console.log("= mem-census " + JSON.stringify(summary));
    if (errors.length && !o.quiet) console.log("page errors: " + JSON.stringify(errors.slice(0, 5)));
    if (o.json) { mkdirSync(dirname(o.json), { recursive: true }); writeFileSync(o.json, JSON.stringify({ summary, rows, errors }, null, 2)); }
  } finally {
    await browser.close().catch(() => {});
    await srv.close?.();
    shutdown();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack || e); shutdown(); process.exit(2); });
