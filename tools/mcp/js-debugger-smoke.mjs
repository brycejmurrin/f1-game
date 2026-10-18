#!/usr/bin/env node
// @doc Parent-only native Chromium smoke for js-debugger-mcp's real stdio/CDP debugging workflow.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { mkdir, writeFile, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { chromiumPath } from "../lib/chromium-path.mjs";
import { acquireLock, releaseLock } from "./apex-tools-mcp.mjs";
import { debuggerRequest } from "./js-debugger-http.mjs";

if (process.argv.includes("--help")) {
  process.stdout.write("node tools/mcp/js-debugger-smoke.mjs\nParent only. One native Chromium, debugger MCP stdio and CDP, no GPU test.\n"); process.exit(0);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(ROOT, "artifacts/js-debugger");
await mkdir(out, { recursive: true });
const busy = acquireLock("js-debugger-smoke");
if (busy) throw Error(JSON.stringify(busy));
const source = `window.fixtureEvents = [];
window.fixture = function outer() {
  const obj = {value: 41, get tricky() { window.getterReads++; return 99; }};
  let answer = obj.value;
  answer = inner(answer);
  return answer;
};
function inner(n) {
  const doubled = n + 1;
  return doubled;
}
window.getterReads = 0;
`;
const server = createServer((req, res) => {
  res.setHeader("Content-Type", req.url === "/fixture.js" ? "text/javascript" : "text/html");
  res.end(req.url === "/fixture.js" ? source : '<!doctype html><title>Debugger fixture</title><script src="/fixture.js"></script>');
});
let chrome, browser, mcp, httpDaemon;
const pending = new Map(), checks = [];
let id = 0;
const check = (name, fn) => { fn(); checks.push(name); };
try {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(path.join(out, "chrome-"));
  chrome = spawn(chromiumPath(), ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const browserWs = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(Error("Chrome endpoint timeout")), 15000);
    chrome.stderr.on("data", b => {
      stderr += b; const found = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (found) { clearTimeout(timer); resolve(found[1]); }
    });
    chrome.once("error", e => { clearTimeout(timer); reject(e); });
    chrome.once("exit", code => { clearTimeout(timer); reject(Error(`Chrome exited ${code}`)); });
  });
  const endpoint = `http://${new URL(browserWs).host}`;
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts()[0].pages()[0]; await page.goto(url);
  function startMcp() {
    mcp = spawn(process.execPath, ["tools/mcp/js-debugger-mcp.mjs"], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    mcp.stderr.on("data", b => process.stderr.write(b));
    const reader = createInterface({ input: mcp.stdout });
    reader.on("line", line => {
      const msg = JSON.parse(line), p = pending.get(msg.id);
      if (!p) return; pending.delete(msg.id); clearTimeout(p.timer);
      if (msg.error) p.reject(Error(msg.error.message)); else p.resolve(msg.result);
    });
  }
  startMcp();
  function rpc(method, params) {
    const next = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(next); reject(Error(`${method} timeout`)); }, 10000);
      pending.set(next, { resolve, reject, timer }); mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: next, method, params }) + "\n");
    });
  }
  async function call(name, args = {}, errorExpected = false) {
    const r = await rpc("tools/call", { name, arguments: args });
    assert.equal(!!r.isError, errorExpected, JSON.stringify(r)); return r.structuredContent;
  }
  async function until(predicate) {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const state = await call("debugger_state"); if (predicate(state)) return state;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error("Expected debugger state did not arrive");
  }
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "native-smoke", version: "1" } });
  check("stdio initialize and tool discovery", () => assert.equal(init.serverInfo.name, "js-debugger-mcp"));
  assert.equal((await rpc("tools/list")).tools.length, 19);
  const target = (await call("debugger_targets", { endpoint })).targets.find(t => t.url === url + "/"); assert.ok(target);
  await call("debugger_attach", { endpoint, targetId: target.id });
  const script = (await call("debugger_scripts", { filter: "fixture.js" })).scripts[0]; assert.ok(script);
  const src = await call("debugger_source", { scriptId: script.scriptId, startLine: 3, count: 3 });
  check("parsed scripts and one-based source excerpts", () => assert.match(src.source, /5:   answer = inner/));
  const bp = await call("debugger_breakpoint", { url: url + "/fixture.js", line: 5 });
  assert.equal(bp.locations[0].line, 5);
  assert.ok(bp.locations[0].column >= 1);
  await call("debugger_run", { expression: "window.finalResult = fixture()" });
  let state = await until(s => s.paused); const first = state.pause.token;
  check("breakpoint pauses pending evaluation", () => { assert.equal(state.pause.frames[0].line, 5); assert.equal(state.operations[0].status, "paused"); });
  const evalArgs = { pauseToken: first, expression: "answer" };
  check("paused frame local evaluation", () => {});
  assert.equal((await call("debugger_evaluate", evalArgs)).result.value, 41);
  const obj = (await call("debugger_evaluate", { pauseToken: first, expression: "obj" })).result;
  const props = await call("debugger_properties", { pauseToken: first, objectId: obj.objectId });
  check("property descriptors do not invoke getters", () => assert.ok(props.properties.find(p => p.name === "tricky").get));
  assert.equal((await call("debugger_evaluate", { pauseToken: first, expression: "window.getterReads" })).result.value, 0);
  await call("debugger_evaluate", { pauseToken: first, expression: "window.getterReads++" }, true);
  check("default evaluation blocks side effects", () => {});
  await call("debugger_evaluate", { pauseToken: first, expression: "window.getterReads = 7", allowSideEffects: true });
  assert.equal((await call("debugger_evaluate", { pauseToken: first, expression: "window.getterReads" })).result.value, 7);
  await call("debugger_evaluate", { pauseToken: first, expression: '(()=>{throw Error("probe")})()' }, true);
  check("explicit mutation and thrown expression", () => {});
  await call("debugger_control", { action: "into", pauseToken: first });
  state = await until(s => s.paused && s.pause.token !== first);
  check("step into reaches inner frame", () => assert.equal(state.pause.frames[0].functionName, "inner"));
  const second = state.pause.token; await call("debugger_evaluate", evalArgs, true);
  await call("debugger_control", { action: "over", pauseToken: second });
  state = await until(s => s.paused && s.pause.token !== second);
  assert.equal((await call("debugger_evaluate", { pauseToken: state.pause.token, expression: "doubled" })).result.value, 42);
  check("step over advances locals, old pause rejected", () => {});
  const third = state.pause.token; await call("debugger_control", { action: "out", pauseToken: third });
  state = await until(s => s.paused && s.pause.token !== third);
  check("step out returns to outer frame", () => assert.equal(state.pause.frames[0].functionName, "outer"));
  await call("debugger_control", { action: "resume", pauseToken: state.pause.token });
  await until(s => s.operations[0].status === "completed"); assert.equal(await page.evaluate(() => window.finalResult), 42);
  check("resume completes original pending evaluation", () => {});
  await page.reload(); await call("debugger_evaluate", evalArgs, true);
  await call("debugger_run", { expression: "window.finalResult = fixture()" });
  state = await until(s => s.paused);
  check("URL breakpoint survives reload; old handles expire", () => assert.ok(state.pause.hitBreakpoints.includes(bp.id)));
  check("reloaded breakpoint reports the current parsed script instead of an expired ID", () => {
    const locations = state.breakpoints.find(b => b.id === bp.id).locations;
    assert.ok(locations.some(p => p.scriptId === state.pause.frames[0].scriptId && p.line === state.pause.frames[0].line));
    assert.ok(locations.every(p => p.scriptId !== script.scriptId));
  });
  await call("debugger_remove_breakpoint", { id: bp.id });
  await call("debugger_control", { action: "resume", pauseToken: state.pause.token });
  await until(s => s.operations.at(-1).status === "completed");
  await call("debugger_exceptions", { state: "all" });
  await call("debugger_run", { expression: 'try { throw Error("caught") } catch(e) { window.caught = true; }' });
  state = await until(s => s.paused); assert.equal(state.pause.reason, "exception");
  await call("debugger_control", { action: "resume", pauseToken: state.pause.token });
  await until(s => s.operations.at(-1).status === "completed");
  await call("debugger_exceptions", { state: "uncaught" });
  // A direct inspector evaluation catches its own exception for the CDP
  // response. Use a real task to exercise an uncaught page exception.
  await call("debugger_run", { expression: 'setTimeout(() => { throw Error("uncaught") }, 0)' });
  state = await until(s => s.paused); assert.equal(state.pause.reason, "exception");
  await call("debugger_control", { action: "resume", pauseToken: state.pause.token });
  await until(s => s.operations.at(-1).status === "completed");
  check("caught and uncaught exception pauses", () => {});
  await call("debugger_run", { expression: '"x".repeat(200000)' });
  state = await until(s => s.operations.at(-1).status === "completed");
  check("large results cannot hide debugger state", () => assert.equal(state.operations.at(-1).result.truncated, true));
  await call("debugger_run", { expression: "Promise.resolve(42)", awaitPromise: true });
  state = await until(s => s.operations.at(-1).status === "completed");
  check("async execution result", () => assert.equal(state.operations.at(-1).result.result.value, 42));
  // T1/A1-A4/T5: scripts filter, non-pausing logpoint, exception log, listener and instance counts.
  const named = await call("debugger_scripts", {});
  check("scripts: anonymous hidden, totals reported", () => { assert.ok(named.scripts.every(x => x.url)); assert.equal(typeof named.total, "number"); assert.equal(named.truncated, false); });
  const lp = await call("debugger_logpoint", { url: url + "/fixture.js", line: 9, expression: "n" });
  assert.equal(lp.locations[0].line, 9);
  await call("debugger_run", { expression: "window.finalResult = fixture()" });
  state = await until(s => s.operations.at(-1).status === "completed");
  const hits = await call("debugger_logpoint_read", { id: lp.id });
  check("logpoint records without pausing", () => { assert.equal(state.paused, false); assert.deepEqual(hits.logpoints[0].items.map(i => i.v), [41]); assert.equal(hits.logpoints[0].hits, 1); });
  await call("debugger_logpoint_read", { clear: true });
  assert.equal((await call("debugger_logpoint_read", {})).logpoints[0].hits, 0);
  check("logpoint ring clear", () => {});
  await call("debugger_remove_breakpoint", { id: lp.breakpointId });
  await call("debugger_exception_log", { action: "start" });
  await call("debugger_run", { expression: 'try { throw Error("logged-by-smoke") } catch (e) {}' });
  state = await until(s => s.operations.at(-1).status === "completed");
  const elog = await call("debugger_exception_log", { action: "read" });
  check("exception log records a caught exception without pausing", () => { assert.equal(state.paused, false); assert.ok(elog.entries.some(e => /logged-by-smoke/.test(e.message))); });
  const incident = await call("debugger_incident");
  const jpeg = await readFile(incident.screenshot);
  check("incident saves the latest exception and a real page JPEG", () => {
    assert.match(incident.exception.message, /logged-by-smoke/);
    assert.equal(jpeg[0], 0xff); assert.equal(jpeg[1], 0xd8);
    assert.equal(incident.scene.available, false); // This fixture is not the game.
  });
  await call("debugger_exception_log", { action: "clear" });
  await call("debugger_run", { expression: 'for (const value of [0, false, null, undefined, NaN, -0, Infinity, 12n, "constructor", "toString", "__proto__", "__proto__"]) { try { throw value; } catch (e) {} }' });
  await until(s => s.operations.at(-1).status === "completed");
  const primitiveLog = await call("debugger_exception_log", { action: "read" });
  check("native CDP preserves primitive throws and reserved exception count keys", () => {
    assert.deepEqual(primitiveLog.entries.map(e => e.message), ["0", "false", "null", "undefined", "NaN", "-0", "Infinity", "12n", "constructor", "toString", "__proto__", "__proto__"]);
    assert.equal(primitiveLog.counts.constructor, 1);
    assert.equal(primitiveLog.counts.toString, 1);
    assert.equal(primitiveLog.counts.__proto__, 2);
  });
  await call("debugger_exception_log", { action: "stop" });
  await call("debugger_run", { expression: 'for (const type of ["apexprobe", "constructor", "toString", "__proto__"]) window.addEventListener(type, () => {}); window.Probe = class Probe {}; window.keep = [new Probe(), new Probe(), new Probe()]; 1' });
  await until(s => s.operations.at(-1).status === "completed");
  const ls = await call("debugger_listeners", { target: "window" });
  check("listeners counted by type", () => assert.equal(ls.byType.apexprobe, 1));
  check("native CDP counts custom listener names matching inherited properties", () => {
    for (const type of ["constructor", "toString", "__proto__"]) assert.equal(ls.byType[type], 1);
  });
  const inst = await call("debugger_instances", { expression: "Probe" });
  check("instances counted via queryObjects", () => assert.equal(inst.count, 3));
  await call("debugger_run", { expression: "new Promise(() => {})", awaitPromise: true });
  const abandoning = await call("debugger_run", { expression: "1" });
  check("a new run abandons a hung one", () => assert.equal(abandoning.abandoned.length, 1));
  await until(s => s.operations.at(-1).status === "completed");
  // T9: deadline passes, op stays tracked, the late result is recorded.
  await call("debugger_run", { expression: "new Promise(r => setTimeout(() => r(7), 2500))", awaitPromise: true, timeoutMs: 1000 });
  state = await until(s => s.operations.at(-1).timedOut);
  state = await until(s => s.operations.at(-1).status === "completed");
  check("timed-out run stays tracked and records its late result", () => { assert.equal(state.operations.at(-1).late, true); assert.equal(state.operations.at(-1).result.result.value, 7); });
  // T10: a busy page is reported, and cancel (terminateExecution) frees it.
  await call("debugger_run", { expression: "(() => { const t = Date.now(); while (Date.now() - t < 60000) {} })()" });
  state = await until(s => s.pageUnresponsive === true);
  await call("debugger_control", { action: "cancel" });
  state = await call("debugger_state");
  check("pageUnresponsive reported; cancel terminates the script", () => assert.equal(state.operations.at(-1).status, "cancelled"));
  assert.equal(await page.evaluate(() => 1 + 1), 2);
  // T7: worker targets are listed on request.
  await page.evaluate(() => { window.w = new Worker(URL.createObjectURL(new Blob(["setInterval(() => {}, 1000)"]))); });
  await new Promise(resolve => setTimeout(resolve, 500));
  const workers = await call("debugger_targets", { endpoint, targetType: "worker" });
  check("worker targets listed with targetType", () => { assert.ok(workers.targets.length >= 1); assert.ok(workers.targets.every(t => t.type === "worker")); });
  // T8: a run pending across a reload fails as aborted.
  await call("debugger_run", { expression: "new Promise(() => {})", awaitPromise: true });
  await page.reload();
  state = await until(s => s.operations.at(-1).status === "aborted");
  check("run across a reload is aborted, not pending", () => assert.match(state.operations.at(-1).error, /context destroyed/));
  await page.evaluate(() => new Promise(resolve => {
    const iframe = document.createElement("iframe"); iframe.onload = resolve;
    iframe.srcdoc = "<script>window.frameValue = 1; //# sourceURL=iframe-debugger-fixture.js<\/script>";
    document.body.append(iframe);
  }));
  await call("debugger_breakpoint", { url: url + "/fixture.js", line: 5 });
  await call("debugger_run", { expression: "window.finalResult = fixture()" }); await until(s => s.paused);
  state = await call("debugger_state"); const priorIframeToken = state.pause.token;
  const removed = await rpc("tools/call", { name: "debugger_evaluate", arguments: { pauseToken: priorIframeToken,
    expression: "document.querySelector('iframe').remove()", allowSideEffects: true } });
  if (removed.isError) assert.match(removed.structuredContent.error, /Stale/);
  state = await until(s => s.paused && s.pause.token !== priorIframeToken);
  assert.deepEqual(state.pause.frames, []);
  await call("debugger_control", { action: "resume", pauseToken: state.pause.token });
  await until(s => s.operations.at(-1).status === "completed");
  check("iframe destruction retains a fresh resumable pause", () => {});
  await call("debugger_run", { expression: "window.finalResult = fixture()" }); await until(s => s.paused);
  const detached = await call("debugger_detach"); assert.deepEqual(detached.cleanupErrors, []);
  assert.equal(await page.evaluate(() => window.finalResult), 42);
  check("detach while paused resumes and preserves browser", () => assert.equal((browser.contexts()[0].pages()).length, 1));
  await call("debugger_attach", { targetId: target.id });
  check("attach reuses the last endpoint (T12)", () => {});
  await call("debugger_breakpoint", { url: url + "/fixture.js", line: 5 });
  await call("debugger_run", { expression: "window.finalResult = fixture()" }); state = await until(s => s.paused);
  assert.equal((await call("debugger_evaluate", { pauseToken: state.pause.token, frameIndex: 0, expression: "answer" })).result.value, 41);
  const bysrc = await call("debugger_source", { url: url + "/fixture.js", startLine: 3, endLine: 5 });
  check("frameIndex alias, source by url+endLine (T12)", () => assert.match(bysrc.source, /5:   answer = inner/));
  const badArg = await rpc("tools/call", { name: "debugger_evaluate", arguments: { pauseToken: state.pause.token, expression: "1", bogus: 1 } });
  check("rejection names the valid parameters (T12)", () => assert.match(badArg.structuredContent.error, /valid arguments: pauseToken, frame/));
  await call("debugger_exceptions", { mode: "none" });
  const lsRefused = await call("debugger_evaluate", { pauseToken: state.pause.token, expression: "localStorage.getItem('apex26.smoke')" }, true);
  check("storage read refusal points at allowSideEffects (T14b)", () => assert.match(lsRefused.hint, /allowSideEffects:true/));
  const eofExit = once(mcp, "exit"); mcp.stdin.end(); assert.equal((await eofExit)[0], 0); mcp = null;
  check("MCP stdin closure cleans up a paused session", () => {});
  assert.equal(await page.evaluate(() => window.finalResult), 42);
  // The shell fallback must keep its CDP session after each short-lived caller exits.
  httpDaemon = spawn("bash", ["tools/mcp/js-debugger-mcp.sh", "serve-http"], {
    cwd: ROOT, env: { ...process.env, APEX_DEBUGGER_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  const daemonUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(Error("Debugger daemon startup timeout")), 10000);
    httpDaemon.stderr.on("data", b => {
      stderr += b; const match = stderr.match(/listening (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    httpDaemon.once("exit", code => { clearTimeout(timer); reject(Error(`Debugger daemon exited${code}: ${stderr}`)); });
    httpDaemon.once("error", e => { clearTimeout(timer); reject(e); });
  });
  const daemonPort = new URL(daemonUrl).port;
  async function shellCall(name, args = {}) {
    const child = spawn("bash", ["tools/mcp/js-debugger-mcp.sh", "call", name, JSON.stringify(args)], {
      cwd: ROOT, env: { ...process.env, APEX_DEBUGGER_PORT: daemonPort }, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = ""; child.stdout.on("data", b => { stdout += b; }); child.stderr.on("data", b => { stderr += b; });
    assert.equal((await once(child, "exit"))[0], 0, stdout + stderr); return JSON.parse(stdout);
  }
  async function httpUntil(predicate) {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const r = await debuggerRequest("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "debugger_state" } }, Number(daemonPort));
      const value = r.result.structuredContent; if (predicate(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error("Expected persistent debugger state did not arrive");
  }
  await shellCall("debugger_attach", { endpoint, targetId: target.id });
  await shellCall("debugger_breakpoint", { url: url + "/fixture.js", line: 5 });
  await shellCall("debugger_run", { expression: "window.wrapperResult = fixture()" });
  await httpUntil(s => s.paused); state = await shellCall("debugger_state");
  assert.equal(state.breakpointCount, 1);
  const local = await shellCall("debugger_evaluate", { pauseToken: state.pause.token, expression: "answer" });
  check("separate shell processes preserve native attachment, breakpoint and locals", () => assert.equal(local.result.value, 41));
  const wrapperToken = state.pause.token;
  await shellCall("debugger_control", { action: "over", pauseToken: wrapperToken });
  state = await httpUntil(s => s.paused && s.pause.token !== wrapperToken);
  await shellCall("debugger_control", { action: "resume", pauseToken: state.pause.token });
  await httpUntil(s => s.operations.at(-1).status === "completed");
  check("separate shell commands step and resume native execution", () => {});
  await shellCall("debugger_run", { expression: "window.wrapperResult = fixture()" }); await httpUntil(s => s.paused);
  const daemonExit = once(httpDaemon, "exit"); httpDaemon.kill("SIGTERM"); assert.equal((await daemonExit)[0], 0); httpDaemon = null;
  assert.equal(await page.evaluate(() => window.wrapperResult), 42);
  check("daemon SIGTERM cleans up a native paused target and preserves Chrome", () => assert.equal(browser.contexts()[0].pages().length, 1));
  startMcp();
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "native-smoke", version: "1" } });
  await call("debugger_attach", { endpoint, targetId: target.id });
  await page.close(); await until(s => !s.connected);
  check("lost target reads detached: target gone", () => {});
  assert.match((await call("debugger_state")).detached, /^target gone/);
  check("target closure clears session", () => {});
  const receipt = { passed: checks.length, checks, browserVersion: browser.version(), protocol: "MCP stdio + persistent HTTP shell wrapper + native CDP", gpuClaim: false };
  await writeFile(path.join(out, "smoke.json"), JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
} finally {
  if (httpDaemon) { const exit = once(httpDaemon, "exit"); httpDaemon.kill("SIGTERM"); await exit; }
  if (mcp) { const exit = once(mcp, "exit"); mcp.stdin.end(); await exit; }
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error("Smoke closed")); }
  if (browser) await browser.close();
  if (chrome && chrome.exitCode === null) { const exit = once(chrome, "exit"); chrome.kill("SIGTERM"); await exit; }
  await new Promise(resolve => server.close(resolve)); releaseLock();
}
