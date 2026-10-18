// No browser: real session/trace routes with documented CDP RemoteObject fixtures.
// https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#type-RemoteObject
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import { DebugSession } from "../../tools/mcp/js-debugger-session.mjs";
import { callTool } from "../../tools/mcp/js-debugger-mcp.mjs";

class FakeCdp extends EventEmitter {
  closed = false;
  calls = [];
  listenerTypes = [];
  async send(method, params) {
    this.calls.push({ method, params });
    if (method === "Runtime.evaluate") return { result: { type: "object", objectId: "window" } };
    if (method === "DOMDebugger.getEventListeners") return { listeners: this.listenerTypes.map(type => ({ type })) };
    return {};
  }
  close() { this.closed = true; this.emit("disconnect", Error("fixture closed")); }
}
async function attached(t) {
  const cdp = new FakeCdp();
  const session = new DebugSession({
    discover: async () => [{ id: "fixture", type: "page", url: "about:blank",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/fixture" }],
    open: async () => cdp,
  });
  await session.attach("http://127.0.0.1:9222", "fixture");
  t.after(() => session.detach());
  return { session, cdp };
}
const throwRemote = (cdp, data) => cdp.emit("Debugger.paused", { reason: "exception", data, callFrames: [] });
async function tool(session, name, args) {
  const result = await callTool(session, name, args);
  assert.equal(result.isError, false, result.content[0].text);
  // Verify dictionaries retain their keys across the actual MCP JSON representation.
  return JSON.parse(result.content[0].text);
}

test("exception counts accept inherited object names before and after clear/restart", async t => {
  const { session, cdp } = await attached(t);
  for (const action of ["start", "clear", "start"]) {
    await tool(session, "debugger_exception_log", { action });
    for (const value of ["constructor", "toString", "__proto__", "__proto__"])
      throwRemote(cdp, { type: "string", value });
    const result = await tool(session, "debugger_exception_log", { action: "read" });
    assert.equal(result.total, 4);
    assert.deepEqual(result.counts, JSON.parse('{"constructor":1,"toString":1,"__proto__":2}'));
    assert.equal(session.pause, null);
  }
  assert.equal(cdp.calls.filter(c => c.method === "Debugger.resume").length, 12);
});

test("exception log preserves primitive throws and CDP unserializable values", async t => {
  const { session, cdp } = await attached(t);
  await tool(session, "debugger_exception_log", { action: "start" });
  const cases = [
    ["0", { type: "number", value: 0 }, "0"],
    ["false", { type: "boolean", value: false }, "false"],
    ["null", { type: "object", subtype: "null", value: null }, "null"],
    ["undefined", { type: "undefined" }, "undefined"],
    ["NaN", { type: "number", unserializableValue: "NaN" }, "NaN"],
    ["-0", { type: "number", unserializableValue: "-0" }, "-0"],
    ["Infinity", { type: "number", unserializableValue: "Infinity" }, "Infinity"],
    ["-Infinity", { type: "number", unserializableValue: "-Infinity" }, "-Infinity"],
    ["12n", { type: "bigint", unserializableValue: "12n" }, "12n"],
    ['""', { type: "string", value: "" }, ""],
  ];
  for (const [source, remote] of cases) {
    // Each fixture represents a value that real JavaScript can throw, including falsy values.
    assert.equal(vm.runInNewContext(`try { throw (${source}); } catch (value) { typeof value; }`), remote.type);
    throwRemote(cdp, remote);
  }
  const result = await tool(session, "debugger_exception_log", { action: "read" });
  assert.deepEqual(result.entries.map(e => e.message), cases.map(c => c[2]));
  for (const [, , message] of cases) assert.equal(result.counts[message], 1);
});

test("exception log keeps bounded first-line descriptions and per-message counts", async t => {
  const { session, cdp } = await attached(t);
  await tool(session, "debugger_exception_log", { action: "start", max: 1 });
  throwRemote(cdp, { type: "object", subtype: "error", description: "Error: boom\n    at fixture" });
  throwRemote(cdp, { type: "string", value: "x".repeat(400) });
  const result = await tool(session, "debugger_exception_log", { action: "read" });
  assert.equal(result.total, 2);
  assert.equal(result.retained, 1);
  assert.equal(result.counts["Error: boom"], 1);
  assert.equal(result.entries[0].message, "x".repeat(300));
});

test("listener counts include custom event types named after inherited object properties", async t => {
  const { session, cdp } = await attached(t);
  cdp.listenerTypes = ["constructor", "toString", "__proto__", "__proto__", "click"];
  const result = await tool(session, "debugger_listeners", {});
  assert.equal(result.total, 5);
  assert.deepEqual(result.byType, JSON.parse('{"constructor":1,"toString":1,"__proto__":2,"click":1}'));
  assert.ok(cdp.calls.some(c => c.method === "Runtime.releaseObjectGroup" && c.params.objectGroup === "apex-dbg-listeners"));
});
