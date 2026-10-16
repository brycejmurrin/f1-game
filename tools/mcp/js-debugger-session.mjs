// @doc Agent debugger session: pause generations, breakpoints, scopes and nonblocking execution.
import { randomUUID } from "node:crypto";
import { Cdp, localUrl, targets } from "./js-debugger-cdp.mjs";

const clip = (s, max = 2000) => String(s || "").slice(0, max);
const sourceLocation = p => ({ scriptId: p.scriptId, line: p.lineNumber + 1, column: (p.columnNumber ?? 0) + 1 });
function exceptionPreview(value) {
  if (!value || typeof value.type !== "string") return undefined;
  const out = { type: value.type, subtype: value.subtype, className: clip(value.className, 100),
    description: clip(value.description, 200), objectId: value.objectId,
    unserializableValue: value.unserializableValue, uncaught: value.uncaught };
  if (Object.hasOwn(value, "value") && (value.value === null || ["string", "number", "boolean"].includes(typeof value.value))) {
    out.value = typeof value.value === "string" ? clip(value.value, 2000) : value.value;
    if (typeof value.value === "string" && value.value.length > 2000) out.truncated = true;
  }
  return out;
}
function operationResult(result) {
  const size = JSON.stringify(result).length;
  return size <= 4000 ? result : { truncated: true, originalCharacters: size,
    result: { type: result.result?.type, subtype: result.result?.subtype, description: clip(result.result?.description, 200) },
    hadException: !!result.exceptionDetails };
}
export class DebugSession {
  constructor({ discover = targets, open = Cdp.open } = {}) {
    this.discover = discover; this.open = open;
    this.cdp = null; this.pause = null; this.sequence = 0;
    this.scripts = new Map(); this.objects = new Set(); this.breakpoints = new Map();
    this.operations = new Map(); this.operationSequence = 0; this.connecting = false;
    this.operationGroups = new Set();
    this.generation = randomUUID();
  }
  resetPause() {
    const token = this.pause?.token;
    this.pause = null; this.objects.clear();
    if (token && this.cdp && !this.cdp.closed) this.cdp.send("Runtime.releaseObjectGroup", { objectGroup: token }).catch(() => {});
  }
  markOperations(from, to) { for (const o of this.operations.values()) if (o.status === from) o.status = to; }
  connected() { if (!this.cdp || this.cdp.closed) throw Error("Attach a target first"); return this.cdp; }
  paused(token) {
    this.connected();
    if (!this.pause || this.pause.token !== token) throw Error("Stale or missing pauseToken; read debugger_state again");
    return this.pause;
  }
  remember(value) {
    if (!value) return value;
    if (value.objectId) this.objects.add(value.objectId);
    return { ...value, description: clip(value.description, 200), preview: undefined };
  }
  clearScripts() {
    this.scripts.clear();
    for (const bp of this.breakpoints.values()) bp.locations = [];
  }
  forgetScript(id) {
    this.scripts.delete(id);
    for (const bp of this.breakpoints.values()) bp.locations = bp.locations.filter(p => p.scriptId !== id);
  }
  resolveBreakpoint(id, location) {
    const bp = this.breakpoints.get(id);
    if (!bp || !location || !this.scripts.has(location.scriptId)) return;
    const p = sourceLocation(location);
    if (bp.locations.some(q => q.scriptId === p.scriptId && q.line === p.line && q.column === p.column)) return;
    bp.locations.push(p);
    if (bp.locations.length > 5) bp.locations.shift();
  }
  // Only the latest operation carries its result: tool responses used to re-send
  // all ten stored results on every call. Older rows keep id/status.
  state(withResults = false) {
    const ops = [...this.operations.values()];
    return { connected: !!this.cdp && !this.cdp.closed, target: this.target || null,
      paused: !!this.pause, pause: this.pause,
      breakpointCount: this.breakpoints.size, breakpoints: [...this.breakpoints.values()].slice(0, 20).map(b => ({ ...b, url: clip(b.url, 300) })),
      operations: withResults ? ops.map((o, i) => i === ops.length - 1 ? o : { id: o.id, status: o.status }) : ops.map(o => ({ id: o.id, status: o.status })) };
  }
  async listTargets(endpoint) {
    return { targets: (await this.discover(endpoint)).map(({ webSocketDebuggerUrl, ...t }) => t) };
  }
  async attach(endpoint, targetId) {
    if (this.connecting || this.cdp) throw Error("Already attached or attaching; detach first");
    this.connecting = true;
    let client;
    try {
      const rows = await this.discover(endpoint);
      const target = rows.find(t => t.id === targetId);
      if (!target) throw Error("Unknown page targetId; use debugger_targets");
      // The repository's debugger works on local repros, never the deployed site.
      if (target.url !== "about:blank") localUrl(target.url.split(/[?#]/)[0]);
      const ws = localUrl(target.webSocketDebuggerUrl, true), origin = localUrl(endpoint);
      if (ws.host !== origin.host) throw Error("Target WebSocket must use the discovery host and port");
      client = await this.open(ws.href); this.cdp = client;
      this.target = { id: target.id, url: clip(target.url, 1000), title: clip(target.title, 200) };
      this.generation = randomUUID(); this.operations.clear(); this.scripts.clear();
      client.on("Debugger.scriptParsed", s => {
        if (this.scripts.size >= 2000 && !this.scripts.has(s.scriptId)) this.forgetScript(this.scripts.keys().next().value);
        this.scripts.set(s.scriptId, { scriptId: s.scriptId, url: clip(s.url), startLine: s.startLine + 1, endLine: s.endLine + 1, executionContextId: s.executionContextId });
        for (const b of s.resolvedBreakpoints || []) this.resolveBreakpoint(b.breakpointId, b.location);
      });
      client.on("Debugger.breakpointResolved", b => this.resolveBreakpoint(b.breakpointId, b.location));
      client.on("Debugger.paused", event => {
        this.resetPause();
        this.markOperations("pending", "paused");
        this.pause = { token: `${this.generation}:${++this.sequence}`, reason: event.reason,
          exception: ["exception", "promiseRejection"].includes(event.reason) ? this.remember(exceptionPreview(event.data)) : undefined,
          hitBreakpoints: event.hitBreakpoints || [],
          frames: event.callFrames.slice(0, 10).map((f, index) => ({ index, functionName: clip(f.functionName, 200),
            url: clip(f.url || this.scripts.get(f.location.scriptId)?.url, 1000), scriptId: f.location.scriptId,
            line: f.location.lineNumber + 1, column: f.location.columnNumber + 1, callFrameId: f.callFrameId,
            scopes: f.scopeChain.slice(0, 6).map(s => ({ type: s.type, name: clip(s.name, 100), object: this.remember(s.object) })) })) };
      });
      client.on("Debugger.resumed", () => { this.resetPause(); this.markOperations("paused", "pending"); });
      client.on("Runtime.executionContextsCleared", () => { this.resetPause(); this.clearScripts(); });
      client.on("Runtime.executionContextDestroyed", event => {
        const wasPaused = !!this.pause;
        this.resetPause();
        for (const [id, script] of this.scripts) if (script.executionContextId === event.executionContextId) this.forgetScript(id);
        // An iframe can be removed by a paused evaluation while the main
        // context remains stopped. Invalidate handles, but retain a resumable
        // pause instead of falsely reporting that execution is running.
        if (wasPaused) this.pause = { token: `${this.generation}:${++this.sequence}`,
          reason: "executionContextDestroyed", hitBreakpoints: [], frames: [] };
      });
      client.on("Debugger.globalObjectCleared", () => { this.resetPause(); this.clearScripts(); });
      client.on("disconnect", () => {
        this.resetPause(); this.scripts.clear(); this.breakpoints.clear(); this.operationGroups.clear();
        if (this.cdp === client) { this.cdp = null; this.target = null; }
      });
      await client.send("Runtime.enable");
      await client.send("Debugger.enable");
      await client.send("Debugger.setAsyncCallStackDepth", { maxDepth: 8 });
      return this.state();
    } catch (e) { client?.close(); this.cdp = null; this.target = null; throw e; }
    finally { this.connecting = false; }
  }
  async detach() {
    const client = this.cdp;
    if (!client) return { detached: true, cleanupErrors: [] };
    const cleanupErrors = [], cleanupWarnings = [];
    let resumedEventObserved = false;
    const observed = () => { resumedEventObserved = true; };
    client.on("Debugger.resumed", observed);
    // Reset exception pauses and owned breakpoints before resuming the program.
    const commands = [["Debugger.setPauseOnExceptions", { state: "none" }],
      ...[...this.breakpoints.keys()].map(breakpointId => ["Debugger.removeBreakpoint", { breakpointId }]),
      ...[...this.operationGroups].map(objectGroup => ["Runtime.releaseObjectGroup", { objectGroup }]),
      ["Runtime.releaseObjectGroup", { objectGroup: this.generation }]];
    if (this.pause) commands.push(["Runtime.releaseObjectGroup", { objectGroup: this.pause.token }]);
    await Promise.all(commands.map(async ([method, params]) => {
      try { await client.send(method, params, 1000); } catch (e) { cleanupErrors.push(`${method}: ${clip(e.message)}`); }
    }));
    for (const method of [...(this.pause ? ["Debugger.resume"] : []), "Debugger.disable"]) {
      try { await client.send(method, {}, 1000); } catch (e) {
        // Closing the CDP session below disables the domain anyway, so a slow
        // Debugger.disable (full software-GL frames) is a warning, not a failed cleanup.
        (method === "Debugger.disable" ? cleanupWarnings : cleanupErrors).push(`${method}: ${clip(e.message)}`);
      }
    }
    client.close(); this.cdp = null; this.target = null; this.resetPause();
    client.removeListener("Debugger.resumed", observed);
    this.breakpoints.clear(); this.scripts.clear();
    return { detached: true, cleanupErrors, cleanupWarnings, cleanupAcknowledged: cleanupErrors.length === 0, resumedEventObserved };
  }
  async scriptsList(filter = "") {
    this.connected(); return { scripts: [...this.scripts.values()].filter(s => s.url.includes(filter)).slice(0, 200) };
  }
  async source(scriptId, startLine, count) {
    if (!this.scripts.has(scriptId)) throw Error("Unknown/stale scriptId; list scripts again");
    const r = await this.connected().send("Debugger.getScriptSource", { scriptId });
    const lines = (r.scriptSource || "").split("\n");
    return { scriptId, startLine, totalLines: lines.length,
      source: lines.slice(startLine - 1, startLine - 1 + count).map((s, i) => `${startLine + i}: ${clip(s, 1000)}`).join("\n") };
  }
  async setBreakpoint(url, line, column = 1, condition = "") {
    if (this.breakpoints.size >= 100) throw Error("Breakpoint limit 100 reached; remove unused breakpoints");
    const r = await this.connected().send("Debugger.setBreakpointByUrl", { url, lineNumber: line - 1,
      columnNumber: column - 1, condition });
    const bp = { id: r.breakpointId, url, line, column, locations: [] };
    this.breakpoints.set(bp.id, bp);
    for (const p of (r.locations || []).slice(0, 5)) this.resolveBreakpoint(bp.id, p);
    return bp;
  }
  async removeBreakpoint(id) {
    if (!this.breakpoints.has(id)) throw Error("Breakpoint is not owned by this session");
    await this.connected().send("Debugger.removeBreakpoint", { breakpointId: id }); this.breakpoints.delete(id);
    return { removed: id };
  }
  async control(action, token) {
    const methods = { pause: "Debugger.pause", resume: "Debugger.resume", over: "Debugger.stepOver", into: "Debugger.stepInto", out: "Debugger.stepOut" };
    if (action !== "pause") this.paused(token);
    else if (this.pause) return this.state();
    const before = this.pause?.token;
    await this.connected().send(methods[action]);
    // CDP events, not command acknowledgments, prove the new pause. If resumed
    // has not arrived yet, remove the old frame handles before returning.
    if (action !== "pause" && this.pause?.token === before) this.resetPause();
    return this.state();
  }
  async exceptions(state) { await this.connected().send("Debugger.setPauseOnExceptions", { state }); return { state }; }
  async evaluate(token, frame, expression, allowSideEffects = false) {
    const pause = this.paused(token), callFrame = pause.frames[frame];
    if (!callFrame) throw Error("Unknown frame index");
    const result = await this.connected().send("Debugger.evaluateOnCallFrame", { callFrameId: callFrame.callFrameId,
      expression, silent: true, throwOnSideEffect: !allowSideEffects, returnByValue: false,
      generatePreview: false, objectGroup: token, timeout: 1000 }, 2000);
    this.paused(token);
    return { ...result, result: this.remember(result.result), ok: !result.exceptionDetails };
  }
  async properties(token, objectId, offset, limit) {
    this.paused(token);
    if (!this.objects.has(objectId)) throw Error("Object is not owned by the current pause");
    const r = await this.connected().send("Runtime.getProperties", { objectId, ownProperties: true, generatePreview: false });
    this.paused(token);
    return { total: r.result?.length || 0, properties: (r.result || []).slice(offset, offset + limit)
      .map(p => ({ name: clip(p.name), enumerable: p.enumerable, configurable: p.configurable,
        value: this.remember(p.value), get: this.remember(p.get), set: this.remember(p.set) })), exceptionDetails: r.exceptionDetails };
  }
  run(expression, awaitPromise = false) {
    const client = this.connected();
    if (this.pause) throw Error("Use debugger_evaluate while paused");
    if ([...this.operations.values()].some(o => ["pending", "unknown"].includes(o.status))) throw Error("An evaluation is pending or its execution is unknown; inspect state/resume or detach first");
    const id = ++this.operationSequence, generation = this.generation;
    const objectGroup = `${generation}:run:${id}`;
    this.operationGroups.add(objectGroup);
    const operation = { id, status: "pending" }; this.operations.set(id, operation);
    if (this.operations.size > 10) this.operations.delete(this.operations.keys().next().value);
    // Deliberately not awaited: a breakpoint inside the expression must not
    // prevent a later MCP request from inspecting and resuming it.
    client.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true,
      generatePreview: false, objectGroup }, 600000).then(async r => {
      // returnByValue still creates remote Error handles on thrown expressions.
      // Their graphs must not survive for the whole attachment after a result
      // has been copied into the bounded history. Unknown/timed-out execution
      // keeps its group until detach: a deadline does not cancel page JS.
      let cleanupError;
      try {
        await client.send("Runtime.releaseObjectGroup", { objectGroup }, 1000);
        this.operationGroups.delete(objectGroup);
      } catch (e) {
        cleanupError = clip(e.message);
      }
      // A final operation status also means its cleanup attempt has settled,
      // so clients can verify reachability without racing the release command.
      if (this.generation === generation) Object.assign(operation, { status: r.exceptionDetails ? "exception" : "completed",
        result: operationResult(r), ...(cleanupError ? { cleanupError } : {}) });
    }, e => { if (this.generation === generation) Object.assign(operation, { status: "unknown", error: clip(e.message) }); });
    return { operationId: id, status: "pending", note: "Inspect debugger_state; a response timeout does not cancel JavaScript execution." };
  }
}
