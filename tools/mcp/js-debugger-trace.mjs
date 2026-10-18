// @doc Non-pausing debugger tools: logpoints, exception log, listener counts, live-object counts (CDP).
// CDP contracts: Debugger.setBreakpointByUrl/paused, DOMDebugger.getEventListeners, Runtime.queryObjects
// (https://chromedevtools.github.io/devtools-protocol/).
const clip = (s, max = 2000) => String(s ?? "").slice(0, max);
const RING = "__apexDbgLog";

function exceptionMessage(data) {
  const value = data?.description ?? data?.unserializableValue ??
    (data && Object.hasOwn(data, "value") ? String(data.value) : data?.type === "undefined" ? "undefined" : "");
  return clip(String(value).split("\n")[0], 300);
}

// Page-side ring: the breakpoint condition pushes the value and returns false, so the
// page never pauses. Condition source runs in the paused-frame scope, so locals resolve.
export function logpointCondition(id, expression, maxHits, maxChars) {
  return `(function(){try{var G=globalThis,R=G.${RING}||(Object.defineProperty(G,"${RING}",{value:{},configurable:true}),G.${RING}),`
    + `L=R[${JSON.stringify(id)}]||(R[${JSON.stringify(id)}]={n:0,items:[]}),v,s;`
    + `try{v=(${expression}\n);s=typeof v==="number"?(isFinite(v)?v:String(v)):typeof v==="string"?v:(typeof v==="object"&&v!==null?JSON.stringify(v):String(v));`
    + `if(typeof s==="string"&&s.length>${maxChars})s=s.slice(0,${maxChars});}catch(e){s="!err: "+String(e&&e.message||e).slice(0,${maxChars})}`
    + `L.n++;if(L.items.length>=${maxHits})L.items.shift();L.items.push({i:L.n,t:Math.round(performance.now()),v:s});}catch(e){}return false})()`;
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
