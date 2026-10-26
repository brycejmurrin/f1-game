// No browser: argument building, refusal rules and PID-exact stop for tools/mcp/debug-chrome.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chromeArgs, refusal, stop, owns, DEVICES, headlessGamePlan, discoveryFile } from "../../tools/mcp/debug-chrome.mjs";

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
