#!/usr/bin/env node
// @doc CLI, not an MCP tool: start/status/stop a headless Chromium (CDP 9222) plus static server for the js-debugger.
// Usage: node tools/mcp/debug-chrome.mjs start [--port 9222] [--url <page>] [--webgpu] | status | stop
// The debugger MCP never launches Chrome; the parent runs this, attaches, and stops it. Kills only its own PIDs.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromiumPath } from "../lib/chromium-path.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DIR = path.join(ROOT, "artifacts/debug-chrome");
export const PID_FILE = path.join(DIR, "pids.json");
export const PROFILE = path.join(ROOT, "scratch/debug-chrome");
export const SERVER_PORT = 3456;

// headless=new --window-size is the OUTER window: 844x390 gave an 844x198 viewport. The viewport is
// therefore set by a small holder process (Emulation.setDeviceMetricsOverride lives only as long as
// the CDP session that set it) and verified through innerWidth x innerHeight.
export const DEVICES = {
  "phone-landscape": { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, touch: true },
  desktop: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false, touch: false },
};
// The proven cloud-container flags (issue #2534). --webgpu only adds the WebGPU switch.
export function chromeArgs({ port = 9222, url, webgpu = false, device = "phone-landscape" } = {}) {
  const d = DEVICES[device] || DEVICES["phone-landscape"];
  return ["--headless=new", "--no-sandbox", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${PROFILE}`, "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${d.width},${d.height}`,
    ...(webgpu ? ["--enable-unsafe-webgpu"] : []), url || `http://127.0.0.1:${SERVER_PORT}/`];
}
// Refuse beside a Playwright/test-bg run (one browser at a time) or a busy box.
export function refusal({ load = os.loadavg()[0], live = liveRun() } = {}) {
  if (live) return `a browser test run is live (${live}); one browser at a time — wait for it or use node tools/ci/test-bg.mjs --status`;
  if (load >= 3) return `loadavg ${load.toFixed(2)} >= 3; the machine is busy — reap what is running first`;
  return null;
}
export function liveRun() {
  const r = spawnSync("python3", [path.join(ROOT, ".claude/hooks/live-run.py"), ROOT], { encoding: "utf8" });
  return (r.stdout || "").trim() || null;
}
export const readPids = () => { try { return JSON.parse(readFileSync(PID_FILE, "utf8")); } catch { return null; } };
const cmdline = pid => { try { return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " "); } catch { return null; } };
// A recorded PID is ours only while its command line still carries the marker we launched it with.
export const owns = (p, read = cmdline) => (read(p.pid) || "").includes(p.marker);
export function stop({ kill = (pid, sig) => process.kill(pid, sig), read = cmdline, pids = readPids(), wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (!pids) return Promise.resolve({ stopped: [], skipped: [], note: "no pid file; nothing to stop" });
  const stopped = [], skipped = [];
  return (async () => {
    for (const p of pids.procs) {
      if (!owns(p, read)) { skipped.push({ ...p, reason: "pid gone or reused" }); continue; }
      // detached => own process group; the negative pid reaches Chrome's renderer/GPU children.
      try { kill(-p.pid, "SIGTERM"); } catch { try { kill(p.pid, "SIGTERM"); } catch {} }
      stopped.push(p);
    }
    await wait(1500);
    for (const p of stopped) if (owns(p, read)) { try { kill(-p.pid, "SIGKILL"); } catch {} }
    return { stopped, skipped };
  })();
}
// One-shot CDP call on the first page target (read-only use: status/verification).
async function pageSocket(port) {
  const rows = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
  const page = rows.find(t => t.type === "page");
  if (!page) throw Error("no page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(Error("CDP socket error")); });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(Error(m.error.message)) : p.res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => rej(Error(method + " timed out")), 8000); });
  return { send, ws };
}
export async function viewport(port) {
  const { send, ws } = await pageSocket(port);
  try { return (await send("Runtime.evaluate", { expression: 'innerWidth + "x" + innerHeight', returnByValue: true })).result.value; } finally { ws.close(); }
}
// --headless-game (field note, incidents lane): loading or reloading the game with drawing on pegs the
// SwiftShader GPU process. Launch on about:blank, then navigate to the game, then __apex.headless(true)
// the moment it is up (the game URL never renders with drawing on for long).
export const headlessGamePlan = url => [{ navigate: "about:blank" }, { navigate: url },
  { waitFor: 'document.readyState === "complete" && typeof window.__apex === "object"' }, { evaluate: "__apex.headless(true)" }];
async function runPlan(port, plan) {
  const { send, ws } = await pageSocket(port);
  try {
    for (const step of plan) {
      if (step.navigate) { await send("Page.navigate", { url: step.navigate }); await new Promise(r => setTimeout(r, 700)); }
      else if (step.waitFor) {
        let ok = false;
        for (let i = 0; i < 120 && !ok; i++) { ok = (await send("Runtime.evaluate", { expression: step.waitFor, returnByValue: true }).catch(() => ({}))).result?.value === true; if (!ok) await new Promise(r => setTimeout(r, 500)); }
        if (!ok) throw Error("game did not finish loading within 60 s");
      } else await send("Runtime.evaluate", { expression: step.evaluate, returnByValue: true });
    }
  } finally { ws.close(); }
}
// The holder keeps its CDP session open so the override outlives this CLI.
async function hold(port, device) {
  const d = DEVICES[device]; const { send, ws } = await pageSocket(port);
  await send("Emulation.setDeviceMetricsOverride", { width: d.width, height: d.height, deviceScaleFactor: d.deviceScaleFactor, mobile: d.mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: d.touch, maxTouchPoints: d.touch ? 5 : 0 });
  await new Promise(res => { ws.onclose = res; });
}
async function endpointTargets(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
    return (await r.json()).filter(t => t.type === "page").map(t => ({ id: t.id, url: t.url, title: t.title }));
  } catch (e) { return { error: e.cause?.code || e.name }; }
}
const argOf = (args, flag, d) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : d; };
function launch(cmd, args, marker, log) {
  const fd = openSync(path.join(DIR, log), "a");
  const child = spawn(cmd, args, { cwd: ROOT, detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  return { pid: child.pid, marker, cmd: path.basename(cmd), log: path.relative(ROOT, path.join(DIR, log)) };
}
export async function main(args = process.argv.slice(2)) {
  const cmd = args[0] || "help";
  if (cmd === "status") {
    const p = readPids();
    if (!p) { console.log(JSON.stringify({ running: false })); return 0; }
    const live = p.procs.map(x => ({ ...x, alive: owns(x) }));
    const chrome = live.find(x => x.role === "chrome");
    const targets = await endpointTargets(p.port);
    const vp = Array.isArray(targets) && targets.length ? await viewport(p.port).catch(e => `unavailable: ${e.message}`) : null;
    console.log(JSON.stringify({ running: live.some(x => x.alive), chromeAlive: !!chrome?.alive, cdpResponding: Array.isArray(targets), device: p.device,
      viewport: vp, endpoint: `http://127.0.0.1:${p.port}`, procs: live, targets }, null, 2));
    return 0;
  }
  if (cmd === "_hold") { await hold(Number(args[1]), args[2]); return 0; }
  if (cmd === "stop") { const r = await stop(); rmSync(PID_FILE, { force: true }); console.log(JSON.stringify(r, null, 2)); return 0; }
  if (cmd === "start") {
    const port = Number(argOf(args, "--port", 9222)), url = argOf(args, "--url"), webgpu = args.includes("--webgpu"), headlessGame = args.includes("--headless-game"), device = argOf(args, "--device", "phone-landscape");
    if (!DEVICES[device]) throw Error(`--device must be ${Object.keys(DEVICES).join(" or ")}`);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("--port must be 1024-65535");
    if (url) { const u = new URL(url); if (!["127.0.0.1", "localhost"].includes(u.hostname)) throw Error("--url must be a local page"); }
    const existing = readPids();
    if (existing?.procs.some(p => owns(p))) throw Error("already running; use status or stop first");
    const why = refusal(); if (why) throw Error(`refusing to start: ${why}`);
    if (!existsSync(".git") && !existsSync(path.join(ROOT, "index.html"))) throw Error("run from the repo checkout");
    mkdirSync(DIR, { recursive: true }); mkdirSync(PROFILE, { recursive: true });
    const procs = [];
    const serverUp = await fetch(`http://127.0.0.1:${SERVER_PORT}/`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
    if (!serverUp) procs.push({ role: "server", ...launch("python3", ["-m", "http.server", String(SERVER_PORT), "--bind", "127.0.0.1"], `http.server ${SERVER_PORT}`, "server.log") });
    const chrome = chromiumPath();
    procs.push({ role: "chrome", ...launch(chrome, chromeArgs({ port, url: headlessGame ? "about:blank" : url, webgpu, device }), `--remote-debugging-port=${port}`, "chrome.log") });
    writeFileSync(PID_FILE, JSON.stringify({ port, device, startedAt: new Date().toISOString(), procs }, null, 2) + "\n");
    for (let i = 0; i < 60; i++) {
      const t = await endpointTargets(port);
      if (Array.isArray(t) && t.length) {
        procs.push({ role: "holder", ...launch(process.execPath, [fileURLToPath(import.meta.url), "_hold", String(port), device], "debug-chrome.mjs _hold", "holder.log") });
        writeFileSync(PID_FILE, JSON.stringify({ port, device, startedAt: new Date().toISOString(), procs }, null, 2) + "\n");
        let headless = null;
        if (headlessGame) { try { await runPlan(port, headlessGamePlan(url || `http://127.0.0.1:${SERVER_PORT}/`)); headless = true; } catch (e) { headless = `failed: ${e.message}`; } }
        const want = `${DEVICES[device].width}x${DEVICES[device].height}`; let vp = null;
        for (let j = 0; j < 20 && vp !== want; j++) { await new Promise(r => setTimeout(r, 500)); vp = await viewport(port).catch(() => null); }
        console.log(JSON.stringify({ started: true, ...(headlessGame ? { headlessGame: headless } : {}), endpoint: `http://127.0.0.1:${port}`, device, viewport: vp, viewportOk: vp === want, serverReused: serverUp, targets: t, pidFile: path.relative(ROOT, PID_FILE) }, null, 2));
        return vp === want ? 0 : 1;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    await stop(); rmSync(PID_FILE, { force: true });
    throw Error(`Chrome did not expose CDP on ${port} within 30 s (see artifacts/debug-chrome/chrome.log); stopped what it started`);
  }
  console.log(`debug-chrome — own a headless Chromium for the js-debugger (a CLI, not an MCP tool; the debugger never launches Chrome)
  start [--port 9222] [--url http://127.0.0.1:3456/] [--webgpu] [--device phone-landscape|desktop] [--headless-game]   static server (3456) + Chromium; refuses beside a test run or at loadavg >= 3
  status                                                           chromeAlive, viewport (innerWidth x innerHeight), PIDs, page targets
  stop                                                             kills exactly the PIDs in artifacts/debug-chrome/pids.json`);
  return cmd === "help" || cmd === "--help" ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(c => { process.exitCode = c; }).catch(e => { console.error(JSON.stringify({ ok: false, error: e.message })); process.exitCode = 1; });
}
