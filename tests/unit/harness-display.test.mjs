/**
 * Dead DISPLAY must not poison headless SwiftShader WebGL.
 * Measured 2026-09-10 on Cloud: DISPLAY=:1 with no /tmp/.X11-unix/X1 made
 * canvas.getContext("webgl2") return null, so game.js never finished and
 * garage-angles timed out waiting for __apex. Unsetting the var restored GL.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const harnessPath = join(ROOT, "tools/lib/harness.mjs");

test("harness exports display helpers and clears a dead DISPLAY for headless", async () => {
  const src = readFileSync(harnessPath, "utf8");
  assert.match(src, /export function displaySocketAlive/, "probe X11 socket before launch");
  assert.match(src, /export function clearDeadDisplay/, "shared clear for shot tools");
  assert.match(src, /clearDeadDisplay\(\{ headed/, "launchChromium must call it (not just declare it)");
  assert.match(src, /\/tmp\/\.X11-unix\/X/, "local :N displays use the unix socket");

  const { displaySocketAlive, clearDeadDisplay, x11SocketPath } =
    await import(pathToFileURL(harnessPath).href);

  assert.equal(x11SocketPath(":1"), "/tmp/.X11-unix/X1");
  assert.equal(x11SocketPath("localhost:0.0"), null, "remote DISPLAY left alone");
  assert.equal(displaySocketAlive(""), false);
  assert.equal(displaySocketAlive(undefined), displaySocketAlive(process.env.DISPLAY),
    "an omitted display probes the process environment");

  const env = { DISPLAY: ":1" };
  const logs = [];
  const cleared = clearDeadDisplay({
    headed: false,
    env,
    socketAlive: () => false,
    log: (m) => logs.push(m),
  });
  assert.equal(cleared, true);
  assert.equal(env.DISPLAY, undefined);
  assert.match(logs.join("\n"), /DISPLAY=:1/);

  const kept = { DISPLAY: ":1" };
  assert.equal(clearDeadDisplay({
    headed: true,
    env: kept,
    socketAlive: () => false,
  }), false, "headed launches need a real X — do not clear");
  assert.equal(kept.DISPLAY, ":1");

  const alive = { DISPLAY: ":0" };
  assert.equal(clearDeadDisplay({
    headed: false,
    env: alive,
    socketAlive: () => true,
  }), false);
  assert.equal(alive.DISPLAY, ":0");

  const forced = { DISPLAY: ":1", APEX_KEEP_DISPLAY: "1" };
  assert.equal(clearDeadDisplay({
    headed: false,
    env: forced,
    socketAlive: () => false,
  }), false, "APEX_KEEP_DISPLAY opts out");
  assert.equal(forced.DISPLAY, ":1");
});

test("chromiumArgsForBackend pins unsafe SwiftShader for GLX/TLX", () => {
  const src = readFileSync(join(ROOT, "tools/shot/probe-page.mjs"), "utf8");
  assert.match(src, /--enable-unsafe-swiftshader/,
    "Chromium 1xx blocks SwiftShader WebGL without this flag");
  assert.match(src, /gotoGameBootDiag|__apex never appeared/,
    "boot timeout must name WebGL / DISPLAY, not a bare waitForFunction");
});

function fakeChromium({ hang = false, connectFails = false } = {}) {
  const calls = [], browser = new EventEmitter();
  const child = { pid: 12345, exitCode: null, signalCode: null,
    kill: (signal) => { calls.push(["child.kill", signal]); child.signalCode = signal; } };
  browser.close = async (...args) => { calls.push(["browser.close", ...args]); if (hang) await new Promise(() => {}); browser.emit("disconnected"); };
  const owner = { process: () => child, wsEndpoint: () => "ws://127.0.0.1/fixture",
    close: async () => { calls.push(["owner.close"]); child.exitCode = 0; },
    kill: async () => { calls.push(["owner.kill"]); child.signalCode = "SIGKILL"; } };
  return { browser, child, calls, chromium: {
    launchServer: async (opts) => { calls.push(["launchServer", opts]); return owner; },
    connect: async (url, opts) => { calls.push(["connect", url, opts]); if (connectFails) throw new Error("connection failed"); return browser; },
  }, kill: (...args) => { calls.push(["process.kill", ...args]); child.signalCode = args[1]; } };
}

test("owned BrowserServer returns Browser API, preserves close options and reports selection", async () => {
  const { launchChromium, chromiumLaunchInfo } = await import(pathToFileURL(harnessPath).href);
  const f = fakeChromium();
  const browser = await launchChromium({ executablePath: "/fixture/chrome", browserFlavor: "full" }, f);
  assert.equal(browser, f.browser);
  const launch = f.calls.find(([name]) => name === "launchServer")[1];
  assert.equal(launch.executablePath, "/fixture/chrome"); assert.equal(launch.host, "127.0.0.1");
  assert.equal(launch.browserFlavor, undefined); assert.equal(launch.handleSIGTERM, false);
  assert.equal(chromiumLaunchInfo(browser).source, "option:executablePath");
  assert.equal(chromiumLaunchInfo(browser).requestedFlavor, "chromium");
  await browser.close({ reason: "unit test finished" });
  assert.deepEqual(f.calls.find(([name]) => name === "browser.close"), ["browser.close", { reason: "unit test finished" }]);
  assert.equal(f.calls.filter(([name]) => name === "owner.close").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "process.kill").length, 0);
});

test("hung direct Browser.close and shutdown retain the owned group until bounded force", async () => {
  const { launchChromium, shutdown } = await import(pathToFileURL(harnessPath).href);
  const f = fakeChromium({ hang: true });
  const browser = await launchChromium({ executablePath: "/fixture/chrome" }, { ...f, closeTimeoutMs: 10 });
  const close = browser.close();
  await Promise.all([close, shutdown()]);
  assert.equal(f.calls.filter(([name]) => name === "browser.close").length, 1);
  assert.deepEqual(f.calls.find(([name]) => name === "process.kill"), ["process.kill", -12345, "SIGKILL"]);
  assert.ok(f.calls.some(([name]) => name === "owner.kill"));
});

test("failed connect and unexpected disconnect close BrowserServer ownership", async () => {
  const { launchChromium, shutdown } = await import(pathToFileURL(harnessPath).href);
  const failed = fakeChromium({ connectFails: true });
  await assert.rejects(launchChromium({ executablePath: "/fixture/chrome" }, failed), /connection failed/);
  assert.equal(failed.calls.filter(([name]) => name === "owner.close").length, 1);
  const f = fakeChromium();
  const browser = await launchChromium({ executablePath: "/fixture/chrome" }, f);
  browser.emit("disconnected");
  await shutdown();
  assert.equal(f.calls.filter(([name]) => name === "owner.close").length, 1);
});

test("shutdown during server launch reaps a late owner instead of returning an orphan", async () => {
  const { launchChromium, shutdown } = await import(pathToFileURL(harnessPath).href);
  const f = fakeChromium();
  const original = f.chromium.launchServer;
  let resume;
  f.chromium.launchServer = async (opts) => { await new Promise((resolve) => { resume = resolve; }); return original(opts); };
  const launching = launchChromium({ executablePath: "/fixture/chrome" }, f);
  await shutdown(); resume();
  await assert.rejects(launching, /acquisition interrupted/);
  assert.equal(f.calls.filter(([name]) => name === "owner.close").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "connect").length, 0);
});

test("snapshot cache pins immutable bytes, keeps absolute requests consistent and rejects unread edits", async () => {
  const { startStaticServer } = await import(pathToFileURL(harnessPath).href);
  const dir = mkdtempSync(join(ROOT, "scratch", "server-snapshot-"));
  mkdirSync(join(dir, "assets"));
  const assetA = ["assets", "a.js"].join("/"), assetB = ["assets", "b.js"].join("/");
  writeFileSync(join(dir, "index.html"), "<script src='" + assetA + "?v=dev'></script>");
  writeFileSync(join(dir, "assets", "a.js"), "old bytes");
  writeFileSync(join(dir, "assets", "b.js"), "unread bytes");
  let server;
  try {
    server = await startStaticServer(dir, { immutableAssets: { namespace: "fixture-v1" } });
    assert.match(server.snapshotUrl, /\/__apex_snapshot\/fixture-v1\/$/);
    const response = await fetch(server.snapshotUrl + assetA + "?v=dev");
    assert.equal(await response.text(), "old bytes");
    assert.equal(response.headers.get("content-type"), "application/javascript; charset=utf-8");
    assert.match(response.headers.get("cache-control"), /immutable/);
    const etag = response.headers.get("etag"); assert.ok(etag);
    writeFileSync(join(dir, "assets", "a.js"), "edited bytes");
    writeFileSync(join(dir, "assets", "b.js"), "edited unread bytes");
    const absolute = await fetch(server.url + assetA + "?v=dev");
    assert.equal(await absolute.text(), "old bytes"); assert.equal(absolute.headers.get("cache-control"), "no-store");
    const edited = await fetch(server.snapshotUrl + assetB);
    assert.equal(edited.status, 409); assert.equal(edited.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(server.snapshotUrl + assetA, { headers: { "If-None-Match": etag } })).status, 304);
    assert.equal((await fetch(server.snapshotUrl + assetA, { method: "HEAD" })).headers.get("content-length"), "9");
    assert.equal((await fetch(server.url + "__apex_snapshot/wrong/" + assetA)).status, 404);
    await server.close();
    server = await startStaticServer(dir);
    const live = await fetch(server.url + assetA);
    assert.equal(await live.text(), "edited bytes"); assert.equal(live.headers.get("cache-control"), "no-store");
    assert.equal(server.snapshotUrl, null);
  } finally { await server?.close(); rmSync(dir, { recursive: true, force: true }); }
});


test("explicit launch environments clear dead local DISPLAY without mutating caller state", async () => {
  const { launchChromium } = await import(pathToFileURL(harnessPath).href);
  const f = fakeChromium(), env = { DISPLAY: ":9999999", APEX_KEEP_DISPLAY: "0", PATH: "/fixture/bin" };
  const browser = await launchChromium({ executablePath: "/fixture/chrome", env }, f);
  const launch = f.calls.find(([name]) => name === "launchServer")[1];
  assert.equal(launch.env.DISPLAY, undefined);
  assert.equal(launch.env.PATH, env.PATH); assert.equal(env.DISPLAY, ":9999999");
  await browser.close();
  const kept = fakeChromium();
  const headed = await launchChromium({ executablePath: "/fixture/chrome", headless: false, env }, kept);
  assert.equal(kept.calls.find(([name]) => name === "launchServer")[1].env.DISPLAY, env.DISPLAY);
  await headed.close();
});

test("a hanging Browser close remains owned and shutdown kills its process group", async () => {
  const { spawn } = await import("node:child_process");
  const { once } = await import("node:events");
  const { trackBrowserOwner, shutdown } = await import(pathToFileURL(harnessPath).href);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
  await once(child, "spawn");
  const exited = once(child, "exit");
  let ownerClosed = false;
  const browser = trackBrowserOwner({ close: () => new Promise(() => {}) }, {
    process: () => child, close: async () => { ownerClosed = true; },
  });
  browser.close();
  try {
    await shutdown();
    const [, signal] = await exited;
    assert.equal(signal, "SIGKILL");
    assert.equal(ownerClosed, false, "hung browser close never reaches graceful owner close");
  } finally { if (child.exitCode == null && child.signalCode == null) process.kill(-child.pid, "SIGKILL"); }
});

test("graceful Browser close closes the supported process owner too", async () => {
  const { trackBrowserOwner, shutdown } = await import(pathToFileURL(harnessPath).href);
  const calls = [];
  const browser = trackBrowserOwner({ close: async options => calls.push(options.reason) }, {
    close: async () => calls.push("owner"), process: () => ({ exitCode: 0 }),
  });
  await browser.close({ reason: "finished" });
  await shutdown();
  assert.deepEqual(calls, ["finished", "owner"]);
});
