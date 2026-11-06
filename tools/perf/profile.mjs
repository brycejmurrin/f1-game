#!/usr/bin/env node
// tools/perf/profile.mjs — one profiler CLI: per-subsystem spans, CPU profile, hitch scan, Perfetto trace, physics step, A/B diff.
// @doc One profiler CLI (spans | cpu | hitch | trace | step) with --repeat noise floor and --base <ref> A/B delta table.
// @skill playwright-probe
//
//   node tools/perf/profile.mjs <track> [--mode spans|cpu|hitch|trace|step] [--frames N] [--repeat N]
//                               [--steps N] [--warm N] [--base <git-ref>] [--json]
//
// spans  PerfSpans (js/perf/spans.js) over a deterministic scenario: race(track), go(), jump(), throttle plus
//        a frame-indexed steer sine, N rendered frames. Prints p50/p95/p99/max ms per span. Also records the
//        rAF cadence ("raf"), which exists on every ref, so --base works on a ref that predates the spans.
// cpu    wraps tools/shot/profile-gameloop.mjs (V8 sampling profile, top self time); no measurement controls.
// hitch  wraps tools/gfx/frame-hitch.mjs (per-rAF cost, spike period); --frames N means max(10, round(N/6)) seconds, --capture restores readback.
// step   the physics/AI step alone in real Chromium V8 (headless(true): no render, no SwiftShader in the timing):
//        seed 42 before race creation, reset(seed 42) + throttle, --warm steps for the JIT, then --steps timed in batches of 10 (performance.now
//        is coarse); prints ms/step p50/p95/p99 and checks the rounded field digest across --base arms.
//        The spans "physics" row is NOT one step: a slow SwiftShader frame catches up
//        to five, and the Node VM (game-vm.cjs) over-weights global lookups ~6x (docs/notes/PERF-SCENE-CPU-2026-10-20.md).
//        --cpu-throttle N: CDP Emulation.setCPUThrottlingRate(N) for the whole page (phone-class CPU, e.g. 4 or 6).
// trace  CDP Tracing → artifacts/profiles/*.json, open in ui.perfetto.dev or the Chrome Performance panel (spans: User Timing "apex:*", one DevTools track per phase in group "Apex 26").
// --repeat N    (spans/step only) N fresh pages; reports the median of each stat and the spread (max-min) across repeats.
// --base <ref>  (spans/step only) same scenario on an ephemeral git worktree at <ref>; prints a delta table. A delta inside the
//               spread is "noise", never a win; with fewer than 3 repeats every verdict is "unproven"; the raf row is cadence, informational only.
// SwiftShader caveat: CPU JS cost is meaningful, GPU/fill numbers are not (the "render" span includes the synchronous
// software-raster wait; physics/ai/collide/hud are the reliable rows) (docs/notes/PROFILER-DESIGN-2026-10-16.md).
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { exitIfHelp, parseFlags } from "../lib/cli-args.mjs";
import { aggregate, diff, formatDiff, formatTable, intervalStats, supportsCaptureKey, profileScenario, profileScenarioSignature, profileComparability, profileOptionProblem } from "./lib.mjs";
const CAPTURE_SRC = ["js/render/three/tlx.js", "js/render/glx/glx.js", "js/render/webgpu/wgx.js"];   // where a ref reads the apex26.wgxCapture switch

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "artifacts/profiles");
const argv = process.argv.slice(2);
exitIfHelp(argv, `profile — spans | cpu | hitch | trace | step; repeat/base A/B in spans/step only

  node tools/perf/profile.mjs <track> [--mode spans|cpu|hitch|trace|step] [--frames N] [--steps N] [--warm N] [--repeat N] [--base <ref>] [--cpu-throttle N] [--json] [--capture]

Controls by mode:
  spans: frames, repeat, base, json, capture
  cpu: none (one raw CPU profile)
  hitch: frames (max(10, round(N/6)) seconds), capture
  trace: frames, capture
  step: steps, warm, repeat, base, json, capture, cpu-throttle
Boolean switches json/capture/help take no assigned value.
Default track vegas, mode spans, frames 40, repeat 1. Output: artifacts/profiles/.`);
parseFlags(argv, ["--mode", "--frames", "--steps", "--warm", "--repeat", "--base", "--json", "--capture", "--cpu-throttle", "--help"]);

function flag(name, dflt) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return dflt;
}
const VALUED = new Set(["--mode", "--frames", "--steps", "--warm", "--repeat", "--base", "--cpu-throttle"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
const track = positional[0] || "vegas";
const mode = flag("--mode", "spans");
const explicit = argv.filter(arg => arg.startsWith("--"))
  .map(arg => arg.slice(2).split("=")[0]).filter(name => name !== "mode" && name !== "help");
const problem = profileOptionProblem(mode, explicit);
const assignedBoolean = argv.find(arg => /^--(json|capture|help)=/.test(arg));
if (problem || assignedBoolean) {
  console.error("profile: " + (problem || `${assignedBoolean.split("=")[0]} takes no assigned value; use the bare switch`));
  process.exit(2);
}
const frames = Math.max(10, +flag("--frames", 40) || 40);
const repeat = Math.max(1, +flag("--repeat", 1) || 1);
const steps = Math.max(100, +flag("--steps", 3000) || 3000), warm = Math.max(0, +flag("--warm", 3000) || 0);
const baseRef = flag("--base", null);
const cpuThrottle = Math.max(1, +flag("--cpu-throttle", 1) || 1);
const asJson = argv.includes("--json");
// Headless TLX blits every frame to #game-soft (a readback: ~8 s a frame on SwiftShader). Timing wants it OFF, as
// frame-hitch.mjs does; --capture puts it back. The backend itself stays the default (TLX).
// 320x180: spans time main-thread JS, and SwiftShader rasterisation scales with pixels (844x390: ~9 s a frame, 320x180: ~3 s).
const VIEWPORT = { width: 320, height: 180 };
const DEVICE_SCALE_FACTOR = 1;
const noBlit = () => { try { sessionStorage.setItem("apex26.wgxCapture", "0"); } catch (_) { /* blocked */ } };
const newPage = async (browser) => { const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR }); if (!argv.includes("--capture")) await ctx.addInitScript(noBlit); return [ctx, await ctx.newPage()]; };
const log = (...a) => console.error(...a);
// Page-ready / track-load wait: APEX_PROFILE_WAIT_MS raises the 30 s floor on a loaded SwiftShader box (as profile-gameloop.mjs does).
const WAIT_MS = Math.max(30000, +process.env.APEX_PROFILE_WAIT_MS || 30000);

async function prepareRace(page) {
  await page.evaluate(async (t) => {
    const A = window.__apex;
    // reset() re-grids existing cars; skill and lanePref were drawn by race().
    A.seed(42);
    const started = await A.race(t);
    if (!started || started.track !== t) throw new Error(`profile: race setup rejected ${t}`);
  }, track);
  // Also supports older refs whose race descriptor was not yet thenable. A
  // selected id alone is insufficient: require the built world and live grid.
  await page.waitForFunction((t) => {
    const A = window.__apex, i = A.info();
    return i.track === t && (i.state === "count" || i.state === "race") && i.n > 0 && i.total > 0 && A.fieldState().length > 0;
  }, track, { timeout: WAIT_MS, polling: 100 });
}

/** The deterministic scenario, evaluated in the page: same track, same start, same inputs on every ref. */
async function scenario(page, nFrames) {
  await prepareRace(page);
  await page.evaluate(() => {
    const A = window.__apex;
    if (A.go() !== "race" || !A.jump(0.1, 55, 0)) throw new Error("profile: race did not reach the driving scenario");
  });
  return page.evaluate(async (n) => {
    const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
    const iv = new Float64Array(n);
    let steer = (i) => 0.35 * Math.sin(i / 25);
    const drive = (i) => A.setInput({ throttle: true, steer: steer(i) });
    for (let i = 0; i < 20; i++) { drive(i); await raf(); }            // warm-up: shader/pipeline compile out of the numbers
    const before = A.fieldState();
    if (A.perf) A.perf({ on: true, reset: true });
    let last = performance.now();
    for (let i = 0; i < n; i++) { drive(i); await raf(); const t = performance.now(); iv[i] = t - last; last = t; }
    const rep = A.perf ? A.perf() : {};
    if (A.perf) A.perf({ on: false });
    A.clearInput();
    const after = A.fieldState();
    if (A.info().state !== "race" || after.length !== before.length || !after.some(c => {
      const prev = before.find(b => b.id === c.id); return prev && (c.lap !== prev.lap || c.frac !== prev.frac);
    }))
      throw new Error("profile: rendered scenario did not advance the racing field");
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
      const identity = await page.evaluate(() => {
        try {
          const d = window.__apex.diag({ download: false });
          return { backend: d.env?.backend || null, api: d.env?.backendState?.api || null, device: d.gl?.renderer || null };
        } catch { return { backend: null, api: null, device: null }; }
      });
      res.scenario = profileScenario({ track, frames, viewport: { ...VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR },
        capture: argv.includes("--capture") || !supportsCaptureKey(CAPTURE_SRC.map(f => { try { return readFileSync(join(root, f), "utf8"); } catch { return ""; } })) ? "enabled" : "disabled",
        environment: { ...identity, browser: browser.version() } });
      runs.push(res);
      log(`  ${label}: repeat ${r + 1}/${repeat} — ${res.intervals.length} frames, spans: ${Object.keys(res.spans).join(",")}`);
      await context.close();
    }
  } finally { await browser.close().catch(() => {}); await srv.close?.(); }
  const savedScenario = runs[0]?.scenario;
  // A fallback or device change between repeats also prevents trustworthy judgments.
  const stable = !!profileScenarioSignature(savedScenario) && runs.every(r => profileScenarioSignature(r.scenario) === profileScenarioSignature(savedScenario));
  return { agg: aggregate(runs), scenario: stable ? savedScenario : null, observedScenarios: runs.map(r => r.scenario) };
}

/** Serialized into Chromium: no Node closures; validation stays outside timed batches. */
function measureSteps({ n, w }) {
  const A = window.__apex;
  if (A.go() !== "race") throw new Error("profile: race did not reach the step scenario");
  A.headless(true);
  try {
    if (!A.reset(0.02, 55, 0, 42)) throw new Error("profile: step reset failed");
    A.setInput({ throttle: true, steer: 0.02 });
    for (let i = 0; i < w; i++) A.step(1 / 60, 1);
    const before = A.fieldState();
    if (!before.length || !before.every(c => Number.isFinite(c.frac) && Number.isFinite(c.lap))) throw new Error("profile: invalid field before fixed steps");
    // FNV-1a over fieldState() every 100 steps: rounded fields, but a divergence grows over thousands of
    // steps. The raw bit-identity check is the Node VM's (tests/unit/determinism-replay-vm.test.mjs).
    let h = 0x811c9dc5;
    const digest = () => { const str = JSON.stringify(A.fieldState());
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
    const B = 10, per = [];
    for (let i = 0; i < n; i += B) {
      const count = Math.min(B, n - i);
      const t0 = performance.now(); A.step(1 / 60, count); per.push((performance.now() - t0) / count);
      if ((i / B) % 10 === 0) digest();
    }
    const after = A.fieldState();
    if (A.info().state !== "race" || after.length !== before.length || !after.every(c => Number.isFinite(c.frac) && Number.isFinite(c.lap)) || !after.some(c => {
      const prev = before.find(b => b.id === c.id); return prev && (c.lap !== prev.lap || c.frac !== prev.frac);
    }))
      throw new Error("profile: fixed steps did not advance the racing field");
    digest();
    const s = per.slice().sort((a, b) => a - b), q = (p) => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(4);
    return { spans: { step: { n: per.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s[s.length - 1].toFixed(4) } },
             digest: h.toString(16), cars: after.length };
  } finally { A.clearInput(); A.headless(false); }
}

/** --mode step: one page per repeat; the in-page loop times batches of 10 steps between digest reads. */
async function runStep(root, label) {
  const srv = await startStaticServer(root);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
  const runs = [];
  try {
    for (let r = 0; r < repeat; r++) {
      const [context, page] = await newPage(browser);
      if (cpuThrottle > 1) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
      await page.goto(srv.url);
      await page.waitForFunction(() => window.__apex != null, null, { timeout: WAIT_MS, polling: 100 });
      await prepareRace(page);
      const res = await page.evaluate(measureSteps, { n: steps, w: warm });
      runs.push(res);
      log(`  ${label}: repeat ${r + 1}/${repeat} — ${res.cars} cars, step p50 ${res.spans.step.p50} ms, digest ${res.digest}`);
      await context.close();
    }
  } finally { await browser.close().catch(() => {}); await srv.close?.(); }
  return { agg: aggregate(runs), digests: [...new Set(runs.map((r) => r.digest))] };
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
  // spawnSync has no numeric status when launch fails or a signal ends the
  // child. Neither outcome establishes a completed profile.
  if (r.error) console.error(`profile child ${script} failed: ${r.error.message}`);
  else if (r.signal) console.error(`profile child ${script} terminated by ${r.signal}`);
  process.exitCode = r.status ?? 1;
}

async function runTrace() {
  mkdirSync(OUT, { recursive: true });
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
  try {
    const [, page] = await newPage(browser);
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { timeout: WAIT_MS, polling: 100 });
    await prepareRace(page);
    await page.evaluate(() => {
      const A = window.__apex;
      if (A.go() !== "race" || !A.jump(0.1, 55, 0)) throw new Error("profile: race did not reach the trace scenario");
      A.setInput({ throttle: true }); A.perf({ on: true, reset: true, measure: true });
    });
    const cdp = await page.context().newCDPSession(page);
    const chunks = [];
    cdp.on("Tracing.dataCollected", (e) => chunks.push(...e.value));
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.start", { categories: "devtools.timeline,v8.execute,blink.user_timing", transferMode: "ReportEvents" });
    await page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, frames);
    await cdp.send("Tracing.end"); await done;
    const file = join(OUT, `${track}-trace.json`);
    writeFileSync(file, JSON.stringify({ traceEvents: chunks }));
    const tracks = {};
    for (const e of chunks) { const t = e.cat === "blink.user_timing" && e.args && e.args.detail; const d = typeof t === "string" && /"track":"([^"]+)"/.exec(t); if (d) tracks[d[1]] = (tracks[d[1]] || 0) + 1; }
    console.log(`trace: ${file} (${chunks.length} events) — open in https://ui.perfetto.dev or the Chrome Performance panel (Load profile); spans are User Timing "apex:*", DevTools tracks in group "Apex 26": ${JSON.stringify(tracks)}`);
  } finally { await browser.close().catch(() => {}); await srv.close?.(); }
}

try {
  if (mode === "cpu") wrap("tools/shot/profile-gameloop.mjs", [track]);
  else if (mode === "hitch") wrap("tools/gfx/frame-hitch.mjs", [track, "--seconds", String(Math.max(10, Math.round(frames / 6))), ...(argv.includes("--capture") ? ["--capture"] : [])]);
  else if (mode === "trace") await runTrace();
  else if (mode === "step") {
    mkdirSync(OUT, { recursive: true });
    log(`profile step: ${track}, warm ${warm} + ${steps} steps x ${repeat} repeat${baseRef ? `, base ${baseRef}` : ""}`);
    const head = await runStep(ROOT, "head");
    const out = { track, steps, warm, repeat, head: head.agg, digests: head.digests };
    console.log(`\nstep — ${track}, ${steps} steps after ${warm}, ${repeat} repeat(s) (ms per step)\n${formatTable(head.agg)}\ndigest ${head.digests.join(" ")}${head.digests.length > 1 ? "  (NOT deterministic across repeats)" : ""}`);
    if (baseRef) {
      const base = await withWorktree(baseRef, async (dir, sha) => ({ ...(await runStep(dir, "base")), sha }));
      out.base = base.agg; out.baseRef = baseRef; out.baseSha = base.sha; out.baseDigests = base.digests;
      out.delta = diff(base.agg, head.agg);
      out.bitIdentical = base.digests.length === 1 && head.digests.length === 1 && base.digests[0] === head.digests[0];
      console.log("\n" + formatDiff(out.delta, `${baseRef}@${base.sha.slice(0, 8)}`, "HEAD"));
      console.log(`field digest: base ${base.digests.join(" ")}  head ${head.digests.join(" ")}  → ${out.bitIdentical ? "rounded digest matches" : "DIFFERS"}`);
    }
    const file = join(OUT, `${track}-step${baseRef ? "-ab" : ""}.json`);
    writeFileSync(file, JSON.stringify(out, null, 1));
    log(`wrote ${file}`);
    if (asJson) console.log(JSON.stringify(out));
  }
  else if (mode === "spans") {
    mkdirSync(OUT, { recursive: true });
    log(`profile spans: ${track}, ${frames} frames x ${repeat} repeat${baseRef ? `, base ${baseRef}` : ""}`);
    const headRun = await runSpans(ROOT, "head"), head = headRun.agg;
    const out = { track, frames, repeat, head, scenario: headRun.scenario, scenarioSignature: profileScenarioSignature(headRun.scenario), observedScenarios: headRun.observedScenarios };
    console.log(`\nspans — ${track}, ${frames} frames, ${repeat} repeat(s) (ms)\n${formatTable(head)}`);
    if (baseRef) {
      const { agg, scenario: baseScenario, observedScenarios: baseObservedScenarios, sha, keyed } = await withWorktree(baseRef, async (dir, sha) => ({ ...(await runSpans(dir, "base")), sha, keyed: argv.includes("--capture") || supportsCaptureKey(CAPTURE_SRC.map((f) => { try { return readFileSync(join(dir, f), "utf8"); } catch (_) { return ""; } })) }));
      out.base = agg; out.baseRef = baseRef; out.baseSha = sha; out.baseScenario = baseScenario;
      out.baseScenarioSignature = profileScenarioSignature(baseScenario); out.baseObservedScenarios = baseObservedScenarios;
      out.comparability = profileComparability({ scenario: baseScenario }, out);
      out.delta = diff(agg, head, { incomparable: !keyed || !out.comparability.comparable });
      if (!out.comparability.comparable) console.log(`(comparison incomparable: ${out.comparability.reason})`);
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
