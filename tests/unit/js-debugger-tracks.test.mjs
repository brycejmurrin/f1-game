// js-debugger T1-T14 regressions: targets, aborted/timed-out runs, detach, alias keys. No browser.
// Split from js-debugger-mcp.test.mjs (T3-16); fixtures live in tests/helpers/js-debugger-rig.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Cdp } from "../../tools/mcp/js-debugger-cdp.mjs";
import { DebugSession } from "../../tools/mcp/js-debugger-session.mjs";
import { callTool } from "../../tools/mcp/js-debugger-mcp.mjs";
import http from "node:http";
import { FakeCdp, frame, paused, attached } from "../helpers/js-debugger-rig.mjs";

test("break workflow keeps trigger execution independent of the breakpoint wait budget", async () => {
  for (const executionTimeoutMs of [undefined, 2000]) {
    const { s, c } = await attached();
    let finish;
    c.reply = async (method, params) => {
      if (method === "Runtime.evaluate" && params.expression === "probe()") {
        setImmediate(() => paused(c));
        return new Promise(resolve => { finish = resolve; });
      }
      if (method === "Debugger.resume") {
        c.emit("Debugger.resumed");
        finish({ result: { type: "number", value: 42 } });
      }
      return {};
    };
    try {
      const args = { breakpoints: [], trigger: "probe()", timeoutMs: 100,
        ...(executionTimeoutMs === undefined ? {} : { executionTimeoutMs }) };
      const hit = await callTool(s, "debugger_break", args);
      assert.equal(hit.isError, false);
      assert.equal(hit.structuredContent.paused, true);
      assert.equal(c.calls.find(x => x.method === "Runtime.evaluate" && x.params.expression === "probe()").timeout, executionTimeoutMs ?? 600000);
      assert.equal((await callTool(s, "debugger_control", { action: "resume", pauseToken: hit.structuredContent.token })).isError, false);
      await new Promise(setImmediate);
      const operation = s.state(true).operations.find(x => x.id === hit.structuredContent.operation.id);
      assert.equal(operation.status, "completed");
      assert.equal(operation.result.result.value, 42);
      assert.equal(operation.timedOut, undefined);
    } finally { await s.detach(); }
  }
  const invalid = await callTool(new DebugSession(), "debugger_break", { breakpoints: [], executionTimeoutMs: 999 });
  assert.equal(invalid.isError, true, "invalid execution budgets fail before attaching");
});

test("T7: targets lists worker/service_worker rows on request, attach accepts them (including blob: workers)", async () => {
  const rows = [{ type: "page", id: "p", url: "http://127.0.0.1:3456/", title: "g", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/p" },
    { type: "service_worker", id: "sw", url: "http://127.0.0.1:3456/sw.js", title: "sw", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/sw" },
    { type: "worker", id: "w", url: "blob:http://127.0.0.1:3456/abc", title: "", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/w" },
    { type: "iframe", id: "f", url: "http://127.0.0.1:3456/f", title: "" }];
  const srv = http.createServer((q, r) => r.end(JSON.stringify(rows.map(x => ({ ...x, webSocketDebuggerUrl: x.webSocketDebuggerUrl?.replace(":9222", ":" + srv.address().port) })))));
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const endpoint = `http://127.0.0.1:${srv.address().port}`;
  try {
    const { targets: t } = await import("../../tools/mcp/js-debugger-cdp.mjs");
    assert.deepEqual((await t(endpoint)).map(x => x.id), ["p"]);
    assert.deepEqual((await t(endpoint, "service_worker")).map(x => [x.id, x.type]), [["sw", "service_worker"]]);
    assert.deepEqual((await t(endpoint, "all")).map(x => x.id), ["p", "sw", "w"]);
    await assert.rejects(t(endpoint, "browser"), /targetType/);
    const c = new FakeCdp();
    const s = new DebugSession({ open: async () => c });
    await s.attach(endpoint, "w"); assert.equal(s.state().target.type, "worker");
    await s.detach(); await s.attach(endpoint, "sw"); assert.equal(s.state().target.id, "sw");
    const r = await callTool(s, "debugger_targets", { endpoint, targetType: "worker" });
    assert.deepEqual(r.structuredContent.targets.map(x => x.id), ["w"]);
  } finally { srv.close(); }
});
test("T8: a run pending across a reload/navigation (or a lost target) fails as aborted instead of staying pending", async () => {
  const { s, c } = await attached(); c.reply = () => new Promise(() => {});
  s.run("longAsync()", true);
  c.emit("Runtime.executionContextsCleared");
  const op = s.state().operations[0]; assert.equal(op.status, "aborted");
  assert.match(s.operations.get(1).error, /aborted: context destroyed/);
  const next = s.run("again()"); assert.equal(next.abandoned, undefined, "aborted run must not block or count as abandoned");
  c.close(); assert.equal(s.operations.get(2).status, "aborted"); assert.match(s.operations.get(2).error, /target disconnected/);
});
test("T9: a timed-out run stays tracked as timedOut; its late result is recorded; timeoutMs is per call", async () => {
  const { s, c } = await attached(); let lateCb, release;
  c.send = async function (method, params, timeout, late) {
    this.calls.push({ method, params, timeout });
    if (method === "Runtime.evaluate") { lateCb = late; throw Error("Runtime.evaluate response timed out; execution may still be active"); }
    if (method === "Runtime.releaseObjectGroup") return new Promise(resolve => { release = resolve; });
    return {};
  };
  const r = await callTool(s, "debugger_run", { expression: "slow()", awaitPromise: true, timeoutMs: 3000 });
  assert.equal(r.structuredContent.timeoutMs, 3000); await new Promise(setImmediate);
  assert.equal(c.calls.at(-1).timeout, 3000);
  assert.deepEqual([s.state().operations[0].status, s.state().operations[0].timedOut], ["unknown", true]);
  const completion = lateCb(null, { result: { type: "number", value: 5 } });
  assert.equal(s.state().operations[0].status, "unknown", "the late result is not final until remote cleanup settles");
  assert.equal(s.operationGroups.size, 1);
  release({}); await completion;
  const op = s.state(true).operations[0]; assert.equal(op.status, "completed"); assert.equal(op.late, true); assert.equal(op.result.result.value, 5);
  assert.equal(s.operationGroups.size, 0);
  assert.equal((await callTool(s, "debugger_run", { expression: "x", timeoutMs: 5 })).isError, true, "below 1000 ms is out of range");
});
test("T9: Cdp keeps a timed-out call's id so the late response reaches the handler", async () => {
  const socket = new EventTarget(); socket.readyState = 1; socket.send = () => {}; socket.close = () => {};
  const c = new Cdp(socket, 5); let got;
  await assert.rejects(c.send("Runtime.evaluate", {}, 5, (e, r) => { got = [e, r]; }), /timed out/);
  assert.equal(c.pending.size, 1);
  socket.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify({ id: 1, result: { result: { value: 9 } } }) }));
  assert.deepEqual(got, [null, { result: { value: 9 } }]); assert.equal(c.pending.size, 0);
});
test("T10: state reports pageUnresponsive when a long run blocks Runtime.evaluate; cancel terminates the script", async () => {
  const { s, c } = await attached();
  c.send = async function (method, params, timeout) {
    this.calls.push({ method, params, timeout });
    if (method === "Runtime.evaluate" && params.expression === "1") throw Error("Runtime.evaluate response timed out");
    if (method === "Runtime.evaluate") return new Promise(() => {});
    return {};
  };
  s.run("for(;;){}"); s.operations.get(1).startedAt -= 5000;
  const st = (await callTool(s, "debugger_state")).structuredContent;
  assert.equal(st.pageUnresponsive, true); assert.match(st.pageNote, /cancel/);
  const cancelled = await callTool(s, "debugger_control", { action: "cancel" });
  assert.equal(c.calls.at(-1).method, "Runtime.terminateExecution"); assert.equal(cancelled.isError, false);
  assert.equal(s.operations.get(1).status, "cancelled");
  s.run("quick()"); // fresh pending op younger than 2 s is not probed
  c.send = async () => { throw Error("must not probe"); };
  assert.equal((await callTool(s, "debugger_state")).structuredContent.pageUnresponsive, undefined);
});
test("T11: a lost target reads detached: target gone; a deliberate detach does not", async () => {
  const { s, c } = await attached(); c.close();
  const st = s.state(); assert.equal(st.connected, false); assert.match(st.detached, /^target gone: CDP connection closed/);
  const b = await attached(); await b.s.detach(); assert.equal(b.s.state().detached, undefined);
  const d = await attached(); d.c.emit("Inspector.detached", { reason: "target_closed" }); d.c.close();
  assert.equal(d.s.state().detached, "target gone: target_closed");
});
test("T2: debugger_state carries only the latest operation's result, however many ran (fixed in #2535)", async () => {
  const { s, c } = await attached(); c.reply = async () => ({ result: { type: "string", value: "x".repeat(3000) } });
  for (let i = 0; i < 12; i++) { s.run("r" + i); await new Promise(setImmediate); }
  const ops = s.state(true).operations; assert.equal(ops.length, 10);
  assert.equal(ops.filter(o => o.result).length, 1); assert.ok(ops.at(-1).result);
  assert.ok(JSON.stringify(ops).length < 6000, "response size must not grow with the number of past runs");
});
test("T12: attach remembers the last endpoint; common parameter aliases are accepted and every rejection names the right key", async () => {
  const { s, c } = await attached(); await s.detach();
  const unconfigured = new DebugSession({ sharedEndpoint: () => null });
  assert.equal((await callTool(unconfigured, "debugger_attach", { targetId: "t" })).structuredContent.error.includes("endpoint is required"), true);
  s.discover = async () => [{ type: "page", id: "t", url: "about:blank", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/t" }];
  await s.listTargets("http://127.0.0.1:9222");
  const c2 = new FakeCdp(); s.open = async () => c2;
  assert.equal((await callTool(s, "debugger_attach", { targetId: "t" })).isError, false, "endpoint omitted after debugger_targets");
  paused(c2); const token = s.pause.token;
  c2.reply = async () => ({ result: { type: "number", value: 1 } });
  const ev = await callTool(s, "debugger_evaluate", { pauseToken: token, frameIndex: 0, expression: "1" });
  assert.equal(ev.isError, false); assert.equal(c2.calls.at(-1).params.callFrameId, "frame1");
  const bad = await callTool(s, "debugger_evaluate", { pauseToken: token, expression: "1", bogus: 1 });
  assert.match(bad.structuredContent.error, /Unknown argument: bogus; valid arguments: pauseToken, frame, expression, allowSideEffects/);
  assert.match((await callTool(s, "debugger_evaluate", { expression: "1" })).structuredContent.error, /Missing argument: pauseToken \(Current pause\.token/);
  assert.equal((await callTool(s, "debugger_exceptions", { mode: "none" })).isError, false);
  assert.deepEqual(c2.calls.at(-1), { method: "Debugger.setPauseOnExceptions", params: { state: "none" }, timeout: undefined });
  c2.emit("Debugger.scriptParsed", { scriptId: "s1", url: frame.url, startLine: 0, endLine: 20 });
  c2.reply = async () => ({ scriptSource: Array.from({ length: 20 }, (_, i) => "line" + (i + 1)).join("\n") });
  const src = (await callTool(s, "debugger_source", { url: frame.url, startLine: 3, endLine: 5 })).structuredContent;
  assert.equal(src.source, "3: line3\n4: line4\n5: line5");
  assert.match((await callTool(s, "debugger_source", {})).structuredContent.error, /needs scriptId, or url/);
});
test("T13: detach always drops the local session, even when every CDP call hangs, and the daemon can attach again", async () => {
  const { s, c } = await attached(); await s.setBreakpoint(frame.url, 4); paused(c);
  c.send = () => new Promise(() => {}); // wedged page: no CDP answer ever
  s.toolBusy = true; // a stuck command must not block the recovery path
  const r = await callTool(s, "debugger_detach", {});
  assert.equal(r.structuredContent.detached, true); assert.ok(r.structuredContent.cleanupErrors.length, "failures are reported");
  assert.equal(s.cdp, null); assert.equal(s.breakpoints.size, 0); assert.equal(s.pause, null); assert.equal(s.state().connected, false);
  const c2 = new FakeCdp(); s.open = async () => c2;
  await s.attach("http://127.0.0.1:9222", "t"); assert.equal(s.state().connected, true);
}, { timeout: 15000 });
test("T14a: a pause whose resumed event never arrived does not block debugger_run; a live pause still does", async () => {
  const { s, c } = await attached(); paused(c);
  c.reply = async method => { if (method === "Debugger.evaluateOnCallFrame") throw Error("Invalid call frame id"); return {}; };
  const ok = await callTool(s, "debugger_run", { expression: "1" }); assert.equal(ok.isError, false); assert.equal(s.pause, null);
  paused(c); c.reply = async () => ({ result: { value: 0 } });
  const live = await callTool(s, "debugger_run", { expression: "1" }); assert.equal(live.isError, true); assert.match(live.structuredContent.error, /while paused/);
  // synthetic frameless pause (iframe destroyed): resume probe says the thread is not paused
  c.emit("Runtime.executionContextDestroyed", { executionContextId: 99 }); assert.deepEqual(s.pause.frames, []);
  c.reply = async method => { if (method === "Debugger.resume") throw Error("Can only perform operation while paused."); return {}; };
  assert.equal((await callTool(s, "debugger_run", { expression: "2" })).isError, false);
});
test("T14b: a refused paused evaluate (e.g. localStorage read) says to retry with allowSideEffects:true", async () => {
  const { s, c } = await attached(); paused(c);
  c.reply = async () => ({ result: { type: "object" }, exceptionDetails: { text: "Uncaught", exception: { description: "EvalError: Possible side-effect in debug-evaluate" } } });
  const r = await callTool(s, "debugger_evaluate", { pauseToken: s.pause.token, expression: "localStorage.getItem('apex26.x')" });
  assert.equal(r.isError, true); assert.match(r.structuredContent.hint, /allowSideEffects:true/);
  const ok = await callTool(s, "debugger_evaluate", { pauseToken: s.pause.token, expression: "localStorage.getItem('apex26.x')", allowSideEffects: true });
  assert.equal(ok.structuredContent.hint, undefined);
});
test("boot lane: a non-matching or invalid filter returns nothing / a clear error, never everything", async () => {
  const { s, c } = await attached();
  c.emit("Debugger.scriptParsed", { scriptId: "g", url: "http://127.0.0.1:3456/js/game.js", startLine: 0, endLine: 9 });
  c.emit("Debugger.scriptParsed", { scriptId: "h", url: "http://127.0.0.1:3456/js/hud.js", startLine: 0, endLine: 9 });
  assert.equal((await s.scriptsList("")).total, 2);
  const none = await s.scriptsList("no-such-script.js"); assert.deepEqual([none.scripts, none.total], [[], 0]);
  assert.equal((await s.scriptsList("^http.*/hud\\.js$", { regex: true })).scripts[0].scriptId, "h");
  const bad = await callTool(s, "debugger_scripts", { filter: "(", regex: true }); assert.equal(bad.isError, true); assert.match(bad.structuredContent.error, /regular expression/i);
});
test("boot lane: attaching a non-local page is refused with a message that says why", async () => {
  const c = new FakeCdp();
  const s = new DebugSession({ discover: async () => [{ type: "page", id: "t", url: "https://brycejmurrin.github.io/f1-game/", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/t" }], open: async () => c });
  await assert.rejects(s.attach("http://127.0.0.1:9222", "t"), /only attaches pages served from 127\.0\.0\.1, localhost or \[::1\] \(local repros only/);
});
