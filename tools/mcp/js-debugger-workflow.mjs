// @doc Batched debugger workflows: break-and-inspect, logpoint collect, and the scope-locals reader they share.
// One call replaces the set-breakpoint → run → state → properties → resume round trips
// (CDP: Debugger.setBreakpointByUrl, Debugger.paused, Runtime.getProperties).
const clip = (s, max = 2000) => String(s ?? "").slice(0, max);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** One-line value for a Runtime.RemoteObject: primitives by value, objects by V8 preview or description. */
export function valueSummary(v) {
  if (!v) return undefined;
  if (Object.hasOwn(v, "value") && (v.value === null || typeof v.value !== "object")) return typeof v.value === "string" ? clip(v.value, 200) : v.value;
  if (v.unserializableValue) return v.unserializableValue;
  if (v.type === "undefined") return "undefined";
  if (v.type === "function") return clip(String(v.description || "function").split("\n")[0], 100);
  const props = v.preview?.properties;
  if (props) {
    const arr = v.subtype === "array";
    const shown = p => p.type === "function" ? "ƒ" : clip(p.value, 40);
    const body = props.slice(0, 8).map(p => arr ? shown(p) : `${clip(p.name, 30)}: ${shown(p)}`).join(", ");
    return clip(`${arr ? `${clip(v.description, 30)} [` : "{"}${body}${v.preview.overflow || props.length > 8 ? ", …" : ""}${arr ? "]" : "}"}`, 300);
  }
  return clip(v.description || v.type, 200);
}

// Scope types worth printing: the global/script scopes are the whole window/module table.
const LOCAL_SCOPES = new Set(["local", "block", "closure", "catch", "module", "with"]);
/** Read up to `max` variables from the frame's local-ish scopes; inner scopes win on name clashes. */
export async function frameLocals(cdp, scopeChain, { max = 40, objectGroup, closures = 1, timeout = 3000 } = {}) {
  const out = {};
  let n = 0, closureSeen = 0, truncated = false;
  for (const scope of scopeChain || []) {
    if (!LOCAL_SCOPES.has(scope.type) || !scope.object?.objectId) continue;
    if (scope.type === "closure" && ++closureSeen > closures) continue;
    const r = await cdp.send("Runtime.getProperties", { objectId: scope.object.objectId, ownProperties: true,
      generatePreview: true, ...(objectGroup ? { objectGroup } : {}) }, timeout);
    for (const p of r.result || []) {
      if (Object.hasOwn(out, p.name)) continue;
      if (n >= max) { truncated = true; break; }
      out[p.name] = p.value ? valueSummary(p.value) : p.get ? "(getter)" : undefined; n++;
    }
  }
  return truncated ? { ...out, "…": `more than ${max} variables` } : out;
}
// R4 (debugger-B, measured): a vm script's scriptParsed url is whatever filename the harness gave
// it: file:///abs/js/physics/brake-cue.js, js/physics/brake-cue.js, or a bare brake-cue.js. Match any trailing sub-path of the repo
// path, with or without file://, so one probe hits every named form.
export function pathSuffixRegex(rel) {
  const parts = rel.replace(/^\.?\//, "").split("/").map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const tails = parts.map((_, i) => parts.slice(i).join("/"));
  // The full repo path may sit under any root (file:///abs/…); a shorter tail only as the WHOLE
  // url, so a same-named file in another directory never matches.
  return tails.length > 1 ? `(?:^|/)${tails[0]}$|^(?:${tails.slice(1).join("|")})$` : `(?:^|/)${tails[0]}$`;
}
export const frameLine = (f, url) => `${f.functionName || "(anonymous)"} ${url || f.url || f.location.scriptId}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}`;

export function workflowMethods() {
  return {
    // Resolve on the next Debugger.paused for this client (the session's own handler runs first,
    // so this.pause is already the new pause) or after ms.
    waitForPause(ms) {
      if (this.pause) return Promise.resolve(true);
      const client = this.cdp;
      return new Promise(resolve => {
        let timer;
        const done = v => { clearTimeout(timer); client.removeListener("Debugger.paused", hit); client.removeListener("disconnect", lost); resolve(v); };
        const hit = () => setImmediate(() => { if (this.pause) done(true); });
        const lost = () => done(false);
        timer = setTimeout(() => done(!!this.pause), ms);
        client.on("Debugger.paused", hit); client.once("disconnect", lost);
      });
    },
    async pauseDigest(frames = 1, maxLocals = 40) {
      const pause = this.pause, cdp = this.connected();
      const raw = pause.frames.map(f => ({ scopeChain: f.scopes }));
      const out = { paused: true, token: pause.token, reason: pause.reason, cause: pause.cause,
        ...(pause.exception ? { exception: pause.exception } : {}), hitBreakpoints: pause.hitBreakpoints,
        stack: pause.frames.map(f => `${f.functionName || "(anonymous)"} ${f.url || f.scriptId}:${f.line}:${f.column}`), locals: [] };
      for (let i = 0; i < Math.min(frames, raw.length); i++) {
        try { out.locals.push({ frame: i, vars: await frameLocals(cdp, raw[i].scopeChain, { max: maxLocals, objectGroup: pause.token }) }); }
        catch (e) { out.locals.push({ frame: i, error: clip(e.message, 300) }); }
        if (this.pause !== pause) { out.note = "Execution resumed while locals were read; token is stale"; break; }
      }
      return out;
    },
    // debugger_break: set breakpoints, optionally run a trigger, wait for the first pause and return
    // stack + locals in one response. Leaves the page paused (token in the reply) unless resume:true.
    async breakAndInspect({ breakpoints = [], trigger, awaitPromise = false, timeoutMs = 10000, frames = 1, maxLocals = 40, resume = false, keep = !resume }) {
      this.connected();
      if (this.pause && trigger) await this.verifyPause();
      if (this.pause && trigger) throw Error("Already paused: inspect the current pause or resume first (debugger_control resume)");
      const set = [];
      for (const b of breakpoints) {
        const bp = await this.setBreakpoint(b.url, b.line, b.column ?? 1, b.condition ?? "");
        set.push({ id: bp.id, url: bp.url ?? bp.urlRegex, line: b.line, locations: bp.locations, ...(bp.warning ? { warning: bp.warning } : {}) });
      }
      // Already paused (Node's Break on start, a previous hit) and no trigger: run to the next pause.
      if (this.pause && !trigger) {
        const at = this.pause.token;
        await this.connected().send("Debugger.resume");
        if (this.pause?.token === at) { this.resetPause(); this.markOperations("paused", "pending"); }
      }
      const operation = trigger ? this.run(trigger, awaitPromise, Math.max(timeoutMs, 1000)) : null;
      const started = Date.now();
      let hit = await this.waitForPause(timeoutMs);
      // A trigger that already settled cannot pause later; stop waiting.
      const op = operation && this.operations.get(operation.operationId);
      const body = { breakpoints: set, waitedMs: Date.now() - started };
      if (op) body.operation = { id: op.id, status: op.status, ...(op.result ? { result: op.result } : {}), ...(op.error ? { error: op.error } : {}) };
      if (!hit) {
        return { ...body, paused: false, note: `No pause within ${timeoutMs} ms. ${set.some(b => !b.locations.length) ? "Some breakpoints have no locations (see warning). " : ""}${op?.status === "completed" ? "The trigger completed without reaching a breakpoint (check the condition and line)." : ""}`.trim(),
          ...(keep ? {} : await this.dropAll(set)) };
      }
      const digest = await this.pauseDigest(Math.min(3, frames), maxLocals);
      Object.assign(body, digest);
      if (resume) {
        try { await this.connected().send("Debugger.resume"); this.resetPause(); this.markOperations("paused", "pending"); body.resumed = true; body.token = undefined; }
        catch (e) { body.resumeError = clip(e.message, 300); }
        if (!keep) Object.assign(body, await this.dropAll(set));
      }
      return body;
    },
    async dropAll(set) {
      const removed = [], removeErrors = [];
      for (const b of set) {
        const bp = this.breakpoints.get(b.id); if (!bp) continue;
        try { await this.dropBreakpoint(bp); removed.push(b.id); } catch (e) { removeErrors.push(`${b.id}: ${clip(e.message, 200)}`); }
      }
      return { removed, ...(removeErrors.length ? { removeErrors } : {}) };
    },
    // debugger_collect: logpoints + trigger + wait + read + remove in one call (page must run).
    async collect({ logpoints = [], trigger, awaitPromise = true, waitMs = 2000, limit = 20, keep = false }) {
      this.connected(); this.notPaused();
      const set = [];
      for (const lp of logpoints) set.push(await this.setLogpoint({ url: lp.url, line: lp.line, column: lp.column, expression: lp.expression,
        maxHits: Math.max(limit, 1), maxChars: 200 }));
      let op = null;
      const started = Date.now();
      if (trigger) {
        const { operationId } = this.run(trigger, awaitPromise, Math.max(waitMs, 1000));
        op = this.operations.get(operationId);
        while (Date.now() - started < waitMs && ["pending", "unknown"].includes(op.status) && !this.pause) await sleep(25);
      } else await sleep(waitMs);
      if (this.pause) {
        return { paused: true, note: "A breakpoint or exception paused the page during collection; logpoints left in place. Inspect debugger_state, resume, then debugger_logpoint_read.",
          logpoints: set.map(s => ({ id: s.id, breakpointId: s.breakpointId })) };
      }
      const read = await this.readLogpoints({ limit });
      const mine = new Set(set.map(s => s.id));
      const body = { waitedMs: Date.now() - started,
        ...(op ? { operation: { id: op.id, status: op.status, ...(op.result ? { result: op.result } : {}), ...(op.error ? { error: op.error } : {}) } } : {}),
        logpoints: read.logpoints.filter(l => mine.has(l.id)).map(l => ({ id: l.id, url: l.url, line: l.line, expression: l.expression,
          resolved: set.find(s => s.id === l.id)?.locations?.map(p => p.line) ?? [], hits: l.hits, values: l.items.map(x => x.v),
          ...(set.find(s => s.id === l.id)?.warning ? { warning: set.find(s => s.id === l.id).warning } : {}) })) };
      if (!keep) Object.assign(body, await this.dropAll(set.map(s => ({ id: s.breakpointId }))));
      return body;
    },
  };
}
