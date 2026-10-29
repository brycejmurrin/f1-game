// @doc Non-pausing debugger tools: logpoints, exception log, listener counts, live-object counts (CDP).
// CDP contracts: Debugger.setBreakpointByUrl/paused, DOMDebugger.getEventListeners, Runtime.queryObjects
// (https://chromedevtools.github.io/devtools-protocol/).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const clip = (s, max = 2000) => String(s ?? "").slice(0, max);
const RING = "__apexDbgLog";

function exceptionMessage(data) {
  const value = data?.description ?? data?.unserializableValue ??
    (data && Object.hasOwn(data, "value") ? String(data.value) : data?.type === "undefined" ? "undefined" : "");
  return clip(String(value).split("\n")[0], 300);
}

// Page-side ring: the breakpoint condition pushes the value and returns false, so the
// page never pauses. Condition source runs in the paused-frame scope, so locals resolve.
// The user expression is evaluated FIRST, in an arrow (keeps `this`/`arguments`), and every
// helper name is __apexDbg-prefixed: a `var G` here once shadowed the game's own `G` façade,
// so `G.state` recorded "undefined".
export function logpointCondition(id, expression, maxHits, maxChars) {
  return `(()=>{var __apexDbgV,__apexDbgS;try{__apexDbgV=(${expression}\n);__apexDbgS=typeof __apexDbgV==="number"?(isFinite(__apexDbgV)?__apexDbgV:String(__apexDbgV)):typeof __apexDbgV==="string"?__apexDbgV:(typeof __apexDbgV==="object"&&__apexDbgV!==null?JSON.stringify(__apexDbgV):String(__apexDbgV));`
    + `if(typeof __apexDbgS==="string"&&__apexDbgS.length>${maxChars})__apexDbgS=__apexDbgS.slice(0,${maxChars});}catch(__apexDbgE){__apexDbgS="!err: "+String(__apexDbgE&&__apexDbgE.message||__apexDbgE).slice(0,${maxChars})}`
    + `try{var __apexDbgG=globalThis,__apexDbgR=__apexDbgG.${RING}||(Object.defineProperty(__apexDbgG,"${RING}",{value:{},configurable:true}),__apexDbgG.${RING}),`
    + `__apexDbgL=__apexDbgR[${JSON.stringify(id)}]||(__apexDbgR[${JSON.stringify(id)}]={n:0,items:[]});`
    + `__apexDbgL.n++;if(__apexDbgL.items.length>=${maxHits})__apexDbgL.items.shift();__apexDbgL.items.push({i:__apexDbgL.n,t:Math.round(performance.now()),v:__apexDbgS});}catch(__apexDbgE){}return false})()`;
}

// Called first in Debugger.paused. True = handled (recorded + auto-resumed), no pause surfaced.
export function recordException(session, event) {
  const log = session.exceptionLog;
  if (!log || !["exception", "promiseRejection"].includes(event.reason)) return false;
  const top = (event.callFrames || []).slice(0, 5).map(f => `${f.functionName || "(anon)"} ${f.url || session.scripts.get(f.location.scriptId)?.url || f.location.scriptId}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}`);
  const message = exceptionMessage(event.data);
  const f0 = event.callFrames?.[0];
  log.total++;
  log.counts[message] = (log.counts[message] || 0) + 1;
  if (Object.keys(log.counts).length > 50) delete log.counts[Object.keys(log.counts)[0]];
  if (log.entries.length >= log.max) log.entries.shift();
  log.entries.push({ n: log.total, reason: event.reason, uncaught: event.data?.uncaught ?? null, message,
    at: f0 ? `${f0.url || session.scripts.get(f0.location.scriptId)?.url || f0.location.scriptId}:${f0.location.lineNumber + 1}` : null, stack: top });
  session.cdp?.send("Debugger.resume").catch(() => {});
  return true;
}

export function traceMethods() {
  return {
    notPaused() { if (this.pause) throw Error("Page is paused: resume first (this tool evaluates on the running page)"); },
    async setLogpoint({ url, line, column = 1, expression, maxHits = 100, maxChars = 200 }) {
      this.connected(); this.notPaused();
      const id = `lp${++this.logpointSequence}`;
      const bp = await this.setBreakpoint(url, line, column, logpointCondition(id, expression, maxHits, maxChars), { logpoint: id });
      this.logpoints.set(id, { id, breakpointId: bp.id, url, line, column, expression: clip(expression, 300), maxHits, maxChars });
      return { id, breakpointId: bp.id, locations: bp.locations, ...(bp.warning ? { warning: bp.warning } : {}),
        note: "Never pauses. Read with debugger_logpoint_read; remove with debugger_remove_breakpoint {id:breakpointId}. Ring lives in the page and is lost on reload." };
    },
    async readLogpoints({ id, clear = false, limit = 50 } = {}) {
      this.connected(); this.notPaused();
      const ids = id ? [id] : [...this.logpoints.keys()];
      if (id && !this.logpoints.has(id)) throw Error("Unknown logpoint id; set one with debugger_logpoint");
      const expr = `(function(ids,clear,limit){var R=globalThis.${RING}||{},o={};ids.forEach(function(k){var L=R[k];`
        + `o[k]=L?{hits:L.n,retained:L.items.length,items:L.items.slice(-limit)}:{hits:0,retained:0,items:[]};if(clear&&L){L.n=0;L.items.length=0}});return o})(${JSON.stringify(ids)},${!!clear},${limit})`;
      const r = await this.cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, silent: true }, 5000);
      if (r.exceptionDetails) throw Error(`Logpoint read failed: ${clip(r.exceptionDetails.text)}`);
      return { logpoints: ids.map(k => ({ ...this.logpoints.get(k), ...r.result.value[k] })), cleared: !!clear };
    },
    async exceptionLogControl({ action, state = "all", max = 100 }) {
      this.connected();
      if (action === "start") {
        if (!["all", "uncaught"].includes(state)) throw Error("state must be all (caught+uncaught) or uncaught");
        this.exceptionLog = { state, max, total: 0, counts: Object.create(null), entries: [] };
        await this.cdp.send("Debugger.setPauseOnExceptions", { state });
        return { started: true, state, max, note: "Exception pauses are recorded and auto-resumed. Do not rely on debugger_exceptions pauses while this runs." };
      }
      const log = this.exceptionLog;
      if (!log) { if (action === "stop") return { stopped: true, active: false }; throw Error("Exception log is not running; call with action:start"); }
      const body = { active: true, state: log.state, total: log.total, retained: log.entries.length, counts: log.counts, entries: log.entries };
      if (action === "clear") { Object.assign(log, { total: 0, counts: Object.create(null), entries: [] }); return { ...body, cleared: true }; }
      if (action === "stop") { this.exceptionLog = null; await this.cdp.send("Debugger.setPauseOnExceptions", { state: "none" }); return { ...body, active: false, stopped: true }; }
      return body;
    },
    async listeners({ target = "window", detail = 0 }) {
      this.connected(); this.notPaused();
      const sel = JSON.stringify(target);
      const expression = target === "window" ? "window" : target === "document" ? "document" : `document.querySelector(${sel})`;
      const group = "apex-dbg-listeners";
      try {
        const o = await this.cdp.send("Runtime.evaluate", { expression, objectGroup: group, silent: true }, 5000);
        if (o.exceptionDetails || !o.result?.objectId) throw Error(`Target ${target} did not resolve to an object`);
        const { listeners } = await this.cdp.send("DOMDebugger.getEventListeners", { objectId: o.result.objectId }, 5000);
        const byType = Object.create(null);
        for (const l of listeners) byType[l.type] = (byType[l.type] || 0) + 1;
        return { target, total: listeners.length, byType: { ...byType },
          ...(detail ? { listeners: listeners.slice(0, detail).map(l => ({ type: l.type, capture: l.useCapture, once: l.once, passive: l.passive,
            url: this.scripts.get(l.scriptId)?.url || null, line: l.lineNumber + 1, column: l.columnNumber + 1 })) } : {}) };
      } finally { this.cdp?.send("Runtime.releaseObjectGroup", { objectGroup: group }).catch(() => {}); }
    },
    async instances({ expression }) {
      this.connected(); this.notPaused();
      const group = "apex-dbg-instances";
      try {
        const proto = await this.cdp.send("Runtime.evaluate", { objectGroup: group, silent: true,
          expression: `(function(){var x=(${expression}\n);return typeof x==="function"?x.prototype:x})()` }, 5000);
        if (proto.exceptionDetails || !proto.result?.objectId) throw Error(`Expression did not give a constructor/prototype object: ${clip(proto.exceptionDetails?.exception?.description || proto.exceptionDetails?.text)}`);
        const { objects } = await this.cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId, objectGroup: group }, 30000);
        const n = await this.cdp.send("Runtime.callFunctionOn", { objectId: objects.objectId, functionDeclaration: "function(){return this.length}", returnByValue: true }, 10000);
        return { expression: clip(expression, 300), count: n.result?.value ?? null,
          note: "Counts objects whose prototype chain includes the prototype (subclasses too); V8 runs a GC first." };
      } finally { this.cdp?.send("Runtime.releaseObjectGroup", { objectGroup: group }).catch(() => {}); }
    },
  };
}

// --- realtime CDP profiling (D·W25a; was js-debugger-profile.mjs; folded to avoid tools/README hold) ---

/** Strip origin so game URLs collapse to repo paths (http://127.0.0.1:3456/js/game.js?v=dev → js/game.js). */
export function shortUrl(url = "") {
  return String(url).replace(/^.*?\/\/[^/]+\//, "").replace(/[?#].*$/, "") || "(native)";
}

function callKey(frame) {
  const name = frame?.functionName || "(anon)";
  const url = shortUrl(frame?.url);
  const line = Number.isInteger(frame?.lineNumber) ? frame.lineNumber + 1 : 0;
  return `${name} ${url}:${line}`;
}

/**
 * Summarise a V8 CPU profile (Profiler.stop). Self = samples on the node; inclusive walks parents once per sample.
 * @param {object} profile CDP Profile
 * @param {{ top?: number }} [opts]
 */
export function summarizeCpuProfile(profile, { top = 20 } = {}) {
  if (!profile?.nodes || !Array.isArray(profile.samples)) {
    throw Error("CPU profile missing nodes/samples");
  }
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
  const selfUs = new Map();
  const deltas = profile.timeDeltas || [];
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i], dt = deltas[i] || 0;
    selfUs.set(id, (selfUs.get(id) || 0) + dt);
  }
  const totalUs = [...selfUs.values()].reduce((a, b) => a + b, 0);
  const byFn = new Map(), byFile = new Map(), incl = new Map();
  for (const [id, us] of selfUs) {
    const n = byId.get(id);
    if (!n) continue;
    const k = callKey(n.callFrame);
    byFn.set(k, (byFn.get(k) || 0) + us);
    const f = shortUrl(n.callFrame?.url);
    byFile.set(f, (byFile.get(f) || 0) + us);
    const seen = new Set();
    let cur = id;
    while (cur != null) {
      const node = byId.get(cur);
      if (!node) break;
      const ik = callKey(node.callFrame);
      if (!seen.has(ik)) { seen.add(ik); incl.set(ik, (incl.get(ik) || 0) + us); }
      cur = parent.get(cur);
    }
  }
  const toMs = us => Math.round(us / 1000);
  const sortTop = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([name, us]) => ({ name, ms: toMs(us), pct: totalUs ? +(100 * us / totalUs).toFixed(1) : 0 }));
  const excludeRoot = ([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k);
  return {
    kind: "cpu",
    samples: profile.samples.length,
    nodes: profile.nodes.length,
    totalMs: toMs(totalUs),
    startTime: profile.startTime,
    endTime: profile.endTime,
    byFile: sortTop(byFile, Math.min(15, top)),
    byFnSelf: sortTop(byFn, top),
    byFnIncl: sortTop(new Map([...incl].filter(excludeRoot)), top),
  };
}

/**
 * Hitch windows from a CPU profile: contiguous stretches where a single sample's timeDelta
 * (or a run of deltas attributed to the same top frame) exceeds thresholdMs.
 * @param {object} profile
 * @param {{ thresholdMs?: number, maxWindows?: number }} [opts]
 */
export function hitchWindowsFromCpuProfile(profile, { thresholdMs = 50, maxWindows = 10 } = {}) {
  if (!profile?.nodes || !Array.isArray(profile.samples)) return { windows: [], thresholdMs };
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const deltas = profile.timeDeltas || [];
  const thresholdUs = thresholdMs * 1000;
  const windows = [];
  let tUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = deltas[i] || 0;
    const startUs = tUs;
    tUs += dt;
    if (dt < thresholdUs) continue;
    const n = byId.get(profile.samples[i]);
    windows.push({
      startMs: Math.round(startUs / 1000),
      durationMs: Math.round(dt / 1000),
      top: callKey(n?.callFrame),
      url: shortUrl(n?.callFrame?.url),
      functionName: clip(n?.callFrame?.functionName || "(anon)", 120),
    });
    if (windows.length >= maxWindows) break;
  }
  windows.sort((a, b) => b.durationMs - a.durationMs);
  return { windows: windows.slice(0, maxWindows), thresholdMs, scannedSamples: profile.samples.length };
}

/**
 * Summarise a SamplingHeapProfile (HeapProfiler.stopSampling).
 * Walks the tree summing selfSize; returns top sites by allocated bytes.
 */
export function summarizeHeapSample(profile, { top = 20 } = {}) {
  const head = profile?.head;
  if (!head) throw Error("Heap sample missing head");
  const rows = [];
  const walk = (node, chain) => {
    const frame = node.callFrame || {};
    const next = [...chain, callKey(frame)];
    const self = node.selfSize || 0;
    if (self > 0) rows.push({ name: next[next.length - 1], bytes: self, stack: next.slice(-4) });
    for (const c of (node.children || [])) walk(c, next);
  };
  walk(head, []);
  rows.sort((a, b) => b.bytes - a.bytes);
  const totalBytes = rows.reduce((a, r) => a + r.bytes, 0);
  return {
    kind: "heap",
    totalBytes,
    totalKb: Math.round(totalBytes / 1024),
    samples: rows.length,
    top: rows.slice(0, top).map(r => ({
      name: r.name, kb: Math.round(r.bytes / 1024),
      pct: totalBytes ? +(100 * r.bytes / totalBytes).toFixed(1) : 0,
      stack: r.stack,
    })),
  };
}

/** Page-side rAF hitch sampler: install, wait, read. Used by debugger_profile action=hitch. */
function hitchSamplerExpression({ durationMs = 2000, thresholdMs = 50, maxWindows = 20 } = {}) {
  const ms = Math.max(100, Math.min(30000, durationMs | 0));
  const thr = Math.max(8, Math.min(2000, thresholdMs | 0));
  const cap = Math.max(1, Math.min(50, maxWindows | 0));
  return `(()=>new Promise(resolve=>{
    var thr=${thr}, cap=${cap}, end=performance.now()+${ms}, last=performance.now(), wins=[], frames=0;
    function tick(t){
      frames++;
      var dt=t-last; last=t;
      if(dt>=thr && wins.length<cap) wins.push({t:Math.round(t), durationMs:+dt.toFixed(1), sinceStartMs:Math.round(t-(end-${ms}))});
      if(t<end) requestAnimationFrame(tick);
      else resolve({ok:true, durationMs:${ms}, thresholdMs:thr, frames:frames, windows:wins.sort(function(a,b){return b.durationMs-a.durationMs}).slice(0,cap)});
    }
    requestAnimationFrame(tick);
  }))()`;
}

/** Persist a raw profile under scratch/debug-profiles for DevTools reopen. */
function saveProfileArtifact(kind, body, root = fileURLToPath(new URL("../..", import.meta.url))) {
  const dir = path.join(root, "scratch", "debug-profiles");
  mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  const ext = kind === "heap" ? "heapprofile" : "cpuprofile";
  const file = path.join(dir, `${id}.${ext}`);
  writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  return file;
}

const PROFILE_ACTIONS = ["start", "stop", "status", "hitch"];
const PROFILE_KINDS = ["cpu", "heap"];

/**
 * Mixin for DebugSession: realtime CDP Profiler / HeapProfiler / rAF hitch windows.
 * One profile at a time; detach stops an active one. Page must be running (not paused).
 */
export function profileMethods() {
  return {
    async profileControl({
      action, kind = "cpu", intervalUs = 1000, durationMs = 2000,
      top = 20, thresholdMs = 50, maxWindows = 10, save = true,
    } = {}) {
      if (!PROFILE_ACTIONS.includes(action)) {
        throw Error(`Invalid action; use ${PROFILE_ACTIONS.join("|")}`);
      }
      if (!PROFILE_KINDS.includes(kind)) {
        throw Error(`Invalid kind; use ${PROFILE_KINDS.join("|")}`);
      }
      const cdp = this.connected();
      if (this.pause && action !== "status") {
        throw Error("Resume before profiling; Profiler/HeapProfiler need a running page (debugger_control {action:\"resume\"})");
      }
      if (action === "status") {
        return {
          ok: true,
          profiling: this.profiling
            ? { kind: this.profiling.kind, startedAt: this.profiling.startedAt, intervalUs: this.profiling.intervalUs }
            : null,
        };
      }
      if (action === "hitch") {
        const expression = hitchSamplerExpression({ durationMs, thresholdMs, maxWindows });
        const wait = Math.max(100, Math.min(30000, durationMs | 0)) + 5000;
        const r = await cdp.send("Runtime.evaluate", {
          expression, awaitPromise: true, returnByValue: true, silent: true,
        }, wait);
        if (r.exceptionDetails) {
          throw Error(`Hitch sampler failed: ${clip(r.exceptionDetails.text || r.exceptionDetails.exception?.description, 300)}`);
        }
        const body = r.result?.value;
        if (!body?.ok) throw Error("Hitch sampler returned no result (page may lack rAF)");
        return {
          ok: true, kind: "hitch", ...body,
          note: "rAF gaps on the attached page; software GL stalls are not player-GPU conclusions.",
        };
      }
      if (action === "start") {
        if (this.profiling) {
          throw Error(`Already profiling (${this.profiling.kind}); stop it first`);
        }
        const interval = Math.max(100, Math.min(100000, intervalUs | 0));
        if (kind === "cpu") {
          await cdp.send("Profiler.enable", {}, 5000);
          await cdp.send("Profiler.setSamplingInterval", { interval }, 5000);
          await cdp.send("Profiler.start", {}, 5000);
        } else {
          await cdp.send("HeapProfiler.enable", {}, 5000);
          await cdp.send("HeapProfiler.startSampling", { samplingInterval: Math.max(1000, interval * 32) }, 5000);
        }
        this.profiling = { kind, startedAt: Date.now(), intervalUs: interval };
        return {
          ok: true, started: true, kind, intervalUs: interval,
          note: "Call debugger_profile {action:\"stop\"} after the reproduction; summary is bounded (no raw profile in the reply unless save writes scratch/debug-profiles).",
        };
      }
      // stop
      if (!this.profiling) throw Error("No active profile; start one first");
      if (this.profiling.kind !== kind && kind) {
        // Allow stop without matching kind: use the active kind.
        kind = this.profiling.kind;
      }
      const startedAt = this.profiling.startedAt;
      let summary, artifact, raw;
      try {
        if (kind === "cpu") {
          const { profile } = await cdp.send("Profiler.stop", {}, 60000);
          raw = profile;
          summary = summarizeCpuProfile(profile, { top });
          summary.hitches = hitchWindowsFromCpuProfile(profile, { thresholdMs, maxWindows });
          try { await cdp.send("Profiler.disable", {}, 2000); } catch { /* ignore */ }
        } else {
          const { profile } = await cdp.send("HeapProfiler.stopSampling", {}, 60000);
          raw = profile;
          summary = summarizeHeapSample(profile, { top });
          try { await cdp.send("HeapProfiler.disable", {}, 2000); } catch { /* ignore */ }
        }
      } finally {
        this.profiling = null;
      }
      if (save && raw) artifact = saveProfileArtifact(kind, raw);
      return {
        ok: true, stopped: true, kind,
        elapsedMs: Date.now() - startedAt,
        summary,
        ...(artifact ? { artifact } : {}),
        note: artifact
          ? "Open artifact in Chrome DevTools → Performance/Memory; reply carries the bounded summary only."
          : "Bounded summary only (save:false).",
      };
    },

    /** Best-effort stop used by detach so a wedged profile cannot block the next attach. */
    async stopProfilingQuiet() {
      if (!this.profiling || !this.cdp || this.cdp.closed) { this.profiling = null; return; }
      const kind = this.profiling.kind;
      this.profiling = null;
      try {
        if (kind === "cpu") {
          await this.cdp.send("Profiler.stop", {}, 2000).catch(() => {});
          await this.cdp.send("Profiler.disable", {}, 1000).catch(() => {});
        } else {
          await this.cdp.send("HeapProfiler.stopSampling", {}, 2000).catch(() => {});
          await this.cdp.send("HeapProfiler.disable", {}, 1000).catch(() => {});
        }
      } catch { /* detach reports its own cleanup */ }
    },
  };
}
