// @ts-check
// Playwright driver for tests/specs/perf-session-budgets.spec.js.
// Budgets and verdicts live in tools/perf/session-budgets.mjs (unit-tested).
import fs from "node:fs";
import path from "node:path";
import { toMenu } from "./shared-page.js";

export {
  BUDGETS, RACE_WINDOW_MS, frameWindow, heapGrowth, judge, sessionReport, STRICT,
} from "../../tools/perf/session-budgets.mjs";

export const TRACK = "monza";

/** Pins read by the spec before goto. three + tlxForceGL so software GL stays on WebGL2. */
export function installSessionPins() {
  window.__TEST_MODE = true;
  try {
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", "1");
    localStorage.setItem("apex26.gfxBootStepMs", "45000");
  } catch (_) { /* private mode */ }
  const bag = { samples: [], on: false, until: 0, last: 0 };
  window.__perfSessionFrames = bag;
  const tick = (t) => {
    // An in-flight callback can carry a stamp from before the seed
    // (measured −33 ms). Ignore it and keep the seed so the next stamp
    // records the real gap. A backward last would invent a negative frame.
    if (bag.on && bag.last && t > bag.last) {
      bag.samples.push(+(t - bag.last).toFixed(3));
      bag.last = t;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Which renderer actually bound, plus the software-GL string when WebGL2 will answer. */
export function readBackend() {
  let backend = null, api = null;
  try {
    if (typeof GLX !== "undefined") {
      backend = GLX.backend || null;
      const st = GLX.backendState ? GLX.backendState() : null;
      api = st && st.api ? st.api : null;
    }
  } catch (_) { /* identity stays null */ }
  let gl = null;
  try {
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (g) {
      const ext = g.getExtension("WEBGL_debug_renderer_info");
      gl = String(g.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : g.RENDERER));
    }
  } catch (_) { gl = null; }
  return { backend, api, gl };
}

/** Wait until the title is idle (no menu prep, no garage prebuild) for quietMs. */
export async function menuQuiet(page, quietMs = 2000, timeout = 45_000) {
  const hooks = await page.evaluate(() => {
    const A = window.__apex;
    return {
      menuPrep: !!(A && typeof A.menuPrep === "function"),
      garagePrebuild: !!(A && typeof A.garagePrebuild === "function"),
    };
  });
  if (!hooks.menuPrep || !hooks.garagePrebuild) return { quiet: false, reason: "menu hooks missing" };
  try {
    await page.waitForFunction((ms) => {
      const A = window.__apex;
      const p = A.menuPrep();
      const g = A.garagePrebuild();
      const busy = !!(p && (p.building || p.warming || p.warmFrames > 0)) || !!(g && g.running);
      const now = performance.now();
      const q = window.__perfSessionQuiet || (window.__perfSessionQuiet = { since: now });
      if (busy) q.since = now;
      return !busy && (now - q.since) >= ms;
    }, quietMs, { polling: 250, timeout });
    return { quiet: true };
  } catch (err) {
    return { quiet: false, reason: String(err && err.message || err).slice(0, 240) };
  }
}

/** Title GARAGE tap → the game's own firstFrame.tapMs (ms from the tap to the first drawn frame). */
export async function garageFirstDraw(page) {
  await toMenu(page);
  const started = await page.evaluate(() => {
    const btn = document.getElementById("mb-garage");
    if (!btn) return { ok: false, reason: "no #mb-garage" };
    btn.click();
    return { ok: true, t0: performance.now() };
  });
  if (!started.ok) throw new Error("garageFirstDraw: " + started.reason);
  await page.waitForFunction(() => {
    const cs = document.getElementById("carsetup");
    const pre = window.__apex && window.__apex.garagePrebuild && window.__apex.garagePrebuild();
    const first = pre && pre.firstFrame;
    return !!(cs && !cs.hidden && first && first.from === "menu" && first.tapMs > 0);
  }, null, { polling: 100, timeout: 90_000 });
  return page.evaluate((t0) => {
    const first = window.__apex.garagePrebuild().firstFrame;
    return {
      tapMs: first.tapMs,
      workMs: first.workMs,
      calls: first.calls,
      prebuilt: !!first.prebuilt,
      from: first.from,
      wallMs: Math.round(performance.now() - t0),
    };
  }, started.t0);
}

/** __apex.race until the formation grid (state "count") or, if the countdown already ended, "race". */
export async function timeToGrid(page, track = TRACK) {
  const t0 = await page.evaluate((id) => {
    const r = window.__apex.race(id, "day", "clear");
    return { ok: !!r, t0: performance.now(), track: r && r.track };
  }, track);
  if (!t0.ok) throw new Error("timeToGrid: race() rejected " + track);
  await page.waitForFunction((id) => {
    const info = window.__apex.info();
    return !!(info && info.track === id && (info.state === "count" || info.state === "race"));
  }, track, { polling: 200, timeout: 240_000 });
  return page.evaluate((start) => {
    const info = window.__apex.info();
    return { ms: Math.round(performance.now() - start), state: info.state, track: info.track };
  }, t0.t0);
}

/** Collect rAF deltas for windowMs of wall time once the race is green.
 *
 * go() skips the formation countdown, the same lights-out the other race specs
 * use. On software GL that countdown only moves when a frame runs, and a frame
 * can cost many seconds, so waiting it out missed a 90 s budget while the
 * field was still building (2026-10-29, state stayed "count").
 */
export async function sampleRaceWindow(page, windowMs) {
  const lightsHandle = await page.waitForFunction(() => {
    const A = window.__apex;
    const info = A && A.info();
    if (!info) return false;
    if (info.state === "race") return "already-race";
    if (info.state === "count") {
      try { A.go(); } catch (_) { /* grid not seated yet; the next poll retries */ }
    }
    return A.info().state === "race" ? "go" : false;
  }, null, { polling: 250, timeout: 180_000 });
  const lights = await lightsHandle.jsonValue();
  await page.evaluate((ms) => {
    const bag = window.__perfSessionFrames;
    const A = window.__apex;
    try { A.frametimeBench("reset"); } catch (_) { /* older build: rAF samples still stand */ }
    bag.samples.length = 0;
    // Seed last so the first callback keeps the gap since arming. Zeroing it
    // dropped that gap (measured: 4 samples summing to ~5 s of a 30 s window).
    bag.last = performance.now();
    bag.on = true;
    bag.until = bag.last + ms;
    A.setInput({ throttle: true, steer: 0, brake: false });
    if (window.__perfSessionDrive) clearInterval(window.__perfSessionDrive);
    window.__perfSessionDrive = setInterval(() => {
      if (!bag.on) return;
      try {
        const p = A.probe();
        const steer = p && Number.isFinite(p.x) ? Math.max(-1, Math.min(1, -p.x * 0.15)) : 0;
        A.setInput({ throttle: true, steer, brake: false });
      } catch (_) { /* probe is optional; throttle already held */ }
    }, 50);
  }, windowMs);
  await page.waitForFunction(() => performance.now() >= window.__perfSessionFrames.until, null, { polling: 200, timeout: windowMs + 20_000 });
  return page.evaluate((how) => {
    const bag = window.__perfSessionFrames;
    bag.on = false;
    if (window.__perfSessionDrive) { clearInterval(window.__perfSessionDrive); window.__perfSessionDrive = 0; }
    try { window.__apex.clearInput(); } catch (_) { /* already clear */ }
    let governor = null;
    try { governor = window.__apex.frametimeBench("snapshot"); } catch (_) { governor = null; }
    const samples = bag.samples.slice();
    let coveredMs = 0;
    for (let i = 0; i < samples.length; i++) coveredMs += samples[i];
    return { samples, coveredMs: Math.round(coveredMs), governor, lights: how };
  }, lights);
}

/** Pause, then QUIT TO MENU (the first press arms when confirm-quit is on). */
export async function quitToMenu(page) {
  await page.evaluate(() => {
    const pause = document.getElementById("pausebtn");
    if (pause) pause.click();
  });
  await page.waitForFunction(() => {
    const d = document.getElementById("pausemenu");
    return !!(d && !d.hidden);
  }, null, { polling: 100, timeout: 15_000 }).catch(() => null);
  const clicked = await page.evaluate(() => {
    const q = document.getElementById("pm-quit");
    if (!q) return false;
    q.click();
    if (q.classList.contains("armed")) q.click();
    return true;
  });
  if (!clicked) throw new Error("quitToMenu: no #pm-quit");
  await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 200, timeout: 60_000 });
}

/** usedSize after two CDP collections. performance.memory is not precise enough to gate. */
export async function heapMB(page, cdp) {
  for (let i = 0; i < 2; i++) await cdp.send("HeapProfiler.collectGarbage");
  const usage = await cdp.send("Runtime.getHeapUsage");
  const bytes = usage && usage.usedSize;
  if (!Number.isFinite(bytes)) return { bytes: null, mb: null };
  return { bytes, mb: Math.round((bytes / 1048576) * 100) / 100 };
}

export function writeArtifact(dir, payload) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "perf-session.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
  return file;
}
