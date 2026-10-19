// No browser: protocol/transport fixtures preserve CDP event and response ordering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { localUrl } from "../../tools/mcp/js-debugger-cdp.mjs";
import { DebugSession } from "../../tools/mcp/js-debugger-session.mjs";
import { callTool, TOOLS } from "../../tools/mcp/js-debugger-mcp.mjs";
import http from "node:http";
import { debuggerRequest } from "../../tools/mcp/js-debugger-http.mjs";
import { frame, paused, attached } from "../helpers/js-debugger-rig.mjs";

test("loopback validation refuses remote/rebinding/credentials and wrong protocols", () => {
  for (const u of ["http://example.com", "http://127.0.0.1.evil.test", "http://user@localhost", "https://localhost", "http://localhost/?secret=1"]) assert.throws(() => localUrl(u));
  for (const u of ["http://127.0.0.1:9222", "http://localhost:9222", "http://[::1]:9222"]) assert.equal(localUrl(u).protocol, "http:");
});
test("tools expose actual debugger operations; malformed arguments fail before attachment", async () => {
  assert.equal(TOOLS.length, 22);
  const s = new DebugSession();
  for (const [name, args] of [["debugger_breakpoint", { url: "x", line: 0 }], ["debugger_control", { action: "unknown" }],
    ["debugger_source", { scriptId: "s1", count: 201 }], ["debugger_state", { surprise: true }], ["debugger_evaluate", { pauseToken: "x", expression: "x", allowSideEffects: "true" }]]) {
    const r = await callTool(s, name, args); assert.equal(r.isError, true); assert.doesNotMatch(r.content[0].text, /Attach a target/);
  }
});
test("incident bundles the latest exception, local page state and bounded screenshot", async () => {
  const { s, c } = await attached();
  await s.exceptionLogControl({ action: "start" });
  c.emit("Debugger.paused", { reason: "exception", data: { description: "boom", uncaught: true }, callFrames: [frame] });
  c.reply = async (method, params) => method === "Runtime.evaluate"
    ? { result: { value: params.expression === "location.href" ? "about:blank" : { available: true, info: { track: "monza" } } } }
    : method === "Page.captureScreenshot" ? { data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64") } : {};
  const result = await callTool(s, "debugger_incident", {});
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.exception.message, "boom");
  assert.equal(result.structuredContent.scene.info.track, "monza");
  assert.deepEqual(readFileSync(result.structuredContent.screenshot), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.equal(result.content.filter(x => x.type === "resource_link").length, 2);
  assert.equal(c.calls.find(x => x.method === "Page.captureScreenshot").params.captureBeyondViewport, false);
  unlinkSync(result.structuredContent.screenshot); unlinkSync(result.structuredContent.report);
  paused(c);
  const refused = await callTool(s, "debugger_incident", {});
  assert.equal(refused.isError, true);
  assert.match(refused.structuredContent.error, /Resume before/);
  await s.detach();
});
test("incident refuses a page that navigated away from loopback after attachment", async () => {
  const { s, c } = await attached();
  c.reply = async method => method === "Runtime.evaluate"
    ? { result: { value: "https://example.com/private" } } : {};
  const result = await callTool(s, "debugger_incident", {});
  assert.equal(result.isError, true);
  assert.match(result.structuredContent.error, /loopback|127\.0\.0\.1|localhost/i);
  assert.equal(c.calls.some(x => x.method === "Page.captureScreenshot"), false);
  await s.detach();
});
test("pause generation invalidates frames and objects after resume and re-pause", async () => {
  const { s, c } = await attached(); paused(c);
  const first = s.pause.token; assert.equal(s.pause.frames[0].line, 4); assert.equal(s.pause.frames[0].column, 3);
  assert.ok(s.objects.has("locals1")); c.emit("Debugger.resumed");
  assert.equal(s.objects.size, 0); await assert.rejects(s.evaluate(first, 0, "x"), /Stale/);
  paused(c); assert.notEqual(s.pause.token, first);
  await assert.rejects(s.properties(first, "locals1", 0, 10), /Stale/);
});

test("exception pauses expose bounded thrown values and own their object handles until resume", async () => {
  const { s, c } = await attached();
  for (const reason of ["exception", "promiseRejection"]) {
    c.emit("Debugger.paused", { reason, data: { type: "object", subtype: "error", objectId: "thrown1", description: "Error: fixture", uncaught: true }, callFrames: [frame] });
    const state = (await callTool(s, "debugger_state")).structuredContent;
    assert.equal(state.pause.exception.description, "Error: fixture");
    assert.equal(state.pause.exception.uncaught, true);
    const token = state.pause.token;
    assert.equal((await callTool(s, "debugger_properties", { pauseToken: token, objectId: "thrown1" })).isError, false);
    c.emit("Debugger.resumed");
    assert.equal(s.objects.has("thrown1"), false);
    assert.equal((await callTool(s, "debugger_properties", { pauseToken: token, objectId: "thrown1" })).isError, true);
  }
  c.emit("Debugger.paused", { reason: "exception", data: { type: "string", value: "x".repeat(200000), description: "x".repeat(200000) }, callFrames: [frame] });
  const result = await callTool(s, "debugger_state");
  assert.equal(result.isError, false, "large thrown primitives cannot hide the resume token");
  assert.equal(result.structuredContent.pause.exception.value.length, 2000);
  assert.equal(result.structuredContent.pause.exception.truncated, true);
  assert.ok(result.structuredContent.pause.token);
});

test("completed failed runs release remote Error graphs before bounded history eviction", async () => {
  const { s, c } = await attached();
  const retained = new Set(), groups = [];
  c.reply = async (method, params) => {
    if (method === "Runtime.evaluate") {
      retained.add(params.objectGroup); groups.push(params.objectGroup);
      return { result: { type: "object", subtype: "error", objectId: "error" + groups.length }, exceptionDetails: { text: "Uncaught" } };
    }
    if (method === "Runtime.releaseObjectGroup") retained.delete(params.objectGroup);
    return {};
  };
  for (let i = 0; i < 20; i++) {
    assert.equal((await callTool(s, "debugger_run", { expression: 'throw new Error("fixture")' })).isError, false);
    await new Promise(setImmediate);
    assert.equal(retained.size, 0, "a completed error result releases its remote object group");
  }
  assert.equal(new Set(groups).size, 20, "each operation owns a separate group");
  assert.equal(s.operations.size, 10);
  assert.equal(s.operationGroups.size, 0);
});

test("unknown execution and failed group release retain cleanup ownership until detach", async () => {
  const { s, c } = await attached();
  const send = c.send.bind(c); let late;
  c.send = (method, params, timeout, onLate) => {
    if (method === "Runtime.evaluate" && !late) late = onLate;
    return send(method, params, timeout);
  };
  c.reply = async method => { if (method === "Runtime.evaluate") throw Error("response timed out"); return {}; };
  s.run("pending()"); await new Promise(setImmediate);
  const unknownGroup = [...s.operationGroups][0];
  assert.ok(unknownGroup);
  assert.equal(s.state().operations.at(-1).status, "unknown");
  const again = s.run("again()"); await new Promise(setImmediate);
  assert.deepEqual(again.abandoned, [1], "a new run explicitly abandons the unknown operation");
  assert.equal(s.operations.get(1).status, "abandoned");
  assert.ok(s.operationGroups.has(unknownGroup), "abandonment does not end the old JavaScript execution");
  const nextUnknownGroup = [...s.operationGroups].find(group => group !== unknownGroup);
  assert.ok(nextUnknownGroup);
  assert.equal(c.calls.some(call => call.method === "Runtime.releaseObjectGroup"), false, "timeout does not mean execution ended");
  await late(null, { result: { type: "number", value: 42 } });
  assert.equal(s.operations.get(1).status, "abandoned", "a late reply cannot resurrect the abandoned operation");
  assert.equal(s.operations.get(1).result, undefined);
  assert.equal(s.operationGroups.has(unknownGroup), false, "its late reply still releases its remote group");
  assert.ok(s.operationGroups.has(nextUnknownGroup), "the second unknown execution retains cleanup ownership");
  await s.detach();
  for (const group of [unknownGroup, nextUnknownGroup]) assert.equal(c.calls.filter(call => call.method === "Runtime.releaseObjectGroup" && call.params.objectGroup === group).length, 1);
  assert.equal(s.operationGroups.size, 0);

  const next = await attached();
  next.c.reply = async method => {
    if (method === "Runtime.evaluate") return { result: { type: "number", value: 42 } };
    if (method === "Runtime.releaseObjectGroup") throw Error("temporary cleanup failure");
    return {};
  };
  next.s.run("42"); await new Promise(setImmediate);
  assert.equal(next.s.operationGroups.size, 1);
  assert.match(next.s.state(true).operations.at(-1).cleanupError, /cleanup failure/);
  next.c.reply = async () => ({});
  assert.deepEqual((await next.s.detach()).cleanupErrors, []);
  assert.equal(next.s.operationGroups.size, 0);
});

test("a final operation status waits for its remote group cleanup attempt", async () => {
  const { s, c } = await attached(); let release;
  c.reply = async method => {
    if (method === "Runtime.evaluate") return { result: { type: "number", value: 42 } };
    if (method === "Runtime.releaseObjectGroup") return new Promise(resolve => { release = resolve; });
    return {};
  };
  s.run("42"); await new Promise(setImmediate);
  assert.equal(s.state().operations.at(-1).status, "pending");
  assert.equal(s.operationGroups.size, 1);
  release({}); await new Promise(setImmediate);
  assert.equal(s.state().operations.at(-1).status, "completed");
  assert.equal(s.operationGroups.size, 0);
});
test("step acknowledgment alone never returns previous paused frame", async () => {
  const { s, c } = await attached(); paused(c); const token = s.pause.token;
  const r = await s.control("over", token); assert.equal(r.paused, false);
  paused(c); assert.notEqual(s.pause.token, token);
});
test("new pause arriving before step response remains authoritative", async () => {
  const { s, c } = await attached(); paused(c); const token = s.pause.token;
  c.reply = async method => { if (method === "Debugger.stepInto") { c.emit("Debugger.resumed"); paused(c); } return {}; };
  const r = await s.control("into", token); assert.equal(r.paused, true); assert.notEqual(r.pause.token, token);
});
test("URL breakpoint survives context clearing while scripts/frame handles expire", async () => {
  const { s, c } = await attached();
  await s.setBreakpoint(frame.url, 4, 3, "x === 1");
  // A query-less URL matches the script under any ?v= query (deferred backends load ?v=<n>).
  assert.deepEqual(c.calls.at(-1).params, { urlRegex: "^http://127\\.0\\.0\\.1:3456/fixture\\.js(?:[?#].*)?$", lineNumber: 3, columnNumber: 2, condition: "x === 1" });
  c.emit("Debugger.scriptParsed", { scriptId: "s1", url: frame.url, startLine: 0, endLine: 9 }); paused(c);
  c.emit("Runtime.executionContextsCleared");
  assert.equal(s.pause, null); assert.equal(s.scripts.size, 0); assert.equal(s.breakpoints.size, 1);
  await assert.rejects(s.source("s1", 1, 10), /stale/);
});
test("resolved breakpoint coordinates use the same one-based units as source and paused frames", async () => {
  const { s, c } = await attached();
  for (const scriptId of ["s1", "s2"]) c.emit("Debugger.scriptParsed", { scriptId, url: frame.url, startLine: 0, endLine: 9 });
  c.reply = async () => ({ breakpointId: "bp1", locations: [{ scriptId: "s1", lineNumber: 3, columnNumber: 2 }, { scriptId: "s2", lineNumber: 0 }] });
  const bp = await s.setBreakpoint(frame.url, 4, 3);
  assert.deepEqual(bp.locations, [{ scriptId: "s1", line: 4, column: 3 }, { scriptId: "s2", line: 1, column: 1 }]);
  paused(c);
  assert.equal(bp.locations[0].line, s.pause.frames[0].line);
  assert.equal(bp.locations[0].column, s.pause.frames[0].column);
  assert.deepEqual(s.state().breakpoints[0].locations, bp.locations);
});
test("URL breakpoint resolutions follow scriptParsed, legacy events and reload", async () => {
  const { s, c } = await attached();
  const bp = await s.setBreakpoint(frame.url, 4, 3);
  const location = { scriptId: "s1", lineNumber: 3, columnNumber: 2 };
  c.emit("Debugger.scriptParsed", { scriptId: "s1", url: frame.url, startLine: 0, endLine: 9,
    resolvedBreakpoints: [{ breakpointId: bp.id, location }] });
  c.emit("Debugger.breakpointResolved", { breakpointId: bp.id, location });
  assert.deepEqual(bp.locations, [{ scriptId: "s1", line: 4, column: 3 }], "equivalent CDP paths must not duplicate a location");
  c.emit("Debugger.globalObjectCleared");
  assert.deepEqual(bp.locations, []);
  c.emit("Debugger.breakpointResolved", { breakpointId: bp.id, location });
  assert.deepEqual(bp.locations, [], "late events for an expired script must not restore it");
  c.emit("Debugger.scriptParsed", { scriptId: "s2", url: frame.url, startLine: 0, endLine: 9 });
  c.emit("Debugger.breakpointResolved", { breakpointId: bp.id, location: { ...location, scriptId: "s2" } });
  assert.deepEqual(bp.locations, [{ scriptId: "s2", line: 4, column: 3 }]);
  c.emit("Runtime.executionContextsCleared");
  assert.deepEqual(bp.locations, []);
  assert.equal(s.breakpoints.size, 1, "URL ownership survives while resolution handles expire");
});
test("breakpoint resolutions are bounded, owned and pruned with individual script contexts", async () => {
  const { s, c } = await attached(); const bp = await s.setBreakpoint(frame.url, 4);
  for (let i = 0; i < 8; i++) {
    c.emit("Debugger.scriptParsed", { scriptId: "s" + i, url: frame.url, startLine: 0, endLine: 9, executionContextId: i });
    c.emit("Debugger.breakpointResolved", { breakpointId: bp.id, location: { scriptId: "s" + i, lineNumber: 3 } });
  }
  assert.equal(bp.locations.length, 5);
  c.emit("Debugger.breakpointResolved", { breakpointId: "foreign", location: { scriptId: "s7", lineNumber: 8 } });
  assert.equal(s.breakpoints.size, 1); assert.equal(bp.locations.length, 5);
  c.emit("Runtime.executionContextDestroyed", { executionContextId: 7 });
  assert.deepEqual(bp.locations.map(p => p.scriptId), ["s3", "s4", "s5", "s6"]);
  await s.removeBreakpoint(bp.id);
  c.emit("Debugger.breakpointResolved", { breakpointId: bp.id, location: { scriptId: "s6", lineNumber: 3 } });
  assert.equal(s.breakpoints.size, 0);
});
test("evaluation rejects side effects by default and reports JavaScript exceptions", async () => {
  const { s, c } = await attached(); paused(c); const token = s.pause.token;
  c.reply = async () => ({ result: { type: "undefined" }, exceptionDetails: { text: "side effect" } });
  const r = await callTool(s, "debugger_evaluate", { pauseToken: token, expression: "x++" });
  assert.equal(r.isError, true); assert.equal(c.calls.at(-1).params.throwOnSideEffect, true);
  await s.evaluate(token, 0, "x++", true); assert.equal(c.calls.at(-1).params.throwOnSideEffect, false);
});
test("evaluate returns a one-line summary of an object result from V8's preview", async () => {
  const { s, c } = await attached(); paused(c);
  c.reply = async () => ({ result: { type: "object", objectId: "o1", description: "Object", preview: { overflow: false, properties: [{ name: "now", value: "31448" }, { name: "state", value: "menu" }] } } });
  const r = await s.evaluate(s.pause.token, 0, "({now, state})");
  assert.equal(r.summary, "{now: 31448, state: menu}"); assert.equal(c.calls.at(-1).params.generatePreview, true);
  assert.equal(r.result.preview, undefined);
});
test("property reads return getter descriptors without invoking them; rejects foreign objects", async () => {
  const { s, c } = await attached(); paused(c);
  c.reply = async () => ({ result: [{ name: "value", get: { type: "function", objectId: "getter1" } }] });
  const r = await s.properties(s.pause.token, "locals1", 0, 10);
  assert.equal(r.properties[0].get.objectId, "getter1"); assert.equal(c.calls.at(-1).method, "Runtime.getProperties");
  await assert.rejects(s.properties(s.pause.token, "foreign", 0, 10), /not owned/);
});
test("pending Runtime evaluation cannot block an independent pause inspection and resume", async () => {
  const { s, c } = await attached(); let finish;
  c.reply = async method => {
    if (method === "Runtime.evaluate") { paused(c); return new Promise(resolve => { finish = resolve; }); }
    if (method === "Debugger.resume") { c.emit("Debugger.resumed"); finish({ result: { value: 42 } }); }
    return {};
  };
  const run = await callTool(s, "debugger_run", { expression: "fixture()" }); assert.equal(run.isError, false);
  const state = (await callTool(s, "debugger_state")).structuredContent; assert.equal(state.paused, true);
  await callTool(s, "debugger_control", { action: "resume", pauseToken: state.pause.token });
  await Promise.resolve(); assert.equal(s.state().operations[0].status, "completed");
});
test("concurrent mutations are refused while state remains readable", async () => {
  const { s, c } = await attached(); let done;
  c.reply = () => new Promise(resolve => { done = resolve; });
  const pending = callTool(s, "debugger_exceptions", { state: "all" });
  assert.equal((await callTool(s, "debugger_control", { action: "pause" })).isError, true);
  assert.equal((await callTool(s, "debugger_state")).isError, false);
  done({}); await pending;
});
test("detach resumes, removes owned breakpoints and never closes the browser", async () => {
  const { s, c } = await attached(); await s.setBreakpoint(frame.url, 4); paused(c);
  const result = await s.detach(); assert.deepEqual(result.cleanupErrors, []); assert.equal(s.state().connected, false);
  const methods = c.calls.map(x => x.method); assert.ok(methods.includes("Debugger.resume")); assert.ok(methods.includes("Debugger.removeBreakpoint"));
  assert.ok(methods.includes("Runtime.releaseObjectGroup")); assert.ok(!methods.includes("Browser.close"));
  assert.equal(result.cleanupAcknowledged, true); assert.equal(result.resumedEventObserved, false);
});
test("large execution result is bounded so later pause/state remains inspectable", async () => {
  const { s, c } = await attached();
  c.reply = async () => ({ result: { type: "string", value: "a".repeat(200000) } });
  s.run("large()"); await new Promise(setImmediate); paused(c);
  const r = await callTool(s, "debugger_state"); assert.equal(r.isError, false);
  assert.equal(r.structuredContent.operations[0].result.truncated, true); assert.ok(r.structuredContent.pause.token);
});
test("individual context destruction invalidates pause and script cache", async () => {
  const { s, c } = await attached(); paused(c); const token = s.pause.token;
  c.emit("Debugger.scriptParsed", { scriptId: "s1", url: frame.url, startLine: 0, endLine: 9, executionContextId: 123 });
  c.emit("Debugger.scriptParsed", { scriptId: "other", url: frame.url, startLine: 0, endLine: 9, executionContextId: 456 });
  c.emit("Runtime.executionContextDestroyed", { executionContextId: 123 });
  assert.equal(s.scripts.size, 1); assert.ok(s.scripts.has("other")); assert.equal(s.pause.reason, "executionContextDestroyed");
  assert.deepEqual(s.pause.frames, []); assert.notEqual(s.pause.token, token);
  await assert.rejects(s.evaluate(token, 0, "x"), /Stale/);
  await s.control("resume", s.pause.token); assert.equal(c.calls.findLast(x => x.method === "Debugger.resume").method, "Debugger.resume");
});
test("async expression can await its promise without blocking MCP control", async () => {
  const { s, c } = await attached();
  c.reply = async () => ({ result: { value: 42 } });
  s.run("Promise.resolve(42)", true); await new Promise(setImmediate);
  assert.equal(c.calls.find(x => x.method === "Runtime.evaluate" && !x.params.expression.includes("__apexDbgClients")).params.awaitPromise, true);
  assert.equal(s.state(true).operations[0].result.result.value, 42);
});
test("tool responses carry only the latest operation result, not the last ten", async () => {
  const { s, c } = await attached(); c.reply = async () => ({ result: { type: "string", value: "x".repeat(3000) } });
  for (let i = 0; i < 4; i++) { s.run(`op${i}()`); await new Promise(setImmediate); }
  const ops = (await callTool(s, "debugger_state")).structuredContent.operations;
  assert.equal(ops.length, 4); assert.deepEqual(ops.slice(0, 3).map(o => Object.keys(o).sort()), Array(3).fill(["id", "status"]));
  assert.ok(ops[3].result);
  assert.ok(!JSON.stringify(s.state()).includes("xxxx"), "attach/control responses carry no results");
});
test("a run paused on a breakpoint reports paused, then pending after resume, never unknown", async () => {
  const { s, c } = await attached(); let finish;
  c.reply = async method => {
    if (method === "Runtime.evaluate") { paused(c); return new Promise(r => { finish = r; }); }
    return {};
  };
  s.run("fixture()"); await new Promise(setImmediate);
  assert.equal(s.state().operations[0].status, "paused");
  assert.equal(c.calls.find(x => x.method === "Runtime.evaluate" && !x.params.expression.includes("__apexDbgClients")).timeout, 600000);
  c.emit("Debugger.resumed"); assert.equal(s.state().operations[0].status, "pending");
  finish({ result: { value: 1 } }); await new Promise(setImmediate); assert.equal(s.state().operations[0].status, "completed");
});
test("a slow Debugger.disable on detach is a warning, not a failed cleanup", async () => {
  const { s, c } = await attached();
  c.reply = async method => { if (method === "Debugger.disable") throw Error("Debugger.disable response timed out; execution may still be active"); return {}; };
  const r = await callTool(s, "debugger_detach");
  assert.equal(r.isError, false); assert.deepEqual(r.structuredContent.cleanupErrors, []);
  assert.match(r.structuredContent.cleanupWarnings[0], /Debugger\.disable/); assert.equal(r.structuredContent.detached, true);
});
test("a failed breakpoint removal on detach stays an error", async () => {
  const { s, c } = await attached(); await s.setBreakpoint(frame.url, 4);
  c.reply = async method => { if (method === "Debugger.removeBreakpoint") throw Error("timed out"); return { breakpointId: "bp1", locations: [] }; };
  assert.equal((await callTool(s, "debugger_detach")).isError, true);
});
test("dead endpoint and missing tool name give actionable messages", async () => {
  const { targets } = await import("../../tools/mcp/js-debugger-cdp.mjs");
  await assert.rejects(targets("http://127.0.0.1:1"), /Cannot reach a debug endpoint at http:\/\/127\.0\.0\.1:1/);
  const r = spawnSync(process.execPath, ["tools/mcp/js-debugger-cli.mjs", "call"], { encoding: "utf8" });
  assert.match(r.stdout, /call needs a tool name/);
  await assert.rejects(debuggerRequest("/healthz", null, 1), /on port 1|nothing listening on 127\.0\.0\.1:1/);
});
test("T5: a timed-out (unknown) or pending run no longer blocks; it is marked abandoned and its late result dropped", async () => {
  const { s, c } = await attached(); c.reply = async () => { throw Error("response timed out; execution may still be active"); };
  s.run("forever()"); await new Promise(setImmediate);
  assert.equal(s.state().operations[0].status, "unknown");
  let late; c.reply = () => new Promise(resolve => { late = resolve; });
  const second = s.run("again()"); assert.deepEqual(second.abandoned, [1]);
  assert.equal(s.state().operations[0].status, "abandoned");
  const third = s.run("third()"); assert.deepEqual(third.abandoned, [2]);
  late({ result: { value: 1 } }); await new Promise(setImmediate);
  assert.equal(s.state().operations.find(o => o.id === 2).status, "abandoned", "late result must not resurrect an abandoned run");
});
test("T6: debugger_run is documented as always mutating and refuses allowSideEffects with a pointer to debugger_evaluate", async () => {
  const run = TOOLS.find(t => t.name === "debugger_run"), ev = TOOLS.find(t => t.name === "debugger_evaluate");
  assert.match(run.description, /ALWAYS mutating/); assert.match(run.description, /no allowSideEffects/);
  assert.ok(ev.inputSchema.properties.allowSideEffects); assert.ok(!run.inputSchema.properties.allowSideEffects);
  const { s } = await attached(); const r = await callTool(s, "debugger_run", { expression: "1", allowSideEffects: true });
  assert.equal(r.isError, true); assert.match(r.structuredContent.error, /only on debugger_evaluate/);
});
test("T1: scripts hide anonymous rows by default, list named URLs first, report total/truncated, and eviction keeps game.js", async () => {
  const { s, c } = await attached();
  for (let i = 0; i < 250; i++) c.emit("Debugger.scriptParsed", { scriptId: "a" + i, url: "", startLine: 0, endLine: 1 });
  c.emit("Debugger.scriptParsed", { scriptId: "g", url: "http://127.0.0.1:3456/js/game.js?v=dev", startLine: 0, endLine: 9 });
  let r = await s.scriptsList("game.js");
  assert.deepEqual(r.scripts.map(x => x.scriptId), ["g"]); assert.equal(r.total, 1); assert.equal(r.truncated, false);
  r = await s.scriptsList("", { includeAnonymous: true });
  assert.equal(r.scripts.length, 50); assert.equal(r.truncated, true);   // default limit (#2672)
  r = await s.scriptsList("", { includeAnonymous: true, limit: 200 });
  assert.equal(r.scripts.length, 200); assert.equal(r.total, 251); assert.equal(r.truncated, true); assert.equal(r.scripts[0].scriptId, "g");
  r = await s.scriptsList("js/(game|core)\\.js", { regex: true }); assert.equal(r.total, 1);
  assert.equal((await s.scriptsList("")).anonymousHidden, 250);
  for (let i = 0; i < 2100; i++) c.emit("Debugger.scriptParsed", { scriptId: "b" + i, url: "", startLine: 0, endLine: 1 });
  assert.ok(s.scripts.has("g"), "2000-entry eviction must drop anonymous scripts before a named one");
});
test("T1: an unresolved breakpoint warns loudly and suggests the exact parsed URL", async () => {
  const { s, c } = await attached();
  c.emit("Debugger.scriptParsed", { scriptId: "g", url: "http://127.0.0.1:3456/js/game.js?v=dev", startLine: 0, endLine: 9 });
  const bp = await s.setBreakpoint("http://127.0.0.1:3456/js/game.js?v=old", 5);
  assert.deepEqual(bp.locations, []); assert.match(bp.warning, /NO LOCATIONS/); assert.match(bp.warning, /game\.js\?v=dev/);
  const r = await callTool(s, "debugger_breakpoint", { url: "http://127.0.0.1:3456/never.js", line: 1 });
  assert.match(r.structuredContent.warning, /not parsed yet/);
});
test("T4: setting a breakpoint at an owned location removes the old CDP breakpoint by id first, even when unresolved", async () => {
  const { s, c } = await attached(); let n = 0;
  c.reply = async method => method === "Debugger.setBreakpointByUrl" ? { breakpointId: "same", locations: [] } : {};
  const a = await s.setBreakpoint(frame.url, 4, 3, "x === 1"); assert.deepEqual(a.locations, []);
  const b = await s.setBreakpoint(frame.url, 4, 3, "x === 2");
  const seq = c.calls.map(x => x.method).filter(m => m.includes("Breakpoint"));
  assert.deepEqual(seq, ["Debugger.setBreakpointByUrl", "Debugger.removeBreakpoint", "Debugger.setBreakpointByUrl"]);
  assert.equal(b.condition, "x === 2"); assert.equal(s.breakpoints.size, 1);
  assert.deepEqual(c.calls.find(x => x.method === "Debugger.removeBreakpoint").params, { breakpointId: "same" });
  c.reply = async method => { if (method === "Debugger.removeBreakpoint") throw Error("cdp down"); return { breakpointId: "same", locations: [] }; };
  await assert.rejects(s.setBreakpoint(frame.url, 4, 3, "x === 3"), /old condition may still be armed/);
  assert.equal(s.breakpoints.get("same").condition, "x === 2", "a failed remove must not claim the new condition");
});
test("A1: logpoint condition never pauses, records into a page ring, and read/clear go through Runtime.evaluate", async () => {
  const { s, c } = await attached();
  const r = await callTool(s, "debugger_logpoint", { url: frame.url, line: 4, expression: "speed * 2" });
  assert.equal(r.isError, false); const call = c.calls.find(x => x.method === "Debugger.setBreakpointByUrl");
  assert.match(call.params.condition, /return false\}\)\(\)$/); assert.match(call.params.condition, /speed \* 2/);
  // Execute the generated condition for real, in a scope that defines `speed`.
  const run = (speed) => new Function("speed", "globalThis_", `return ${call.params.condition.replaceAll("globalThis", "globalThis_")}`)(speed, globalThis_);
  var globalThis_ = {}; assert.equal(run(2), false); run(NaN); run(Infinity);
  const ring = globalThis_.__apexDbgLog[r.structuredContent.id];
  assert.deepEqual(ring.items.map(i => i.v), [4, "NaN", "Infinity"]); assert.equal(ring.n, 3);
  for (let i = 0; i < 150; i++) run(i); assert.equal(ring.items.length, 100, "ring is bounded"); assert.equal(ring.n, 153);
  c.reply = async (method, params) => { assert.equal(method, "Runtime.evaluate"); return { result: { value: { lp1: { hits: 3, retained: 3, items: [{ i: 1, v: "NaN" }] } } } }; };
  const read = await callTool(s, "debugger_logpoint_read", { clear: true });
  assert.equal(read.structuredContent.logpoints[0].hits, 3); assert.match(c.calls.at(-1).params.expression, /clear/);
  paused(c); assert.equal((await callTool(s, "debugger_logpoint_read", {})).isError, true);
});
test("A2: exception log records message/location/top-5 stack and auto-resumes without surfacing a pause", async () => {
  const { s, c } = await attached();
  assert.equal((await callTool(s, "debugger_exception_log", { action: "read" })).isError, true);
  await s.exceptionLogControl({ action: "start", state: "all", max: 2 });
  assert.deepEqual(c.calls.at(-1), { method: "Debugger.setPauseOnExceptions", params: { state: "all" }, timeout: undefined });
  const frames = Array.from({ length: 8 }, (_, i) => ({ ...frame, functionName: "f" + i, callFrameId: "cf" + i }));
  for (let i = 0; i < 3; i++) c.emit("Debugger.paused", { reason: "exception", data: { description: "TypeError: boom " + (i % 2) + "\n    at x", uncaught: i === 2 }, callFrames: frames });
  assert.equal(s.pause, null, "no visible pause"); assert.equal(c.calls.filter(x => x.method === "Debugger.resume").length, 3);
  const r = await s.exceptionLogControl({ action: "read" });
  assert.equal(r.total, 3); assert.equal(r.entries.length, 2, "bounded ring"); assert.equal(r.entries[1].stack.length, 5);
  assert.match(r.entries[1].message, /^TypeError: boom 0$/); assert.match(r.entries[1].at, /fixture\.js:4$/); assert.equal(r.counts["TypeError: boom 0"], 2);
  c.emit("Debugger.paused", { reason: "other", callFrames: [frame] }); assert.ok(s.pause, "non-exception pauses still surface");
  assert.equal((await s.exceptionLogControl({ action: "clear" })).cleared, true);
  assert.equal((await s.exceptionLogControl({ action: "read" })).total, 0);
  await s.exceptionLogControl({ action: "stop" }); assert.equal(c.calls.at(-1).params.state, "none"); assert.equal(s.exceptionLog, null);
});
test("A3: listeners counts by type via DOMDebugger.getEventListeners and releases the object group", async () => {
  const { s, c } = await attached();
  c.reply = async (method, params) => {
    if (method === "Runtime.evaluate") return { result: { objectId: "w1" } };
    if (method === "DOMDebugger.getEventListeners") return { listeners: [{ type: "keydown", scriptId: "s1", lineNumber: 1, columnNumber: 0 }, { type: "keydown", scriptId: "s1", lineNumber: 2, columnNumber: 0 }, { type: "resize", scriptId: "s1", lineNumber: 3, columnNumber: 0 }] };
    return {};
  };
  c.emit("Debugger.scriptParsed", { scriptId: "s1", url: frame.url, startLine: 0, endLine: 9 });
  const r = await callTool(s, "debugger_listeners", { target: "#hud", detail: 2 });
  assert.deepEqual(r.structuredContent.byType, { keydown: 2, resize: 1 }); assert.equal(r.structuredContent.total, 3);
  assert.equal(r.structuredContent.listeners[0].url, frame.url); assert.equal(r.structuredContent.listeners.length, 2);
  assert.match(c.calls.find(x => x.method === "Runtime.evaluate" && !x.params.expression.includes("__apexDbgClients")).params.expression, /querySelector\("#hud"\)/);
  assert.ok(c.calls.some(x => x.method === "Runtime.releaseObjectGroup" && x.params.objectGroup === "apex-dbg-listeners"));
});
test("A4: instances queries the prototype, reads the array length and releases the group", async () => {
  const { s, c } = await attached();
  c.reply = async (method, params) => {
    if (method === "Runtime.evaluate") return { result: { objectId: "p1" } };
    if (method === "Runtime.queryObjects") { assert.equal(params.prototypeObjectId, "p1"); return { objects: { objectId: "arr1" } }; }
    if (method === "Runtime.callFunctionOn") { assert.equal(params.objectId, "arr1"); return { result: { value: 7 } }; }
    return {};
  };
  const r = await callTool(s, "debugger_instances", { expression: "AudioNode" });
  assert.equal(r.structuredContent.count, 7);
  assert.ok(c.calls.some(x => x.method === "Runtime.releaseObjectGroup" && x.params.objectGroup === "apex-dbg-instances"));
  c.reply = async () => ({ result: {}, exceptionDetails: { text: "x" } });
  assert.equal((await callTool(s, "debugger_instances", { expression: "Nope" })).isError, true);
});
