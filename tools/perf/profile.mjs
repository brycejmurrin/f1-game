#!/usr/bin/env node
// tools/perf/profile.mjs — one profiler CLI: per-subsystem spans, CPU profile, hitch scan, Perfetto trace, A/B diff.
// @doc One profiler CLI (spans | cpu | hitch | trace) with --repeat noise floor and --base <ref> A/B delta table.
// @skill playwright-probe
//
//   node tools/perf/profile.mjs <track> [--mode spans|cpu|hitch|trace] [--frames N] [--repeat N]
//                               [--base <git-ref>] [--json]
//
// spans  PerfSpans (js/perf/spans.js) over a deterministic scenario: race(track), go(), jump(), throttle plus
//        a frame-indexed steer sine, N rendered frames. Prints p50/p95/p99/max ms per span. Also records the
//        rAF cadence ("raf"), which exists on every ref, so --base works on a ref that predates the spans.
// cpu    wraps tools/shot/profile-gameloop.mjs (V8 sampling profile, top self time).
// hitch  wraps tools/gfx/frame-hitch.mjs (per-rAF cost, spike period).
// trace  CDP Tracing → artifacts/profiles/*.json, open in ui.perfetto.dev (spans show as User Timing "apex:*").
// --repeat N    N fresh pages; reports the median of each stat and the spread (max-min) across repeats.
// --base <ref>  same scenario on an ephemeral git worktree at <ref>; prints a delta table. A delta inside the
//               spread is "noise", never a win; with fewer than 3 repeats every verdict is "unproven"; the raf row is cadence, informational only.
// SwiftShader caveat: CPU JS cost is meaningful, GPU/fill numbers are not (the "render" span includes the synchronous
// software-raster wait; physics/ai/collide/hud are the reliable rows) (docs/notes/PROFILER-DESIGN-2026-10-16.md).
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { exitIfHelp, parseFlags } from "../lib/cli-args.mjs";
import { aggregate, diff, formatDiff, formatTable, intervalStats, supportsCaptureKey } from "./lib.mjs";
const CAPTURE_SRC = ["js/render/three/tlx.js", "js/render/glx/glx.js", "js/render/webgpu/wgx.js"];   // where a ref reads the apex26.wgxCapture switch

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "artifacts/profiles");
const argv = process.argv.slice(2);
exitIfHelp(argv, `profile — spans | cpu | hitch | trace, with --repeat and --base A/B

  node tools/perf/profile.mjs <track> [--mode spans|cpu|hitch|trace] [--frames N] [--repeat N] [--base <ref>] [--json] [--capture]

Default track vegas, mode spans, frames 40, repeat 1. Output: artifacts/profiles/.`);
parseFlags(argv, ["--mode", "--frames", "--repeat", "--base", "--json", "--capture", "--help"]);

function flag(name, dflt) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return dflt;
}
const VALUED = new Set(["--mode", "--frames", "--repeat", "--base"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
const track = positional[0] || "vegas";
const mode = flag("--mode", "spans");
const frames = Math.max(10, +flag("--frames", 40) || 40);
const repeat = Math.max(1, +flag("--repeat", 1) || 1);
const baseRef = flag("--base", null);
const asJson = argv.includes("--json");
// Headless TLX blits every frame to #game-soft (a readback: ~8 s a frame on SwiftShader). Timing wants it OFF, as
// frame-hitch.mjs does; --capture puts it back. The backend itself stays the default (TLX).
// 320x180: spans time main-thread JS, and SwiftShader rasterisation scales with pixels (844x390: ~9 s a frame, 320x180: ~3 s).
const VIEWPORT = { width: 320, height: 180 };
const noBlit = () => { try { sessionStorage.setItem("apex26.wgxCapture", "0"); } catch (_) { /* blocked */ } };
const newPage = async (browser) => { const ctx = await browser.newContext({ viewport: VIEWPORT }); if (!argv.includes("--capture")) await ctx.addInitScript(noBlit); return [ctx, await ctx.newPage()]; };
const log = (...a) => console.error(...a);
// Page-ready / track-load wait: APEX_PROFILE_WAIT_MS raises the 30 s floor on a loaded SwiftShader box (as profile-gameloop.mjs does).
const WAIT_MS = Math.max(30000, +process.env.APEX_PROFILE_WAIT_MS || 30000);

/** The deterministic scenario, evaluated in the page: same track, same start, same inputs on every ref. */
async function scenario(page, nFrames) {
  await page.evaluate((t) => { window.__apex.race(t); }, track);
  await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: WAIT_MS, polling: 100 });
  await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); });
  return page.evaluate(async (n) => {
    const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
    const iv = new Float64Array(n);
    let steer = (i) => 0.35 * Math.sin(i / 25);
    const drive = (i) => A.setInput({ throttle: true, steer: steer(i) });
    for (let i = 0; i < 20; i++) { drive(i); await raf(); }            // warm-up: shader/pipeline compile out of the numbers
    if (A.perf) A.perf({ on: true, reset: true });
    let last = performance.now();
    for (let i = 0; i < n; i++) { drive(i); await raf(); const t = performance.now(); iv[i] = t - last; last = t; }
    const rep = A.perf ? A.perf() : {};
    if (A.perf) A.perf({ on: false });
    A.clearInput();
    return { intervals: Array.from(iv), spans: rep.spans || null, loaf: rep.loaf || null, gpu: rep.gpu || null, frameTimes: rep.frameTimes || null };
  }, nFrames);
}

async function runSpans(root, label) {
  const srv = await startStaticServer(root);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
  const runs = [];
  try {
    for (let r = 0; r < repeat; r++) {
      const [context, page] = await newPage(browser);
      await page.goto(srv.url);
      await page.waitForFunction(() => window.__apex != null, null, { timeout: WAIT_MS, polling: 100 });
      const res = await scenario(page, frames);
      res.spans = Object.assign({}, res.spans || {}, { raf: intervalStats(res.intervals) });
      runs.push(res);
      log(`  ${label}: repeat ${r + 1}/${repeat} — ${res.intervals.length} frames, spans: ${Object.keys(res.spans).join(",")}`);
      await context.close();
    }
  } finally { await browser.close().catch(() => {}); await srv.close?.(); }
  return runs;
}

function withWorktree(ref, fn) {
  const sha = execFileSync("git", ["rev-parse", "--verify", ref], { cwd: ROOT, encoding: "utf8" }).trim();
  const dir = join(ROOT, "artifacts/profiles", "wt-" + sha.slice(0, 10));
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  execFileSync("git", ["worktree", "add", "--detach", dir, sha], { cwd: ROOT, stdio: "ignore" });
  return fn(dir, sha).finally(() => {
    try { execFileSync("git", ["worktree", "remove", "--force", dir], { cwd: ROOT, stdio: "ignore" }); } catch (_) { rmSync(dir, { recursive: true, force: true }); }
  });
}

function wrap(script, args) {
  const r = spawnSync("node", [join(ROOT, script), ...args], { cwd: ROOT, stdio: "inherit" });
  process.exitCode = r.status || 0;
}

async function runTrace() {
  mkdirSync(OUT, { recursive: true });
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
  try {
    const [, page] = await newPage(browser);
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate((t) => { window.__apex.race(t); }, track);
    await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); window.__apex.setInput({ throttle: true }); window.__apex.perf({ on: true, reset: true, measure: true }); });
    const cdp = await page.context().newCDPSession(page);
    const chunks = [];
    cdp.on("Tracing.dataCollected", (e) => chunks.push(...e.value));
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.start", { categories: "devtools.timeline,v8.execute,blink.user_timing", transferMode: "ReportEvents" });
    await page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, frames);
    await cdp.send("Tracing.end"); await done;
    const file = join(OUT, `${track}-trace.json`);
    writeFileSync(file, JSON.stringify({ traceEvents: chunks }));
    console.log(`trace: ${file} (${chunks.length} events) — open in https://ui.perfetto.dev ; spans are User Timing "apex:*"`);
  } finally { await browser.close().catch(() => {}); await srv.close?.(); }
}

try {
  if (mode === "cpu") wrap("tools/shot/profile-gameloop.mjs", [track]);
  else if (mode === "hitch") wrap("tools/gfx/frame-hitch.mjs", [track, "--seconds", String(Math.max(10, Math.round(frames / 6)))]);
  else if (mode === "trace") await runTrace();
  else if (mode === "spans") {
    mkdirSync(OUT, { recursive: true });
    log(`profile spans: ${track}, ${frames} frames x ${repeat} repeat${baseRef ? `, base ${baseRef}` : ""}`);
    const head = aggregate(await runSpans(ROOT, "head"));
    const out = { track, frames, repeat, head };
    console.log(`\nspans — ${track}, ${frames} frames, ${repeat} repeat(s) (ms)\n${formatTable(head)}`);
    if (baseRef) {
      const { agg, sha, keyed } = await withWorktree(baseRef, async (dir, sha) => ({ agg: aggregate(await runSpans(dir, "base")), sha, keyed: argv.includes("--capture") || supportsCaptureKey(CAPTURE_SRC.map((f) => { try { return readFileSync(join(dir, f), "utf8"); } catch (_) { return ""; } })) }));
      out.base = agg; out.baseRef = baseRef; out.baseSha = sha; out.delta = diff(agg, head, { incomparable: !keyed });
      if (!keyed) console.log(`(base predates the apex26.wgxCapture key: it paid the per-frame readback HEAD skipped; verdicts are "incomparable" — re-run with --capture to put the readback on both arms)`);
      console.log("\n" + formatDiff(out.delta, `${baseRef}@${sha.slice(0, 8)}`, "HEAD"));
      if (!Object.keys(agg).some((k) => k !== "raf")) console.log("(base predates PerfSpans: only the rAF cadence row is comparable)");
    }
    const file = join(OUT, `${track}-spans${baseRef ? "-ab" : ""}.json`);
    writeFileSync(file, JSON.stringify(out, null, 1));
    log(`wrote ${file}`);
    if (asJson) console.log(JSON.stringify(out));
  } else { console.error(`unknown --mode ${mode}`); process.exitCode = 1; }
} catch (err) {
  console.error("profile failed:", err.stack || err.message);
  process.exitCode = 1;
} finally { await shutdown(); }
