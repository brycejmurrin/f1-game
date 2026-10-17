/* iphone-census.test.mjs — .github/workflows/iphone-census.yml's parsing and Verdict as functions.
 *
 * The run itself needs a BrowserStack iPhone; this pins everything decidable without one:
 * the capability object (and that no credential can reach it or a log line), the interleaved arm
 * schedule, the in-page probe sources executed against stubbed globals, the percentile / cadence
 * maths, the Verdict rows and failures, the summary CLI, the driver's fail-fast on missing
 * secrets, and the workflow's shape (dispatch only, fail-fast step first, inputs through env).
 * No browser, no network, < 1 s.
 *
 * Run: node --test tests/unit/iphone-census.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYAML } from "yaml";
import * as L from "../../tools/gfx/iphone-census-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wf = parseYAML(fs.readFileSync(path.join(ROOT, ".github/workflows/iphone-census.yml"), "utf8"));
const wfText = fs.readFileSync(path.join(ROOT, ".github/workflows/iphone-census.yml"), "utf8");

test("capabilities: safaridriver on an iOS simulator, iPhone only", () => {
  const c = L.buildCapabilities({ device: "iPhone 17 Pro", os: 26 });
  assert.equal(c.browserName, "safari");
  assert.equal(c.platformName, "ios");
  assert.equal(c["safari:useSimulator"], true);
  assert.equal(c["safari:deviceType"], "iPhone");
  assert.equal(c["safari:deviceName"], "iPhone 17 Pro");
  assert.equal(c["safari:platformVersion"], "26");
  assert.ok(!("safari:platformVersion" in L.buildCapabilities({ device: "" })), "an empty os pins nothing");
});

const RUNTIMES = { runtimes: [
  { identifier: "com.apple.CoreSimulator.SimRuntime.iOS-18-5", platform: "iOS", version: "18.5", name: "iOS 18.5", isAvailable: true },
  { identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-0", platform: "iOS", version: "26.0.1", name: "iOS 26.0", isAvailable: true },
  { identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-1", platform: "iOS", version: "26.1", name: "iOS 26.1", isAvailable: false },
  { identifier: "com.apple.CoreSimulator.SimRuntime.watchOS-26-0", platform: "watchOS", version: "26.0", name: "watchOS 26.0", isAvailable: true },
] };
const DEVTYPES = { devicetypes: [
  { identifier: "dt.iPad", name: "iPad Pro 13-inch (M5)" },
  { identifier: "dt.16pro", name: "iPhone 16 Pro" },
  { identifier: "dt.17", name: "iPhone 17" },
  { identifier: "dt.17pro", name: "iPhone 17 Pro" },
  { identifier: "dt.17air", name: "iPhone Air" },
] };

test("pickRuntime: newest available iOS, version-prefix match, none", () => {
  assert.equal(L.pickRuntime(RUNTIMES).version, "26.0.1", "unavailable 26.1 and watchOS are skipped");
  assert.equal(L.pickRuntime(RUNTIMES, "18").version, "18.5");
  assert.equal(L.pickRuntime(RUNTIMES, "26.0.1").version, "26.0.1");
  assert.equal(L.pickRuntime(RUNTIMES, "2"), null, "a prefix is whole-component, not substring");
  assert.equal(L.pickRuntime({ runtimes: [] }), null);
  assert.equal(L.pickRuntime(null), null);
});

test("pickDeviceType: exact model, else the newest Pro, else the newest iPhone", () => {
  assert.deepEqual([L.pickDeviceType(DEVTYPES).identifier, L.pickDeviceType(DEVTYPES).exact], ["dt.17pro", true]);
  const noModel = { devicetypes: DEVTYPES.devicetypes.filter((d) => d.identifier !== "dt.17pro") };
  assert.deepEqual([L.pickDeviceType(noModel).identifier, L.pickDeviceType(noModel).exact], ["dt.16pro", false]);
  const noPro = { devicetypes: [{ identifier: "a", name: "iPhone 15" }, { identifier: "b", name: "iPhone 17" }] };
  assert.equal(L.pickDeviceType(noPro, "iPhone 17 Pro").identifier, "b");
  assert.equal(L.pickDeviceType({ devicetypes: [{ identifier: "p", name: "iPad Air" }] }), null);
});

test("arms: parse, reject unknown, interleave A B C A B C", () => {
  assert.deepEqual(L.parseArms("tlx, glx"), ["tlx", "glx"]);
  assert.deepEqual(L.parseArms(""), ["tlx", "tlxgpu", "glx"]);
  assert.throws(() => L.parseArms("tlx,metal"), /metal/);
  const s = L.armSchedule(["tlx", "tlxgpu", "glx"], 2).map((x) => x.arm + x.round);
  assert.deepEqual(s, ["tlx1", "tlxgpu1", "glx1", "tlx2", "tlxgpu2", "glx2"]);
  // the pins: GLX = gfxBackend webgl2; WebGPU = tlxForceGL "0"; default clears both
  assert.deepEqual(L.ARMS.glx.set, { "apex26.gfxBackend": "webgl2" });
  assert.deepEqual(L.ARMS.tlxgpu.set, { "apex26.tlxForceGL": "0" });
  assert.deepEqual(L.ARMS.tlx.set, {});
  assert.ok(L.ARMS.tlx.del.includes("apex26.gfxBackend") && L.ARMS.tlx.del.includes("apex26.tlxForceGL"));
});

test("the arm keys are the ones the game reads", () => {
  const gfx = fs.readFileSync(path.join(ROOT, "js/render/gfx.js"), "utf8");
  const picker = fs.readFileSync(path.join(ROOT, "js/perf/renderer-picker.js"), "utf8");
  assert.ok(gfx.includes('"apex26.gfxBackend"'));
  assert.ok(picker.includes('"apex26.tlxForceGL"'));
  assert.match(picker, /next === "webgpu"\) GameStore\.store\.rawSet\("apex26\.tlxForceGL", "0"\)/);
});

test("percentiles, median and rAF cadence", () => {
  const p = L.pctiles([5, 1, 2, 3, 4, 100, NaN]);
  assert.deepEqual(p, { n: 6, p50: 4, p95: 100, p99: 100 });
  assert.equal(L.pctiles([]).p50, null);
  assert.equal(L.median([3, 1, 2]), 2);
  const ts = Array.from({ length: 61 }, (_, i) => i * 16.6667);
  const c = L.cadence(ts);
  assert.equal(c.frames, 61);
  assert.equal(c.hz, 60);
  assert.equal(c.medianMs, 16.67);
  assert.equal(L.cadence([1]).hz, null);
});

function runProbe(src, globals, args = []) {
  return new Function(...Object.keys(globals), "arguments_", "return (function () {" + src + "}).apply(null, arguments_);")(...Object.values(globals), args);
}

test("FACTS_SRC: executes against stubbed Safari globals and never throws on absent hooks", () => {
  const gl = { getExtension: (n) => (n === "EXT_disjoint_timer_query_webgl2" ? null : {}), getParameter: () => "Apple GPU", RENDERER: 1, MAX_TEXTURE_SIZE: 2 };
  const doc = { createElement: () => ({ getContext: () => gl }) };
  const f = runProbe(L.FACTS_SRC, {
    navigator: { userAgent: "iPhone UA" }, window: { devicePixelRatio: 3, __apex: { perf: () => ({ scale: 1 }) } }, screen: { width: 393, height: 852 },
    innerWidth: 393, innerHeight: 700, document: doc,
    GLX: { __tlx: { backendState: () => ({ api: "webgl2", pin: null }) } },
  });
  assert.equal(f.ua, "iPhone UA");
  assert.equal(f.dpr, 3);
  assert.equal(f.hasNavigatorGpu, false);
  assert.equal(f.backendState.api, "webgl2");
  assert.equal(f.ext.EXT_color_buffer_float, true);
  assert.equal(f.ext.EXT_disjoint_timer_query_webgl2, false);
  const bare = runProbe(L.FACTS_SRC, { navigator: { userAgent: "x" }, window: {}, screen: {}, innerWidth: 1, innerHeight: 1, document: { createElement: () => ({ getContext: () => null }) }, GLX: undefined });
  assert.equal(bare.webgl2, false);
  assert.equal(bare.backendState, null);
});

test("BOUND_SRC names the bound backend: TLX api, else GLX api", () => {
  assert.equal(runProbe(L.BOUND_SRC, { GLX: { __tlx: { backendState: () => ({ api: "webgpu" }) } } }), "tlx:webgpu");
  assert.equal(runProbe(L.BOUND_SRC, { GLX: { backendState: () => ({ api: "webgl2" }) } }), "glx:webgl2");
  assert.equal(runProbe(L.BOUND_SRC, { GLX: undefined }), null);
  for (const a of Object.values(L.ARMS)) assert.match(a.expectBound, /^(tlx|glx):(webgl2|webgpu)$/);
});

test("SAMPLE_SRC reads perf, memState and tolerates Safari's missing performance.memory", () => {
  const s = runProbe(L.SAMPLE_SRC, {
    window: { __apex: { perf: () => ({ scale: 0.8, fps: 58, tier: 1, autoTier: 1, autoShed: 0, floorMs: 16.7, frameTimes: { p50: 16.7, p95: 21, p99: 30, frames: 600 } }) } },
    GLX: { __tlx: { memState: () => ({ geometries: 12 }) } }, performance: {},
  });
  assert.equal(s.scale, 0.8);
  assert.equal(s.frameTimes.p99, 30);
  assert.equal(s.mem.geometries, 12);
  assert.equal(s.jsHeapMB, null);
  const none = runProbe(L.SAMPLE_SRC, { window: {}, GLX: undefined, performance: {} });
  assert.ok(none.perfError);
});

test("every in-page source is syntactically a function body", () => {
  for (const k of ["FACTS_SRC", "GPU_ADAPTER_SRC", "RAF_SRC", "SAMPLE_SRC", "RESET_FRAMES_SRC", "DIAG_SRC", "DRIVER_SRC", "FIXED_VIEW_SRC", "READY_SRC", "BOUND_SRC"]) {
    assert.doesNotThrow(() => new Function(L[k]), k);
  }
});

const leg = (arm, round, p50, extra = {}) => ({ arm, round, expectBound: L.ARMS[arm].expectBound, bound: L.ARMS[arm].expectBound, shot: `shot-${arm}-r${round}.png`, png: { w: 393, h: 852, meanLuma: 90, nearBlack: 0.05 }, window: { p50, p95: p50 + 5, p99: p50 + 12, frames: 500, scale: 1, tier: 0 }, ...extra });
const good = () => ({
  device: "iPhone 17 Pro", os: "26", url: "https://x/", sessionId: "abc", wallMin: 12.3,
  facts: { ua: "UA", dpr: 3, hasNavigatorGpu: true, webgl2: true, ext: { EXT_color_buffer_float: true, EXT_disjoint_timer_query_webgl2: false }, backendState: { api: "webgl2" } },
  gpuAdapter: { adapter: true, shaderF16: true }, raf: { hz: 60, medianMs: 16.67 },
  soak: { windows: [{ minute: 0.5, p50: 16.7, p95: 20, p99: 28, scale: 1, tier: 0 }, { minute: 1, p50: 17.2, p95: 21, p99: 29, scale: 0.9, tier: 1 }], driver: { distM: 4200, offRoadFrames: 3 } },
  ab: [leg("tlx", 1, 16.7), leg("tlxgpu", 1, 18.4), leg("glx", 1, 16.1), leg("tlx", 2, 16.9)],
});

test("verdict: a healthy run passes and reports every plan row", () => {
  const v = L.verdict(good());
  assert.deepEqual(v.bad, []);
  const keys = v.rows.map((r) => r[0]);
  for (const k of ["host", "userAgent", "DPR", "navigator.gpu", "backendState", "extensions", "rAF (menu)", "soak +0.5m (host GPU)", "A/B tlx", "A/B tlxgpu", "A/B glx"]) assert.ok(keys.includes(k), k);
  assert.match(v.rows.find((r) => r[0] === "A/B tlx")[1], /16\.7 \| 16\.9 ms HOST-GPU, NOT PHONE \(median 16\.9\)/);
  const md = L.renderSummary(good(), v);
  assert.match(md, /Verdict: PASS/);
  assert.match(md, /SIMULATOR/);
  assert.match(md, /NOT A PHONE/);
  assert.match(md, /HOST-GPU, NOT PHONE/);
  assert.match(md, /make no thermal/);
  assert.match(md, /Timelines/);
  assert.ok(!/BrowserStack/i.test(md));
});

test("verdict: a missing facts block, failed arm, or no p50 fails; a slow phone does not", () => {
  const r = good(); r.facts = null;
  assert.match(L.verdict(r).bad.join("\n"), /no facts block/);
  const r2 = good(); r2.ab[1] = { arm: "tlxgpu", round: 1, error: "page never answered" };
  assert.match(L.verdict(r2).bad.join("\n"), /arm tlxgpu round 1: page never answered/);
  const r3 = good(); r3.ab[2].window.p50 = null;
  assert.match(L.verdict(r3).bad.join("\n"), /arm glx round 1: no frame p50/);
  const slow = good(); slow.ab.forEach((l) => { l.window.p50 = 90; });
  assert.deepEqual(L.verdict(slow).bad, []);
  const r4 = good(); r4.soak.windows = [];
  assert.match(L.verdict(r4).bad.join("\n"), /soak recorded no windows/);
});

test("verdict: a pin that did not hold FAILS and is named on its row", () => {
  const r = good(); r.ab[1].bound = "glx:webgl2";
  const v = L.verdict(r);
  assert.match(v.rows.find((x) => x[0] === "arm tlxgpu r1 bound")[1], /WANTED tlx:webgpu, GOT glx:webgl2/);
  assert.match(v.bad.join("\n"), /arm tlxgpu round 1: wanted tlx:webgpu, bound glx:webgl2/);
});

test("verdict: a hollow run (p50 0, a car that never moved, a blank frame) is not a PASS", () => {
  const r = good();
  r.soak.windows.forEach((w) => { w.p50 = 0; w.state = "menu"; });
  r.soak.driver.distM = 0;
  r.ab[0].window.p50 = 0;
  r.ab[2].png = { w: 393, h: 852, meanLuma: 0.4, nearBlack: 1 };
  const bad = L.verdict(r).bad.join("\n");
  assert.match(bad, /soak is hollow.*"menu"/);
  assert.match(bad, /covered 0 m/);
  assert.match(bad, /arm tlx round 1: hollow window/);
  assert.match(bad, /arm glx round 1: screenshot is blank/);
});

import zlib from "node:zlib";
function makePng(w, h, rgb) {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}

test("pngStats: tells a drawn frame from a black one, returns null for non-PNG", () => {
  const black = L.pngStats(makePng(8, 6, [0, 0, 0]), zlib);
  assert.deepEqual([black.w, black.h, black.meanLuma, black.nearBlack], [8, 6, 0, 1]);
  const sky = L.pngStats(makePng(8, 6, [100, 150, 220]), zlib);
  assert.ok(sky.meanLuma > 100 && sky.nearBlack === 0, JSON.stringify(sky));
  assert.equal(L.pngStats(Buffer.from("not a png at all"), zlib), null);
});

test("windowSummary takes the last sample's own ring", () => {
  const w = L.windowSummary([{ frameTimes: { p50: 20, p95: 30, p99: 40, frames: 10 }, scale: 1, tier: 0 }, { frameTimes: { p50: 17, p95: 22, p99: 31, frames: 80 }, scale: 0.9, tier: 1 }, { perfError: "x" }]);
  assert.equal(w.p50, 17); assert.equal(w.scale, 0.9); assert.deepEqual(w.p50Series, [20, 17]); assert.equal(w.samples, 3);
});

function cli(script, args, env) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...args], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
}

test("summary CLI: writes the step summary, exits 0 on pass and 1 on fail or no result", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ic-"));
  const sum = path.join(dir, "step.md");
  fs.writeFileSync(path.join(dir, "iphone-census.json"), JSON.stringify(good()));
  let r = cli("tools/gfx/iphone-census-summary.mjs", [dir], { GITHUB_STEP_SUMMARY: sum });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(sum, "utf8"), /iPhone census — iPhone 17 Pro \/ iOS 26 SIMULATOR/);
  const bad = good(); bad.facts = null;
  fs.writeFileSync(path.join(dir, "iphone-census.json"), JSON.stringify(bad));
  assert.equal(cli("tools/gfx/iphone-census-summary.mjs", [dir], { GITHUB_STEP_SUMMARY: sum }).status, 1);
  r = cli("tools/gfx/iphone-census-summary.mjs", [path.join(dir, "nope")], { GITHUB_STEP_SUMMARY: sum });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no .*iphone-census\.json/);
});

test("driver: without selenium-webdriver it exits 2 with the install hint, before touching a simulator", (t) => {
  if (fs.existsSync(path.join(ROOT, "node_modules/selenium-webdriver"))) return t.skip("selenium-webdriver is installed here; the driver would open a session");
  const r = cli("tools/gfx/iphone-census.mjs", ["--out", fs.mkdtempSync(path.join(os.tmpdir(), "ic-"))], {});
  assert.equal(r.status, 2);
  assert.match(r.stderr, /selenium-webdriver.*not installed/);
});

test("workflow: dispatch + request push only, macOS simulator, no secrets, inputs via env, verdict + artifact", () => {
  assert.deepEqual(Object.keys(wf.on), ["workflow_dispatch", "push"], "no schedule");
  assert.deepEqual(wf.on.push.paths, [".github/iphone-census-request.json"]);
  assert.deepEqual(wf.on.push.branches, ["cursor/**"]);
  const job = wf.jobs.census;
  assert.match(job["runs-on"], /inputs\.image \|\| 'macos-latest'/);
  assert.ok(wf.on.workflow_dispatch.inputs.image.options.every((o) => /^macos-/.test(o)), "image choices are macOS only");
  assert.ok(!/secrets\./.test(wfText.replace(/^\s*#.*$/gm, "")), "no secrets are read");
  assert.ok(!/browserstack/i.test(wfText.replace(/^\s*#.*$/gm, "")));
  const steps = job.steps;
  const names = steps.map((s) => s.name || s.uses);
  const iSim = names.findIndex((n) => /Boot an iPhone simulator/.test(n));
  const iRun = names.findIndex((n) => /Run census/.test(n));
  assert.ok(iSim >= 0 && iRun > iSim, "the simulator boots before the census runs");
  assert.match(steps[iSim].run, /iphone-sim-setup\.mjs/);
  for (const s of steps) if (s.run) assert.ok(!s.run.includes("${{"), "no expression interpolated into a script: " + s.name);
  assert.ok(steps.some((s) => s.run && s.run.includes("iphone-census-summary.mjs")));
  assert.ok(steps.some((s) => s.uses && s.uses.startsWith("actions/upload-artifact")));
  assert.equal(wf.concurrency["cancel-in-progress"], false);
  assert.equal(wf.permissions.contents, "read");
  const d = wf.on.workflow_dispatch.inputs;
  assert.equal(d.soak_minutes.default, "3");
  assert.equal(d.rounds.default, "1");
  assert.equal(d.device.default, "iPhone 17 Pro");
  assert.equal(d.url.default, "https://brycejmurrin.github.io/f1-game/");
  assert.match(wfText, /NOT for phone performance/);
});

test("requestEnv: allowlisted fields become IC_* lines, the rest is rejected", () => {
  const r = L.requestEnv({ "//": "note", soak_minutes: "2", arms: "tlx,glx", url: "https://example.com/x", rounds: "", device: "iPhone 17 Pro" });
  assert.deepEqual(r.lines, ["IC_SOAK=2", "IC_ARMS=tlx,glx", "IC_URL=https://example.com/x", "IC_DEVICE=iPhone 17 Pro"]);
  assert.deepEqual(r.rejected, []);
  const bad = L.requestEnv({ url: "http://x", arms: "tlx\nIC_X=1", soak_minutes: "99999", evil: "1", track: "a b" });
  assert.deepEqual(bad.lines, []);
  assert.deepEqual(bad.rejected.sort(), ["arms", "evil", "soak_minutes", "track", "url"]);
  assert.deepEqual(L.requestEnv(null).lines, []);
  const req = JSON.parse(fs.readFileSync(path.join(ROOT, ".github/iphone-census-request.json"), "utf8"));
  assert.deepEqual(L.requestEnv(req).rejected, [], "the committed request file passes its own allowlist");
});

test("verdict: the per-arm page row carries the fallback log and visibility, so a bound-GLX arm explains itself", () => {
  const r = good();
  r.ab[0].diag = { hidden: true, vis: "hidden", focus: false, hasTLX: false, gfxLog: ["Gfx.bind fallback webgl2"], diag: { env: { backendState: { api: "webgl2" } } } };
  const row = L.verdict(r).rows.find((x) => x[0] === "arm tlx r1 page");
  assert.match(row[1], /"hidden":true/);
  assert.match(row[1], /Gfx\.bind fallback webgl2/);
  assert.match(row[1], /"hasTLX":false/);
});
