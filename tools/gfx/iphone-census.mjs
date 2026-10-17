// iphone-census.mjs — drive Mobile Safari in an iOS SIMULATOR through safaridriver
// @doc Drives Mobile Safari in an iOS simulator (safaridriver): facts, rAF, soak, 3-arm renderer A/B -> iphone-census.json.
// @skill renderer-debug
// and record the phone measurement plan's automatable parts
// (docs/notes/PERF-RESEARCH-2026-10-17.md §4 A, A2, B-lite, D). The simulator
// renders on the Mac's GPU: correctness evidence, not phone performance (see
// iphone-census-lib.mjs). Pure logic is there (node --test); this is the plumbing.
//
//   node tools/gfx/iphone-census.mjs [--url U] [--device "iPhone 17 Pro"] [--os 26.0]
//        [--soak-min 3] [--arms tlx,tlxgpu,glx] [--rounds 1] [--window-s 45]
//        [--track montreal] [--out artifacts/iphone-census]
//
// Needs macOS with Xcode, a BOOTED iOS simulator (tools/gfx/iphone-sim-setup.mjs
// does that in CI) and `selenium-webdriver` (the workflow installs it with
// --no-save; it is deliberately not a package.json dependency). No secrets.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import {
  ARMS, BOUND_SRC, DIAG_SRC, DRIVER_SRC, NO_ROTATE_SRC, FACTS_SRC, FIXED_VIEW_SRC, GLPROBE_SRC, GPU_ADAPTER_SRC, RAF_SRC, READY_SRC,
  RESET_FRAMES_SRC, SAMPLE_SRC, DEFAULT_URL, armSchedule, buildCapabilities, cadence, parseArms, pngStats, windowSummary,
} from "./iphone-census-lib.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(a.join(" "));

const URL_ = flag("--url", DEFAULT_URL);
const device = flag("--device", "iPhone 17 Pro");   // the simulator's NAME (safari:deviceName)
const model = flag("--model", device);          // what the summary calls it
const os = flag("--os", "");
const soakMin = Math.max(0, Number(flag("--soak-min", 3)));
const arms = parseArms(flag("--arms", "tlx,tlxgpu,glx"));
const rounds = Math.max(1, Number(flag("--rounds", 1)));
const windowS = Math.max(15, Number(flag("--window-s", 45)));
const track = flag("--track", "montreal");
const outDir = flag("--out", "artifacts/iphone-census");
fs.mkdirSync(outDir, { recursive: true });

const res = { url: URL_, device: model, simName: device, os, track, soakMin, arms, rounds, windowS, startedAt: new Date().toISOString(), phases: {} };
const save = () => fs.writeFileSync(path.join(outDir, "iphone-census.json"), JSON.stringify(res, null, 2));
const t0 = Date.now();

let webdriver;
try { webdriver = await import("selenium-webdriver"); }
catch (_) { console.error("iphone-census: `selenium-webdriver` is not installed (npm install --no-save --no-package-lock selenium-webdriver)."); process.exit(2); }
const { Builder } = webdriver;

const caps = buildCapabilities({ device, os });
res.capabilities = caps;
res.runner = process.env.RUNNER_NAME ? process.env.RUNNER_OS + "/" + process.env.RUNNER_ARCH : null;
const driver = await new Builder().forBrowser("safari").withCapabilities(caps).build()
  .catch((e) => {
    console.error("iphone-census: safaridriver refused the iOS-simulator session: " + String((e && e.message) || e).slice(0, 800));
    console.error("Is a simulator booted (xcrun simctl list devices booted) and Remote Automation on? See tools/gfx/iphone-sim-setup.mjs.");
    process.exit(3);
  });
const session = await driver.getSession();
res.sessionId = session.getId();
{
  const c = session.getCapabilities();
  res.reportedCaps = { browserName: c.get("browserName"), platformName: c.get("platformName"), browserVersion: c.get("browserVersion") };
}
log("session", res.sessionId, device, os ? "iOS " + os : "");
// executeAsyncScript waits for its callback only this long; the rAF probe needs seconds.
await driver.manage().setTimeouts({ script: 60000, pageLoad: 180000 });

const run = (src, ...a) => driver.executeScript(src, ...a);
const runAsync = (src, ...a) => driver.executeAsyncScript(src, ...a);
const phase = async (name, fn) => {
  const t = Date.now();
  try { res.phases[name] = { ok: true, value: await fn() }; }
  catch (e) { res.phases[name] = { ok: false, error: String((e && e.message) || e).slice(0, 400) }; log("phase", name, "FAILED:", res.phases[name].error); }
  res.phases[name].sec = Math.round((Date.now() - t) / 1000);
  save();
  return res.phases[name];
};

async function waitReady(timeoutMs = 180000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if (await run(READY_SRC)) { await run(NO_ROTATE_SRC); return true; } } catch (_) { /* page still loading */ }
    await sleep(3000);
  }
  throw new Error("game did not answer __apex.info() in " + timeoutMs / 1000 + " s");
}

async function startRace() {
  const r = await run(`return window.__apex.race(arguments[0], "day", "dry", { laps: 50 })`, track);
  if (!r) throw new Error("__apex.race(" + track + ") returned false");
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    if (await run(`try { return window.__apex.info().track != null; } catch (_) { return false; }`)) break;
    await sleep(2000);
  }
  await run(`const A = window.__apex; A.go(); A.camera("chase"); return true;`);
  await run(DRIVER_SRC);
  await run(`window.__icDrive.start(); return true;`);
}

/** Sample every `everyS` for `totalS`, resetting the frame ring after each read
 *  (BrowserStack's idle timeout is 90 s: every poll is also the keep-alive). */
async function sampleWindow(totalS, everyS) {
  const samples = [];
  await run(RESET_FRAMES_SRC);
  const end = Date.now() + totalS * 1000;
  while (Date.now() < end) {
    await sleep(Math.min(everyS * 1000, Math.max(0, end - Date.now())));
    samples.push(await run(SAMPLE_SRC));
  }
  return samples;
}

try {
  // ── A: facts (page loads on the default path) ──
  await phase("load", async () => { await driver.get(URL_); await waitReady(); return true; });
  await phase("facts", async () => {
    res.facts = await run(FACTS_SRC);
    const m = /OS (\d+)[_.](\d+)/.exec(res.facts.ua || "");
    if (m) res.os = res.os || `${m[1]}.${m[2]}`;   // Safari freezes the minor in the UA; a hint, not the runtime build
    res.gpuAdapter = await runAsync(GPU_ADAPTER_SRC);
    res.glProbe = await run(GLPROBE_SRC).catch((e) => ({ error: String(e && e.message) }));
    log("glprobe", JSON.stringify(res.glProbe));
    return true;
  });
  // ── A2: rAF cadence on the menu ──
  await phase("raf", async () => { res.raf = cadence(await runAsync(RAF_SRC, 4000)); return res.raf; });

  // ── B-lite: scripted race soak ──
  if (soakMin > 0) {
    await phase("soak", async () => {
      await startRace();
      await sleep(15000);   // settle: warm, first governor decisions
      const windows = [];
      const every = 30, n = Math.round(soakMin * 60 / every);
      for (let i = 1; i <= n; i++) {
        const w = windowSummary(await sampleWindow(every, every));
        const s = await run(SAMPLE_SRC);
        windows.push({ minute: +(i * every / 60).toFixed(1), ...w, mem: s.mem || null, jsHeapMB: s.jsHeapMB ?? null });
        log("soak", i + "/" + n, "p50", w.p50, "scale", w.scale, "tier", w.tier);
      }
      res.soakDiag = await run(DIAG_SRC).catch((e) => ({ error: String(e && e.message) }));
      res.soak = { windows, driver: await run(`return window.__icDrive ? window.__icDrive.stats() : null`) };
      return true;
    });
  }

  // ── D: three-way renderer A/B, interleaved ──
  res.ab = [];
  for (const { arm, round } of armSchedule(arms, rounds)) {
    const leg = { arm, round, label: ARMS[arm].label, expectBound: ARMS[arm].expectBound };
    res.ab.push(leg);
    if (arm === "tlxgpu" && !(res.gpuAdapter && res.gpuAdapter.adapter)) {
      leg.skipped = "this simulator has no WebGPU adapter (navigator.gpu exists, requestAdapter() = null): three's WebGPU pin falls back to its WebGL2 backend, so there is nothing distinct to measure. A real-device question.";
      log("ab", arm, "r" + round, "SKIPPED:", leg.skipped);
      continue;
    }
    const ph = await phase(`ab-${arm}-r${round}`, async () => {
      await run(`const [set, del] = arguments; try { for (const k of del) localStorage.removeItem(k); for (const k of Object.keys(set)) localStorage.setItem(k, set[k]); sessionStorage.removeItem("apex26.gfxBound"); } catch (e) {} return true;`, ARMS[arm].set, ARMS[arm].del);
      await driver.get(URL_);
      await waitReady();
      leg.bound = await run(BOUND_SRC);
      await startRace();
      await sleep(15000);
      const samples = await sampleWindow(windowS, 15);
      leg.window = windowSummary(samples);
      leg.mem = (samples[samples.length - 1] || {}).mem || null;
      leg.diag = await run(DIAG_SRC).catch((e) => ({ error: String(e && e.message) }));
      leg.driver = await run(`return window.__icDrive ? window.__icDrive.stats() : null`).catch(() => null);
      await run(FIXED_VIEW_SRC);
      await sleep(2500);   // frames reach the compositor before the capture
      const png = await driver.takeScreenshot();
      const file = `shot-${arm}-r${round}.png`;
      const pngBuf = Buffer.from(png, "base64");
      fs.writeFileSync(path.join(outDir, file), pngBuf);
      leg.png = pngStats(pngBuf, zlib);
      leg.shot = file;
      // The whole simulator screen too (best effort): shows what the WebDriver capture can crop.
      const sf = `sim-${arm}-r${round}.png`;
      const r = spawnSync("xcrun", ["simctl", "io", "booted", "screenshot", path.join(outDir, sf)], { encoding: "utf8" });
      if (r.status === 0) leg.simShot = sf;
      log("ab", arm, "r" + round, "bound", leg.bound, "p50", leg.window.p50);
      return true;
    });
    if (!ph.ok) leg.error = ph.error;
  }
  res.status = "done";
} finally {
  res.wallMin = +((Date.now() - t0) / 60000).toFixed(1);
  save();
  const bad = Object.entries(res.phases).filter(([, p]) => !p.ok).length;
  try {
    res.failedPhases = bad;
  } catch (_) { /* cosmetic */ }
  try { await driver.quit(); } catch (_) { /* session already gone */ }
}
log("done in", res.wallMin, "min →", outDir);
