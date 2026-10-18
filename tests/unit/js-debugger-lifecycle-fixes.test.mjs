import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import { DebugSession } from "../../tools/mcp/js-debugger-session.mjs";

const target = { type: "page", id: "t", url: "about:blank", title: "fixture",
  webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/t" };
const endpoint = "http://127.0.0.1:9222";
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const turn = () => new Promise(resolve => setImmediate(resolve));

class FakeCdp extends EventEmitter {
  constructor() { super(); this.calls = []; this.closed = false; }
  async send(method, params = {}) { this.calls.push({ method, params }); return {}; }
  close() { if (this.closed) return; this.closed = true; this.emit("disconnect", Error("closed")); }
}

class DelayedDisconnectCdp extends FakeCdp {
  close() { this.closed = true; }
  disconnectNow() { this.emit("disconnect", Error("delayed close")); }
}

class DelayedCleanupCdp extends DelayedDisconnectCdp {
  constructor(gate) { super(); this.gate = gate; }
  async send(method, params = {}) {
    this.calls.push({ method, params });
    if (method === "Runtime.releaseObjectGroup") return this.gate.promise;
    return {};
  }
}

test("detach invalidates an attach pending in discovery", async () => {
  const discovery = deferred(); let opens = 0;
  const session = new DebugSession({ discover: () => discovery.promise, open: async () => { opens++; return new FakeCdp(); } });
  const attaching = session.attach(endpoint, "t"); await turn();
  assert.equal((await session.detach()).detached, true);
  discovery.resolve([target]);
  await assert.rejects(attaching, /cancelled.*detach/i);
  assert.equal(opens, 0, "a stale discovery must not open a socket");
  assert.equal(session.state().connected, false);
});

test("a late open is closed and cannot replace a newer attachment", async () => {
  const oldOpen = deferred(), oldClient = new FakeCdp(), newClient = new FakeCdp(); let opens = 0;
  const session = new DebugSession({ discover: async () => [target], open: () => ++opens === 1 ? oldOpen.promise : Promise.resolve(newClient) });
  const stale = session.attach(endpoint, "t"); await turn();
  await session.detach();
  await session.attach(endpoint, "t");
  oldOpen.resolve(oldClient);
  await assert.rejects(stale, /cancelled.*detach/i);
  assert.equal(oldClient.closed, true, "late stale client is closed");
  assert.equal(session.cdp, newClient, "stale attach cleanup cannot clear the newer client");
  assert.equal(session.state().connected, true);
  await session.detach();
});

test("a delayed disconnect from the old client cannot clear newer session state", async () => {
  const oldClient = new DelayedDisconnectCdp(), newClient = new FakeCdp(); let opens = 0;
  const session = new DebugSession({ discover: async () => [target], open: async () => ++opens === 1 ? oldClient : newClient });
  await session.attach(endpoint, "t"); await session.detach(); await session.attach(endpoint, "t");
  newClient.emit("Debugger.scriptParsed", { scriptId: "new-script", url: "http://127.0.0.1:3456/new.js", startLine: 0, endLine: 2 });
  newClient.emit("Debugger.paused", { reason: "other", callFrames: [{ callFrameId: "new-frame", functionName: "newer",
    url: "http://127.0.0.1:3456/new.js", location: { scriptId: "new-script", lineNumber: 1, columnNumber: 0 },
    scopeChain: [{ type: "local", object: { type: "object", objectId: "new-object" } }] }] });
  session.breakpoints.set("new-bp", { id: "new-bp", locations: [] });
  session.logpoints.set("new-ring", { id: "new-ring", breakpointId: "new-bp" });
  session.logpointRings.add("new-ring");
  const token = session.pause.token;
  oldClient.disconnectNow();
  assert.equal(session.cdp, newClient);
  assert.equal(session.pause.token, token);
  assert.equal(session.scripts.has("new-script"), true);
  assert.equal(session.breakpoints.has("new-bp"), true);
  assert.equal(session.logpoints.has("new-ring"), true);
  assert.equal(session.logpointRings.has("new-ring"), true);
  await session.detach();
});

test("old detach finalization cannot clear a replacement attached during delayed cleanup", async () => {
  const cleanup = deferred(), oldClient = new DelayedCleanupCdp(cleanup), newClient = new FakeCdp(); let opens = 0;
  const session = new DebugSession({ discover: async () => [target], open: async () => ++opens === 1 ? oldClient : newClient });
  await session.attach(endpoint, "t");
  const detaching = session.detach(); await turn();
  oldClient.disconnectNow();
  await session.attach(endpoint, "t");
  newClient.emit("Debugger.scriptParsed", { scriptId: "replacement", url: "http://127.0.0.1:3456/replacement.js", startLine: 0, endLine: 1 });
  cleanup.resolve({}); await detaching;
  assert.equal(session.cdp, newClient);
  assert.equal(session.state().connected, true);
  assert.equal(session.scripts.has("replacement"), true);
  await session.detach();
});

class PageCdp extends FakeCdp {
  constructor() { super(); this.context = vm.createContext({ performance: { now: () => 1 } }); this.next = 0; this.failRingCleanupOnce = false; }
  async send(method, params = {}) {
    this.calls.push({ method, params });
    if (method === "Debugger.setBreakpointByUrl") {
      vm.runInContext(params.condition, this.context);
      return { breakpointId: `bp${++this.next}`, locations: [] };
    }
    if (method === "Runtime.evaluate") {
      if (this.failRingCleanupOnce && /__apexDbgLog/.test(params.expression)) { this.failRingCleanupOnce = false; throw Error("injected cleanup failure"); }
      return { result: { value: vm.runInContext(params.expression, this.context) } };
    }
    return {};
  }
  rings() { return [...vm.runInContext("Object.keys(globalThis.__apexDbgLog || {})", this.context)]; }
}
async function attachedPage() {
  const client = new PageCdp();
  const session = new DebugSession({ discover: async () => [target], open: async () => client });
  await session.attach(endpoint, "t"); return { session, client };
}

test("removing hit logpoints deletes each page ring and bounds repeated set/remove ownership", async () => {
  const { session, client } = await attachedPage();
  for (let i = 0; i < 25; i++) {
    const logpoint = await session.setLogpoint({ url: "http://127.0.0.1:3456/app.js", line: i + 1, expression: String(i), maxHits: 2 });
    assert.deepEqual(client.rings(), [logpoint.id], "condition fixture records a hit");
    await session.removeBreakpoint(logpoint.breakpointId);
    assert.deepEqual(client.rings(), [], "removal deletes the page-side ring");
    assert.equal(session.logpoints.size, 0);
    assert.equal(session.logpointRings.size, 0);
  }
  await session.detach();
  assert.equal(vm.runInContext("globalThis.__apexDbgLog", client.context), undefined);
});

test("detach retries an owned ring whose per-logpoint cleanup failed", async () => {
  const { session, client } = await attachedPage();
  const logpoint = await session.setLogpoint({ url: "http://127.0.0.1:3456/app.js", line: 1, expression: "42" });
  vm.runInContext("globalThis.__apexDbgLog.foreign={n:1,items:[]}", client.context);
  client.failRingCleanupOnce = true;
  await session.removeBreakpoint(logpoint.breakpointId);
  assert.deepEqual(client.rings().sort(), ["foreign", logpoint.id].sort());
  assert.equal(session.logpoints.size, 0, "removed breakpoint is no longer exposed as active");
  assert.equal(session.logpointRings.size, 1, "failed cleanup remains owned for detach retry");
  const detached = await session.detach();
  assert.deepEqual(detached.cleanupErrors, []);
  assert.deepEqual(client.rings(), ["foreign"], "detach preserves rings not owned by this session");
  assert.equal(session.logpointRings.size, 0);
});
