#!/usr/bin/env node
// @doc Device Farm automated-run body: on the AWS Mac host, Safari bench legs + Instruments trace into $DEVICEFARM_LOG_DIR.
// Runs ON the Device Farm test host (macos_tahoe), not here: `devicefarm-iphone.mjs auto` packages this file with
// `npm pack` and a generated test spec, and the spec starts Appium on 127.0.0.1:4723 before running it. It opens the
// live game in Safari, optionally records an Instruments profile (`mobile: startPerfRecord`, the one thing a remote
// access session cannot do), runs BENCHMARK "paths" for APEX_LEGS legs and writes report.json, the Safari console,
// the trace and screenshots into $DEVICEFARM_LOG_DIR (collected as Customer Artifacts). No dependencies: Node fetch only.
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.APEX_APPIUM || "http://127.0.0.1:4723";
const OUT = process.env.DEVICEFARM_LOG_DIR || "out";
const SHOTS = process.env.DEVICEFARM_SCREENSHOT_PATH || OUT;
const URL_ = process.env.APEX_URL || "https://brycejmurrin.github.io/f1-game/";
const LEGS = Number(process.env.APEX_LEGS || "2");
// Instruments is opt-in: on Device Farm (2026-10-23) xctrace logged "Device got disconnected" 3 s into an Activity
// Monitor recording and the Safari remote debugger never answered again (docs/notes/AWS-DEVICE-FARM-IPHONE-2026-10-23.md §7).
const PERF = process.env.APEX_PERF || "none";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

async function wd(method, p, body, ms = 90000) {
  const r = await fetch(BASE + p, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(ms) });
  const j = await r.json().catch(() => ({}));
  if (j && j.value && j.value.error) throw new Error(`${method} ${p}: ${j.value.error}: ${String(j.value.message).slice(0, 300)}`);
  return j.value;
}
const exec = (sid, script, args = []) => wd("POST", `/session/${sid}/execute/sync`, { script, args });

const PROBE = `
  let be = null; try { be = GLX.__tlx.backendState(); } catch (e) { be = { error: String(e) }; }
  return { title: document.title, ua: navigator.userAgent, gpu: !!navigator.gpu, backendState: be, w: innerWidth, h: innerHeight, dpr: devicePixelRatio };`;
const BENCH = (n) => `
  const ok = BenchRun.run("paths");
  const s = GameStore.store, p = JSON.parse(s.raw(BenchRun.KEY));
  if (${n} > 0 && ${n} < p.legs.length) { p.legs = p.legs.slice(0, ${n}); s.rawSet(BenchRun.KEY, JSON.stringify(p)); }
  return { ok, legs: p.legs.map((l) => l.path) };`;
const STATE = `
  let p = null; try { p = JSON.parse(GameStore.store.raw("apex26.benchRun")); } catch (_) {}
  if (!p) return { state: "none" };
  let entry = null; try { const t = RaceEntryProfile.stageTable(), s = RaceEntryProfile.snapshot();
    entry = { kind: t.entry, winT0: s.winT0, windowMs: t.windowMs, stages: t.stages.filter((r) => r.ms == null || r.ms >= 50).map((r) => [r.n, r.ms]) }; } catch (_) {}
  return { state: p.state, i: p.i, legs: p.legs.map((l) => l.state), api: (() => { try { return RendererPicker.liveThreeApi(); } catch (_) { return null; } })(),
    entry, result: p.state !== "running" ? p : null };`;

async function shot(sid, name) {
  try { const b = await wd("GET", `/session/${sid}/screenshot`); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(b, "base64")); }
  catch (e) { log("shot " + name + ": " + e.message.slice(0, 120)); }
}
async function drainConsole(sid) {
  try { const rows = await wd("POST", `/session/${sid}/se/log`, { type: "safariConsole" });
    if (Array.isArray(rows) && rows.length) fs.appendFileSync(path.join(OUT, "safariConsole.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  } catch (_) { /* bucket unsupported */ }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { legs: LEGS, url: URL_, perf: PERF, device: process.env.DEVICEFARM_DEVICE_NAME, os: process.env.DEVICEFARM_DEVICE_OS_VERSION };
  let sid = null;
  try {
    report.status = await wd("GET", "/status");
    const caps = { platformName: "iOS", browserName: "Safari", "appium:automationName": "XCUITest", "appium:newCommandTimeout": 600,
      "appium:showSafariConsoleLog": true };
    const open = async (extra) => (await wd("POST", "/session", { capabilities: { alwaysMatch: { ...caps, ...extra }, firstMatch: [{}] } }, 180000)).sessionId;
    // A wedged Web Inspector link never recovers inside its session: drop it and attach a fresh one to the open tab
    // (safariInitialUrl "" skips the welcome-page navigation, so the running benchmark is not interrupted).
    const reattach = async () => {
      try { await wd("DELETE", `/session/${sid}`, undefined, 30000); } catch (_) { /* wedged */ }
      sid = await open({ "appium:safariInitialUrl": "" }); report.reattached = (report.reattached || 0) + 1; log("reattached WebDriver session");
    };
    sid = await open({});
    log("session up");
    try { await wd("POST", `/session/${sid}/orientation`, { orientation: "LANDSCAPE" }); } catch (e) { log("orientation: " + e.message.slice(0, 120)); }
    await wd("POST", `/session/${sid}/url`, { url: URL_ });
    await sleep(20000);
    report.boot = await exec(sid, PROBE);
    log("boot " + JSON.stringify({ gpu: report.boot.gpu, api: report.boot.backendState && report.boot.backendState.api }));
    await shot(sid, "boot.png");
    if (PERF && PERF !== "none") {
      try { await exec(sid, "mobile: startPerfRecord", [{ profileName: PERF, timeout: (LEGS * 4 + 4) * 60000 }]); report.perfStarted = true; log("perf record started: " + PERF); }
      catch (e) { report.perfError = e.message; log("perf start: " + e.message.slice(0, 200)); }
    }
    if (LEGS > 0) {
      report.benchStart = await exec(sid, BENCH(LEGS));
      const entries = report.entries = {}, thermal = report.thermal = [];
      const cap = (LEGS * 4.5 + 3) * 60000, tb = Date.now();
      let last = "", n = 0, fails = 0;
      for (;;) {
        await sleep(4000); n++;
        if (n % 5 === 0) await drainConsole(sid);
        if (n % 15 === 1) { try { const d = await exec(sid, "mobile: deviceInfo"); thermal.push({ t: Math.round((Date.now() - tb) / 1000), thermalState: d && d.thermalState }); } catch (_) { /* no lockdown */ } }
        let st; try { st = await exec(sid, STATE); fails = 0; } catch (e) {
          log("poll: " + e.message.slice(0, 120));
          if (++fails >= 2) { fails = 0; try { await reattach(); } catch (e2) { log("reattach: " + e2.message.slice(0, 120)); } }
          if (Date.now() - tb > cap) { report.benchTimedOut = { reason: "polls failing" }; log("bench cap"); break; }
          continue;
        }
        if (st.entry && st.entry.winT0 && st.entry.windowMs > 0) entries[`${st.i}:${st.api}:${Math.round(st.entry.winT0)}`] = st.entry;
        const line = `${st.state} i=${st.i} api=${st.api} ${JSON.stringify(st.legs)}`;
        if (line !== last) { log(line); last = line; }
        if (st.state !== "running" && st.state !== "none") { report.bench = st.result; break; }
        if (Date.now() - tb > cap) { report.benchTimedOut = st; log("bench cap"); break; }
      }
      await drainConsole(sid);
      await shot(sid, "bench.png");
    }
    if (report.perfStarted) {
      try {
        const b64 = await exec(sid, "mobile: stopPerfRecord", [{ profileName: PERF }]);
        const f = path.join(OUT, PERF.replace(/\s+/g, "-").toLowerCase() + ".trace.zip");
        fs.writeFileSync(f, Buffer.from(b64, "base64")); report.perfFile = path.basename(f); report.perfBytes = fs.statSync(f).size;
        log(`perf trace ${report.perfFile} ${report.perfBytes} bytes`);
      } catch (e) { report.perfStopError = e.message; log("perf stop: " + e.message.slice(0, 200)); }
    }
  } catch (e) {
    report.error = e.message; log("ERROR " + e.message);
  } finally {
    if (sid) try { await wd("DELETE", `/session/${sid}`); } catch (_) { /* gone */ }
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    log("report written");
  }
  if (report.error) process.exit(1);
}
main();
