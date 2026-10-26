#!/usr/bin/env node
// tools/archive/perf/touch-boost-probe.mjs — the BUTTONS-mode "lift GAS, tap BOOST" hitch (A·W15, 2026-10-23): real CDP touch
// events (Input.dispatchTouchEvent → touch + pointer streams, as a phone delivers them) at 844x390 landscape, hasTouch,
// shipped settings (steerMode defaults to "buttons"). Each cycle: thumb down on GAS, hold, lift, tap a second control,
// coast. The page records every rAF interval and every main-thread task; a Chrome trace (devtools.timeline) names the
// work inside the window after each tap: style recalc, layout, script, by top-level event.
// @doc BUTTONS-mode pedal → BOOST tap hitch probe: CDP touch sequence at 844x390, frame gaps + traced main-thread work.
//
//   npx serve -l 3456 .
//   node tools/archive/perf/touch-boost-probe.mjs [label] [--cycles 6] [--to btn-boost] [--from btn-throttle] [--track monza]
//     --from/--to none skips that touch (control runs: lift only, tap only)
//   APEX_PIN=webgl2 node tools/archive/perf/touch-boost-probe.mjs glx      # pin a backend (unset = shipped pick)
//   APEX_TRACE=artifacts/perf/boost.json node tools/archive/perf/touch-boost-probe.mjs   # keep the raw trace
//
// Output: `= <label> tap=<id> cycles=N tapWin{p50,p95,max ms} ctrlWin{…} work{tap ms/cycle vs ctrl ms/cycle}` plus
// the top traced event names by self-time inside the tap windows minus the control windows. Tap window = 0..400 ms
// after the second control's touchstart; control window = the same span 600 ms into the GAS hold (no touch change).
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const { chromium } = await import(new URL("node_modules/@playwright/test/index.mjs", "file://" + ROOT).href);
const cfg = (await import(new URL("playwright.config.js", "file://" + ROOT).href)).default;
const launch = cfg.projects[0].use.launchOptions;
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const label = argv[0] && !argv[0].startsWith("--") ? argv[0] : "run";
const CYCLES = +opt("cycles", 6), TO = opt("to", "btn-boost"), FROM = opt("from", "btn-throttle"), TRACK = opt("track", "monza");
const URL_ = process.env.APEX_URL || "http://127.0.0.1:3456/";
const WIN = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ ...launch, headless: true });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
if (process.env.APEX_PIN) await page.addInitScript((p) => { try { localStorage.setItem("apex26.gfxBackend", p); } catch (_) { /* no storage */ } }, process.env.APEX_PIN);
await page.goto(URL_);
await page.waitForFunction(() => window.__apex?.race, null, { polling: 200, timeout: 60000 });
// race() returns a thenable that settles at session:committed (after rigWarm); go() before it finds no grid.
await page.evaluate((tr) => Promise.resolve(window.__apex.race(tr, "day", "dry")), TRACK);
await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 200, timeout: 120000 });
const went = await page.evaluate(() => window.__apex.go());
if (process.env.APEX_PROBE_DEBUG) console.log("go=" + went + " info=" + JSON.stringify(await page.evaluate(() => window.__apex.info())).slice(0, 600));
await page.waitForFunction((ids) => ids.every((id) => { const el = document.getElementById(id); if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
  [FROM, TO].filter((i) => i !== "none"), { polling: 200, timeout: 30000 });
const centre = (id) => page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, id);
const from = FROM === "none" ? null : await centre(FROM), to = TO === "none" ? null : await centre(TO);
const gfx = await page.evaluate(() => { try { return sessionStorage.getItem("apex26.gfxBound"); } catch (_) { return null; } });

// Page-side recorders: every rAF interval and every task the main thread runs (longtask ≥ 50 ms only, so the trace
// below is the fine-grained source; the rAF series is the player-visible one).
await page.evaluate(() => {
  const P = window.__tbp = { raf: [], marks: [], long: [] };
  let last = performance.now();
  (function tick(t) { P.raf.push([t, t - last]); last = t; requestAnimationFrame(tick); })(last);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: false }); } catch (_) { /* no longtask */ }
});
const mark = (n) => page.evaluate((m) => {
  performance.mark("tbp:" + m); window.__tbp.marks.push([m, performance.now()]);
  let v = null; try { const ps = window.__apex.physState(); v = ps && (ps.speed ?? ps.v ?? ps.kmh); } catch (_) { /* not ready */ }
  (window.__tbp.diag = window.__tbp.diag || []).push([m, typeof Input !== "undefined" ? +Input.throttle() : null, v == null ? null : +(+v).toFixed(1)]);
}, n);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 8, radiusY: 8, force: 1 })) });

const events = [];
cdp.on("Tracing.dataCollected", (d) => { for (const e of d.value) events.push(e); });
const traceDone = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink.user_timing", "v8.execute"] } });
await sleep(800);
for (let c = 0; c < CYCLES; c++) {
  if (from) await touch("touchStart", [{ ...from, id: 1 }]);
  await sleep(600); await mark("ctrl"); await sleep(WIN + 300);
  if (from) await touch("touchEnd", []);
  await sleep(60);
  await mark("tap");
  if (to) await touch("touchStart", [{ ...to, id: 2 }]);
  await sleep(70);
  if (to) await touch("touchEnd", []);
  await sleep(WIN + 500);
}
await cdp.send("Tracing.end");
await traceDone;
const P = await page.evaluate(() => window.__tbp);
const state = await page.evaluate(() => {
  const i = window.__apex.info();
  let ps = null; try { ps = window.__apex.physState(); } catch (_) { /* player not initialised */ }
  const open = [...document.querySelectorAll("dialog[open], .screen:not([hidden])")].map((d) => d.id).filter(Boolean);
  return { state: i.state, paused: i.paused, speed: ps && ps.speed != null ? +(+ps.speed).toFixed(1) : null, boostOn: ps ? ps.boostOn : null, open, active: document.activeElement && document.activeElement.id };
});
if (process.env.APEX_SHOT) await page.screenshot({ path: process.env.APEX_SHOT });
await browser.close();

const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; };
const inWin = (t, kind) => P.marks.some(([k, m]) => k === kind && t >= m && t < m + WIN);
const rafIn = (kind) => P.raf.filter(([t]) => inWin(t, kind)).map(([, d]) => d);
const tapF = rafIn("tap"), ctlF = rafIn("ctrl");
const longIn = (kind) => P.long.filter(([t]) => inWin(t, kind));

// Trace alignment: each page mark is also a performance.mark ("tbp:<kind>", blink.user_timing) with a trace ts;
// offset = median(trace ms - page ms) over the matched pairs.
const um = events.filter((e) => typeof e.name === "string" && e.name.startsWith("tbp:") && e.ph !== "e").map((e) => e.ts / 1000).sort((a, b) => a - b);
let offset = null;
if (um.length === P.marks.length && um.length) offset = pct(um.map((t, i) => t - P.marks[i][1]), 0.5);
const byName = (kind) => {
  const acc = new Map(); let total = 0;
  if (offset == null) return { acc, total };
  for (const e of events) {
    if (e.ph !== "X" || !e.dur) continue;
    const t = e.ts / 1000 - offset;
    if (!inWin(t, kind)) continue;
    if (e.name === "RunTask") { total += e.dur / 1000; continue; }
    acc.set(e.name, (acc.get(e.name) || 0) + e.dur / 1000);
  }
  return { acc, total };
};
const tapW = byName("tap"), ctlW = byName("ctrl");
const diff = [...tapW.acc.entries()].map(([n, v]) => [n, v - (ctlW.acc.get(n) || 0)]).sort((a, b) => b[1] - a[1]).slice(0, 12);
const f = (a) => `{n:${a.length},p50:${pct(a, 0.5).toFixed(1)},p95:${pct(a, 0.95).toFixed(1)},max:${(a.length ? Math.max(...a) : 0).toFixed(1)}}`;
console.log(`= ${label} ${FROM}->${TO} cycles=${CYCLES} gfx=${gfx} tapWin${f(tapF)} ctrlWin${f(ctlF)} ` +
  `work{tap:${(tapW.total / CYCLES).toFixed(1)}ms/cyc ctrl:${(ctlW.total / CYCLES).toFixed(1)}ms/cyc} long{tap:${longIn("tap").length} ctrl:${longIn("ctrl").length}} end=${JSON.stringify(state)} diag=${JSON.stringify(P.diag)} traceAligned=${offset != null}`);
console.log("top tap-minus-ctrl (ms over all cycles): " + diff.map(([n, v]) => `${n}=${v.toFixed(1)}`).join(" | "));
if (process.env.APEX_TRACE) { mkdirSync(path.dirname(process.env.APEX_TRACE), { recursive: true }); writeFileSync(process.env.APEX_TRACE, JSON.stringify({ traceEvents: events })); console.log("trace: " + process.env.APEX_TRACE); }
