#!/usr/bin/env node
// tools/perf/race-entry-timer.mjs — one race entry under a Playwright Chromium: boot → __apex.race(track) → the
// info().track flip (time to the lights) and the race() settle, with raceEntryStages(), marks, Log records and an
// optional CDP CPU profile. The spec's own steps (tests/specs/monza-foundation.spec.js), fresh context, the
// headless project's launch args. B·H14 2026-10-21 (docs/notes/RACE-ENTRY-TOOLING-RESEARCH-2026-10-21.md, I4).
// @doc Time one race entry: boot, race() → track flip, settle, stages, Log records; APEX_PIN / APEX_PROFILE knobs.
//
//   npx serve -l 3456 .                       # or: python3 -m http.server 3456 --bind 127.0.0.1
//   node tools/perf/race-entry-timer.mjs <label> [track]            # default track monza
//   APEX_PIN=webgl2 node tools/perf/race-entry-timer.mjs glx monza  # apex26.gfxBackend pinned (webgl2 | three)
//   APEX_PROFILE=artifacts/perf/entry.cpuprofile node tools/perf/race-entry-timer.mjs prof monza
//   APEX_URL=http://127.0.0.1:3456/           # the static server (default)
//   APEX_ENTRY=menu node tools/perf/race-entry-timer.mjs menu monza # the PLAYER's path: title > RACE > RACE SETUP
//     (day) > wait for the menu prep (census-entry.mjs menuPrepReady) > START RACE. race() is a cold path no player
//     takes: it skips the menu's track build, car prep and program warm (tools/lib/census-entry.mjs header).
//   APEX_HEAP=1                               # JS heap after two forced GCs at menu / prepared (menu) / race +5 s
//
// Output: `= <label> track=… boot=…s raceCall=…s race->track=…s {…backend probe…}` (raceCall = the race() thenable's
// settle, race->track = the info().track flip; with APEX_ENTRY=menu, boot includes menuPrep, raceCall is the
// RaceEntryProfile window and race->track the count state), `stages:` (raceEntryStages), `legs:`/`marks:`, `gaps>300ms:` (idle
// between consecutive marks), `logs since race (n):` (the Log buffer, ms relative to race()). Summarise a profile
// with tools/perf/cpuprofile-summary.mjs.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await import(new URL("node_modules/@playwright/test/index.mjs", "file://" + ROOT).href);
const cfg = (await import(new URL("playwright.config.js", "file://" + ROOT).href)).default;
const launch = cfg.projects[0].use.launchOptions;
const label = process.argv[2] || "run", track = process.argv[3] || "monza";
const URL_ = process.env.APEX_URL || "http://127.0.0.1:3456/";
const BOOT_MS = 45000;
const MENU = process.env.APEX_ENTRY === "menu", HEAP = process.env.APEX_HEAP === "1";
const browser = await chromium.launch({ ...launch, headless: true,
  args: [...(launch.args || []), ...(HEAP ? ["--enable-precise-memory-info", "--js-flags=--expose-gc"] : [])] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
// APEX_PIN=webgl2|three pins apex26.gfxBackend before boot (the foundation specs pin nothing: unset = TLX with a
// WebGPU adapter, else GLX — renderer-boot.js gpuAdapterAvailable).
if (process.env.APEX_PIN) await page.addInitScript((p) => { try { localStorage.setItem("apex26.gfxBackend", p); } catch (_) { /* no storage */ } }, process.env.APEX_PIN);
// select-screen.js stores the pick as JSON (gpu-game-check.mjs presets it the same way).
if (MENU) await page.addInitScript((tr) => { try { localStorage.setItem("apex26.trackId", JSON.stringify(tr)); } catch (_) { /* no storage */ } }, track);
const T = (a, b) => ((b - a) / 1000).toFixed(1);
const heapMB = () => page.evaluate(() => { try { if (window.gc) { window.gc(); window.gc(); } } catch (_) { /* no gc */ } const m = performance.memory; return m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null; });
const heap = {};
const t0 = Date.now();
await page.goto(URL_);
await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
let menuPrepMs = null;
if (MENU) {
  const { menuPrepReady } = await import(new URL("tools/lib/census-entry.mjs", "file://" + ROOT).href);
  const shown = (id) => page.waitForFunction((i) => { const e = document.getElementById(i); return !!(e && !e.hidden); }, id, { polling: 100, timeout: 60000 });
  await page.waitForFunction(() => { const A = window.__apex; return !!(A && A.info().state === "menu" && A.menuPrep); }, null, { polling: 100, timeout: BOOT_MS });
  if (HEAP) heap.menu = await heapMB();
  await page.locator("#mb-race").click({ timeout: 60000 }); await shown("select");
  // A picker that opened on another circuit gets the tile tapped (gpu-game-check.mjs enterViaMenu).
  const picked = await page.evaluate(() => { try { return window.__apex.menuPrep().trackId; } catch (_) { return null; } });
  if (picked !== track) await page.evaluate((id) => { const i = Tracks.LIST.findIndex((t) => t.id === id); const row = document.querySelector(`.track-row[data-track-idx="${i}"]`); if (row) row.click(); }, track);
  await page.locator("#sel-go").click({ timeout: 60000 }); await shown("race-settings");
  try { await page.selectOption("#rs-time-sel", "day", { timeout: 10000 }); } catch (_) { /* the circuit's default light */ }
  const tp = Date.now();
  // The menu's own prep (track build, car prep, program warm) and race settings' garage prewarm: what a player reading
  // the sheet gets. A prep that never settles is reported and START RACE is pressed anyway (census-entry.mjs's rule).
  try { await page.waitForFunction(menuPrepReady, null, { polling: 200, timeout: 300000 }); } catch (_) { console.log("menu prep not ready after 300 s — START RACE pressed anyway"); }
  try { await page.waitForFunction(() => { const g = window.__apex.garagePrebuild && window.__apex.garagePrebuild(); return !g || g.garageReady || !!(g.last && g.last.want === "settings"); }, null, { polling: 200, timeout: 60000 }); } catch (_) { /* reported by the stage table */ }
  menuPrepMs = Date.now() - tp;
  if (HEAP) heap.prepared = await heapMB();
}
const t1 = Date.now();
// APEX_PROFILE=<path>: a V8 CPU profile (CDP Profiler) from race() to the track flip + settle, written as .cpuprofile.
let cdp = null;
if (process.env.APEX_PROFILE) { cdp = await ctx.newCDPSession(page); await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }
// race() is NOT awaited here: the thenable settles at session:committed (after rigWarm), while info().track flips at
// setState("count") (game.js, before rigWarm). Both instants are recorded: __h14.track (polled) and __h14.settled.
let timedOut = false;
if (MENU) {
  // START RACE: the menu already built this circuit, so info().track does not flip — wait for the count state, then
  // for the RaceEntryProfile window to close (the cover lowered), which stands in for race()'s settle.
  await page.evaluate(() => { window.__h14 = { t0: performance.now(), settled: 0 }; });
  await page.locator("#rs-go").click({ timeout: 60000 });
  try { await page.waitForFunction(() => { const s = window.__apex.info().state; return s === "count" || s === "race"; }, null, { polling: 100, timeout: 120000 }); }
  catch (e) { timedOut = true; }
} else {
  await page.evaluate((tr) => { window.__h14 = { t0: performance.now(), settled: 0 }; Promise.resolve(window.__apex.race(tr, "day", "dry")).then(() => { window.__h14.settled = performance.now(); }, (e) => { window.__h14.settled = -1; window.__h14.err = String(e); }); }, track);
  try { await page.waitForFunction((tr) => window.__apex.info().track === tr, track, { polling: 100, timeout: 120000 }); }
  catch (e) { timedOut = true; }
}
const t2 = Date.now();
if (MENU) {
  try { await page.waitForFunction(() => { const p = window.__apex.raceEntryProfile && window.__apex.raceEntryProfile(); const t = window.__apex.raceEntryStages && window.__apex.raceEntryStages();
    if (p && p.armed === false && t && t.windowMs > 0) { window.__h14.settled = window.__h14.t0 + t.windowMs; return true; } return false; }, null, { polling: 100, timeout: 120000 }); } catch (e) { /* reported below */ }
} else {
  try { await page.waitForFunction(() => window.__h14.settled !== 0, null, { polling: 100, timeout: 120000 }); } catch (e) { /* reported below */ }
}
const h14 = await page.evaluate(() => window.__h14);
if (cdp) { const { profile } = await cdp.send("Profiler.stop"); writeFileSync(process.env.APEX_PROFILE, JSON.stringify(profile)); console.log("profile: " + process.env.APEX_PROFILE + " nodes=" + profile.nodes.length + " samples=" + profile.samples.length); }
const tCall = t1 + Math.round(h14.settled > 0 ? h14.settled - h14.t0 : -1);
const stages = await page.evaluate(() => (window.__apex.raceEntryStages && window.__apex.raceEntryStages()) || null);
const snap = await page.evaluate(() => { const s = window.__apex.raceEntryProfile && window.__apex.raceEntryProfile(); return s ? { legs: s.legs, marks: (s.marks || []).slice(0, 80) } : null; });
const gfx = await page.evaluate(() => {
  const out = {};
  try { const i = window.__apex.info(); out.state = i.state; } catch (_) { /* no info */ }
  try { out.bound = sessionStorage.getItem("apex26.gfxBound"); } catch (_) { out.bound = "ERR"; }
  try { out.pick = localStorage.getItem("apex26.gfxBackend"); out.tlxFail = localStorage.getItem("apex26.gfxTlxFail"); } catch (_) { /* none */ }
  try { out.gpu = !!(navigator.gpu && navigator.gpu.requestAdapter); } catch (_) { /* none */ }
  try { const L = (window.__apex.logs && window.__apex.logs()) || []; out.bootGfx = L.filter((x) => x && /^(gfx|boot|render|assets)$/.test(x.ns)).slice(0, 14).map((x) => Math.round(x.t) + " " + x.ns + " " + String(x.msg).slice(0, 90)); } catch (_) { /* none */ }
  return out;
});
// The Log buffer (info level, never the console): every record since race() with ms relative to the first race record.
const recs = await page.evaluate((t0ms) => {
  const L = (window.__apex.logs && window.__apex.logs()) || [];
  const r = L.filter((x) => x && x.t >= t0ms);
  const base = r.length ? r[0].t : t0ms;
  return r.map((x) => `${String(Math.round(x.t - base)).padStart(6)} ${x.ns} ${String(x.msg).slice(0, 170)}`);
}, h14.t0 - 50);
if (HEAP) { await page.waitForTimeout(5000); heap.race5s = await heapMB(); }
console.log(`= ${label} track=${track} entry=${MENU ? "menu" : "api"}${MENU ? ` menuPrep=${(menuPrepMs / 1000).toFixed(1)}s` : ""} boot=${T(t0, t1)}s raceCall=${T(t1, tCall)}s race->track=${T(t1, t2)}s${timedOut ? " TIMEOUT" : ""}${HEAP ? " heapMB=" + JSON.stringify(heap) : ""} ${JSON.stringify(gfx)}`);
if (stages) console.log("stages: " + JSON.stringify(stages));
if (snap) { console.log("legs: " + JSON.stringify(snap.legs)); console.log("marks: " + JSON.stringify(snap.marks)); }
if (snap && snap.marks) { const gaps = []; for (let i = 1; i < snap.marks.length; i++) { const d = snap.marks[i].t - snap.marks[i - 1].t; if (d > 300) gaps.push(`${snap.marks[i - 1].n} → ${snap.marks[i].n}: ${Math.round(d)} ms`); } console.log("gaps>300ms: " + gaps.join(" | ")); }
console.log(`logs since race (${recs.length}):`); for (const l of recs.slice(0, 120)) console.log("  " + l);
await browser.close();
