#!/usr/bin/env node
// @doc AWS Device Farm: cold boot to menu-interactive time of the live game in Safari on a real iPhone.
// Cold boot -> menu-interactive on a real iPhone through AWS Device Farm (remote access + Appium), no race entry.
// It drives the same session the sibling devicefarm-iphone.mjs does, but only loads the page and reads the browser's own
// timings: Navigation Timing, Paint Timing, Resource Timing (which file, how big, cached or not, when it finished) and
// the moment the game reports state "menu". Each trial is one of: first (fresh Safari), reload (same process, HTTP cache
// warm), relaunch (Safari force-quit, disk cache warm).
//
//   node tools/perf/devicefarm-boot.mjs --device "iPhone 14" [--trials 3] [--url URL] [--max-min 25] [--out DIR]
//   node tools/perf/devicefarm-boot.mjs --self-test      # no AWS: checks the page-side probes against a local page
//
// Credentials come only from the environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION), read by
// the aws CLI (APEX_AWS_CLI, else `aws` on PATH). Nothing here prints them or the endpoint URL. Device minutes are metered
// ($0.17 each): the session is always stopped in `finally`, and --max-min bounds the wall time of the whole run.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
  const a = ["-sS", "-X", method, "--max-time", "120", "-H", "Content-Type: application/json", base + p];
  if (body !== undefined) a.push("--data-binary", JSON.stringify(body));
  const out = execFileSync("curl", a, { encoding: "utf8", maxBuffer: 64 << 20 });
  let j; try { j = JSON.parse(out); } catch (_) { throw new Error(`${method} ${p}: non-JSON reply ${out.slice(0, 200)}`); }
  if (j && j.value && j.value.error) throw new Error(`${method} ${p}: ${j.value.error}: ${String(j.value.message).slice(0, 300)}`);
  return j.value;
}
const withApex = (u) => (/[?&]apex=1/.test(u) ? u : u + (u.includes("?") ? "&" : "?") + "apex=1");

// ---- page-side probes (function bodies for WebDriver execute/sync) -------------------------------------------------
// Cheap poll: is the game on the menu yet, and what time is it on the page's own clock (ms since navigation start).
export const POLL = `
  let st = null; try { st = window.__apex && __apex.info ? __apex.info().state : null; } catch (_) {}
  const ov = document.getElementById("overlay");
  return { t: performance.now(), rs: document.readyState, st,
    ovShown: !!(ov && !ov.hidden && ov.offsetParent !== null), res: performance.getEntriesByType("resource").length };`;
// Full dump once the menu is up: what the browser measured, with no interpretation.
export const DUMP = `
  const r = (x) => (x == null ? null : Math.round(x));
  const nav = performance.getEntriesByType("navigation")[0];
  const navOut = nav ? { type: nav.type, start: r(nav.startTime), fetchStart: r(nav.fetchStart), responseStart: r(nav.responseStart),
    responseEnd: r(nav.responseEnd), domInteractive: r(nav.domInteractive), dclEnd: r(nav.domContentLoadedEventEnd),
    loadEnd: r(nav.loadEventEnd), transfer: nav.transferSize, protocol: nav.nextHopProtocol } : null;
  const paint = {}; for (const p of performance.getEntriesByType("paint")) paint[p.name] = r(p.startTime);
  const res = performance.getEntriesByType("resource").map((e) => ({ n: e.name.replace(location.origin, "").slice(0, 90), t: e.initiatorType,
    s: r(e.startTime), end: r(e.responseEnd), d: r(e.duration), xfer: e.transferSize, body: e.encodedBodySize, dec: e.decodedBodySize }));
  const sum = (f) => res.filter(f).reduce((a, e) => a + (e.xfer || 0), 0);
  const cached = res.filter((e) => e.xfer === 0 && e.body > 0).length;
  const byType = {};
  for (const e of res) { const k = e.n.split("?")[0].split(".").pop() || "other"; const b = byType[k] || (byType[k] = { n: 0, xfer: 0, dec: 0 }); b.n++; b.xfer += e.xfer || 0; b.dec += e.dec || 0; }
  const lastEnd = res.reduce((m, e) => Math.max(m, e.end || 0), 0);
  const slowest = res.slice().sort((a, b) => (b.end - b.s) - (a.end - a.s)).slice(0, 12);
  const latest = res.slice().sort((a, b) => b.end - a.end).slice(0, 8);
  const marks = performance.getEntriesByType("mark").map((m) => [m.name, r(m.startTime)]);
  let build = null, api = null, errors = null;
  try { build = window.__apex && __apex.info ? __apex.info().build || null : null; } catch (_) {}
  try { api = RendererPicker.liveThreeApi(); } catch (_) {}
  try { errors = (window.__apexErrors || []).length; } catch (_) {}
  return { nowMs: r(performance.now()), nav: navOut, paint, counts: { res: res.length, cached, xfer: sum(() => true) }, byType, lastEnd,
    slowest, latest, marks, api, build, errors, sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    mem: (performance.memory && performance.memory.usedJSHeapSize) || null };`;

// ---- Appium ----------------------------------------------------------------------------------------------------------
const CAPS = { platformName: "iOS", browserName: "Safari", "appium:automationName": "XCUITest", "appium:newCommandTimeout": 300 };
async function exec(ctx, script, tries = 2) {
  for (let t = 1; ; t++) {
    try { return wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script, args: [] }); }
    catch (e) { if (t >= tries) throw e; await sleep(1500); }
  }
}
function newSession(ctx) {
  ctx.sid = wd(ctx.base, "POST", "/session", { capabilities: { alwaysMatch: CAPS, firstMatch: [{}] } }).sessionId;
  try { wd(ctx.base, "POST", `/session/${ctx.sid}/orientation`, { orientation: "LANDSCAPE" }); } catch (_) { /* keep portrait */ }
}
function killSafari(ctx) {
  try { wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: terminateApp", args: [{ bundleId: "com.apple.mobilesafari" }] }); } catch (e) { log("terminate: " + e.message.slice(0, 100)); }
  try { wd(ctx.base, "DELETE", `/session/${ctx.sid}`); } catch (_) { /* gone with Safari */ }
  newSession(ctx);
}
// One timed load. `go` starts the navigation; the wall clock t0 is taken just before it, so wallMs includes the Appium
// round trips (~0.3-1 s) while pageMs is the page's own performance.now() at the first poll that saw state "menu".
async function timedBoot(ctx, label, go, capMs = 150000) {
  const t0 = Date.now();
  go();
  const samples = [];
  let menu = null;
  for (;;) {
    let p = null;
    try { p = await exec(ctx, POLL, 1); } catch (_) { /* page is navigating */ }
    if (p) {
      samples.push([Date.now() - t0, Math.round(p.t), p.rs, p.st, p.ovShown, p.res]);
      if (p.st === "menu" && p.ovShown) { menu = { wallMs: Date.now() - t0, pageMs: Math.round(p.t) }; break; }
    }
    if (Date.now() - t0 > capMs) break;
    await sleep(250);
  }
  const dump = menu ? await exec(ctx, DUMP) : null;
  let thermal = null;
  try { const d = wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: deviceInfo", args: [] }); thermal = d && d.thermalState; } catch (_) { /* optional */ }
  log(`${label}: ${menu ? `menu at page ${menu.pageMs} ms (wall ${menu.wallMs}); fcp ${dump.paint["first-contentful-paint"]}; load ${dump.nav && dump.nav.loadEnd}; res ${dump.counts.res} (cached ${dump.counts.cached}); thermal ${thermal}` : "NO MENU within cap"}`);
  return { label, menu, thermal, dump, samples: samples.length > 60 ? samples.filter((_, i) => i % 3 === 0) : samples };
}

async function main() {
  const want = opt("device", "iPhone 14"), trials = Number(opt("trials", "3")), maxMin = Number(opt("max-min", "25"));
  const url = withApex(opt("url", SITE));
  const out = opt("out", path.join("artifacts", "devicefarm", "boot-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)));
  fs.mkdirSync(out, { recursive: true });
  const phones = aws("devicefarm", "list-devices", "--filters", "attribute=PLATFORM,operator=EQUALS,values=IOS", "attribute=FORM_FACTOR,operator=EQUALS,values=PHONE").devices;
  const dev = phones.find((d) => d.name === want || d.name.endsWith(" " + want));
  if (!dev) throw new Error(`no iOS phone named ${want}`);
  if (/18 Pro Max/.test(dev.name)) throw new Error("the 18 Pro Max is reserved for other lanes");
  const proj = aws("devicefarm", "list-projects").projects.find((p) => p.name === PROJECT);
  log(`device ${dev.name} iOS ${dev.os}; trials ${trials}; cap ${maxMin} min`);
  const ses = aws("devicefarm", "create-remote-access-session", "--project-arn", proj.arn, "--device-arn", dev.arn,
    "--name", "apex-boot-" + Date.now(), "--configuration", JSON.stringify({ parameters: { "appium:version": "3" } })).remoteAccessSession;
  const report = { device: dev.name, os: dev.os, url, startedAt: new Date().toISOString(), sessionArn: ses.arn, trials: [] };
  const ctx = { base: null, sid: null };
  const tStart = Date.now(), over = () => Date.now() - tStart > maxMin * 60000;
  try {
    const tq = Date.now();
    for (let t = 0; ; t++) {
      const s = aws("devicefarm", "get-remote-access-session", "--arn", ses.arn).remoteAccessSession;
      if (s.status === "RUNNING" && s.endpoints && s.endpoints.remoteDriverEndpoint) { ctx.base = s.endpoints.remoteDriverEndpoint.replace(/\/$/, ""); break; }
      if (/COMPLETED|STOPPING|ERRORED|FAILED/.test(s.status) || Date.now() - tq > 30 * 60000) throw new Error(`session ${s.status} ${s.result || ""}`);
      if (t % 6 === 0) log(`session ${s.status}`);
      await sleep(5000);
    }
    report.queuedMs = Date.now() - tq;
    newSession(ctx);
    try { const d = wd(ctx.base, "POST", `/session/${ctx.sid}/execute/sync`, { script: "mobile: deviceInfo", args: [] }); report.unit = String((d && d.uuid) || "").slice(0, 8) || null; } catch (_) { report.unit = null; }
    log(`session up; unit ${report.unit}`);
    for (let i = 1; i <= trials && !over(); i++) {
      // first: a fresh Safari process loads the URL; reload: same process, HTTP cache warm; relaunch: Safari killed, disk cache warm
      killSafari(ctx);
      report.trials.push({ i, ...(await timedBoot(ctx, `t${i} first`, () => wd(ctx.base, "POST", `/session/${ctx.sid}/url`, { url }))) , kind: "first" });
      if (over()) break;
      report.trials.push({ i, ...(await timedBoot(ctx, `t${i} reload`, () => { exec(ctx, "setTimeout(() => location.reload(), 30); return true;").catch(() => {}); }, 120000)), kind: "reload" });
      fs.writeFileSync(path.join(out, "boot.json"), JSON.stringify(report, null, 2));
    }
    if (over()) log(`run cap of ${maxMin} min reached`);
  } catch (e) {
    report.error = e.message; log("ERROR " + e.message);
  } finally {
    if (ctx.sid) try { wd(ctx.base, "DELETE", `/session/${ctx.sid}`); } catch (_) { /* gone */ }
    try { aws("devicefarm", "stop-remote-access-session", "--arn", ses.arn); } catch (e) { log("stop: " + e.message.slice(0, 160)); }
    for (let t = 0; t < 24; t++) {
      const s = aws("devicefarm", "get-remote-access-session", "--arn", ses.arn).remoteAccessSession;
      report.session = { status: s.status, result: s.result, deviceMinutes: s.deviceMinutes };
      if (s.status === "COMPLETED") break;
      await sleep(5000);
    }
    log("session " + JSON.stringify(report.session));
    fs.writeFileSync(path.join(out, "boot.json"), JSON.stringify(report, null, 2));
    log(`report ${path.join(out, "boot.json")}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  if (args.includes("--self-test")) {
    for (const [n, s] of [["POLL", POLL], ["DUMP", DUMP]]) { new Function(s); process.stdout.write(`${n}: parses as a function body\n`); }
  } else main().catch((e) => { process.stderr.write(String(e.message || e) + "\n"); process.exitCode = 1; });
}
