// No browser: argument building, refusal rules and PID-exact stop for tools/mcp/debug-chrome.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import nodeFs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { chromeArgs, refusal, stop, owns, DEVICES, headlessGamePlan, discoveryFile, browserOccupant } from "../../tools/mcp/debug-chrome.mjs";
import { readLock, lockPayload, reapStaleLock } from "../../tools/mcp/job-admission.mjs";
import { processBirth } from "../../tools/mcp/job-admission.mjs";
const REPO = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "../..");

test("discovery honors an absolute XDG config root without redirecting home", () => {
  assert.equal(discoveryFile({ configHome: "/workspace/runtime-config", home: "/readonly/home" }), "/workspace/runtime-config/chromium/DevToolsActivePort");
  for (const configHome of ["", "relative/config"]) {
    assert.equal(discoveryFile({ configHome, home: "/readonly/home" }), "/readonly/home/.config/chromium/DevToolsActivePort");
  }
});

test("chromeArgs carries the proven flags, the loopback-only address and optional WebGPU", () => {
  const a = chromeArgs({});
  for (const f of ["--headless=new", "--no-sandbox", "--remote-debugging-port=9222", "--remote-debugging-address=127.0.0.1",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=844,390"]) assert.ok(a.includes(f), f);
  assert.ok(a.some(x => x.startsWith("--user-data-dir=") && x.endsWith("scratch/debug-chrome")));
  assert.equal(a.at(-1), "http://127.0.0.1:3456/"); assert.ok(!a.includes("--enable-unsafe-webgpu"));
  const w = chromeArgs({ port: 9333, url: "http://127.0.0.1:3456/x", webgpu: true });
  assert.ok(w.includes("--remote-debugging-port=9333") && w.includes("--enable-unsafe-webgpu")); assert.equal(w.at(-1), "http://127.0.0.1:3456/x");
});
test("start is refused while a test run is live or loadavg >= 3", () => {
  assert.match(refusal({ load: 0.5, live: "123:456 log" }), /test run is live/);
  assert.match(refusal({ load: 3.2, live: null }), /loadavg 3\.20/);
  assert.equal(refusal({ load: 2.9, live: null }), null);
});
test("stop kills exactly its recorded PIDs and skips a reused PID", async () => {
  const pids = { port: 9222, procs: [{ pid: 111, marker: "--remote-debugging-port=9222" }, { pid: 222, marker: "http.server 3456" }] };
  const alive = new Map([[111, "chrome --remote-debugging-port=9222"], [222, "someone else entirely"]]);
  const sent = [];
  const r = await stop({ pids, read: p => alive.get(p) ?? null, kill: (pid, sig) => { sent.push([pid, sig]); if (sig === "SIGTERM") alive.delete(Math.abs(pid)); }, wait: async () => {} });
  assert.deepEqual(sent, [[-111, "SIGTERM"]]); assert.equal(r.stopped.length, 1); assert.equal(r.skipped[0].pid, 222);
  assert.ok(!owns({ pid: 1, marker: "m" }, () => null));
  assert.deepEqual((await stop({ pids: null })).stopped, []);
});
test("CLI help and unknown command do not touch processes", () => {
  assert.equal(spawnSync(process.execPath, ["tools/mcp/debug-chrome.mjs", "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, ["tools/mcp/debug-chrome.mjs", "nope"], { encoding: "utf8" }).status, 1);
  const s = spawnSync(process.execPath, ["tools/mcp/debug-chrome.mjs", "status"], { encoding: "utf8" });
  assert.equal(s.status, 0);
});
test("--device picks the window and the emulated viewport (phone-landscape 844x390 + touch, desktop 1280x720)", () => {
  assert.deepEqual([DEVICES["phone-landscape"].width, DEVICES["phone-landscape"].height, DEVICES["phone-landscape"].mobile, DEVICES["phone-landscape"].touch], [844, 390, true, true]);
  assert.deepEqual([DEVICES.desktop.width, DEVICES.desktop.height, DEVICES.desktop.touch], [1280, 720, false]);
  assert.ok(chromeArgs({ device: "desktop" }).includes("--window-size=1280,720"));
  const r = spawnSync(process.execPath, ["tools/mcp/debug-chrome.mjs", "start", "--device", "tablet"], { encoding: "utf8" });
  assert.equal(r.status, 1); assert.match(r.stderr, /--device must be/);
});
test("--headless-game plan: about:blank, then the game, wait for __apex, then headless(true)", () => {
  const plan = headlessGamePlan("http://127.0.0.1:3456/");
  assert.deepEqual(plan.map(x => Object.keys(x)[0]), ["navigate", "navigate", "waitFor", "evaluate"]);
  assert.equal(plan[0].navigate, "about:blank"); assert.equal(plan[1].navigate, "http://127.0.0.1:3456/"); assert.equal(plan[3].evaluate, "__apex.headless(true)");
});

test("`start --help` prints usage and exits 0 without launching Chromium", async () => {
  const { main } = await import("../../tools/mcp/debug-chrome.mjs");
  const out = [], log = console.log;
  console.log = (...a) => out.push(a.join(" "));
  try { assert.equal(await main(["start", "--help"]), 0); } finally { console.log = log; }
  assert.match(out.join("\n"), /debug-chrome — own a headless Chromium/);
  assert.ok(!out.join("\n").includes('"started"'), "no browser was started");
});

test("phone-landscape sends the iPhone UA (the mobile render tier is UA-driven); desktop sends none", async () => {
  const { IPHONE_UA } = await import("../../tools/mcp/debug-chrome.mjs");
  assert.ok(chromeArgs({}).includes(`--user-agent=${IPHONE_UA}`));
  assert.ok(!chromeArgs({ device: "desktop" }).some(a => a.startsWith("--user-agent=")));
});
test("browser-use discovery file: Chrome's port + path format, removed only while it names our port", async () => {
  const { discoveryText, removeDiscovery, runningEndpoint } = await import("../../tools/mcp/debug-chrome.mjs");
  const { mkdtempSync, writeFileSync, existsSync } = await import("node:fs");
  const os = await import("node:os"); const path = await import("node:path");
  assert.equal(discoveryText(9222, "ws://127.0.0.1:9222/devtools/browser/abc"), "9222\n/devtools/browser/abc\n");
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), "dc-")), "DevToolsActivePort");
  writeFileSync(f, "9333\n/devtools/browser/x\n");
  assert.equal(removeDiscovery(9222, f), false); assert.ok(existsSync(f), "another browser's file stays");
  assert.equal(removeDiscovery(9333, f), true); assert.ok(!existsSync(f));
  const pids = { port: 9222, procs: [{ role: "chrome", pid: 7, marker: "--remote-debugging-port=9222" }] };
  assert.equal(runningEndpoint({ pids, read: () => "chrome --remote-debugging-port=9222" }), "http://127.0.0.1:9222");
  assert.equal(runningEndpoint({ pids, read: () => null }), null);
  assert.equal(runningEndpoint({ pids: null }), null);
});

// ── One browser at a time (W25): the lock carries its holder's start time, reaping is race-safe, and
// apex_debug_chrome start honours the lock and running browser jobs. Node processes only; nothing is launched.
const tmpDir = (prefix) => { nodeFs.mkdirSync(nodePath.join(REPO, "artifacts"), { recursive: true }); return nodeFs.mkdtempSync(nodePath.join(REPO, "artifacts", prefix)); };
test("browser lock: a reused PID is stale, a live stamped holder is held, a legacy lock falls back to liveness", () => {
  const dir = tmpDir("browser-lock-"), lock = nodePath.join(dir, "apex-browser.lock");
  try {
    const mine = lockPayload("t");
    assert.equal(typeof mine.birth, "string");
    nodeFs.writeFileSync(lock, JSON.stringify(mine));
    assert.equal(readLock(lock).held, true);
    nodeFs.writeFileSync(lock, JSON.stringify({ ...mine, birth: mine.birth.replace(/[^:]+$/, "1") }));
    const reused = readLock(lock);
    assert.equal(reused.held, false); assert.equal(reused.stale, true, "same PID, other start time: the holder is gone");
    nodeFs.writeFileSync(lock, JSON.stringify({ pid: process.pid, tool: "legacy" }));
    assert.equal(readLock(lock).held, true, "no birth: liveness only");
    nodeFs.writeFileSync(lock, JSON.stringify({ pid: 2147483646, tool: "dead" }));
    assert.equal(readLock(lock).stale, true);
  } finally { nodeFs.rmSync(dir, { recursive: true, force: true }); }
});
test("browser lock: reaping never removes a lock a new owner wrote after the stale one was judged", () => {
  const dir = tmpDir("browser-lock-"), lock = nodePath.join(dir, "apex-browser.lock");
  try {
    const fresh = JSON.stringify({ pid: process.pid, tool: "new-owner", since: Date.now() });
    nodeFs.writeFileSync(lock, JSON.stringify({ pid: 2147483646, tool: "dead" }));
    // Between the stale read and the removal, another reaper clears it and a new owner takes the lock.
    const alive = (pid) => { if (pid === 2147483646) { nodeFs.rmSync(lock); nodeFs.writeFileSync(lock, fresh); return false; } return true; };
    const r = reapStaleLock(lock, { alive });
    assert.equal(r.reaped, false);
    assert.equal(nodeFs.readFileSync(lock, "utf8"), fresh, "the new owner's lock survives");
    assert.deepEqual(nodeFs.readdirSync(dir), ["apex-browser.lock"], "no aside file left");
    nodeFs.writeFileSync(lock, JSON.stringify({ pid: 2147483646, tool: "dead" }));
    assert.equal(reapStaleLock(lock).reaped, true);
    assert.equal(nodeFs.existsSync(lock), false);
  } finally { nodeFs.rmSync(dir, { recursive: true, force: true }); }
});
test("debug-chrome start refuses while another holder has the lock or a browser job runs", () => {
  const dir = tmpDir("debug-chrome-occ-");
  const lockPath = nodePath.join(dir, "apex-browser.lock"), jobDir = nodePath.join(dir, "jobs");
  nodeFs.mkdirSync(jobDir);
  try {
    assert.equal(browserOccupant({ lockPath, jobDir, ppid: 1 }), null);
    nodeFs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, birth: processBirth(process.pid), tool: "apex_shot" }));
    assert.equal(browserOccupant({ lockPath, jobDir, ppid: 1 }), `the browser lock (scratch/apex-browser.lock) is held by pid ${process.pid} (apex_shot)`);
    assert.equal(browserOccupant({ lockPath, jobDir, ppid: process.pid }), null, "the apex_debug_chrome call that spawned this CLI holds it");
    nodeFs.rmSync(lockPath);
    const id = "hud_shot-t1-1-000000000001";
    const job = { id, kind: "hud_shot", state: "running", browser: true, pid: process.pid, birth: processBirth(process.pid) };
    nodeFs.writeFileSync(nodePath.join(jobDir, `${id}.json`), JSON.stringify(job));
    assert.equal(browserOccupant({ lockPath, jobDir, ppid: 1 }), `browser job hud_shot-t1-1-000000000001 is running (pid ${process.pid}); apex_job_status / apex_job_cancel it first`);
    nodeFs.writeFileSync(nodePath.join(jobDir, `${id}.json`), JSON.stringify({ ...job, birth: job.birth.replace(/[^:]+$/, "1") }));
    assert.equal(browserOccupant({ lockPath, jobDir, ppid: 1 }), null, "a reused PID is not a running job");
    nodeFs.writeFileSync(nodePath.join(jobDir, `${id}.json`), JSON.stringify(job));
    nodeFs.writeFileSync(nodePath.join(jobDir, `${id}.exit`), "0");
    assert.equal(browserOccupant({ lockPath, jobDir, ppid: 1 }), null, "a recorded exit frees it");
  } finally { nodeFs.rmSync(dir, { recursive: true, force: true }); }
});
test("apex_debug_chrome start takes the browser lock; status and stop stay tree", () => {
  const lock = nodePath.join(REPO, "scratch", "apex-browser.lock");
  nodeFs.mkdirSync(nodePath.dirname(lock), { recursive: true });
  nodeFs.writeFileSync(lock, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    const call = (args) => JSON.parse(spawnSync(process.execPath, [nodePath.join(REPO, "tools/mcp/apex-tools-mcp.mjs"), "call", "apex_debug_chrome", JSON.stringify(args)],
      { cwd: REPO, encoding: "utf8", env: { ...process.env, APEX_MCP_MOCK: "0", APEX_MCP_PS: "" }, timeout: 15000 }).stdout);
    assert.equal(call({ action: "start", dryRun: true }).error, "lock_held");
    for (const action of ["status", "stop"]) assert.equal(call({ action, dryRun: true }).ok, true, action);
  } finally { nodeFs.rmSync(lock, { force: true }); }
});
