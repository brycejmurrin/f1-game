// @doc Agent debugger session: pause generations, breakpoints, scopes and nonblocking execution.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Cdp, localUrl, targets } from "./js-debugger-cdp.mjs";
import { recordException, traceMethods } from "./js-debugger-trace.mjs";
import { pathSuffixRegex, workflowMethods } from "./js-debugger-workflow.mjs";
import { saveOutputArtifact } from "../agent/output.mjs";

const clip = (s, max = 2000) => String(s || "").slice(0, max);
/** One-line value of an object result from V8's preview, so an agent need not chain debugger_properties for `{a, b}`. */
function previewSummary(r) {
  const props = r?.preview?.properties;
  if (!props) return undefined;
  const body = props.slice(0, 12).map(p => `${clip(p.name, 40)}: ${clip(p.value, 60)}`).join(", ");
  return clip(`${r.subtype === "array" ? "[" : "{"}${body}${r.preview.overflow || props.length > 12 ? ", …" : ""}${r.subtype === "array" ? "]" : "}"}`, 600);
}
// Which local URLs a target may carry: http loopback pages; a dedicated worker created from a
// blob or data URL lists url "" (bug: it was refused); a Node target is a file:// script (#2957).
export function attachableUrl(target) {
  const url = target.url;
  if (url === "about:blank" || (url === "" && ["worker", "service_worker"].includes(target.type))) return true;
  if (target.type === "node") return /^(?:file:\/\/|node:|$)/.test(url) || url.startsWith("/");
  try { localUrl(url.replace(/^blob:/, "").split(/[?#]/)[0]); return true; } catch { return false; }
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A URL without a query matches the script under ANY query: the shell tags scripts ?v=dev but
// deferred backends load ?v=<n>, and the deploy rewrites both, so an exact URL broke on each.
// A bare path (js/agent/apex.js) matches by path suffix; a Node target takes an fs path.
export function breakpointTarget(url, target) {
  if (target?.type === "node" && !/^[a-z]+:/i.test(url)) {
    // A vm-loaded file's url is whatever filename the harness passed (absolute, repo-relative, or a bare name).
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const abs = url.startsWith("/") ? url : path.resolve(root, url);
    return abs.startsWith(root) ? { urlRegex: pathSuffixRegex(path.relative(root, abs)) } : { url: pathToFileURL(abs).href };
  }
  if (/[?#]/.test(url)) return { url };
  if (/^[a-z]+:\/\//i.test(url)) return { urlRegex: `^${escapeRe(url)}(?:[?#].*)?$` };
  return { urlRegex: `(?:^|/)${escapeRe(url.replace(/^\.?\//, ""))}(?:[?#].*)?$` };
}
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
function operationResult(result, id) {
  const serialized = JSON.stringify(result), size = serialized.length;
  if (size <= 4000) return result;
  const artifact = saveOutputArtifact(serialized, {
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), tool: `debugger-operation-${id}`,
  });
  return { truncated: true, originalCharacters: size, artifact,
    note: "Use output_read with artifact.path for the original response without repeating execution.",
    result: { type: result.result?.type, subtype: result.result?.subtype, description: clip(result.result?.description, 200) },
    hadException: !!result.exceptionDetails };
}
// Two js-debugger sessions on one target share every pause. Each session registers itself in a
// page-global table (its generation + pid); a live pid there that is not ours is another debugger.
// (Chrome's Target.getTargets `attached` cannot tell: debug-chrome's viewport holder is always attached.)
const REGISTRY = "__apexDbgClients";
const registerExpression = (gen, pid) => `(()=>{var M=globalThis.${REGISTRY}||(Object.defineProperty(globalThis,"${REGISTRY}",{value:{},configurable:true}),globalThis.${REGISTRY});var o=Object.entries(M).map(function(e){return {gen:e[0],pid:e[1].pid,since:e[1].since}});M[${JSON.stringify(gen)}]={pid:${pid},since:Date.now()};return o})()`;
const unregisterExpression = gen => `(()=>{var M=globalThis.${REGISTRY};if(M)delete M[${JSON.stringify(gen)}];return true})()`;
const pidAlive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
export class DebugSession {
  constructor({ discover = targets, open = Cdp.open } = {}) {
    this.discover = discover; this.open = open;
    this.cdp = null; this.pause = null; this.sequence = 0;
    this.scripts = new Map(); this.objects = new Set(); this.breakpoints = new Map();
    this.operations = new Map(); this.operationSequence = 0; this.connecting = false; this.attachGeneration = 0;
    this.operationGroups = new Set();
    this.logpoints = new Map(); this.logpointRings = new Set(); this.logpointSequence = 0; this.exceptionLog = null; this.lost = null; this.lastEndpoint = null;
    this.generation = randomUUID();
  }
  resetPause() {
    const token = this.pause?.token;
    this.pause = null; this.objects.clear();
    if (token && this.cdp && !this.cdp.closed) this.cdp.send("Runtime.releaseObjectGroup", { objectGroup: token }).catch(() => {});
  }
  // T8/T11: a run whose context or target is gone can never finish; say so instead of staying pending.
  abortOperations(reason, status = "aborted") {
    for (const o of this.operations.values()) if (["pending", "paused", "unknown"].includes(o.status)) Object.assign(o, { status, error: reason });
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
      ...(this.lost && !this.cdp ? { detached: `target gone: ${this.lost}` } : {}),
      paused: !!this.pause, pause: this.pause,
      breakpointCount: this.breakpoints.size, breakpoints: [...this.breakpoints.values()].slice(0, 20).map(b => ({ ...b, url: clip(b.url, 300) })),
      operations: withResults ? ops.map((o, i) => i === ops.length - 1 ? o : { id: o.id, status: o.status, ...(o.result?.artifact ? { artifact: o.result.artifact } : {}), ...(o.timedOut ? { timedOut: true } : {}) }) : ops.map(o => ({ id: o.id, status: o.status, ...(o.result?.artifact ? { artifact: o.result.artifact } : {}), ...(o.timedOut ? { timedOut: true } : {}) })) };
  }
  // T11 + T9/T10: report the loss reason, and probe the page when a run has been pending a while.
  async stateWithHealth(probeMs = 1500) {
    const st = this.state(true), now = Date.now();
    if (st.connected && !st.paused && [...this.operations.values()].some(o => o.status === "pending" && now - o.startedAt > 2000)) {
      try { await this.cdp.send("Runtime.evaluate", { expression: "1", silent: true }, probeMs); st.pageUnresponsive = false; }
      catch { st.pageUnresponsive = true; st.pageNote = `Page did not answer Runtime.evaluate within ${probeMs} ms: a long loop is running. Wait, or debugger_control {action:"cancel"} (terminateExecution); chunk long loops.`; }
    }
    return st;
  }
  async incident() {
    const cdp = this.connected();
    if (this.pause) throw Error("Resume before capturing an incident; a paused page may not render a screenshot");
    if (this.target?.type !== "page") throw Error("Incident screenshots require an attached page target");
    const currentLocalUrl = async () => {
      const response = await cdp.send("Runtime.evaluate", { expression: "location.href", returnByValue: true, silent: true }, 5000);
      const href = response.result?.value;
      if (response.exceptionDetails || typeof href !== "string") throw Error("Could not verify the current page URL");
      if (href !== "about:blank") localUrl(href.replace(/^blob:/, "").split(/[?#]/)[0]);
      return href.split(/[?#]/)[0];
    };
    const pageUrl = await currentLocalUrl();
    const observedAt = new Date().toISOString();
    const exception = this.exceptionLog?.entries.at(-1) || null;
    const scene = await cdp.send("Runtime.evaluate", { expression:
      "(()=>{const a=globalThis.__apex;if(!a)return {available:false};return {available:true,info:a.info?.(),camera:a.cameraState?.(),renderScale:a.renderScale?.()}})()",
      returnByValue: true, silent: true }, 5000);
    if (scene.exceptionDetails) throw Error(`Apex state capture failed: ${clip(scene.exceptionDetails.text)}`);
    if (JSON.stringify(scene.result?.value ?? {}).length > 32768) throw Error("Apex state capture exceeded 32 KiB");
    const data = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 75,
      fromSurface: true, captureBeyondViewport: false }, 15000);
    if (await currentLocalUrl() !== pageUrl) throw Error("Page navigated during incident capture; retry on the local page");
    const image = Buffer.from(data.data || "", "base64");
    if (image.length < 4 || image.length > 6 * 1024 * 1024 || image[0] !== 0xff || image[1] !== 0xd8)
      throw Error("Incident screenshot was not a valid bounded JPEG (6 MiB limit)");
    const dir = path.join(fileURLToPath(new URL("../../", import.meta.url)), "scratch", "debug-incidents");
    mkdirSync(dir, { recursive: true });
    const id = randomUUID(), imagePath = `${dir}/${id}.jpg`, reportPath = `${dir}/${id}.json`;
    const report = { version: 1, observedAt, target: { ...this.target, url: pageUrl }, exception,
      scene: scene.result?.value ?? { available: false }, screenshot: imagePath };
    writeFileSync(imagePath, image);
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    return { ok: true, observedAt, exception, scene: report.scene,
      screenshot: imagePath, report: reportPath, bytes: image.length,
      note: "Screenshot and state were collected after the exception; this is not the exact failing frame." };
  }
  async listTargets(endpoint, kind = "default") {
    this.lastEndpoint = endpoint;
    return { targets: (await this.discover(endpoint, kind)).map(({ webSocketDebuggerUrl, ...t }) => t) };
  }
  async attach(endpoint, targetId) {
    endpoint = endpoint || this.lastEndpoint;
    if (!endpoint) throw Error("endpoint is required: pass endpoint (e.g. http://127.0.0.1:9222) or call debugger_targets first, which remembers it");
    this.lastEndpoint = endpoint;
    if (this.connecting || this.cdp) throw Error("Already attached or attaching; detach first");
    const attachGeneration = ++this.attachGeneration;
    const current = () => {
      if (this.attachGeneration !== attachGeneration) throw Error("Attach cancelled by detach");
    };
    this.connecting = true;
    let client;
    try {
      const rows = await this.discover(endpoint, "all");
      current();
      const target = rows.find(t => t.id === targetId);
      if (!target) throw Error("Unknown targetId; list again with debugger_targets (targets change: a service worker stops when idle, a Node process exits)");
      // The repository's debugger works on local repros, never the deployed site.
      this.lastAttachType = target.type;
      if (!attachableUrl(target)) throw Error(`Refusing to attach ${clip(target.url, 200)}: the debugger only attaches pages served from 127.0.0.1, localhost or [::1] (local repros only, never the deployed site). Serve the page locally, e.g. node tools/mcp/debug-chrome.mjs start`);

      const ws = localUrl(target.webSocketDebuggerUrl, true), origin = localUrl(endpoint);
      if (ws.host !== origin.host) throw Error("Target WebSocket must use the discovery host and port");
      client = await this.open(ws.href); current(); this.cdp = client;
      this.lost = null; this.target = { id: target.id, type: target.type, url: clip(target.url, 1000), title: clip(target.title, 200) };
      this.generation = randomUUID(); this.operations.clear(); this.scripts.clear(); this.logpointRings.clear();
      client.on("Debugger.scriptParsed", s => {
        if (this.cdp !== client) return;
        if (this.scripts.size >= 2000 && !this.scripts.has(s.scriptId)) this.forgetScript(this.evictable());
        this.scripts.set(s.scriptId, { scriptId: s.scriptId, url: clip(s.url), startLine: s.startLine + 1, endLine: s.endLine + 1, executionContextId: s.executionContextId });
        for (const b of s.resolvedBreakpoints || []) this.resolveBreakpoint(b.breakpointId, b.location);
      });
      client.on("Debugger.breakpointResolved", b => { if (this.cdp === client) this.resolveBreakpoint(b.breakpointId, b.location); });
      client.on("Debugger.paused", event => {
        if (this.cdp !== client) return;
        // Exception log mode records and resumes: the page never visibly stops.
        if (recordException(this, event)) return;
        this.resetPause();
        this.markOperations("pending", "paused");
        const owned = (event.hitBreakpoints || []).some(id => this.breakpoints.has(id));
        // Every client with Debugger enabled sees every pause; say when nothing of ours explains it.
        const cause = owned ? "breakpoint" : ["exception", "promiseRejection"].includes(event.reason) ? "exception"
          : event.reason === "Break on start" ? "start" : this.stepping ? "step"
          : "unowned: a debugger statement, a pause request, or ANOTHER debugger client on this target";
        this.stepping = false;
        this.pause = { token: `${this.generation}:${++this.sequence}`, reason: event.reason, cause,
          exception: ["exception", "promiseRejection"].includes(event.reason) ? this.remember(exceptionPreview(event.data)) : undefined,
          hitBreakpoints: event.hitBreakpoints || [],
          frames: event.callFrames.slice(0, 10).map((f, index) => ({ index, functionName: clip(f.functionName, 200),
            url: clip(f.url || this.scripts.get(f.location.scriptId)?.url, 1000), scriptId: f.location.scriptId,
            line: f.location.lineNumber + 1, column: f.location.columnNumber + 1, callFrameId: f.callFrameId,
            scopes: f.scopeChain.slice(0, 6).map(s => ({ type: s.type, name: clip(s.name, 100), object: this.remember(s.object) })) })) };
      });
      client.on("Debugger.resumed", () => { if (this.cdp !== client) return; this.resetPause(); this.markOperations("paused", "pending"); });
      client.on("Runtime.executionContextsCleared", () => { if (this.cdp !== client) return; this.resetPause(); this.clearScripts(); this.abortOperations("aborted: context destroyed (page reload or navigation)"); });
      client.on("Inspector.detached", e => { if (this.cdp === client) this.lost = e?.reason || "inspector detached"; });
      client.on("Runtime.executionContextDestroyed", event => {
        if (this.cdp !== client) return;
        const wasPaused = !!this.pause;
        this.resetPause();
        for (const [id, script] of this.scripts) if (script.executionContextId === event.executionContextId) this.forgetScript(id);
        // An iframe can be removed by a paused evaluation while the main
        // context remains stopped. Invalidate handles, but retain a resumable
        // pause instead of falsely reporting that execution is running.
        if (wasPaused) this.pause = { token: `${this.generation}:${++this.sequence}`,
          reason: "executionContextDestroyed", hitBreakpoints: [], frames: [] };
      });
      client.on("Debugger.globalObjectCleared", () => { if (this.cdp !== client) return; this.resetPause(); this.clearScripts(); this.abortOperations("aborted: context destroyed (page reload or navigation)"); });
      client.on("disconnect", () => {
        if (this.cdp !== client) return;
        this.resetPause(); this.scripts.clear(); this.breakpoints.clear(); this.operationGroups.clear(); this.logpoints.clear(); this.logpointRings.clear(); this.exceptionLog = null;
        if (!this.deliberate) this.lost = this.lost || "CDP connection closed (Chrome exited, the page closed, or the container resumed)";
        this.abortOperations("aborted: target disconnected"); this.cdp = null; this.target = null;
      });
      await client.send("Runtime.enable");
      current();
      await client.send("Debugger.enable");
      current();
      await client.send("Debugger.setAsyncCallStackDepth", { maxDepth: 8 });
      current();
      // A Node process started with --inspect-brk waits for this; it then stops at "Break on start",
      // so breakpoints can be set before the first user statement. Harmless when not waiting.
      if (target.type === "node") await client.send("Runtime.runIfWaitingForDebugger", {}, 2000).catch(() => {});
      const st = this.state();
      if (target.type === "node") st.note = "Node target: started with --inspect-brk it now stops at Break on start (cause start); set breakpoints, then resume. Node waits for this client to detach before it exits.";
      try {
        const r = await client.send("Runtime.evaluate", { expression: registerExpression(this.generation, process.pid), returnByValue: true, silent: true }, 2000);
        const others = (r.result?.value || []).filter(o => o.gen !== this.generation && Number.isInteger(o.pid) && o.pid !== process.pid && pidAlive(o.pid));
        if (others.length) st.warning = `Another js-debugger session (pid ${others.map(o => o.pid).join(", ")}) is attached to this target. Pauses are shared: a pause with cause 'unowned' is theirs, and your resume releases it. Coordinate, or detach one.`;
      } catch {}
      return st;
    } catch (e) {
      client?.close();
      if (this.cdp === client || this.attachGeneration === attachGeneration) { this.cdp = null; this.target = null; }
      // Measured 2026-10-19: a url-less worker that never ran answers no command, direct or via Target.attachToTarget.
      if (/timed out/.test(e.message) && this.lastAttachType && this.lastAttachType !== "page") throw Error(`${e.message}. The ${this.lastAttachType} target accepted the socket but answered nothing: it is not running JavaScript (a worker still loading lists url "", a stopped service worker). List again; wake it from the page first.`);
      throw e;
    }
    finally { if (this.attachGeneration === attachGeneration) this.connecting = false; }
  }
  // T13: detach ALWAYS drops the local session, however the CDP cleanup fares (a wedged page, a
  // timed-out evaluate): cleanup runs under one deadline, failures are reported, the daemon stays attachable.
  async detach(deadlineMs = 4000) {
    const detachGeneration = ++this.attachGeneration;
    this.connecting = false;
    const client = this.cdp;
    if (!client) { this.pause = null; this.operations.clear(); return { detached: true, cleanupErrors: [] }; }
    const cleanupErrors = [], cleanupWarnings = [];
    let resumedEventObserved = false, timer;
    const observed = () => { resumedEventObserved = true; };
    client.on("Debugger.resumed", observed);
    // Reset exception pauses and owned breakpoints before resuming the program.
    this.exceptionLog = null;
    const commands = [["Debugger.setPauseOnExceptions", { state: "none" }],
      ...[...this.breakpoints.keys()].map(breakpointId => ["Debugger.removeBreakpoint", { breakpointId }]),
      ...[...this.operationGroups].map(objectGroup => ["Runtime.releaseObjectGroup", { objectGroup }]),
      ["Runtime.releaseObjectGroup", { objectGroup: this.generation }]];
    if (this.pause) commands.push(["Runtime.releaseObjectGroup", { objectGroup: this.pause.token }]);
    commands.push(["Runtime.evaluate", { expression: unregisterExpression(this.generation), returnByValue: true, silent: true }]);
    if (this.logpointRings.size) {
      const ids = JSON.stringify([...this.logpointRings]);
      commands.push(["Runtime.evaluate", { expression: `(function(ids){var R=globalThis.__apexDbgLog;if(!R)return false;ids.forEach(function(id){delete R[id]});if(!Object.keys(R).length)delete globalThis.__apexDbgLog;return true})(${ids})`, returnByValue: true, silent: true }]);
    }
    const wasPaused = !!this.pause;
    const cleanup = async () => {
      await Promise.all(commands.map(async ([method, params]) => {
        try {
          const result = await client.send(method, params, 1000);
          if (result?.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "page evaluation failed");
        } catch (e) { cleanupErrors.push(`${method}: ${clip(e.message)}`); }
      }));
      for (const method of [...(wasPaused ? ["Debugger.resume"] : []), "Debugger.disable"]) {
        try { await client.send(method, {}, 1000); } catch (e) {
          // Closing the CDP session below disables the domain anyway, so a slow
          // Debugger.disable (full software-GL frames) is a warning, not a failed cleanup.
          (method === "Debugger.disable" ? cleanupWarnings : cleanupErrors).push(`${method}: ${clip(e.message)}`);
        }
      }
    };
    try {
      await Promise.race([cleanup().catch(e => { cleanupErrors.push(clip(e.message)); }),
        new Promise(resolve => { timer = setTimeout(() => { cleanupErrors.push(`cleanup deadline ${deadlineMs} ms exceeded; local session dropped`); resolve(); }, deadlineMs); })]);
    } finally {
      clearTimeout(timer);
      this.deliberate = true;
      try { client.close(); } catch {} finally { this.deliberate = false; }
      try { client.removeListener("Debugger.resumed", observed); } catch {}
      // A target-close event can make a new attach possible while old cleanup is
      // still settling. Never let that old detach erase the replacement session.
      if (this.attachGeneration === detachGeneration) {
        this.cdp = null; this.target = null; this.pause = null; this.objects.clear(); this.exceptionLog = null;
        this.breakpoints.clear(); this.logpoints.clear(); this.logpointRings.clear(); this.scripts.clear(); this.operationGroups.clear(); this.operations.clear(); this.connecting = false;
      }
    }
    return { detached: true, cleanupErrors: [...cleanupErrors], cleanupWarnings, cleanupAcknowledged: cleanupErrors.length === 0, resumedEventObserved };
  }
  // T1: anonymous/eval scripts (empty URL) used to fill the 200-row cap and hide game.js.
  // Named URLs sort first; `filter` is a substring (or a regex with regex:true).
  async scriptsList(filter = "", { regex = false, includeAnonymous = false, limit = 50 } = {}) {
    this.connected();
    let test = s => s.url.includes(filter);
    if (regex) { const re = new RegExp(filter); test = s => re.test(s.url); }
    const rows = [...this.scripts.values()].filter(s => (includeAnonymous || s.url) && test(s));
    rows.sort((a, b) => (a.url ? 0 : 1) - (b.url ? 0 : 1));
    const cap = Math.min(200, Math.max(1, Math.floor(+limit) || 50));
    const out = { scripts: rows.slice(0, cap), total: rows.length, truncated: rows.length > cap,
      anonymousHidden: includeAnonymous ? 0 : [...this.scripts.values()].filter(s => !s.url && test(s)).length };
    if (out.truncated) out.note = `${rows.length} matches, showing ${cap}: narrow filter (or use regex:true), or raise limit (max 200).`;
    return out;
  }
  // T12: accept a script URL (+ endLine) instead of a scriptId; the newest parse of that URL wins.
  async source(scriptId, startLine, count, { url, endLine } = {}) {
    if (!scriptId && url) {
      const rows = [...this.scripts.values()].filter(x => x.url === url);
      const bare = url.split(/[?#]/)[0];
      const pick = rows.at(-1) || [...this.scripts.values()].filter(x => x.url && x.url.split(/[?#]/)[0].endsWith(bare)).at(-1);
      if (!pick) throw Error(`No parsed script with url ${clip(url, 200)}; list it with debugger_scripts {filter}`);
      scriptId = pick.scriptId;
    }
    if (!scriptId) throw Error("debugger_source needs scriptId, or url (+ startLine/endLine)");
    if (endLine) count = Math.min(200, Math.max(1, endLine - startLine + 1));
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
    if (bp.logpoint) {
      const expression = `(function(id){var R=globalThis.__apexDbgLog;if(!R)return false;delete R[id];if(!Object.keys(R).length)delete globalThis.__apexDbgLog;return true})(${JSON.stringify(bp.logpoint)})`;
      try {
        const result = await this.connected().send("Runtime.evaluate", { expression, returnByValue: true, silent: true }, 5000);
        if (result?.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "page evaluation failed");
        this.logpointRings.delete(bp.logpoint);
      } catch {}
    }
  }
  async setBreakpoint(url, line, column = 1, condition = "", extra = {}) {
    const same = [...this.breakpoints.values()].find(b => b.url === url && b.line === line && b.column === column);
    if (same) await this.dropBreakpoint(same).catch(e => { throw Error(`Cannot replace breakpoint ${same.id} (old condition may still be armed): ${e.message}`); });
    if (this.breakpoints.size >= 100) throw Error("Breakpoint limit 100 reached; remove unused breakpoints");
    const spec = breakpointTarget(url, this.target);
    const r = await this.connected().send("Debugger.setBreakpointByUrl", { ...spec, lineNumber: line - 1,
      columnNumber: column - 1, condition });
    const bp = { id: r.breakpointId, url, ...(spec.urlRegex ? { urlRegex: spec.urlRegex } : spec.url !== url ? { resolvedUrl: spec.url } : {}),
      line, column, condition: clip(condition, 300), locations: [], ...extra };
    this.breakpoints.set(bp.id, bp);
    if (bp.logpoint) this.logpointRings.add(bp.logpoint);
    for (const p of (r.locations || []).slice(0, 5)) this.resolveBreakpoint(bp.id, p);
    if (!bp.locations.length) {
      const base = url.split(/[?#]/)[0].split("/").pop();
      const near = [...this.scripts.values()].filter(s => s.url && base && s.url.split(/[?#]/)[0].endsWith(base)).map(s => s.url);
      const re = spec.urlRegex && new RegExp(spec.urlRegex);
      bp.warning = near.length && !near.some(u => re ? re.test(u) : u === spec.url)
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
  async control(action, token, waitMs = 1500) {
    const methods = { pause: "Debugger.pause", resume: "Debugger.resume", over: "Debugger.stepOver", into: "Debugger.stepInto", out: "Debugger.stepOut" };
    if (action === "cancel") {
      // Runtime.terminateExecution ends the running script with an uncatchable termination.
      await this.connected().send("Runtime.terminateExecution");
      this.abortOperations("cancelled by debugger_control cancel", "cancelled");
      return this.state();
    }
    if (action !== "pause") this.paused(token);
    else if (this.pause) return this.state();
    const before = this.pause?.token;
    this.stepping = ["over", "into", "out"].includes(action);
    await this.connected().send(methods[action]);
    // CDP events, not command acknowledgments, prove the new pause. If resumed
    // has not arrived yet, remove the old frame handles before returning.
    if (action !== "pause" && this.pause?.token === before) { this.resetPause(); this.markOperations("paused", "pending"); }
    // A step normally lands within milliseconds: wait for it so the reply carries the new token.
    if (this.stepping || action === "pause") await this.waitForPause(waitMs);
    const st = this.state();
    if (this.stepping && !st.paused) st.note = `No pause within ${waitMs} ms of the step: execution ran on (the stepped frame returned to non-JS) or is still running. Read debugger_state.`;
    return st;
  }
  async exceptions(state) { await this.connected().send("Debugger.setPauseOnExceptions", { state }); return { state }; }
  async evaluate(token, frame, expression, allowSideEffects = false) {
    const pause = this.paused(token), callFrame = pause.frames[frame];
    if (!callFrame) throw Error("Unknown frame index");
    const result = await this.connected().send("Debugger.evaluateOnCallFrame", { callFrameId: callFrame.callFrameId,
      expression, silent: true, throwOnSideEffect: !allowSideEffects, returnByValue: false,
      generatePreview: true, objectGroup: token, timeout: 1000 }, 2000);
    this.paused(token);
    const refused = !allowSideEffects && result.exceptionDetails && /side.?effect/i.test(JSON.stringify(result.exceptionDetails));
    return { ...result, result: this.remember(result.result), summary: previewSummary(result.result), ok: !result.exceptionDetails,
      ...(refused ? { hint: "Refused as a possible side effect (V8 also treats localStorage/sessionStorage and similar reads as side-effecting). If the read is intended, retry with allowSideEffects:true." } : {}) };
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
  // T14a: a pause whose Debugger.resumed never arrived must not block runs forever. Probe it:
  // a real frame id fails once the page is no longer stopped there; a frameless synthetic pause is
  // probed with resume, which V8 refuses when the thread is not paused.
  async verifyPause() {
    const pause = this.pause; if (!pause) return;
    const frame = pause.frames[0];
    try {
      if (frame) await this.connected().send("Debugger.evaluateOnCallFrame", { callFrameId: frame.callFrameId, expression: "0", throwOnSideEffect: true, silent: true }, 1500);
      else await this.connected().send("Debugger.resume", {}, 1500);
    } catch (e) {
      if (this.pause === pause && /call frame|not paused|while paused|invalid/i.test(e.message)) { this.resetPause(); this.markOperations("paused", "pending"); }
    }
  }
  async runTool(expression, awaitPromise, timeoutMs) {
    if (this.pause) await this.verifyPause();
    return this.run(expression, awaitPromise, timeoutMs);
  }
  run(expression, awaitPromise = false, timeoutMs = 600000) {
    const client = this.connected();
    if (this.pause) throw Error("Use debugger_evaluate while paused");
    // T5: a pending/unknown run no longer blocks. It is marked abandoned (its late result is
    // dropped); the page JS it started is NOT cancelled.
    const abandoned = [];
    for (const o of this.operations.values()) if (["pending", "unknown"].includes(o.status)) { o.status = "abandoned"; abandoned.push(o.id); }
    const id = ++this.operationSequence, generation = this.generation;
    const objectGroup = `${generation}:run:${id}`;
    this.operationGroups.add(objectGroup);
    const operation = { id, status: "pending", startedAt: Date.now() }; this.operations.set(id, operation);
    if (this.operations.size > 10) this.operations.delete(this.operations.keys().next().value);
    // T9: a response past timeoutMs marks the op timedOut/unknown but stays tracked; a late
    // response (the page finished after the deadline) still lands here.
    let completion;
    const canSettle = () => this.generation === generation && ["pending", "paused", "unknown"].includes(operation.status);
    const settle = (err, r) => {
      if (err) {
        if (canSettle()) Object.assign(operation, { status: "unknown", error: clip(err.message), ...(/timed out/.test(err.message) ? { timedOut: true } : {}) });
        return;
      }
      // Late replies still own remote Error handles, even if their operation
      // was abandoned/cancelled in the meantime. Release each group once.
      if (completion) return completion;
      completion = (async () => {
        let cleanupError;
        try {
          await client.send("Runtime.releaseObjectGroup", { objectGroup }, 1000);
          this.operationGroups.delete(objectGroup);
        } catch (e) { cleanupError = clip(e.message); }
        // Completed/exception means cleanup settled, so clients never race GC
        // against release. Unknown executions keep ownership until late reply
        // or detach; neither timeout nor abandonment cancels page JavaScript.
        if (canSettle()) {
          try {
            Object.assign(operation, { status: r.exceptionDetails ? "exception" : "completed",
              result: operationResult(r, id), ...(operation.timedOut ? { late: true } : {}), ...(cleanupError ? { cleanupError } : {}) });
          } catch (e) {
            Object.assign(operation, { status: "unknown", error: `Could not retain operation result: ${clip(e.message)}`,
              ...(cleanupError ? { cleanupError } : {}) });
          }
        }
      })();
      return completion;
    };
    // Deliberately not awaited: a breakpoint inside the expression must not
    // prevent a later MCP request from inspecting and resuming it.
    client.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true,
      generatePreview: false, objectGroup }, timeoutMs, settle).then(r => settle(null, r), e => settle(e));
    return { operationId: id, status: "pending", timeoutMs, ...(abandoned.length ? { abandoned } : {}), note: "Inspect debugger_state; a response timeout does not cancel JavaScript execution (timedOut ops still report a late result)." };
  }
}
Object.assign(DebugSession.prototype, traceMethods(), workflowMethods());
