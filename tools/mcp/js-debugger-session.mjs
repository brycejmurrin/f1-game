// @doc Agent debugger session: pause generations, breakpoints, scopes and nonblocking execution.
import { randomUUID } from "node:crypto";
import { Cdp, localUrl, targets } from "./js-debugger-cdp.mjs";
import { recordException, traceMethods } from "./js-debugger-trace.mjs";

const clip = (s, max = 2000) => String(s || "").slice(0, max);
const sourceLocation = p => ({ scriptId: p.scriptId, line: p.lineNumber + 1, column: (p.columnNumber ?? 0) + 1 });
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
    this.logpoints = new Map(); this.logpointSequence = 0; this.exceptionLog = null;
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
  // Anonymous/eval scripts flood the table; evict those first so a named game.js survives.
  evictable() {
    for (const [id, script] of this.scripts) if (!script.url) return id;
    return this.scripts.keys().next().value;
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
        if (this.scripts.size >= 2000 && !this.scripts.has(s.scriptId)) this.forgetScript(this.evictable());
        this.scripts.set(s.scriptId, { scriptId: s.scriptId, url: clip(s.url), startLine: s.startLine + 1, endLine: s.endLine + 1, executionContextId: s.executionContextId });
        for (const b of s.resolvedBreakpoints || []) this.resolveBreakpoint(b.breakpointId, b.location);
      });
      client.on("Debugger.breakpointResolved", b => this.resolveBreakpoint(b.breakpointId, b.location));
      client.on("Debugger.paused", event => {
        // Exception log mode records and resumes: the page never visibly stops.
        if (recordException(this, event)) return;
        this.resetPause();
        this.markOperations("pending", "paused");
        this.pause = { token: `${this.generation}:${++this.sequence}`, reason: event.reason,
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
        this.resetPause(); this.scripts.clear(); this.breakpoints.clear(); this.logpoints.clear(); this.exceptionLog = null;
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
    this.exceptionLog = null;
    const commands = [["Debugger.setPauseOnExceptions", { state: "none" }],
      ...[...this.breakpoints.keys()].map(breakpointId => ["Debugger.removeBreakpoint", { breakpointId }]),
      ["Runtime.releaseObjectGroup", { objectGroup: this.generation }]];
    if (this.pause) commands.push(["Runtime.releaseObjectGroup", { objectGroup: this.pause.token }]);
    if (this.logpoints.size) commands.push(["Runtime.evaluate", { expression: "delete globalThis.__apexDbgLog", silent: true }]);
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
    this.breakpoints.clear(); this.logpoints.clear(); this.scripts.clear();
    return { detached: true, cleanupErrors, cleanupWarnings, cleanupAcknowledged: cleanupErrors.length === 0, resumedEventObserved };
  }
  // T1: anonymous/eval scripts (empty URL) used to fill the 200-row cap and hide game.js.
  // Named URLs sort first; `filter` is a substring (or a regex with regex:true).
  async scriptsList(filter = "", { regex = false, includeAnonymous = false } = {}) {
    this.connected();
    let test = s => s.url.includes(filter);
    if (regex) { const re = new RegExp(filter); test = s => re.test(s.url); }
    const rows = [...this.scripts.values()].filter(s => (includeAnonymous || s.url) && test(s));
    rows.sort((a, b) => (a.url ? 0 : 1) - (b.url ? 0 : 1));
    const out = { scripts: rows.slice(0, 200), total: rows.length, truncated: rows.length > 200,
      anonymousHidden: includeAnonymous ? 0 : [...this.scripts.values()].filter(s => !s.url && test(s)).length };
    if (out.truncated) out.note = "More than 200 matches: narrow filter (or use regex:true).";
    return out;
  }
  async source(scriptId, startLine, count) {
    if (!this.scripts.has(scriptId)) throw Error("Unknown/stale scriptId; list scripts again");
    const r = await this.connected().send("Debugger.getScriptSource", { scriptId });
    const lines = (r.scriptSource || "").split("\n");
    return { scriptId, startLine, totalLines: lines.length,
      source: lines.slice(startLine - 1, startLine - 1 + count).map((s, i) => `${startLine + i}: ${clip(s, 1000)}`).join("\n") };
  }
  // Remove the CDP breakpoint behind `bp` by id even when it never resolved (T4): an
  // unresolved URL breakpoint is still armed in Chrome with its old condition.
  async dropBreakpoint(bp) {
    await this.connected().send("Debugger.removeBreakpoint", { breakpointId: bp.id });
    this.breakpoints.delete(bp.id); this.logpoints.delete(bp.logpoint);
  }
  async setBreakpoint(url, line, column = 1, condition = "", extra = {}) {
    const same = [...this.breakpoints.values()].find(b => b.url === url && b.line === line && b.column === column);
    if (same) await this.dropBreakpoint(same).catch(e => { throw Error(`Cannot replace breakpoint ${same.id} (old condition may still be armed): ${e.message}`); });
    if (this.breakpoints.size >= 100) throw Error("Breakpoint limit 100 reached; remove unused breakpoints");
    const r = await this.connected().send("Debugger.setBreakpointByUrl", { url, lineNumber: line - 1,
      columnNumber: column - 1, condition });
    const bp = { id: r.breakpointId, url, line, column, condition: clip(condition, 300), locations: [], ...extra };
    this.breakpoints.set(bp.id, bp);
    for (const p of (r.locations || []).slice(0, 5)) this.resolveBreakpoint(bp.id, p);
    if (!bp.locations.length) {
      const base = url.split(/[?#]/)[0].split("/").pop();
      const near = [...this.scripts.values()].filter(s => s.url && base && s.url.split(/[?#]/)[0].endsWith(base)).map(s => s.url);
      bp.warning = near.length && !near.includes(url)
        ? `NO LOCATIONS: no parsed script has this exact URL. Use one of these exact URLs: ${[...new Set(near)].slice(0, 5).join(" | ")}`
        : "NO LOCATIONS: the script is not parsed yet (it resolves on load) or the URL is wrong. Check debugger_scripts {filter} for the exact URL; a line past the script's end also never resolves.";
    }
    return bp;
  }
  async removeBreakpoint(id) {
    const bp = this.breakpoints.get(id);
    if (!bp) throw Error("Breakpoint is not owned by this session");
    await this.dropBreakpoint(bp);
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
    // T5: a pending/unknown run no longer blocks. It is marked abandoned (its late result is
    // dropped); the page JS it started is NOT cancelled.
    const abandoned = [];
    for (const o of this.operations.values()) if (["pending", "unknown"].includes(o.status)) { o.status = "abandoned"; abandoned.push(o.id); }
    const id = ++this.operationSequence, generation = this.generation;
    const operation = { id, status: "pending" }; this.operations.set(id, operation);
    if (this.operations.size > 10) this.operations.delete(this.operations.keys().next().value);
    // Deliberately not awaited: a breakpoint inside the expression must not
    // prevent a later MCP request from inspecting and resuming it.
    client.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true,
      generatePreview: false, objectGroup: generation }, 600000).then(r => {
      if (this.generation === generation && operation.status !== "abandoned") Object.assign(operation, { status: r.exceptionDetails ? "exception" : "completed", result: operationResult(r) });
    }, e => { if (this.generation === generation && operation.status !== "abandoned") Object.assign(operation, { status: "unknown", error: clip(e.message) }); });
    return { operationId: id, status: "pending", ...(abandoned.length ? { abandoned } : {}), note: "Inspect debugger_state; a response timeout does not cancel JavaScript execution." };
  }
}
Object.assign(DebugSession.prototype, traceMethods());
