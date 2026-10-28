#!/usr/bin/env node
// @doc AWS Device Farm: Safari on a real iPhone (remote access + Appium); renderer probe, BENCHMARK WEBGPU vs WEBGL2.
// AWS Device Farm: open the live game in Safari on a real iPhone and read the renderer state, optionally running the
// in-game BENCHMARK "WEBGPU vs WEBGL2" legs (js/perf/bench-run.js). docs/notes/AWS-DEVICE-FARM-IPHONE-2026-10-23.md.
//
//   node tools/perf/devicefarm-iphone.mjs devices
//   node tools/perf/devicefarm-iphone.mjs run --device "iPhone 18 Pro Max" [--legs 2|4|0] [--url URL] [--out DIR]
//   node tools/perf/devicefarm-iphone.mjs run --device "iPhone 18 Pro Max" --touch 5 [--touch-gap 28] [--touch-pair] [--entry menu] [--from btn-throttle] [--to btn-boost]
//     [--variants none,dom,state,none]   one fresh page load per entry, warm-up before the first tap (see WARM)
//     [--variants none@live,dom@live,none@fix --fix-url URL --cold]   a fresh Safari PROCESS per entry
//   node tools/perf/devicefarm-iphone.mjs run --scenario cache|races [--pins webgpu,webgl2]   (adds ?apex=1)
//     cache: cold race entry per path — first, after two reloads, after force-quitting Safari (shader-cache lifetime)
//     races: BENCHMARK "WEATHER & TRACKS" pinned per path
//     tracks: --tracks monza:night,singapore:night,vegas:night — entry + 20 s steady frames per circuit
//     warmplus: WebGPU entry + first-race frames, default vs apex26.tlxWarmPlus=1, each after a Safari data clear
//     visor,soak,photo (chainable in one session): HELMET-cam visor arms --arms off,on,refr,off at --track bahrain:night
//       (--visor-pins); GRAPHICS --presets medium,low,medium at renderScale 0.5, a 1/0.75/0.5 ladder and a --soak-s
//       governor soak (--soak-pins); Photo Studio by native taps with the 44 px floor read (--photo-scales auto,1)
//     flags: fixed targets / SGSR arms (--flag-arms off,fixed,sgsr,both,off) at pinned --flag-scales 0.5,0.75
//   Method (#3676; DEVICE-FARM-ANALYSIS-2026-10-24.md): rows carry build/first/thermal/warm; --prime TRACK:TOD spends a
//   throwaway entry; --pin-scale S pins the governor in visor arms; units.json logs unit history; never read WebGPU
//   timestamp-query as absolute GPU ms on iOS; repeat counts per the note's §2e (cold deltas: 3+ fresh units).
//   node tools/perf/devicefarm-iphone.mjs download artifacts/devicefarm/<run>... [--all]   (video + logs; --all adds the syslog)
//   node tools/perf/devicefarm-iphone.mjs auto --device "iPhone 18 Pro Max" [--legs 2] [--perf none|"Activity Monitor"] [--out DIR]
//
// `run` is a remote access session driven from here; `auto` is a server-side automated run: it packages
// tools/perf/devicefarm-host.mjs (npm pack → zip), generates a test spec for the macos_tahoe host, uploads both,
// schedules an APPIUM_WEB_NODE run on a one-device pool, waits, and downloads every artifact (video, Appium log,
// device log, Customer Artifacts = the host script's report.json, Safari console and Instruments trace).
//
// Credentials come only from the environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION), read by
// the aws CLI (APEX_AWS_CLI, else `aws` on PATH). Nothing here prints them. WebDriver goes through curl so the
// container's HTTPS proxy applies. Device minutes are metered: the session is always stopped in `finally`, and the
// endpoint URL (it grants control of the device) is never printed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendUnit, tierMoved } from "./devicefarm-method.mjs";
import { loadingProbeReady } from "../shot/loading-probe.mjs";

const AWS = process.env.APEX_AWS_CLI || "aws";
const REGION = process.env.AWS_DEFAULT_REGION || "us-west-2";
const PROJECT = process.env.APEX_DF_PROJECT || "apex-profiler";
const SITE = "https://brycejmurrin.github.io/f1-game/";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${m}\n`);

function aws(...a) {
  let out;
  try { out = execFileSync(AWS, [...a, "--region", REGION, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { throw new Error(`aws ${a.slice(0, 2).join(" ")}: ${String(e.stderr || e.message).trim().split("\n").pop().slice(0, 300)}`); }
  return out.trim() ? JSON.parse(out) : null;
}
function wd(base, method, p, body) {
  const a = ["-sS", "-X", method, "--max-time", "300", "-H", "Content-Type: application/json", base + p];
  if (body !== undefined) a.push("--data-binary", JSON.stringify(body));
  const out = execFileSync("curl", a, { encoding: "utf8", maxBuffer: 64 << 20 });
  let j; try { j = JSON.parse(out); } catch (_) { throw new Error(`${method} ${p}: non-JSON reply ${out.slice(0, 200)}`); }
  if (j && j.value && j.value.error) throw new Error(`${method} ${p}: ${j.value.error}: ${String(j.value.message).slice(0, 300)}`);
  return j.value;
}

function iosPhones() {
  const r = aws("devicefarm", "list-devices", "--filters",
    "attribute=PLATFORM,operator=EQUALS,values=IOS", "attribute=FORM_FACTOR,operator=EQUALS,values=PHONE");
  return r.devices.map((d) => ({ name: d.name, os: d.os, availability: d.availability, remoteAccess: d.remoteAccessEnabled, arn: d.arn }));
}

// --touch N: BUTTONS-mode "lift GAS, tap BOOST" hitch (A·W15). The page starts a race, then records every rAF interval,
// every longtask and the touch/pointer stream (capture listeners, so it timestamps what WebKit delivered); the taps
// themselves are NATIVE W3C touch actions (NATIVE_APP context) mapped through the Safari webview's rect, so the
// device sees real fingers. Windows: "tap" = 0..WIN ms after the page saw BOOST's pointerdown, "ctrl" = the same span
// 600 ms into the GAS hold.
const TOUCH_RACE = `
  if (!window.__apex || !__apex.race) return { ok: false, why: "no __apex" };
  window.__tbpRace = "pending";
  // Whole-load recorder: every rAF gap over 80 ms from race() on, with the game state, so a warm-up's one-time
  // cost shows where it landed (loading, lights, race) and a BEFORE run shows the load is otherwise the same.
  const E = window.__tbp0 = { big: [], t0: performance.now() };
  let l0 = E.t0;
  (function tick(t) { const d = t - l0; l0 = t; if (d > 80) { let st = null; try { st = __apex.info().state; } catch (_) {} E.big.push([Math.round(t - E.t0), Math.round(d), st]); } requestAnimationFrame(tick); })(l0);
  Promise.resolve(__apex.race("monza", "day", "dry")).then(() => { window.__tbpRace = "ok"; }, (e) => { window.__tbpRace = "err:" + e; });
  return { ok: true };`;
const TOUCH_GO = `
  if (!window.__apex) return { ready: false, why: "no __apex (Pages needs ?apex)" };
  const i = __apex.info();
  if (window.__tbpRace !== "ok" || i.track == null) return { ready: false, race: window.__tbpRace, state: i.state };
  const went = __apex.go();
  return { ready: true, went, state: __apex.info().state };`;
const TOUCH_ARM = `
  const P = window.__tbp = { raf: [], long: [], ev: [], t0: performance.now() };
  try { PerfSpans.on(true); PerfSpans.reset(); } catch (_) {}
  // ATTRIBUTION (run 9): where does the ~0.74 s after the first BOOST pointerdown go? Event Timing gives each
  // event's processingStart/End (a long listener) against its duration (incl. the next paint); capture/bubble
  // stamps bracket the target-phase handlers; microtask / timeout / rAF probes after each pointerdown show which
  // queue waited; the PerfSpans frame/render begin+end stamps show whether the game tick ran inside the gap.
  P.et = []; P.pd = []; P.spans = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.et.push([e.name, Math.round(e.startTime), Math.round(e.processingStart), Math.round(e.processingEnd), Math.round(e.duration), (e.target && e.target.id) || ""]); })
    .observe({ type: "event", durationThreshold: 16, buffered: false }); P.etOn = true; } catch (e) { P.etOn = String(e); }
  window.addEventListener("pointerdown", (e) => {
    const t = e.target, r = { id: (t && t.id) || "", cap: performance.now() }; P.pd.push(r);
    queueMicrotask(() => { r.micro = performance.now(); });
    setTimeout(() => { r.timeout = performance.now(); }, 0);
    requestAnimationFrame((ts) => { r.raf = performance.now(); r.rafTs = ts; });
  }, true);
  window.addEventListener("pointerdown", () => { const r = P.pd[P.pd.length - 1]; if (r) r.bub = performance.now(); }, false);
  try { const b0 = PerfSpans.begin, e0 = PerfSpans.end;
    PerfSpans.begin = function (n) { if (n === "frame" || n === "render" || n === "hud" || n === "audio") P.spans.push([n, 0, performance.now()]); return b0.apply(this, arguments); };
    PerfSpans.end = function (n) { const r = e0.apply(this, arguments); if (n === "frame" || n === "render" || n === "hud" || n === "audio") P.spans.push([n, 1, performance.now()]); return r; };
    P.spansWrapped = true; } catch (e) { P.spansWrapped = String(e); }
  let last = performance.now();
  (function tick(t) { P.raf.push([t, t - last]); last = t; requestAnimationFrame(tick); })(last);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push([e.startTime, e.duration]); }).observe({ type: "longtask" }); } catch (_) {}
  for (const type of ["pointerdown", "pointerup", "touchstart", "touchend"])
    window.addEventListener(type, (e) => { const t = e.target, p = e.changedTouches ? e.changedTouches[0] : e;
      P.ev.push([type, (t && t.id) || (t && t.tagName) || "?", performance.now(), p ? Math.round(p.clientX) : null, p ? Math.round(p.clientY) : null]); }, { capture: true, passive: true });
  const rect = (id) => { const el = document.getElementById(id); if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
  return { from: rect(window.__tbpFrom || "btn-throttle"), to: String(window.__tbpTo || "btn-boost").split(",").map(rect), w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
    body: document.body.className, api: (() => { try { return RendererPicker.liveThreeApi(); } catch (_) { return null; } })() };`;
const TOUCH_READ = (win, from, to) => `
  const P = window.__tbp, WIN = ${win};
  // One pointerdown per tap: WebKit has delivered two within a few ms for one native tap (run 3).
  const downs = (ids) => { const out = []; for (const e of P.ev) if (e[0] === "pointerdown" && ids.includes(e[1]) && !(out.length && e[2] - out[out.length - 1][1] < 50)) out.push([e[1], e[2]]); return out; };
  const tapRows = downs(${JSON.stringify(to.split(","))}), taps = tapRows.map((r) => r[1]), ctrls = downs([${JSON.stringify(from)}]).map((r) => r[1] + 600);
  const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; };
  const stat = (starts) => { const f = P.raf.filter(([t]) => starts.some((m) => t >= m && t < m + WIN)).map(([, d]) => d);
    const lt = P.long.filter(([t]) => starts.some((m) => t >= m && t < m + WIN));
    return { n: f.length, p50: +pct(f, 0.5).toFixed(1), p95: +pct(f, 0.95).toFixed(1), max: +(f.length ? Math.max(...f) : 0).toFixed(1),
      over50: f.filter((d) => d > 50).length, longTasks: lt.length, longMs: Math.round(lt.reduce((a, l) => a + l[1], 0)) }; };
  // Lift → BOOST pointerdown delivery latency as the page saw it (touchend of GAS to pointerdown of BOOST).
  let ps = null; try { ps = __apex.physState(); } catch (_) {}
  return { taps: taps.length, ctrls: ctrls.length, tap: stat(taps), ctrl: stat(ctrls), speed: ps && ps.speed, boostOn: ps && ps.boostOn,
    perTap: tapRows.map(([id, m]) => { const f = P.raf.filter(([t]) => t >= m && t < m + WIN).map(([, d]) => d); return id + ":" + (f.length ? Math.max(...f) : 0).toFixed(0); }),
    spans: (() => { try { const r = PerfSpans.stats(); const o = {}; for (const k in r) o[k] = { max: +(+r[k].max).toFixed(1), p95: r[k].p95 != null ? +(+r[k].p95).toFixed(1) : null }; return o; } catch (e) { return String(e); } })(),
    logs: (() => { try { return (__apex.logs() || []).filter((x) => x && x.t >= P.t0).slice(0, 60).map((x) => Math.round(x.t - P.t0) + " " + x.ns + " " + String(x.msg).slice(0, 120)); } catch (_) { return null; } })(),
    tapsAt: tapRows.map(([id, m]) => id + "@" + Math.round(m - P.t0)),
    // Attribution around the FIRST tap of the target control: everything from 50 ms before it to 1.5 s after.
    attr: (() => { const m = taps[0]; if (m == null) return null; const lo = m - 50, hi = m + 1500, rel = (t) => Math.round(t - m);
      return { etOn: P.etOn, spansWrapped: P.spansWrapped,
        et: P.et.filter((e) => e[1] >= lo && e[1] <= hi).map((e) => [e[0], rel(e[1]), rel(e[2]), rel(e[3]), e[4], e[5]]),
        pd: P.pd.filter((r) => r.cap >= lo && r.cap <= hi).map((r) => ({ id: r.id, cap: rel(r.cap), bub: r.bub != null ? rel(r.bub) : null,
          micro: r.micro != null ? rel(r.micro) : null, timeout: r.timeout != null ? rel(r.timeout) : null, raf: r.raf != null ? rel(r.raf) : null })),
        spans: P.spans.filter((x) => x[2] >= lo && x[2] <= hi).map((x) => x[0] + (x[1] ? ">" : "<") + rel(x[2])).slice(0, 120),
        raf: P.raf.filter(([t]) => t >= lo && t <= hi).map(([t, d]) => rel(t) + ":" + Math.round(d)).slice(0, 80) }; })(),
    load: (() => { const E = window.__tbp0; if (!E) return null; const pre = E.big.filter((b) => b[0] < P.t0 - E.t0);
      return { n: pre.length, top: [...pre].sort((a, b) => b[1] - a[1]).slice(0, 5) }; })(),
    warmLog: (() => { try { return (__apex.logs() || []).filter((x) => x && /warmed/.test(String(x.msg))).map((x) => String(x.msg)); } catch (_) { return null; } })(),
    ev: P.ev.length, evHead: P.ev.slice(0, 6).map((e) => [e[0], e[1], e[3], e[4]]) };`;

// #3673 / #3676 (6): every frame over 100 ms inside a sample window, attributed — when (ms from window start), the
// game state, the PerfSpans that began or ended inside that frame, and the material-cache misses (count + new keys)
// since the previous hitch. memState() runs only on a hitch, so the recorder costs nothing on a healthy frame.
const HITCH_JS = `
  const H = window.__dfHitch = { rows: [], ring: [], miss0: null };
  try { const ms = GLX.__tlx.memState(); H.miss0 = ms.matMiss; H.keys0 = (ms.matMissKeys || []).slice(); } catch (_) {}
  if (!window.__dfSpanWrap && typeof PerfSpans !== "undefined") { window.__dfSpanWrap = 1;
    const b0 = PerfSpans.begin, e0 = PerfSpans.end;
    PerfSpans.begin = function (n) { const R = window.__dfHitch && window.__dfHitch.ring; if (R) { R.push([n, 0, performance.now()]); if (R.length > 400) R.shift(); } return b0.apply(this, arguments); };
    PerfSpans.end = function (n) { const R = window.__dfHitch && window.__dfHitch.ring; if (R) { R.push([n, 1, performance.now()]); if (R.length > 400) R.shift(); } return e0.apply(this, arguments); }; }
  const hitch = (t, dt, t0) => { if (H.rows.length >= 20) return;
    let st = null, miss = null, keys = null; try { st = __apex.info().state; } catch (_) {}
    try { const ms = GLX.__tlx.memState(); miss = H.miss0 == null ? null : ms.matMiss - H.miss0; H.miss0 = ms.matMiss;
      keys = (ms.matMissKeys || []).filter((k) => !(H.keys0 || []).includes(k)); H.keys0 = (ms.matMissKeys || []).slice(); } catch (_) {}
    const spans = H.ring.filter((r) => r[2] >= t - dt && r[2] <= t).map((r) => r[0] + (r[1] ? ">" : "<") + Math.round(r[2] - (t - dt)));
    H.rows.push({ at: Math.round(t - t0), dt: Math.round(dt), state: st, spans: spans.slice(0, 24), miss, keys }); };`;
// Page-side probes. Each is a function body for WebDriver execute/sync (returns JSON-able data).
const PROBE = `
  const R = typeof RendererPicker !== "undefined" ? RendererPicker : null;
  let info = null, be = null;
  try { info = window.__apex && __apex.info ? __apex.info() : null; } catch (e) { info = { error: String(e) }; }
  try { be = typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.backendState ? GLX.__tlx.backendState() : null; } catch (e) { be = { error: String(e) }; }
  return { title: document.title, ua: navigator.userAgent, gpu: !!navigator.gpu, readyState: document.readyState,
    live: R ? { api: R.liveThreeApi && R.liveThreeApi(), backend: R.liveBackend && R.liveBackend() } : null,
    pins: { gfxBackend: localStorage.getItem("apex26.gfxBackend"), tlxForceGL: localStorage.getItem("apex26.tlxForceGL") },
    backendState: be, info, w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
    // #3676 (1): the build this run measured, from the shell's own metas (pages.yml stamps both).
    build: (() => { const m = (n) => { const e = document.querySelector('meta[name="' + n + '"]'); return e ? e.content : null; };
      return { sha: m("apex-sha"), build: m("apex-build") }; })() };`;
// Start BENCHMARK "paths" and keep only the first `n` legs (WEBGPU, WEBGL2 for n = 2). BenchRun.run saves the plan and
// reloads after this task, so the trimmed plan is what the next boot resumes.
const BENCH = (n) => `
  if (typeof BenchRun === "undefined") return { ok: false, why: "no BenchRun" };
  const ok = BenchRun.run("paths");
  const s = GameStore.store, p = JSON.parse(s.raw(BenchRun.KEY));
  if (${n} > 0 && ${n} < p.legs.length) { p.legs = p.legs.slice(0, ${n}); s.rawSet(BenchRun.KEY, JSON.stringify(p)); }
  return { ok, legs: p.legs.map((l) => l.path) };`;
const BENCH_STATE = `
  let p = null; try { p = JSON.parse(GameStore.store.raw("apex26.benchRun")); } catch (_) {}
  if (!p) return { state: "none" };
  return { state: p.state, i: p.i, legs: p.legs.map((l) => l.state + (l.reason ? ":" + l.reason : "")),
    api: (() => { try { return RendererPicker.liveThreeApi(); } catch (_) { return null; } })(), result: p.state !== "running" ? p : null,
    entry: (() => { try { const t = RaceEntryProfile.stageTable(), s = RaceEntryProfile.snapshot();
      return { kind: t.entry, winT0: s.winT0, armed: s.armed, windowMs: t.windowMs, blockMs: t.blockMs, maxBlockMs: t.maxBlockMs,
        stages: t.stages.filter((r) => r.ms == null || r.ms >= 50).map((r) => [r.n, r.ms]),
        longTasks: (s.longTasks || []).filter((l) => l && l.ms >= 200).length }; } catch (_) { return null; } })() };`;
// The poll keeps the newest RaceEntryProfile window per (leg, window start): cold and warm entry are separate windows.
const LOG_EVERY = 5, THERMAL_EVERY = 15; // in polls of POLL_MS
const POLL_MS = 4000;

async function exec(base, sid, script, tries = 3) {
  for (let t = 1; ; t++) {
    try { return wd(base, "POST", `/session/${sid}/execute/sync`, { script, args: [] }); }
    catch (e) { if (t >= tries) throw e; log(`execute retry ${t}: ${e.message.slice(0, 120)}`); await sleep(5000); }
  }
}
// Drain Appium's Safari console / network buffers (each read empties them) into JSONL files beside the report.
function pullLogs(base, sid, out) {
  for (const type of ["safariConsole", "safariNetwork"]) {
    try {
      const rows = wd(base, "POST", `/session/${sid}/se/log`, { type });
      if (Array.isArray(rows) && rows.length) fs.appendFileSync(path.join(out, type + ".jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    } catch (e) { fs.appendFileSync(path.join(out, "log-errors.txt"), `${type}: ${e.message.slice(0, 200)}\n`); }
  }
}
function shot(base, sid, file) {
  const b64 = wd(base, "GET", `/session/${sid}/screenshot`);
  fs.writeFileSync(file, Buffer.from(b64, "base64")); log(`screenshot ${file}`);
}

// Real-finger sequence on the device: hold GAS, lift, tap BOOST (or --from/--to ids), N cycles, as native W3C touch
// actions. CSS px → native points through the WebView element's rect (Safari draws the page 1:1 in points at zoom 1).
// --warm: what is pre-applied after go() and before the first tap. "dom" toggles #btn-boost.on for two frames
// (style/paint/compositing only); "state" turns the game's BOOST on and off through __apex.setBoost (HUD, audio,
// physics); "none" nothing. Used by --variants to attribute a first-use stall on one phone in one session.
const WARM = {
  none: "return 'none';",
  dom: `const b = document.getElementById("btn-boost"); if (!b) return "no button"; b.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => b.classList.remove("on"))); return "dom";`,
  state: `if (!__apex.setBoost) return "no setBoost"; __apex.setBoost(true); setTimeout(() => __apex.setBoost(false), 1000); return "state";`,
};
async function touchRun(base, sid, out, n, warm) {
  const WIN = 400, from = opt("from", "btn-throttle"), to = opt("to", "btn-boost");
  const r = { warm: warm || "none" }; r.race = await exec(base, sid, TOUCH_RACE);
  for (let t = 0; t < 45; t++) { await sleep(4000); r.go = await exec(base, sid, TOUCH_GO); if (r.go.ready) break; }
  if (!r.go || !r.go.ready) throw new Error("race never reached the grid: " + JSON.stringify(r.go));
  await sleep(6000);   // lights out, the car rolling, the first-frame spikes gone
  if (warm && warm !== "none") { r.warmed = await exec(base, sid, WARM[warm] || WARM.none); await sleep(2500); }
  await exec(base, sid, `window.__tbpFrom = ${JSON.stringify(from)}; window.__tbpTo = ${JSON.stringify(to)}; return true;`);
  r.arm = await exec(base, sid, TOUCH_ARM);
  log("touch arm " + JSON.stringify(r.arm));
  if (!r.arm.from || !r.arm.to.length || r.arm.to.some((p) => !p)) throw new Error("touch controls not on screen: " + JSON.stringify(r.arm));
  const web = wd(base, "GET", `/session/${sid}/context`);
  wd(base, "POST", `/session/${sid}/context`, { name: "NATIVE_APP" });
  try {
    // Screen size in points (W3C window rect in NATIVE_APP); the page fills the width and sits under Safari's top
    // bar, so the CSS viewport's origin is (0, screenH - innerHeight) in points. The WebView element's rect is
    // recorded for the report but not trusted: run 2 (2026-10-23) landed every tap off GAS/BOOST with it.
    const win = wd(base, "GET", `/session/${sid}/window/rect`);
    let wr = null;
    try {
      const el = wd(base, "POST", `/session/${sid}/element`, { using: "class name", value: "XCUIElementTypeWebView" });
      const id = el["element-6066-11e4-a6c6-4b7c-ad3b-6c3b7e9d1c0b"] || el.ELEMENT || Object.values(el)[0];
      wr = wd(base, "GET", `/session/${sid}/element/${id}/rect`);
    } catch (e) { log("webview rect: " + e.message.slice(0, 120)); }
    const k = win.width / r.arm.w, oy = win.height - r.arm.h * k;
    const pt = (p) => ({ x: Math.round(p.x * k), y: Math.round(oy + p.y * k) });
    r.map = { window: win, webview: wr, k, oy };
    log("touch map " + JSON.stringify(r.map));
    // --to a,b,c: cycle c taps the c-th id (the last repeats), so a first tap on AERO can precede the first BOOST.
    const a = pt(r.arm.from), bs = r.arm.to.map(pt);
    // --touch-gap S: seconds from one press to the next (default: the old fixed ~2.8 s cycle). --touch-pair: every
    // press is BOOST ON then OFF (it toggles), so a deploy-ON press is followed by its release 1.2 s later; the read
    // then lists 2N pointerdowns, the even ones being the ON presses.
    const gapMs = Math.round(Number(opt("touch-gap", "0")) * 1000), pair = opt("touch-pair", "") !== "";
    for (let c = 0; c < n; c++) {
      const b = bs[Math.min(c, bs.length - 1)];
      const press = [{ type: "pointerMove", duration: 0, x: b.x, y: b.y }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 70 }, { type: "pointerUp", button: 0 }];
      const used = 1500 + 60 + 70 + (pair ? 1200 + 70 : 0);
      const tail = Math.max(1200, gapMs - used);
      wd(base, "POST", `/session/${sid}/actions`, { actions: [{ type: "pointer", id: "finger", parameters: { pointerType: "touch" }, actions: [
        { type: "pointerMove", duration: 0, x: a.x, y: a.y }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 1500 },
        { type: "pointerUp", button: 0 }, { type: "pause", duration: 60 }, ...press,
        ...(pair ? [{ type: "pause", duration: 1200 }, ...press] : [])] }] });
      // The long gap is waited here, not as a W3C "pause": run 24 (2026-10-24) asked for 28 s and the presses came
      // ~4 s apart, so the endpoint did not honour the pause. The short first-tail stays in the action.
      await sleep(tail);
    }
    try { wd(base, "DELETE", `/session/${sid}/actions`); } catch (_) { /* nothing held */ }
  } finally {
    const ctxs = wd(base, "GET", `/session/${sid}/contexts`);
    const back = (typeof web === "string" && web !== "NATIVE_APP") ? web : (ctxs || []).find((c) => (c.id || c) !== "NATIVE_APP");
    wd(base, "POST", `/session/${sid}/context`, { name: back && back.id ? back.id : back });
  }
  r.read = await exec(base, sid, TOUCH_READ(WIN, from, to));
  log("touch " + JSON.stringify(r.read));
  try { shot(base, sid, path.join(out, "touch.png")); } catch (e) { log("shot: " + e.message.slice(0, 120)); }
  return r;
}

// ---- scenarios (run --scenario cache|races) ---------------------------------------------------------------------
// The page needs the `__apex` surface (`?apex=1` loads it on the live site, js/core/lazy-bundles.js bindAgent).
const withApex = (u) => (/[?&]apex=1/.test(u) ? u : u + (u.includes("?") ? "&" : "?") + "apex=1");
// Pin the THREE PATH the way BenchRun.pathPrefs/writePrefs do; it takes effect at the next boot.
const PIN = (p) => `
  const s = GameStore.store; s.rawSet("apex26.gfxBackend", "three"); s.rawSet("apex26.tlxForceGL", ${JSON.stringify(p === "webgl2" ? "1" : "0")});
  try { for (const k of RendererPicker.RENDERER_SS_KEYS || []) sessionStorage.removeItem(k); } catch (_) {}
  return true;`;
const READY = `
  let st = null, api = null; try { st = __apex.info().state; } catch (_) {}
  try { api = RendererPicker.liveThreeApi(); } catch (_) {}
  return { ready: st === "menu" && !!api, state: st, api };`;
// --entry menu (A·W43): the player's path — RACE > pick the circuit > RACE SETUP > wait for the menu's own prep
// (menuPrep + garage prewarm, as tools/lib/census-entry.mjs menuPrepReady) > START RACE. `__apex.race` skips race
// settings' prepareMenuCarAssets, so its entry times are a cold-API path no player takes. The prep wait is bounded
// (60 s) and recorded in window.__dfMenu; a prep that never settles still starts the race, and says so.
const KICK_API = (track, tod) => `
  window.__dfRace = undefined; window.__dfT0 = performance.now();
  let prev = null; try { prev = RaceEntryProfile.snapshot().winT0; } catch (_) {}
  Promise.resolve(__apex.race(${JSON.stringify(track)}, ${JSON.stringify(tod)}, "dry")).then((v) => { window.__dfRace = { ok: !!v, ms: performance.now() - window.__dfT0 }; },
    (e) => { window.__dfRace = { err: String(e) }; });
  return prev;`;
const KICK_MENU = (track, tod, idleS = 0, quick = false) => `
  window.__dfRace = undefined; window.__dfT0 = performance.now(); const M = window.__dfMenu = { entry: "menu", steps: [] };
  let prev = null; try { prev = RaceEntryProfile.snapshot().winT0; } catch (_) {}
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms) => { const t = performance.now(); while (performance.now() - t < ms) { try { if (f()) return true; } catch (_) {} await sleep(100); } return false; };
  const shown = (id) => { const e = document.getElementById(id); return !!(e && !e.hidden); };
  const step = (n) => M.steps.push([n, Math.round(performance.now() - window.__dfT0)]);
  (async () => {
    document.getElementById("mb-race").click(); if (!(await until(() => shown("select"), 60000))) throw new Error("no track picker"); step("select");
    const i = Tracks.LIST.findIndex((t) => t.id === ${JSON.stringify(track)}), row = document.querySelector('.track-row[data-track-idx="' + i + '"]');
    if (row) row.click(); M.tile = !!row;
    document.getElementById("sel-go").click(); if (!(await until(() => shown("race-settings"), 60000))) throw new Error("no race settings"); step("race-settings");
    const sel = document.getElementById("rs-time-sel"); if (sel && ${JSON.stringify(tod)} !== "default") { sel.value = ${JSON.stringify(tod)}; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    const t1 = performance.now();
    if (!${quick}) {
      M.prepReady = await until(() => { const p = __apex.menuPrep(); return p && p.state === "menu" && p.world && p.done && p.warmFrames === 0 && !p.warming; }, 60000);
      await until(() => { const g = __apex.garagePrebuild && __apex.garagePrebuild(); return !g || g.garageReady || !!(g.last && g.last.want === "settings"); }, 30000);
    }
    M.prepWaitMs = Math.round(performance.now() - t1); step("prepared");
    if (${idleS}) { await sleep(${idleS * 1000}); step("idled"); }
    try { M.prepAtClick = JSON.parse(JSON.stringify(__apex.menuPrep())); } catch (e) { M.prepAtClick = String(e).slice(0, 80); }
    window.__dfT0 = performance.now(); document.getElementById("rs-go").click(); step("start-race");
    const t2 = performance.now();
    if (!(await until(() => { const s = __apex.info().state; return s && s !== "menu"; }, 180000))) throw new Error("race never left the menu");
    window.__dfRace = { ok: true, ms: performance.now() - t2 };
  })().catch((e) => { window.__dfRace = { err: String(e) }; });
  return prev;`;
const ENTRY_MENU = opt("entry", "api") === "menu";
const KICK_FOR = (track = "monza", tod = "default") => (ENTRY_MENU ? KICK_MENU : KICK_API)(track, tod);
const KICK = KICK_FOR();
const ENTRY = `
  let s = null, t = null, warm = null, st = null;
  try { s = RaceEntryProfile.snapshot(); t = RaceEntryProfile.stageTable(s); } catch (_) {}
  try { warm = GLX.__tlx.memState().warm; } catch (_) {}
  try { st = __apex.info().state; } catch (_) {}
  return { state: st, ready: (${loadingProbeReady.toString()})(), race: window.__dfRace || null, sinceKickMs: Math.round(performance.now() - (window.__dfT0 || 0)),
    winT0: s && s.winT0, armed: s && s.armed, windowMs: t && t.windowMs, blockMs: t && t.blockMs, maxBlockMs: t && t.maxBlockMs,
    stages: t ? t.stages.filter((r) => r.ms == null || r.ms >= 50).map((r) => [r.n, r.ms]) : null, warm,
    // A·W14's ask for the iPhone 14 mirrorPrepare gap: the mirror pass's own state and every mark inside the stage.
    mirror: (() => { try { return __apex.mirror ? __apex.mirror() : null; } catch (e) { return { error: String(e) }; } })(),
    marks: s ? (s.marks || []).filter((m) => m && /mirror|warm|program|prepare/i.test(m.n)).map((m) => [m.n, Math.round(m.t)]) : null,
    api: (() => { try { return RendererPicker.liveThreeApi(); } catch (_) { return null; } })() };`;

async function waitReady(ctx, ms = 120000) {
  const t0 = Date.now();
  for (;;) {
    await sleep(3000);
    try { const r = await exec(ctx.base, ctx.sid, READY, 1); if (r.ready) return r; } catch (_) { /* page loading */ }
    if (Date.now() - t0 > ms) throw new Error("page never reached the menu");
  }
}
// One timed race entry: a closed profile counts only after a successful start,
// ready presentation and lowered cover. Failure must not become a menu FPS row.
async function timedEntry(ctx, label, kick = KICK) {
  const prev = await exec(ctx.base, ctx.sid, kick);
  const t0 = Date.now();
  for (;;) {
    await sleep(2000);
    let e; try { e = await exec(ctx.base, ctx.sid, ENTRY, 1); } catch (err) { log(`${label}: poll ${err.message.slice(0, 100)}`); }
    if (Date.now() - t0 > 180000) throw new Error(`${label}: timed out waiting for visible race readiness`);
    if (!e) continue;
    if (e.race && (e.race.err !== undefined || e.race.ok === false)) throw new Error(`${label}: race start failed: ${e.race.err || "did not reach the grid"}`);
    if (e.race && e.race.ok === true && e.ready && e.winT0 !== prev && e.armed === false && e.windowMs > 0) { log(`${label}: api=${e.api} window ${e.windowMs} ms`); return e; }
  }
}
async function reloadPage(ctx) { try { await exec(ctx.base, ctx.sid, UNARM, 1); } catch (_) { /* no page */ } await exec(ctx.base, ctx.sid, "setTimeout(() => location.reload(), 50); return true;"); await sleep(8000); return waitReady(ctx); }
// Force-quit Safari: the WebDriver session dies with it, so open a fresh one and navigate again.
async function killSafari(ctx, url) {
  try { wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: terminateApp", args: [{ bundleId: "com.apple.mobilesafari" }] }); } catch (e) { log("terminate: " + e.message.slice(0, 100)); }
  try { wd(ctx.base, "DELETE", `/session/${ctx.sid}`); } catch (_) { /* gone */ }
  ctx.sid = wd(ctx.base, "POST", "/session", { capabilities: { alwaysMatch: ctx.caps, firstMatch: [{}] } }).sessionId;
  try { wd(ctx.base, "POST", `/session/${ctx.sid}/orientation`, { orientation: "LANDSCAPE" }); } catch (_) { /* keep portrait */ }
  wd(ctx.base, "POST", `/session/${ctx.sid}/url`, { url });
  await sleep(8000);
  return waitReady(ctx);
}

// cache: how long does a path's first-race shader warm stay paid for? Cold entry first, after reloads, after a Safari kill.
async function cacheScenario(ctx, url, pins, report, out) {
  report.cache = {};
  for (const p of pins) {
    const rows = report.cache[p] = [];
    await exec(ctx.base, ctx.sid, PIN(p));
    let r = await reloadPage(ctx); log(`cache ${p}: booted api=${r.api}`);
    rows.push({ step: "first", ...(await timedEntry(ctx, `${p} first`)) });
    for (const step of ["reload", "reload2"]) { r = await reloadPage(ctx); rows.push({ step, bootApi: r.api, ...(await timedEntry(ctx, `${p} ${step}`)) }); }
    r = await killSafari(ctx, url); rows.push({ step: "safariKill", bootApi: r.api, ...(await timedEntry(ctx, `${p} safariKill`)) });
    try { shot(ctx.base, ctx.sid, path.join(out, `cache-${p}.png`)); } catch (_) { /* no shot */ }
    pullLogs(ctx.base, ctx.sid, out);
  }
}
// ---- warmplus: does warming the post chain / casters in the lights remove the first WebGPU race's hitch? ----------
// tlx.js warms post and casters only when warmPlusOn() (default: three WebGL backend only) or, for post, when the
// scene compile took < 3 s. apex26.tlxWarmPlus=1 forces both. Each arm starts from a cleared Safari (the pipeline
// cache survives sessions on a unit, note §8), pins WebGPU, times one entry and the race's first 15 s of frames.
// Independent rAF metrics are callback cadence. `fps` below is a deprecated
// compatibility alias for callbackHz, never evidence of display presentation.
const RENDER_RATE_SAMPLE = `
  const rateTrace = { start: null, end: null, transitions: [] }; let rateAt = 0, rateKey = null;
  const sampleRate = (t) => {
    let r = null; try { if (typeof RenderRate !== "undefined") r = RenderRate.state(); } catch (_) {}
    if (!r) return;
    const key = JSON.stringify([r.mode, r.tier, r.half, r.active]);
    if (!rateTrace.start) { rateTrace.start = r; rateAt = t; }
    else if (key !== rateKey && rateTrace.transitions.length < 50) rateTrace.transitions.push({ ms: Math.round(t - rateAt), mode: r.mode, tier: r.tier, half: r.half, active: r.active });
    rateKey = key; rateTrace.end = r;
  };
  const finishRate = (t) => {
    const a = rateTrace.start, b = rateTrace.end, elapsedMs = t - rateAt;
    const reset = !!(a && b && (b.drawn < a.drawn || b.skipped < a.skipped));
    const drawn = a && b && !reset ? b.drawn - a.drawn : null;
    return { ...rateTrace, metric: "render-gate-approvals", elapsedMs: a ? Math.round(elapsedMs) : null, reset, drawn,
      skipped: a && b && !reset ? b.skipped - a.skipped : null,
      approvedHz: drawn !== null && elapsedMs > 0 ? Math.round(drawn * 10000 / elapsedMs) / 10 : null };
  };`;
const HITCH_ARM = `
  ${RENDER_RATE_SAMPLE}
  window.__dfFrames = null;
  const t0 = performance.now(); let last = 0, started = 0; const d = [];
  const tick = (t) => {
    let st = null; try { st = __apex.info().state; } catch (_) {}
    if (st === "race") { if (!started) started = t; else d.push(t - last); last = t; sampleRate(t); }
    if (started && t - started > 15000) { d.sort((a, b) => a - b);
      window.__dfFrames = { metric: "raf-callback", callbackHz: Math.round(d.length * 10000 / (t - started)) / 10, renderRate: finishRate(t), n: d.length, max: Math.round(d[d.length - 1] || 0), p99: Math.round(d[Math.floor(d.length * 0.99)] || 0),
        n33: d.filter((x) => x > 33).length, n50: d.filter((x) => x > 50).length, n100: d.filter((x) => x > 100).length }; return; }
    if (performance.now() - t0 < 240000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick); return true;`;
// Best effort: Settings > Apps > Safari > Clear History and Website Data. Returns the steps it managed.
async function clearSafari(ctx) {
  const steps = [];
  const find = (pred) => { try { return wd(ctx.base, "POST", `/session/${ctx.sid}/element`, { using: "-ios predicate string", value: pred }); } catch (_) { return null; } };
  const tap = async (pred, scrolls = 6) => {
    for (let i = 0; i <= scrolls; i++) {
      const el = find(pred);
      if (el) { const id = el["element-6066-11e4-a52e-4f735466cecf"] || el.ELEMENT; wd(ctx.base, "POST", `/session/${ctx.sid}/element/${id}/click`, {}); await sleep(1200); return true; }
      try { wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: swipe", args: [{ direction: "up" }] }); } catch (_) { /* no swipe */ }
      await sleep(600);
    }
    return false;
  };
  try {
    wd(ctx.base, "POST", `/session/${ctx.sid}/context`, { name: "NATIVE_APP" });
    wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: terminateApp", args: [{ bundleId: "com.apple.mobilesafari" }] });
    wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: activateApp", args: [{ bundleId: "com.apple.Preferences" }] });
    await sleep(2000);
    for (const [name, pred] of [["Apps", "(label == 'Apps' OR name == 'Apps') AND visible == 1"], ["Safari", "(label == 'Safari' OR name == 'Safari') AND visible == 1"],
      ["Clear", "label BEGINSWITH 'Clear History and Website Data' AND visible == 1"], ["Confirm", "label BEGINSWITH 'Clear History' AND type == 'XCUIElementTypeButton' AND visible == 1"]]) {
      const ok = await tap(pred, name === "Clear" ? 10 : 6); steps.push(`${name}:${ok ? "ok" : "miss"}`); if (!ok && name !== "Apps") break;
    }
    try { shot(ctx.base, ctx.sid, path.join(ctx.out, `clear-${Date.now()}.png`)); } catch (_) { /* no shot */ }
    wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: terminateApp", args: [{ bundleId: "com.apple.Preferences" }] });
  } catch (e) { steps.push("error:" + e.message.slice(0, 80)); }
  log("safari clear: " + steps.join(" "));
  return steps;
}
async function warmplusScenario(ctx, url, report, out) {
  report.warmplus = {};
  for (const arm of (process.env.APEX_ARMS || "default,warmplus").split(",")) {   // APEX_ARMS reverses the order to expose cache bias
    const row = report.warmplus[arm] = {};
    row.clear = await clearSafari(ctx);
    try { wd(ctx.base, "DELETE", `/session/${ctx.sid}`); } catch (_) { /* gone */ }
    ctx.sid = wd(ctx.base, "POST", "/session", { capabilities: { alwaysMatch: ctx.caps, firstMatch: [{}] } }).sessionId;
    try { wd(ctx.base, "POST", `/session/${ctx.sid}/orientation`, { orientation: "LANDSCAPE" }); } catch (_) { /* keep portrait */ }
    wd(ctx.base, "POST", `/session/${ctx.sid}/url`, { url });
    await waitReady(ctx);
    await exec(ctx.base, ctx.sid, PIN("webgpu") + "");
    await exec(ctx.base, ctx.sid, arm === "warmplus" ? `localStorage.setItem("apex26.tlxWarmPlus", "1"); return 1;` : `localStorage.removeItem("apex26.tlxWarmPlus"); return 1;`);
    const r = await reloadPage(ctx); row.bootApi = r.api;
    await exec(ctx.base, ctx.sid, HITCH_ARM);
    row.entry = await timedEntry(ctx, `warmplus ${arm}`);
    for (let i = 0; i < 12 && !row.frames; i++) { await sleep(2000); try { row.frames = await exec(ctx.base, ctx.sid, "return window.__dfFrames;", 1); } catch (_) { /* reload */ } }
    log(`warmplus ${arm}: programWarm post=${row.entry.warm && row.entry.warm.post} shadow=${row.entry.warm && row.entry.warm.shadow} frames=${JSON.stringify(row.frames)}`);
    pullLogs(ctx.base, ctx.sid, out);
  }
}
// tracks: steady-state race frames on chosen circuits (skyline-heavy night tracks vs Monza): per track a fresh
// reload, one timed entry, 5 s settle, then 20 s of rAF intervals.
const SAMPLE = `${HITCH_JS}
  ${RENDER_RATE_SAMPLE}
  window.__dfSample = null;
  const d = []; let last = 0, t0 = 0;
  const tick = (t) => {
    let st = null; try { st = __apex.info().state; } catch (_) {}
    // Hitches count from the first race frame (#3673's two land early); callback cadence and render-gate samples skip the first 5 s.
    if (st === "race") { if (!t0) t0 = t; if (last) { if (t - last > 100) hitch(t, t - last, t0); if (t - t0 > 5000) d.push(t - last); } last = t; if (t - t0 > 5000) sampleRate(t); }
    if (t0 && t - t0 > 25000) { d.sort((a, b) => a - b); const q = (f) => Math.round(d[Math.min(d.length - 1, Math.floor(d.length * f))] * 10) / 10;
      const callbackHz = Math.round(d.length / 20 * 10) / 10;
      window.__dfSample = { metric: "raf-callback", callbackHz, fps: callbackHz, renderRate: finishRate(t), n: d.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: Math.round(d[d.length - 1] || 0),
        n33: d.filter((x) => x > 33).length, n50: d.filter((x) => x > 50).length, hitches: H.rows }; return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick); return true;`;
async function tracksScenario(ctx, tracks, report, out) {
  report.tracks = [];
  for (const [i, spec] of tracks.entries()) {
    const [track, tod = "default"] = spec.split(":");
    const r = await reloadPage(ctx);
    await exec(ctx.base, ctx.sid, SAMPLE);
    const entry = await timedEntry(ctx, `${track} ${tod}`, KICK_FOR(track, tod));
    let sample = null;
    for (let i = 0; i < 20 && !sample; i++) { await sleep(2000); try { sample = await exec(ctx.base, ctx.sid, "return window.__dfSample;", 1); } catch (_) { /* busy */ } }
    report.tracks.push({ track, tod, api: r.api, entry, sample, ...rowMeta(ctx, report, i, entry) });
    log(`${track} ${tod}: api=${r.api} entry ${entry.windowMs} ms; ${JSON.stringify(sample)}`);
    try { shot(ctx.base, ctx.sid, path.join(out, `track-${track}-${tod}.png`)); } catch (_) { /* no shot */ }
  }
  pullLogs(ctx.base, ctx.sid, out);
}
// races: BENCHMARK "WEATHER & TRACKS" (six races, each reloads and starts cold) on each pinned path.
async function racesScenario(ctx, pins, report, out) {
  report.races = {};
  for (const p of pins) {
    await exec(ctx.base, ctx.sid, PIN(p));
    const r = await reloadPage(ctx); log(`races ${p}: booted api=${r.api}`);
    await exec(ctx.base, ctx.sid, `return BenchRun.run("races");`);
    (report.racesThermal = report.racesThermal || {})[p] = { start: thermalNow(ctx) };
    const t0 = Date.now(); let last = "", n = 0;
    for (;;) {
      await sleep(POLL_MS); n++;
      if (n % LOG_EVERY === 0) pullLogs(ctx.base, ctx.sid, out);
      let st; try { st = await exec(ctx.base, ctx.sid, BENCH_STATE, 2); } catch (e) { log("poll: " + e.message.slice(0, 100)); continue; }
      const line = `${p} ${st.state} i=${st.i} api=${st.api} ${JSON.stringify(st.legs)}`;
      if (line !== last) { log(line); last = line; }
      if (st.state !== "running" && st.state !== "none") { report.races[p] = st.result; break; }
      if (Date.now() - t0 > 15 * 60000) { report.races[p] = { timedOut: st }; break; }
    }
    report.racesThermal[p].end = thermalNow(ctx);
    try { shot(ctx.base, ctx.sid, path.join(out, `races-${p}.png`)); } catch (_) { /* no shot */ }
  }
}

// ---- follow-ups for merged PRs (OrchA 31, 2026-10-23): visor A/B (#3581), LOW/renderScale soak (#3479), Photo (#3482)
// A window of rAF intervals that starts when called: `ms` long after `delay` ms, read back from window.__dfWin.
const WIN_FOR = (ms, delay = 3000) => `${HITCH_JS}
  ${RENDER_RATE_SAMPLE}
  window.__dfWin = null; const d = []; let last = 0, t0 = 0;
  const tick = (t) => { if (!t0) t0 = t; if (t - t0 > ${delay}) { if (last) { d.push(t - last); if (t - last > 100) hitch(t, t - last, t0); } last = t; sampleRate(t); }
    if (t - t0 > ${delay + ms}) { d.sort((a, b) => a - b); const q = (f) => Math.round(d[Math.min(d.length - 1, Math.floor(d.length * f))] * 10) / 10;
      const callbackHz = Math.round(d.length / ${ms / 1000} * 10) / 10;
      window.__dfWin = { metric: "raf-callback", callbackHz, fps: callbackHz, renderRate: finishRate(t), n: d.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: Math.round(d[d.length - 1] || 0),
        n33: d.filter((x) => x > 33).length, n50: d.filter((x) => x > 50).length, hitches: H.rows }; return; }
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return true;`;
async function sampleWin(ctx, ms, delay = 3000, extra = "") {
  await exec(ctx.base, ctx.sid, WIN_FOR(ms, delay));
  await sleep(ms + delay);
  for (let i = 0; i < 15; i++) {
    try { const r = await exec(ctx.base, ctx.sid, `return window.__dfWin ? { win: window.__dfWin${extra ? ", " + extra : ""} } : null;`, 1); if (r) return r; } catch (_) { /* busy */ }
    await sleep(2000);
  }
  return { win: null };
}
// The governor's crash sentinel (js/perf/governor.js init) counts a reload over a live race as a jetsam kill: a
// strike floors the next boot's tier (1 -> 2, 2+ -> 4). A harness reload is not a crash, so drop the race flag first.
const UNARM = `try { GameStore.store.rawDel("apex26.raceActive"); GameStore.store.rawDel("apex26.raceTicked"); } catch (_) {} return true;`;
async function openUrl(ctx, u) {
  try { await exec(ctx.base, ctx.sid, UNARM, 1); } catch (_) { /* no page yet */ }
  wd(ctx.base, "POST", `/session/${ctx.sid}/url`, { url: u + (u.includes("?") ? "&" : "?") + "df=" + Date.now() });
  await sleep(8000); return waitReady(ctx);
}
const GO = `try { return __apex.go(); } catch (e) { return String(e); }`;
// #3676 (3): the phone's thermal state, once per arm (the --legs bench polls it on its own clock).
function thermalNow(ctx) {
  try { const d = wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: deviceInfo", args: [] }); return d ? d.thermalState : null; }
  catch (_) { return null; }
}
// #3676 (1, 2, 3, 7): what every scenario row carries — the build, whether it is the session's first arm (the cold
// one on this unit; --prime spends a throwaway entry so none is), the thermal state, and the entry's warm timeline
// including the menu warm (warm.history).
function rowMeta(ctx, report, i, entry) {
  return { build: report.boot && report.boot.build ? report.boot.build.sha : null, first: i === 0 && !report.primed,
    thermal: thermalNow(ctx), warm: entry && entry.warm ? entry.warm : null, entryPath: ENTRY_MENU ? "menu" : "api (cold: skips race settings' prepareMenuCarAssets)" };
}
// --prime TRACK:TOD: one discarded race entry before the first arm, so no measured arm pays the unit's cold compile.
async function primeOnce(ctx, url, report) {
  const spec = opt("prime", ""); if (!spec || report.primed) return;
  const [track, tod = "default"] = spec.split(":");
  await openUrl(ctx, withApex(url));
  const e = await timedEntry(ctx, `prime ${spec}`, KICK_FOR(track, tod));
  report.primed = { spec, windowMs: e.windowMs, warm: e.warm };
}
// #3676 (4): --pin-scale S pins the 3D scale (which also stops the auto-governor) before an fps window; the row
// records autoTier before and after, and tierMoved marks a window the ladder changed under.
const GOV = `(() => { try { const r = __apex.renderScale(); return { scale: r.scale, auto: r.auto, tier: r.tier, autoTier: r.autoTier, crashStrikes: r.crashStrikes }; } catch (_) { return null; } })()`;
// visor (#3581): the HELMET cam at a night circuit, one fresh page per arm (the visor settings are read from the URL
// at boot, js/camera/cockpit-opts.js choice()), the field released, 20 s of frames. Arms repeat (off … off) so a
// thermal drift shows as a gap between the two "off" rows instead of hiding inside a visor delta.
const VISOR_ARMS = { off: "helmetvisor=off", on: "helmetvisor=clear&visorreflections=medium&visorrefraction=off",
  refr: "helmetvisor=clear&visorreflections=medium&visorrefraction=medium",
  // #3659's A/B on one build: "over" is its WebGL2 default, `visorblend=add` forces the old plus-lighter.
  "on-over": "helmetvisor=clear&visorreflections=medium&visorrefraction=off&visorblend=over",
  "on-add": "helmetvisor=clear&visorreflections=medium&visorrefraction=off&visorblend=add",
  "refr-over": "helmetvisor=clear&visorreflections=medium&visorrefraction=medium&visorblend=over" };
const VISOR_READ = `(() => { let v = null; try { v = typeof VisorOptics !== "undefined" ? VisorOptics.stats() : null; } catch (e) { v = String(e); }
    let cam = null; try { cam = __apex.camera().mode; } catch (_) {}
    return { cam, optics: v, blend: document.body.dataset.visorBlend || null, perf: (() => { try { const r = __apex.renderScale(); return { scale: r.scale, tier: r.tier, autoTier: r.autoTier, crashStrikes: r.crashStrikes }; } catch (_) { return null; } })() }; })()`;
async function visorScenario(ctx, url, pins, report, out) {
  const [track, tod = "night"] = opt("track", "bahrain:night").split(":");
  const arms = opt("arms", "off,on,refr,off").split(",");
  report.visor = {};
  for (const p of pins) {
    const rows = report.visor[p] = [];
    await exec(ctx.base, ctx.sid, PIN(p));
    await primeOnce(ctx, url, report);
    const pin = opt("pin-scale", "");
    for (const [i, arm] of arms.entries()) {
      const r = await openUrl(ctx, withApex(url) + "&" + VISOR_ARMS[arm]);
      const entry = await timedEntry(ctx, `visor ${p} ${arm}`, KICK_FOR(track, tod));
      await exec(ctx.base, ctx.sid, `__apex.camera("helmet"); ${GO}`);
      if (pin) await exec(ctx.base, ctx.sid, `return __apex.renderScale(${Number(pin)});`);
      const gov0 = await exec(ctx.base, ctx.sid, "return " + GOV);
      const s = await sampleWin(ctx, 20000, 4000, "read: " + VISOR_READ);
      const gov1 = s.read && s.read.perf;
      rows.push({ arm, params: VISOR_ARMS[arm], api: r.api, entryMs: entry.windowMs, gov0, tierMoved: tierMoved(gov0, gov1),
        ...rowMeta(ctx, report, i, entry), ...s });
      log(`visor ${p} ${arm}: api=${r.api} ${JSON.stringify(s)}`);
      try { shot(ctx.base, ctx.sid, path.join(out, `visor-${p}-${i}-${arm}.png`)); } catch (_) { /* no shot */ }
    }
    if (pin) await exec(ctx.base, ctx.sid, "return __apex.renderScale(true);");
    pullLogs(ctx.base, ctx.sid, out);
  }
}
// soak (#3479): GRAPHICS LOW vs MEDIUM at renderScale 0.5 (the iPhone 15 before-numbers: LOW 51.2 < MEDIUM 57.6),
// then one race walked 1.0 → 0.75 → 0.5 (the "never recovered" linger), then the governor back on for a soak.
const PRESET = (id) => `GameStore.store.set("gfxPreset", ${JSON.stringify(id)}); return GameStore.store.get("gfxPreset");`;
const RS = `(() => { try { const r = __apex.renderScale(); return { scale: r.scale, auto: r.auto, tier: r.tier, autoTier: r.autoTier,
    lookPostShed: r.lookPostShed, autoShed: r.autoShed, userTier: r.userTier, frameTimes: r.frameTimes }; } catch (e) { return String(e); } })()`;
async function soakScenario(ctx, url, pins, report, out) {
  const [track, tod = "day"] = opt("track", "monza:day").split(":");
  const presets = opt("presets", "medium,low,medium").split(","), soakS = Number(opt("soak-s", "60"));
  report.soak = {};
  for (const p of pins) {
    const R = report.soak[p] = { presets: [], ladder: null };
    await exec(ctx.base, ctx.sid, PIN(p));
    for (const [i, id] of presets.entries()) {
      await exec(ctx.base, ctx.sid, PRESET(id));
      const r = await openUrl(ctx, withApex(url));
      const entry = await timedEntry(ctx, `soak ${p} ${id}`, KICK_FOR(track, tod));
      await exec(ctx.base, ctx.sid, `try { __apex.go(); } catch (_) {} return __apex.renderScale(0.5);`);
      const s = await sampleWin(ctx, 20000, 4000, "rs: " + RS + ", preset: GfxQuality.current()");
      R.presets.push({ preset: id, api: r.api, entryMs: entry.windowMs, ...rowMeta(ctx, report, i, entry), ...s });
      log(`soak ${p} ${id}@0.5: ${JSON.stringify(s.win)} shed=${s.rs && s.rs.lookPostShed}`);
      try { shot(ctx.base, ctx.sid, path.join(out, `soak-${p}-${i}-${id}.png`)); } catch (_) { /* no shot */ }
    }
    // The ladder runs on the last preset's race, still live.
    const steps = R.ladder = [];
    for (const v of [1, 0.75, 0.5]) {
      await exec(ctx.base, ctx.sid, `return __apex.renderScale(${v});`);
      const s = await sampleWin(ctx, 12000, 3000, "rs: " + RS); steps.push({ scale: v, ...s });
      log(`soak ${p} scale ${v}: ${JSON.stringify(s.win)}`);
    }
    await exec(ctx.base, ctx.sid, `return __apex.renderScale(true);`);
    const s = await sampleWin(ctx, soakS * 1000, 2000, "rs: " + RS); steps.push({ scale: "auto", soakS, ...s });
    log(`soak ${p} auto ${soakS}s: ${JSON.stringify(s.win)} rs=${JSON.stringify(s.rs && { scale: s.rs.scale, tier: s.rs.tier, autoShed: s.rs.autoShed })}`);
    pullLogs(ctx.base, ctx.sid, out);
  }
  await exec(ctx.base, ctx.sid, PRESET(opt("restore-preset", "medium")));
}
// flags (A·Y1 lever 6, PERF-KNOWN-WINS rows 4 and 7): the two fill levers that ship behind boot flags, on one pinned
// path — fixed render targets (apex26.tlxFixedTargets) and SGSR1 upscale (apex26.spatialUpscale) — one fresh page per
// arm (both are read at boot), the governor pinned at each --flag-scales value for a --flag-win-s window. Restores
// both flags off at the end.
const FLAG_ARMS = { off: [0, 0], fixed: [1, 0], sgsr: [0, 1], both: [1, 1] };
const FLAG_SET = ([fx, up]) => `const s = GameStore.store;
  if (${fx}) s.rawSet("apex26.tlxFixedTargets", "1"); else s.rawDel("apex26.tlxFixedTargets");
  s.rawSet("spatialUpscale", ${up} ? "1" : "0"); return true;`;
const FLAG_READ = `(() => { let up = null; try { up = __apex.spatialUpscale(); } catch (_) {}
    return { fixed: localStorage.getItem("apex26.tlxFixedTargets"), upscale: up }; })()`;
async function flagsScenario(ctx, url, report, out) {
  const [track, tod = "day"] = opt("track", "monza:day").split(":");
  const pin = opt("flag-pin", "webgl2"), scales = opt("flag-scales", "0.5,0.75").split(",").map(Number), winS = Number(opt("flag-win-s", "15"));
  const R = report.flags = { pin, track, tod, rows: [] };
  await exec(ctx.base, ctx.sid, PIN(pin));
  await primeOnce(ctx, url, report);
  try {
    for (const [i, arm] of opt("flag-arms", "off,fixed,sgsr,both,off").split(",").entries()) {
      await exec(ctx.base, ctx.sid, FLAG_SET(FLAG_ARMS[arm]));
      const r = await openUrl(ctx, withApex(url));
      const entry = await timedEntry(ctx, `flags ${arm}`, KICK_FOR(track, tod));
      await exec(ctx.base, ctx.sid, GO);
      const meta = rowMeta(ctx, report, i, entry);
      for (const sc of scales) {
        await exec(ctx.base, ctx.sid, `return __apex.renderScale(${sc});`);
        const gov0 = await exec(ctx.base, ctx.sid, "return " + GOV);
        const s2 = await sampleWin(ctx, winS * 1000, 3000, "gov: " + GOV + ", flag: " + FLAG_READ);
        R.rows.push({ arm, scale: sc, api: r.api, entryMs: entry.windowMs, gov0, tierMoved: tierMoved(gov0, s2.gov), ...meta, ...s2 });
        log(`flags ${arm}@${sc}: api=${r.api} ${JSON.stringify(s2.win && { fps: s2.win.fps, p95: s2.win.p95, n50: s2.win.n50 })} flag=${JSON.stringify(s2.flag)} tier=${s2.gov && s2.gov.autoTier}`);
      }
      try { shot(ctx.base, ctx.sid, path.join(out, `flags-${i}-${arm}.png`)); } catch (_) { /* no shot */ }
    }
  } finally {
    try { await exec(ctx.base, ctx.sid, FLAG_SET([0, 0]) + ""); await exec(ctx.base, ctx.sid, "return __apex.renderScale(true);"); } catch (_) { /* best effort */ }
    pullLogs(ctx.base, ctx.sid, out);
  }
}
// lsab (patch 17 #3685, #3690): a localStorage A/B on one pinned path. --ls-arms "A=key:val,key:val|B=|A=key:val": each
// arm sets its keys (an empty value removes the key, a bare "B=" sets nothing), loads a fresh page (flags are read at
// boot), times one entry, then samples --ls-win-s seconds in --ls-cam (default helmet) with the governor left alone.
// Each row reads back the keys, GLX.__tlx.postState() tag/depth discard counters and mirrorState().discards, so an arm
// that did not switch the code path shows. Every key an arm touched is removed at the end.
const LS_PARSE = (spec) => spec.split("|").map((a) => { const [name, kv = ""] = a.split("="); return { name, kv: kv ? kv.split(",").map((p) => { const i = p.indexOf(":"); return [p.slice(0, i), p.slice(i + 1)]; }) : [] }; });
const LS_SET = (kv, all) => `const s = GameStore.store; ${all.map((k) => `s.rawDel(${JSON.stringify(k)});`).join(" ")}
  ${kv.map(([k, v]) => `s.rawSet(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(" ")} return true;`;
const LS_READ = (keys) => `(() => { const o = { keys: {} }; ${keys.map((k) => `o.keys[${JSON.stringify(k)}] = localStorage.getItem(${JSON.stringify(k)});`).join(" ")}
  try { const t = GLX.__tlx.postState(); o.tag = t.tag; o.depth = t.depth; } catch (e) { o.postErr = String(e).slice(0, 80); }
  try { o.mirrorDiscards = GLX.__tlx.mirrorState().discards; } catch (_) {}
  try { o.backend = __apex.diag().env.backend; } catch (_) {}
  return o; })()`;
async function lsabScenario(ctx, url, report, out) {
  const [track, tod = "night"] = opt("track", "monza:night").split(":");
  const pin = opt("ls-pin", "webgpu"), winS = Number(opt("ls-win-s", "30")), cam = opt("ls-cam", "helmet");
  const arms = LS_PARSE(opt("ls-arms", "A=apex26.tlxTagDiscard:0,apex26.tlxDepthDiscard:0|B=|A=apex26.tlxTagDiscard:0,apex26.tlxDepthDiscard:0"));
  const keys = [...new Set(arms.flatMap((a) => a.kv.map(([k]) => k)))];
  const R = report.lsab = { pin, track, tod, cam, arms, rows: [] };
  await exec(ctx.base, ctx.sid, PIN(pin));
  await primeOnce(ctx, url, report);
  try {
    for (const [i, arm] of arms.entries()) {
      await exec(ctx.base, ctx.sid, LS_SET(arm.kv, keys));
      const r = await openUrl(ctx, withApex(url));
      const entry = await timedEntry(ctx, `lsab ${arm.name}`, KICK_FOR(track, tod));
      await exec(ctx.base, ctx.sid, GO);
      try { await exec(ctx.base, ctx.sid, `return __apex.camera(${JSON.stringify(cam)});`); } catch (_) { /* keep default */ }
      const meta = rowMeta(ctx, report, i, entry);
      const s2 = await sampleWin(ctx, winS * 1000, 3000, "ls: " + LS_READ(keys));
      R.rows.push({ arm: arm.name, i, api: r.api, entryMs: entry.windowMs, ...meta, ...s2 });
      log(`lsab ${arm.name}: api=${r.api} ${JSON.stringify(s2.win && { fps: s2.win.fps, p95: s2.win.p95, p99: s2.win.p99, n50: s2.win.n50 })} ls=${JSON.stringify(s2.ls)}`);
      try { shot(ctx.base, ctx.sid, path.join(out, `lsab-${i}-${arm.name}.png`)); } catch (_) { /* no shot */ }
    }
  } finally {
    try { await exec(ctx.base, ctx.sid, LS_SET([], keys)); } catch (_) { /* best effort */ }
    pullLogs(ctx.base, ctx.sid, out);
  }
}
// opus (A·H18, #3710): which Opus containers Safari's decodeAudioData takes (Ogg, WebM, CAF) against an MP3 control.
// The probe is the function in devicefarm-opus-probe.mjs (async, returns JSON), serialised and run through
// WebDriver execute/async on the live game page so VoicePack.codecs() reports too. Home-Screen web-app mode is not
// reachable from this harness (Safari only).
async function opusScenario(ctx, url, report, out) {
  const { default: probe } = await import("./devicefarm-opus-probe.mjs");
  await openUrl(ctx, withApex(url));
  const script = `const cb = arguments[arguments.length - 1]; (${probe.toString()})().then(cb, (e) => cb(JSON.stringify({ probeError: String(e && e.message || e) })));`;
  let raw;
  // Run 2026-10-25: execute/async died "after 30 ms" with the endpoint's default script timeout; set it explicitly (ms).
  try { wd(ctx.base, "POST", `/session/${ctx.sid}/timeouts`, { script: 60000 }); } catch (e) { log("timeouts: " + e.message.slice(0, 120)); }
  try { raw = wd(ctx.base, "POST", `/session/${ctx.sid}/execute/async`, { script, args: [] }); }
  catch (e) { raw = JSON.stringify({ probeError: "execute/async: " + e.message.slice(0, 160) }); }
  let parsed; try { parsed = JSON.parse(raw); } catch (_) { parsed = { raw: String(raw).slice(0, 400) }; }
  report.opus = parsed;
  log("opus " + JSON.stringify(parsed));
  fs.writeFileSync(path.join(out, "opus-probe.json"), JSON.stringify(parsed, null, 2));
}
// coldrace (A·W50, #3713): the cold first race on the player's path. --cold-arms menu30,title0,title15,title45,second:
// "menuN" idles N s on RACE SETTINGS (after the menu's own prep) before START; "titleN" idles N s on the title screen
// before RACE; "quickN" is titleN with NO menu-prep or garage wait: START is pressed as soon as RACE SETTINGS shows
// and menuPrep() is recorded at the click (menu.prepAtClick), the S5 symptom path (#3713 part 2); "second" is a fresh page after the others in the same session (a warm pipeline cache: the control).
// One fresh page per arm, the first arm is the cold one only on a fresh unit (rowMeta.first). Per arm: the entry
// window with warm timeline (mirrorPrepare/programWarm/rig/warmCarAssets via the stage table and memState().warm),
// then --cold-win-s seconds of frames after a 3 s settle (fps, worst frame, hitches). gpuMs and memory peak are NOT collected.
async function coldraceScenario(ctx, url, report, out) {
  const [track, tod = "day"] = opt("track", "monza:day").split(":");
  const pin = opt("cold-pin", "webgpu"), winS = Number(opt("cold-win-s", "20"));
  const R = report.coldrace = { pin, track, tod, rows: [] };
  await exec(ctx.base, ctx.sid, PIN(pin));
  for (const [i, arm] of opt("cold-arms", "menu30,title0,title15,title45,second").split(",").entries()) {
    const m = /^(menu|title|quick)(\d+)$/.exec(arm), idle = m ? Number(m[2]) : 0;
    const r = await openUrl(ctx, withApex(url));
    if (m && (m[1] === "title" || m[1] === "quick") && idle) await sleep(idle * 1000);
    const entry = await timedEntry(ctx, `coldrace ${arm}`, KICK_MENU(track, tod, m && m[1] === "menu" ? idle : 0, !!m && m[1] === "quick"));
    await exec(ctx.base, ctx.sid, GO);
    const menu = await exec(ctx.base, ctx.sid, "return window.__dfMenu || null;");
    const s2 = await sampleWin(ctx, winS * 1000, 3000, "mem: (() => { try { return GLX.__tlx.memState().warm; } catch (_) { return null; } })()");
    R.rows.push({ arm, idleS: idle, api: r.api, entryMs: entry.windowMs, stages: entry.stages, menu, ...rowMeta(ctx, report, i, entry), ...s2 });
    log(`coldrace ${arm}: api=${r.api} entry ${entry.windowMs} ms stages=${JSON.stringify(entry.stages)} warm=${JSON.stringify(entry.warm && { total: entry.warm.total, scene: entry.warm.scene, post: entry.warm.post, mirror: entry.warm.mirror, rig: entry.warm.rig && entry.warm.rig.ms })} win=${JSON.stringify(s2.win && { fps: s2.win.fps, max: s2.win.max, n50: s2.win.n50 })} menu=${JSON.stringify(menu && { prepReady: menu.prepReady, prepWaitMs: menu.prepWaitMs, steps: menu.steps })}`);
    try { shot(ctx.base, ctx.sid, path.join(out, `coldrace-${i}-${arm}.png`)); } catch (_) { /* no shot */ }
  }
  pullLogs(ctx.base, ctx.sid, out);
}
// photo (#3482): Photo Studio driven by native finger taps from the title screen, every visible control's painted
// size against the 44 px floor, one shot preset, CAPTURE, CLOSE — and every page error on the way.
const RECT = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`;
async function nativeTap(ctx, sel) {
  const g = await exec(ctx.base, ctx.sid, `return { p: ${RECT(sel)}, w: innerWidth, h: innerHeight };`);
  if (!g.p) return { sel, tapped: false, why: "not on screen" };
  const web = wd(ctx.base, "GET", `/session/${ctx.sid}/context`);
  wd(ctx.base, "POST", `/session/${ctx.sid}/context`, { name: "NATIVE_APP" });
  try {
    const win = wd(ctx.base, "GET", `/session/${ctx.sid}/window/rect`);
    const k = win.width / g.w, oy = win.height - g.h * k, x = Math.round(g.p.x * k), y = Math.round(oy + g.p.y * k);
    wd(ctx.base, "POST", `/session/${ctx.sid}/actions`, { actions: [{ type: "pointer", id: "finger", parameters: { pointerType: "touch" }, actions: [
      { type: "pointerMove", duration: 0, x, y }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 80 }, { type: "pointerUp", button: 0 }] }] });
    try { wd(ctx.base, "DELETE", `/session/${ctx.sid}/actions`); } catch (_) { /* nothing held */ }
    return { sel, tapped: true, at: [x, y], css: [Math.round(g.p.x), Math.round(g.p.y)] };
  } finally {
    const ctxs = wd(ctx.base, "GET", `/session/${ctx.sid}/contexts`);
    const back = (typeof web === "string" && web !== "NATIVE_APP") ? web : (ctxs || []).find((c) => (c.id || c) !== "NATIVE_APP");
    wd(ctx.base, "POST", `/session/${ctx.sid}/context`, { name: back && back.id ? back.id : back });
  }
}
const PHOTO_ERRS = `window.__dfErr = window.__dfErr || []; if (!window.__dfErrOn) { window.__dfErrOn = 1;
  addEventListener("error", (e) => window.__dfErr.push(String(e.message).slice(0, 160)));
  addEventListener("unhandledrejection", (e) => window.__dfErr.push("rej " + String(e.reason).slice(0, 160))); } return true;`;
const PHOTO_READ = `const ps = document.getElementById("photo-studio"); const open = !!ps && !ps.hidden && getComputedStyle(ps).display !== "none";
  const ctl = open ? [...ps.querySelectorAll("button, select, input, [role=slider]")].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).visibility !== "hidden"; })
    .map((el) => { const r = el.getBoundingClientRect(); return { id: el.id || el.textContent.trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height), off: r.bottom > innerHeight + 0.5 || r.top < -0.5 }; }) : [];
  // The panel body scrolls by design (#ps-body); CAPTURE and CLOSE are the two that must stay on screen.
  const msg = document.getElementById("ps-message");
  return { open, w: innerWidth, h: innerHeight, controls: ctl.length, under44: ctl.filter((c) => Math.min(c.w, c.h) < 44), offscreen: ctl.filter((c) => c.off && (c.id === "ps-capture" || c.id === "ps-close")).map((c) => c.id),
    message: msg ? msg.textContent.trim().slice(0, 120) : null, errors: (window.__dfErr || []).slice(0, 20) };`;
// --photo-scales auto,1: one fresh page per entry, the 3D render scale pinned before Photo opens ("auto" = the
// governor's own), so a small capture can be pinned on the scale (#3482: 217 x 122 px at the title scene).
const CANVAS_READ = `(() => { const c = document.getElementById("game"), s = document.getElementById("game-soft");
    let rs = null; try { const r = __apex.renderScale(); rs = { scale: r.scale, auto: r.auto }; } catch (_) {}
    return { game: c ? [c.width, c.height] : null, soft: s ? [s.width, s.height] : null, css: [innerWidth, innerHeight], dpr: devicePixelRatio, rs }; })()`;
async function photoScenario(ctx, url, report, out) {
  const R = report.photo = { runs: [] };
  for (const scale of opt("photo-scales", "auto").split(",")) {
    const run = { scale, steps: [] }; R.runs.push(run);
    await openUrl(ctx, withApex(url));
    await exec(ctx.base, ctx.sid, PHOTO_ERRS);
    if (scale !== "auto") await exec(ctx.base, ctx.sid, `return __apex.renderScale(${Number(scale)});`);
    await sleep(4000);   // the title scene's car settles (and a pinned scale resizes) before the first tap
    const step = async (name, sel, wait = 3000) => {
      const tap = sel ? await nativeTap(ctx, sel) : null; await sleep(wait);
      const read = await exec(ctx.base, ctx.sid, PHOTO_READ), canvas = await exec(ctx.base, ctx.sid, "return " + CANVAS_READ);
      run.steps.push({ name, tap, read, canvas });
      log(`photo@${scale} ${name}: tap=${tap && tap.tapped} open=${read.open} controls=${read.controls} under44=${read.under44.length} off=${read.offscreen.length} msg=${read.message} errors=${read.errors.length} canvas=${JSON.stringify(canvas)}`);
      try { shot(ctx.base, ctx.sid, path.join(out, `photo-${scale}-${run.steps.length}-${name}.png`)); } catch (_) { /* no shot */ }
      return read;
    };
    await step("menu", null, 0);
    const opened = await step("open", "#mb-photo", 5000);
    if (opened.open) {
      await step("shot-preset", "#ps-shots button");
      await step("capture", "#ps-capture", 6000);
      await step("close", "#ps-close");
    }
    if (scale !== "auto") await exec(ctx.base, ctx.sid, "return __apex.renderScale(true);");
  }
  pullLogs(ctx.base, ctx.sid, out);
}

// #3676 (5): unit history. Only a fresh unit is cold (a Safari data clear keeps the pipeline cache, ledger row 13), so
// every session appends unit -> {at, scenario, build, out} to artifacts/devicefarm/units.json and logs whether this
// unit has run the game before. The file is local (artifacts/ is ignored); the ledger's device column is the record.
function noteUnit(report, scenario, out) {
  if (!report.unit) return;
  const file = path.join("artifacts", "devicefarm", "units.json");
  let db = {}; try { db = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { /* first session */ }
  const seen = appendUnit(db, report.unit, { at: new Date().toISOString(), scenario, build: report.boot && report.boot.build ? report.boot.build.sha : null, out });
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 2)); } catch (e) { log("units.json: " + e.message.slice(0, 100)); }
  log(`unit ${report.unit}: ${seen ? seen + " earlier session(s) in units.json" : "first session in units.json"}`);
}

async function run() {
  const want = opt("device", "iPhone 18 Pro Max"), legs = Number(opt("legs", "0")), scenario = opt("scenario", "bench");
  const pins = opt("pins", "webgpu,webgl2").split(",");
  // --touch drives __apex too, which a Pages build loads only with ?apex (js/core/lazy-bundles.js wantAgentSurface).
  const url = scenario === "bench" && !Number(opt("touch", "0")) ? opt("url", SITE) : withApex(opt("url", SITE));
  const out = opt("out", path.join("artifacts", "devicefarm", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)));
  fs.mkdirSync(out, { recursive: true });
  const dev = iosPhones().find((d) => d.name === want || d.name.endsWith(" " + want) || d.arn.endsWith(want));
  if (!dev) throw new Error(`no iOS phone named ${want}; try: devices`);
  const proj = aws("devicefarm", "list-projects").projects.find((p) => p.name === PROJECT);
  if (!proj) throw new Error(`no Device Farm project ${PROJECT}`);
  log(`device ${dev.name} iOS ${dev.os}; project ${PROJECT}; legs ${legs}`);
  const cfg = JSON.stringify({ parameters: { "appium:version": "3" } });
  const ses = aws("devicefarm", "create-remote-access-session", "--project-arn", proj.arn, "--device-arn", dev.arn,
    "--name", "apex-" + Date.now(), "--configuration", cfg).remoteAccessSession;
  const report = { device: dev.name, os: dev.os, url, legs, scenario, pins, startedAt: new Date().toISOString(), sessionArn: ses.arn };
  let sid = null, base = null;
  // --wait-min (A·W15) overrides APEX_DF_WAIT_MIN for one run.
  const tq = Date.now(), WAIT_MIN = Number(opt("wait-min", process.env.APEX_DF_WAIT_MIN || 30));
  try {
    for (let t = 0; ; t++) {
      const s = aws("devicefarm", "get-remote-access-session", "--arn", ses.arn).remoteAccessSession;
      if (s.status === "RUNNING" && s.endpoints && s.endpoints.remoteDriverEndpoint) { base = s.endpoints.remoteDriverEndpoint.replace(/\/$/, ""); break; }
      // PENDING_DEVICE / PENDING_CONCURRENCY cost nothing: wait up to APEX_DF_WAIT_MIN (sessions still STOPPING hold
      // concurrency for minutes after they end, and public devices are shared with other AWS customers).
      if (/COMPLETED|STOPPING|ERRORED|FAILED/.test(s.status) || Date.now() - tq > WAIT_MIN * 60000) throw new Error(`session ${s.status} ${s.result || ""} ${s.message || ""}`);
      if (t % 6 === 0) log(`session ${s.status}`);
      await sleep(5000);
    }
    log("session RUNNING; endpoint ready (not printed)");
    // The physical phone: Safari's shader cache survives between sessions on one instance (A·D1), so a BEFORE/AFTER
    // pair is only comparable on the same instanceArn.
    try { const s = aws("devicefarm", "get-remote-access-session", "--arn", ses.arn).remoteAccessSession;
      report.instanceArn = s.instanceArn || (s.device && s.device.instances && s.device.instances.map((i) => i.arn)) || null;
      report.deviceUdid = s.deviceUdid || null;
      log("instance " + String(report.instanceArn).split("/").pop() + (report.deviceUdid ? " udid " + report.deviceUdid : "")); } catch (e) { log("instance: " + e.message.slice(0, 120)); }
    report.status = wd(base, "GET", "/status");
    const caps = { platformName: "iOS", browserName: "Safari", "appium:automationName": "XCUITest", "appium:newCommandTimeout": 300,
      "appium:showSafariConsoleLog": true, "appium:showSafariNetworkLog": true };
    const created = wd(base, "POST", "/session", { capabilities: { alwaysMatch: caps, firstMatch: [{}] } });
    sid = created.sessionId; log("WebDriver session up");
    // Which physical phone: Device Farm has several units per model and Safari's cache survives between sessions
    // on one unit (note §8), so a "first entry" is only cold if this unit has not run the game before.
    try { const d = wd(base, "POST", `/session/${sid}/execute/sync`, { script: "mobile: deviceInfo", args: [] });
      report.deviceInfo = d; report.unit = String((d && d.uuid) || "").slice(0, 8) || null; log(`unit ${report.unit}`); } catch (_) { report.unit = null; }
    try { wd(base, "POST", `/session/${sid}/orientation`, { orientation: "LANDSCAPE" }); } catch (e) { log("orientation: " + e.message.slice(0, 120)); }
    wd(base, "POST", `/session/${sid}/url`, { url });
    await sleep(20000);
    report.boot = await exec(base, sid, PROBE);
    log(`boot: gpu=${report.boot.gpu} live=${JSON.stringify(report.boot.live)} build=${JSON.stringify(report.boot.build)} title=${report.boot.title}`);
    shot(base, sid, path.join(out, "boot.png"));
    if (scenario !== "bench") {
      const ctx = { base, sid, caps, out };
      log(`live view: AWS console > Device Farm > Mobile Device Testing > Projects > ${PROJECT} > Remote access > ${ses.name}`);
      try { if (scenario === "cache") await cacheScenario(ctx, url, pins, report, out); else if (scenario === "races") await racesScenario(ctx, pins, report, out);
        else if (scenario === "warmplus") await warmplusScenario(ctx, url, report, out);
        else if (scenario === "tracks") await tracksScenario(ctx, opt("tracks", "monza:night,singapore:night,vegas:night").split(","), report, out);
        else {
          // --scenario visor,soak,photo chains the follow-ups in ONE session (a session bills ~13 device-minutes minimum).
          for (const sc of scenario.split(",")) {
            // --visor-pins / --soak-pins: the visor delta shows only where frames are not pinned at 60 Hz (iPhone 14
            // WebGL2, ledger rows 1-4); #3479's before-numbers are WebGPU.
            try { if (sc === "tracks") { await exec(ctx.base, ctx.sid, PIN(pins[0])); await tracksScenario(ctx, opt("tracks", "monza:day").split(","), report, out); }
              else if (sc === "visor") await visorScenario(ctx, opt("url", SITE), opt("visor-pins", "webgl2,webgpu").split(","), report, out);
              else if (sc === "lsab") await lsabScenario(ctx, opt("url", SITE), report, out);
              else if (sc === "opus") await opusScenario(ctx, opt("url", SITE), report, out);
              else if (sc === "coldrace") await coldraceScenario(ctx, opt("url", SITE), report, out);
              else if (sc === "soak") await soakScenario(ctx, opt("url", SITE), opt("soak-pins", "webgpu").split(","), report, out);
              else if (sc === "photo") await photoScenario(ctx, opt("url", SITE), report, out);
              else if (sc === "flags") await flagsScenario(ctx, opt("url", SITE), report, out);
              else throw new Error("unknown scenario " + sc); }
            catch (e) { (report.scenarioErrors = report.scenarioErrors || {})[sc] = e.message; log(`${sc}: ERROR ${e.message.slice(0, 160)}`); }
          }
        } }
      finally { sid = ctx.sid; }
    }
    const touchN = Number(opt("touch", "0"));
    // --variants none,dom,state,none: one fresh page load per entry in the SAME Safari session (same phone, same
    // process caches), so a warm-up's effect is read against a no-warm load before AND after it.
    const variants = opt("variants", "");
    if (touchN && variants) {
      report.variants = [];
      // Entry = warm[@live|@fix]; --fix-url names the @fix page. --cold kills Safari between entries (a fresh
      // process: run 5 showed the stall is paid once per Safari PROCESS, so a reload alone hides it).
      const fixUrl = opt("fix-url", ""), cold = args.includes("--cold");
      for (const [i, spec] of variants.split(",").entries()) {
        const [v, target] = spec.split("@");
        const base0 = target === "fix" ? fixUrl : url;
        if (target === "fix" && !fixUrl) throw new Error("@fix needs --fix-url");
        const u = base0 + (base0.includes("?") ? "&" : "?") + "v" + i + "=" + Date.now();
        if (i && cold) {
          try { wd(base, "POST", `/session/${sid}/context`, { name: "NATIVE_APP" });
            wd(base, "POST", `/session/${sid}/execute/sync`, { script: "mobile: terminateApp", args: [{ bundleId: "com.apple.mobilesafari" }] }); }
          catch (e) { log("terminate: " + e.message.slice(0, 120)); }
          try { wd(base, "DELETE", `/session/${sid}`); } catch (_) { /* gone with Safari */ }
          sid = wd(base, "POST", "/session", { capabilities: { alwaysMatch: caps, firstMatch: [{}] } }).sessionId;
          try { wd(base, "POST", `/session/${sid}/orientation`, { orientation: "LANDSCAPE" }); } catch (_) { /* already */ }
          log(`variant ${i}: cold Safari`);
        }
        if (i || target === "fix") { wd(base, "POST", `/session/${sid}/url`, { url: u }); await sleep(20000); }
        try { const t = await touchRun(base, sid, out, touchN, v); t.target = target || "live"; t.url = u.replace(/[?&]v\d+=\d+$/, ""); report.variants.push(t); log(`variant ${i} ${spec}: first=${t.read && t.read.perTap && t.read.perTap[0]} load=${JSON.stringify(t.read && t.read.load)} warm=${JSON.stringify(t.read && t.read.warmLog)} perTap=${JSON.stringify(t.read && t.read.perTap)} spansFrameMax=${t.read && t.read.spans && t.read.spans.frame && t.read.spans.frame.max}`); }
        catch (e) { report.variants.push({ warm: spec, error: e.message }); log(`variant ${i} ${spec}: ERROR ${e.message.slice(0, 160)}`); }
      }
    } else if (touchN) report.touch = await touchRun(base, sid, out, touchN);
    if (legs) {
      report.benchStart = await exec(base, sid, BENCH(legs));
      log("bench " + JSON.stringify(report.benchStart));
      const t0 = Date.now(), cap = (legs * 4.5 + 3) * 60000;
      let last = "", n = 0;
      const entries = report.entries = {}, thermal = report.thermal = [];
      for (;;) {
        await sleep(POLL_MS); n++;
        if (n % LOG_EVERY === 0) pullLogs(base, sid, out);
        if (n % THERMAL_EVERY === 1) {
          try { const d = wd(base, "POST", `/session/${sid}/execute/sync`, { script: "mobile: deviceInfo", args: [] });
            thermal.push({ t: Math.round((Date.now() - t0) / 1000), thermalState: d && d.thermalState, leg: last.split(" ")[1] || null });
          } catch (e) { if (!thermal.length) log("thermal: " + e.message.slice(0, 120)); thermal.push({ t: Math.round((Date.now() - t0) / 1000), error: true }); }
        }
        let st; try { st = await exec(base, sid, BENCH_STATE, 2); } catch (e) { log("poll: " + e.message.slice(0, 120)); continue; }
        if (st.entry && st.entry.winT0 && st.entry.windowMs > 0) entries[`${st.i}:${st.api}:${Math.round(st.entry.winT0)}`] = st.entry;
        const line = `${st.state} i=${st.i} api=${st.api} ${JSON.stringify(st.legs)}`;
        if (line !== last) { log(line); last = line; }
        if (st.state !== "running" && st.state !== "none") { report.bench = st.result; break; }
        if (Date.now() - t0 > cap) { log("bench cap reached"); report.benchTimedOut = st; break; }
      }
      pullLogs(base, sid, out);
      try { shot(base, sid, path.join(out, "bench.png")); } catch (e) { log("shot: " + e.message.slice(0, 120)); }
    }
  } catch (e) {
    report.error = e.message; log("ERROR " + e.message);
  } finally {
    if (sid) try { wd(base, "DELETE", `/session/${sid}`); } catch (_) { /* gone */ }
    try { aws("devicefarm", "stop-remote-access-session", "--arn", ses.arn); } catch (e) { log("stop: " + e.message.slice(0, 160)); }
    for (let t = 0; t < 24; t++) {
      const s = aws("devicefarm", "get-remote-access-session", "--arn", ses.arn).remoteAccessSession;
      report.session = { status: s.status, result: s.result, deviceMinutes: s.deviceMinutes, billingMethod: s.billingMethod };
      if (s.status === "COMPLETED") break;
      await sleep(5000);
    }
    log("session " + JSON.stringify(report.session));
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    log(`report ${path.join(out, "report.json")}`);
    noteUnit(report, scenario, out);
  }
}

// ---- automated run (server-side) ------------------------------------------------------------------------------
const SPEC = ({ legs, perf, url }) => `version: 0.1
ios_test_host: macos_tahoe
phases:
  install:
    commands:
      - devicefarm-cli use node 24
      - devicefarm-cli use appium 3
      - export APPIUM_BASE_PATH=
  pre_test:
    commands:
      - |-
        APPIUM_DRIVER_VERSION=$(appium driver list --installed --json | jq -r ".xcuitest.version" | cut -d "." -f 1);
        CORRESPONDING_APPIUM_WDA=$(env | grep "DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH_V\${APPIUM_DRIVER_VERSION}")
        if [[ ! -z "$APPIUM_DRIVER_VERSION" ]] && [[ ! -z "$CORRESPONDING_APPIUM_WDA" ]]; then
          DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH=$(echo $CORRESPONDING_APPIUM_WDA | cut -d "=" -f2)
        else
          DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH=$(env | grep "DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH_V" | sort -V -r | head -n 1 | cut -d "=" -f2)
        fi;
      - |-
        appium --base-path=$APPIUM_BASE_PATH --log-timestamp --log-no-colors --relaxed-security --default-capabilities \\
          "{\\"appium:deviceName\\": \\"$DEVICEFARM_DEVICE_NAME\\", \\"platformName\\": \\"iOS\\", \\"browserName\\": \\"Safari\\", \\
          \\"appium:udid\\": \\"$DEVICEFARM_DEVICE_UDID\\", \\"appium:platformVersion\\": \\"$DEVICEFARM_DEVICE_OS_VERSION\\", \\
          \\"appium:derivedDataPath\\": \\"$DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH\\", \\"appium:usePrebuiltWDA\\": true, \\
          \\"appium:automationName\\": \\"XCUITest\\"}" >> $DEVICEFARM_LOG_DIR/appium.log 2>&1 &
      - |-
        n=0; until curl --silent --fail "http://127.0.0.1:4723\${APPIUM_BASE_PATH}/status" >/dev/null; do
          n=$((n + 1)); if [[ $n -gt 60 ]]; then echo "Appium did not start"; exit 1; fi; sleep 1; done
  test:
    commands:
      - cd $DEVICEFARM_TEST_PACKAGE_PATH && tar xzf *.tgz
      - xcrun xctrace version || true
      - APEX_LEGS=${legs} APEX_PERF="${perf}" APEX_URL="${url}" node $DEVICEFARM_TEST_PACKAGE_PATH/package/devicefarm-host.mjs
  post_test:
    commands:
      - ls -la $DEVICEFARM_LOG_DIR
artifacts:
  - $DEVICEFARM_LOG_DIR
`;

function upload(projArn, file, type) {
  const u = aws("devicefarm", "create-upload", "--project-arn", projArn, "--name", path.basename(file), "--type", type).upload;
  execFileSync("curl", ["-sS", "--fail", "-T", file, u.url], { stdio: ["ignore", "ignore", "pipe"] });
  return u.arn;
}
async function uploaded(arn) {
  for (let t = 0; t < 60; t++) {
    const u = aws("devicefarm", "get-upload", "--arn", arn).upload;
    if (u.status === "SUCCEEDED") return u;
    if (u.status === "FAILED") throw new Error(`upload ${u.name} FAILED: ${u.metadata || u.message || ""}`.slice(0, 400));
    await sleep(3000);
  }
  throw new Error("upload processing timed out");
}

async function auto() {
  const want = opt("device", "iPhone 18 Pro Max"), legs = Number(opt("legs", "2")), perf = opt("perf", "none"), url = opt("url", SITE);
  const out = opt("out", path.join("artifacts", "devicefarm", "auto-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)));
  const pkg = path.join(out, "pkg");
  fs.mkdirSync(pkg, { recursive: true });
  const dev = iosPhones().find((d) => d.name === want || d.name.endsWith(" " + want) || d.arn.endsWith(want));
  if (!dev) throw new Error(`no iOS phone named ${want}`);
  const proj = aws("devicefarm", "list-projects").projects.find((p) => p.name === PROJECT);
  if (!proj) throw new Error(`no Device Farm project ${PROJECT}`);
  // Test package: a zip holding the `npm pack` tarball of a dependency-free package (test-types-appium-integrate).
  fs.copyFileSync(fileURLToPath(new URL("./devicefarm-host.mjs", import.meta.url)), path.join(pkg, "devicefarm-host.mjs"));
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "apex-devicefarm-host", version: "1.0.0", private: true, type: "module", files: ["devicefarm-host.mjs"] }, null, 2));
  const tgz = execFileSync("npm", ["pack", "--silent"], { cwd: pkg, encoding: "utf8" }).trim().split("\n").pop();
  const zip = path.resolve(out, "apex-host-tests.zip");
  execFileSync("zip", ["-q", "-j", zip, path.join(pkg, tgz)]);
  const specFile = path.resolve(out, "apex-testspec.yml");
  fs.writeFileSync(specFile, SPEC({ legs, perf, url }));
  log(`device ${dev.name} iOS ${dev.os}; legs ${legs}; perf ${perf}`);
  const pkgArn = upload(proj.arn, zip, "APPIUM_WEB_NODE_TEST_PACKAGE"), specArn = upload(proj.arn, specFile, "APPIUM_WEB_NODE_TEST_SPEC");
  await uploaded(pkgArn); await uploaded(specArn); log("uploads processed");
  const poolName = "apex-" + dev.arn.split(":device:")[1].slice(0, 12);
  let pool = (aws("devicefarm", "list-device-pools", "--arn", proj.arn, "--type", "PRIVATE").devicePools || []).find((p) => p.name === poolName);
  if (!pool) pool = aws("devicefarm", "create-device-pool", "--project-arn", proj.arn, "--name", poolName,
    "--rules", JSON.stringify([{ attribute: "ARN", operator: "IN", value: JSON.stringify([dev.arn]) }])).devicePool;
  const runArn = aws("devicefarm", "schedule-run", "--project-arn", proj.arn, "--device-pool-arn", pool.arn, "--name", "apex-auto-" + Date.now(),
    "--test", JSON.stringify({ type: "APPIUM_WEB_NODE", testPackageArn: pkgArn, testSpecArn: specArn }),
    "--execution-configuration", JSON.stringify({ jobTimeoutMinutes: Math.ceil(legs * 5 + 15), videoCapture: true })).run.arn;
  const report = { device: dev.name, os: dev.os, legs, perf, runArn };
  let r, last = "";
  for (;;) {
    r = aws("devicefarm", "get-run", "--arn", runArn).run;
    const line = `${r.status} ${r.result || ""}`;
    if (line !== last) { log("run " + line); last = line; }
    if (r.status === "COMPLETED") break;
    await sleep(15000);
  }
  report.run = { status: r.status, result: r.result, deviceMinutes: r.deviceMinutes, counters: r.counters, message: r.message };
  log("run " + JSON.stringify(report.run));
  // Every artifact of every job: video, Appium/device logs, and the Customer Artifacts zip (our $DEVICEFARM_LOG_DIR).
  const dl = path.join(out, "artifacts");
  fs.mkdirSync(dl, { recursive: true });
  report.artifacts = [];
  for (const type of ["FILE", "LOG", "SCREENSHOT"]) {
    for (const a of aws("devicefarm", "list-artifacts", "--arn", runArn, "--type", type).artifacts || []) {
      const f = path.join(dl, `${a.name.replace(/[^\w.-]+/g, "_")}.${a.extension}`);
      try { execFileSync("curl", ["-sS", "--fail", "-o", f, a.url]); report.artifacts.push({ type, name: a.name, file: f, bytes: fs.statSync(f).size }); }
      catch (e) { report.artifacts.push({ type, name: a.name, error: e.message.slice(0, 120) }); }
    }
  }
  for (const a of report.artifacts) log(`artifact ${a.type} ${a.name} ${a.bytes ?? a.error}`);
  // The device syslog carries the only phone memory numbers there are (#3675): print the WebContent footprint table.
  const sys = report.artifacts.filter((a) => a.file && /syslog/i.test(a.name || "")).map((a) => a.file);
  if (sys.length) {
    try { const sl = await import("./devicefarm-syslog.mjs"), st = await sl.parseFiles(sys); report.syslog = sl.summarise(st); console.log(sl.table(st)); }
    catch (e) { log("syslog table failed: " + e.message.slice(0, 120)); }
  }
  fs.writeFileSync(path.join(out, "auto-report.json"), JSON.stringify(report, null, 2));
  log(`report ${path.join(out, "auto-report.json")}`);
}

// download REPORT_DIR...: every artifact Device Farm kept for each run's remote access session (video, device /
// Appium / Safari logs, screenshots) into REPORT_DIR/df-artifacts/, named by type. The session ARN comes from the
// report; artifact URLs are pre-signed and short-lived, so they are fetched at once and never printed. The device
// syslog (~300 MB a session) and the TCP dump are skipped unless --all: the container's disk is a fixed allowance.
function download(dirs) {
  const all = dirs.includes("--all"); dirs = dirs.filter((d) => d !== "--all");
  for (const dir of dirs) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")); } catch (e) { log(`${dir}: no report.json`); continue; }
    if (!r.sessionArn) { log(`${dir}: report has no sessionArn`); continue; }
    const dest = path.join(dir, "df-artifacts"); fs.mkdirSync(dest, { recursive: true });
    let n = 0, bytes = 0;
    for (const type of ["FILE", "LOG", "SCREENSHOT"]) {
      let list = []; try { list = aws("devicefarm", "list-artifacts", "--arn", r.sessionArn, "--type", type).artifacts || []; }
      catch (e) { log(`${dir} ${type}: ${e.message.slice(0, 120)}`); continue; }
      for (const a of list) {
        if (!all && (a.type === "DEVICE_LOG" || a.type === "RAW_FILE")) continue;
        const name = `${type.toLowerCase()}-${String(a.type || "x").toLowerCase()}-${String(a.name || "artifact").replace(/[^A-Za-z0-9._-]+/g, "_")}.${a.extension || "bin"}`;
        const f = path.join(dest, name);
        try { execFileSync("curl", ["-sS", "--fail", "-o", f, a.url], { stdio: ["ignore", "ignore", "pipe"] }); n++; bytes += fs.statSync(f).size; }
        catch (e) { log(`${dir}: ${name} failed`); }
      }
    }
    log(`${dir}: ${n} artifact(s), ${(bytes / 1048576).toFixed(1)} MB -> ${dest}`);
  }
}

const cmd = args[0];
if (cmd === "devices") { for (const d of iosPhones()) console.log(`${d.name}\tiOS ${d.os}\t${d.availability}\tremoteAccess=${d.remoteAccess}`); }
else if (cmd === "run") run().catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === "auto") auto().catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === "download") download(args.slice(1));
else { console.error("usage: devicefarm-iphone.mjs devices | run --device NAME [--legs 0|2|4] [--touch N] | auto --device NAME [--legs N] [--perf NAME|none] | download REPORT_DIR..."); process.exit(2); }
