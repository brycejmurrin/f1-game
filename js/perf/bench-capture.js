/* Apex 26 — BenchCapture: the profiling record BENCHMARK (js/perf/bench-run.js) writes beside its frame stats.

   One capture per leg, from legStart() to legEnd(): memory (performance.memory where it exists, the renderer's own
   counters through memState() / renderer.info, the asset pack), logs (a capped slice of the Log ring, window errors,
   unhandled rejections, WebGPU uncapturederror / device.lost), GPU (adapter info, features, the limits that matter,
   per-render-call GPU ms from three's timestamp-query pool, pipeline / shader / program compile counts and times),
   timing (long tasks, long animation frames, rAF gaps, the race-entry marks, visibility / pageshow transitions) and
   the device (dpr, viewport, standalone, battery, thermal / pressure signals). step() adds a small per-step record to
   each measured window. A leg the page never finished leaves a breadcrumb (CRUMB) that recover() hands to the next
   boot, so a WebGPU device loss or a jetsam reload still says what led up to it.

   Everything is capped (CAP) and sampled: a whole run stays well under 1 MB (budget() trims the plan if it is not).
   An API a browser lacks is recorded as "unsupported" (or "unavailable" when no web API exists, like thermal state
   on iOS), never thrown. No personal data: no storage values, no URLs beyond the path, no input. */
const BenchCapture = (function () {
  "use strict";

  const VERSION = 1;
  const CRUMB = "apex26.benchCapture";
  const CAP = { logs: 60, info: 20, msg: 200, errors: 12, longTasks: 12, loaf: 12, timeline: 120, compiles: 12, passes: 12,
    marks: 40, events: 24, bytes: 900000 };
  const TICK_MS = 5000;
  const GAPS = [33, 50, 100, 250, 1000];   // rAF gap buckets, ms
  const LIMITS = ["maxTextureDimension2D", "maxTextureArrayLayers", "maxBindGroups", "maxBufferSize", "maxStorageBufferBindingSize",
    "maxUniformBufferBindingSize", "maxComputeWorkgroupStorageSize", "maxColorAttachments", "maxSampledTexturesPerShaderStage",
    "maxVertexBuffers", "maxComputeInvocationsPerWorkgroup"];

  const r2 = (n) => (n != null && Number.isFinite(+n) ? Math.round(+n * 100) / 100 : null);
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const W = () => (typeof window !== "undefined" ? window : null);
  function safe(fn, dflt) { try { const v = fn(); return v === undefined ? dflt : v; } catch (_) { return dflt; } }
  // Strip query strings and hashes from anything that looks like a URL, and keep it short.
  function clean(s, n) { return String(s == null ? "" : s).replace(/(https?:\/\/[^\s?#)]*)[?#][^\s)]*/g, "$1").slice(0, n || CAP.msg); }
  function push(a, v, cap) { a.push(v); if (a.length > cap) a.shift(); }

  // ---- pure: tests/unit/bench-capture.test.mjs ------------------------------------------------------------------
  // Keep every warn/error, the first CAP.info info lines and every 5th after, newest CAP.logs overall.
  function sampleLogs(records, seen) {
    const out = [], s = seen || { info: 0 };
    for (const r of records || []) {
      if (!r) continue;
      if (r.level === "info") { s.info++; if (s.info > CAP.info && s.info % 5) continue; }
      else if (r.level !== "warn" && r.level !== "error") continue;
      out.push({ t: r.t, ns: r.ns, level: r.level, msg: clean(r.msg) });
    }
    return out.slice(-CAP.logs);
  }
  // rAF gap histogram: counts over each GAPS threshold plus the max.
  function gapStats(gaps) {
    const o = { frames: gaps.length, max: 0 };
    for (const t of GAPS) o["over" + t] = 0;
    for (const g of gaps) { if (g > o.max) o.max = g; for (const t of GAPS) if (g > t) o["over" + t]++; }
    o.max = r2(o.max);
    return o;
  }
  // Per-render-call GPU ms for the newest frame in three's timestamp pool (uids "r:<call>:<ctx>:f<frame>").
  function passTimes(timestamps) {
    if (!timestamps || typeof timestamps.forEach !== "function") return null;
    let best = -1; const rows = [];
    timestamps.forEach((ms, uid) => { const m = /^([rc]):(\d+):[^:]*:f(\d+)$/.exec(String(uid)); if (m) rows.push({ f: +m[3], call: m[1] + m[2], ms: +ms }); });
    for (const r of rows) if (r.f > best) best = r.f;
    const last = rows.filter((r) => r.f === best && Number.isFinite(r.ms) && r.ms >= 0).sort((a, b) => b.ms - a.ms);
    if (!last.length) return null;
    let total = 0; for (const r of last) total += r.ms;
    return { frame: best, calls: last.length, totalMs: r2(total), top: last.slice(0, CAP.passes).map((r) => ({ call: r.call, ms: r2(r.ms) })) };
  }
  function compileStats(list, fromT, toT) {
    const o = { n: 0, ms: 0, max: 0, byKind: {} };
    for (const c of list) {
      if (c.t < fromT || c.t >= toT) continue;
      o.n++; o.ms += c.ms || 0; if (c.ms > o.max) o.max = c.ms;
      const k = o.byKind[c.kind] || (o.byKind[c.kind] = { n: 0, ms: 0 }); k.n++; k.ms = r2(k.ms + (c.ms || 0));
    }
    o.ms = r2(o.ms); o.max = r2(o.max);
    return o;
  }
  // Drop the bulkiest parts (logs, then timelines, then step captures) until the plan fits `limit` bytes.
  function budget(plan, limit) {
    const max = limit || CAP.bytes, size = () => { try { return JSON.stringify(plan).length; } catch (_) { return 0; } };
    let n = size(); if (n <= max) return { bytes: n, trimmed: [] };
    const trimmed = [], legs = (plan && plan.legs) || [];
    const cut = (what, f) => { if (n <= max) return; for (const l of legs) if (l && l.capture) f(l); trimmed.push(what); n = size(); };
    cut("logs", (l) => { l.capture.logs = (l.capture.logs || []).filter((r) => r.level !== "info").slice(-10); });
    cut("timeline", (l) => { const t = l.capture.timeline || []; l.capture.timeline = t.filter((_, i) => i % 4 === 0); });
    cut("steps", (l) => { for (const s of l.steps || []) delete s.cap; });
    cut("all", (l) => { l.capture = { v: VERSION, trimmed: true, end: l.capture.end || null }; });
    if (plan) plan.captureTrimmed = trimmed;
    return { bytes: n, trimmed };
  }

  // ---- live readers -----------------------------------------------------------------------------------------------
  let _G = null;
  // The bound renderer façade: G.gfx (TLX / GLX), or the GLX global and its __tlx.
  function gfx() {
    const c = [_G && _G.gfx, _G && _G.gfx && _G.gfx.__tlx, typeof GLX !== "undefined" ? GLX.__tlx : null, typeof GLX !== "undefined" ? GLX : null];
    return c.filter((x) => x && typeof x === "object");
  }
  function call(name) { for (const g of gfx()) if (typeof g[name] === "function") return safe(() => g[name](), null); return null; }
  function renderer() { const h = call("inspectorHost"); return h && h.renderer ? h.renderer : null; }
  // Timestamp UIDs carry renderer.info.frame. Bound windows by frames already
  // submitted at their start, so a delayed old resolution is not new work.
  function gpuBoundary(r) {
    const frame = safe(() => r.info.frame, null);
    const row = passTimes(safe(() => r.backend.timestampQueryPool.render.timestamps, null));
    return Number.isFinite(frame) ? Math.max(frame, row ? row.frame : -1) : null;
  }
  function readGpu(L, afterFrame, scope) {
    const r = renderer(), timer = L.gpuTimer ? safe(() => L.gpuTimer.gpuTimer(), null) : null;
    const row = passTimes(safe(() => r.backend.timestampQueryPool.render.timestamps, null));
    let state = L.out.gpu.timer === "supported" ? "freshness unavailable" : "unsupported";
    if (timer && !timer.supported) state = "unsupported";
    if (timer && timer.supported) {
      if (!timer.on) state = "timer inactive";
      else if (r !== L.gpuRenderer || afterFrame == null) state = "freshness unavailable";
      else state = row && row.frame > afterFrame ? "fresh" : "no fresh resolved frame";
    }
    return { passes: state === "fresh" ? row : null,
      sample: { state, scope, frame: row ? row.frame : null, afterFrame,
        capturedAtMs: r2(now() - L.t0), timerOn: !!(timer && timer.on) } };
  }
  function memory() {
    const w = W(), pm = safe(() => performance.memory, null);   // Chromium only; WebKit has none
    const m = call("memState") || {}, bs = call("backendState") || {};
    const o = {
      heapMB: pm ? r2(pm.usedJSHeapSize / 1048576) : "unsupported",
      heapTotalMB: pm ? r2(pm.totalJSHeapSize / 1048576) : undefined,
      heapLimitMB: pm ? r2(pm.jsHeapSizeLimit / 1048576) : undefined,
      rGeo: m.rGeo, rTex: m.rTex, progs: m.progs, calls: m.calls, draws: m.draws, mats: m.mats, pool: m.pool, geoKeys: m.geoKeys,
      rObj: m.rObj, rUbo: m.rUbo, rUboKB: m.rUboKB, matMiss: m.matMiss, presentMs: m.presentMs,
      res: m.resources ? Object.assign({}, m.resources) : undefined,
      packLive: bs.packLive, gpuErrors: bs.gpuErrors, ctxLost: bs.ctxLost, healed: bs.healed,
      assets: safe(() => { const a = Assets.state(); return { pack: a.pack, uploaded: a.uploaded, tier: a.tier, layers: a.layers, models: a.models, MB: r2(a.bytes / 1048576), error: a.error ? clean(a.error, 80) : null }; }, undefined),
      errRing: safe(() => w.__apexErrors.length, undefined),
    };
    const ri = safe(() => renderer().info, null);
    if (ri && ri.render) o.tris = ri.render.triangles;
    for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k];
    return o;
  }
  function device() {
    const w = W() || {}, nav = w.navigator || {};
    const conn = nav.connection;
    return {
      dpr: w.devicePixelRatio || 1,
      inner: safe(() => [w.innerWidth, w.innerHeight], null),
      visual: safe(() => [r2(w.visualViewport.width), r2(w.visualViewport.height), r2(w.visualViewport.scale)], "unsupported"),
      screen: safe(() => [w.screen.width, w.screen.height], null),
      orientation: safe(() => w.screen.orientation.type, "unsupported"),
      standalone: safe(() => !!(nav.standalone || (w.matchMedia && w.matchMedia("(display-mode: standalone)").matches)), false),
      hwConcurrency: nav.hardwareConcurrency || "unsupported",
      deviceMemoryGB: nav.deviceMemory || "unsupported",
      connection: conn ? { type: conn.effectiveType || null, saveData: !!conn.saveData } : "unsupported",
      crossOriginIsolated: !!w.crossOriginIsolated,
      battery: typeof nav.getBattery === "function" ? "pending" : "unsupported",
      // No web API reports thermal state on iOS; PressureObserver (Compute Pressure) is Chromium-only.
      thermal: typeof w.PressureObserver === "function" ? "pending" : "unavailable",
      thermalDrift: safe(() => PerfGov.thermalDrift() || "off", "unsupported"),
      memoryPressure: "unavailable",   // no page-visible signal; heap and the reload breadcrumb are the proxies
      reducedMotion: safe(() => w.matchMedia("(prefers-reduced-motion: reduce)").matches, null),
      visibility: safe(() => document.visibilityState, null),
    };
  }
  // Async facts, filled into `into` when they settle; anything that hangs stays "pending".
  function asyncFacts(into) {
    const w = W() || {}, nav = w.navigator || {};
    if (into.device.battery === "pending") safe(() => nav.getBattery().then((b) => { into.device.battery = { level: r2(b.level), charging: !!b.charging }; },
      () => { into.device.battery = "denied"; }), null);
    if (into.device.thermal === "pending") safe(() => {
      const src = w.PressureObserver.knownSources || [];
      if (src.indexOf("cpu") < 0) { into.device.thermal = "unsupported"; return; }
      const po = new w.PressureObserver((recs) => { const r = recs[recs.length - 1]; if (r) into.device.thermal = { cpuPressure: r.state }; });
      into._pressure = po; po.observe("cpu").catch(() => { into.device.thermal = "denied"; });
    }, null);
    // measureUserAgentSpecificMemory needs crossOriginIsolated (COOP+COEP); GitHub Pages sends neither header.
    if (!w.crossOriginIsolated) into.uaMemory = "unsupported (not crossOriginIsolated)";
    else if (!(w.performance && typeof w.performance.measureUserAgentSpecificMemory === "function")) into.uaMemory = "unsupported";
    else { into.uaMemory = "pending"; safe(() => w.performance.measureUserAgentSpecificMemory().then((m) => { into.uaMemory = { MB: r2(m.bytes / 1048576) }; }, (e) => { into.uaMemory = "failed: " + clean(e && e.name, 40); }), null); }
    if (!nav.gpu || typeof nav.gpu.requestAdapter !== "function") { into.gpu.adapter = "unsupported"; return; }
    into.gpu.adapter = "pending";
    safe(() => nav.gpu.requestAdapter().then((a) => {
      if (!a) { into.gpu.adapter = "none"; return; }
      const info = a.info || {}, lim = {};
      for (const k of LIMITS) if (a.limits && typeof a.limits[k] === "number") lim[k] = a.limits[k];
      into.gpu.adapter = { vendor: info.vendor || "", architecture: info.architecture || "", description: info.description || "",
        device: info.device || "", fallback: !!(info.isFallbackAdapter || a.isFallbackAdapter),
        subgroups: info.subgroupMinSize ? [info.subgroupMinSize, info.subgroupMaxSize] : null,
        features: safe(() => Array.from(a.features).sort(), []), limits: lim };
    }, (e) => { into.gpu.adapter = "failed: " + clean(e && e.name, 40); }), null);
  }

  // ---- the live leg -----------------------------------------------------------------------------------------------
  let _leg = null;
  function wrapCompiles(L) {
    const undo = [];
    const wrap = (proto, name, kind, isAsync) => {
      if (!proto || typeof proto[name] !== "function") return;
      const o = proto[name];
      const fn = function () {
        if (!L.on) return o.apply(this, arguments);
        const t0 = now(), add = () => push(L.compiles, { t: t0 - L.t0, kind, ms: r2(now() - t0) }, 2000);
        const v = o.apply(this, arguments);
        if (isAsync && v && typeof v.then === "function") v.then(add, add); else add();
        return v;
      };
      proto[name] = fn;
      undo.push(() => { if (proto[name] === fn) proto[name] = o; });   // someone wrapped on top: L.on=false makes ours a pass-through
    };
    const gd = typeof GPUDevice !== "undefined" ? GPUDevice.prototype : null;
    wrap(gd, "createRenderPipeline", "pipe", false); wrap(gd, "createRenderPipelineAsync", "pipeAsync", true);
    wrap(gd, "createComputePipeline", "compute", false); wrap(gd, "createComputePipelineAsync", "computeAsync", true);
    wrap(gd, "createShaderModule", "shader", false);
    wrap(typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext.prototype : null, "linkProgram", "link", false);
    return () => undo.forEach((f) => safe(f, null));
  }
  function observe(L, type, sink) {
    const PO = typeof PerformanceObserver !== "undefined" ? PerformanceObserver : null;
    if (!PO || (PO.supportedEntryTypes || []).indexOf(type) < 0) return "unsupported";
    return safe(() => {
      const o = new PO((list) => { for (const e of list.getEntries()) sink(e); });
      o.observe({ type, buffered: false }); L.undo.push(() => o.disconnect());
      return "on";
    }, "unsupported");
  }
  function on(L, target, ev, fn) { if (!target || !target.addEventListener) return; target.addEventListener(ev, fn); L.undo.push(() => target.removeEventListener(ev, fn)); }
  function snapLight(L) {
    const m = memory(), t = r2((now() - L.t0) / 1000);
    return { t, st: _G ? _G.state : null, heap: m.heapMB, geo: m.rGeo, tex: m.rTex, progs: m.progs, calls: m.calls, draws: m.draws,
      gpuMs: r2(safe(() => { for (const g of gfx()) if (g.gpuMs) return g.gpuMs(); return null; }, null)),
      err: L.errors.length, lt: L.lt.n, gaps: L.gaps.length };
  }
  function crumb(L) {
    const c = { v: VERSION, label: L.label, at: new Date().toISOString(), t: r2((now() - L.t0) / 1000), last: L.timeline.slice(-6),
      logs: L.logs.slice(-12), errors: L.errors.slice(-6), events: L.events.slice(-8) };
    safe(() => { const s = typeof GameStore !== "undefined" && GameStore.store; const txt = JSON.stringify(c); if (s) s.rawSet(CRUMB, txt); else localStorage.setItem(CRUMB, txt); }, null);
  }
  function pullLogs(L) {
    if (typeof Log === "undefined" || !Log.records) return;
    const recs = safe(() => Log.records({ since: L.logSince }), []);
    if (recs.length) L.logSince = recs[recs.length - 1].id;
    for (const r of sampleLogs(recs, L.logSeen)) push(L.logs, r, CAP.logs);
  }
  function legStart(leg, G) {
    if (_leg) legEnd();
    if (G) _G = G;
    const L = _leg = { on: true, t0: now(), label: leg && leg.label, undo: [], compiles: [], errors: [], events: [], logs: [], logSeen: { info: 0 },
      logSince: safe(() => { const r = Log.records(); return r.length ? r[r.length - 1].id : 0; }, 0),
      lt: { n: 0, ms: 0, top: [] }, loaf: { n: 0, ms: 0, blockMs: 0, top: [] }, gaps: [], timeline: [], raceAt: null, stepFrom: 0, stepErr: 0, stepLt: 0,
      out: { v: VERSION, device: device(), gpu: {}, start: memory() } };
    asyncFacts(L.out);
    L.undo.push(wrapCompiles(L));
    const w = W(), d = typeof document !== "undefined" ? document : null;
    const err = (kind) => (e) => push(L.errors, { t: r2((now() - L.t0) / 1000), kind,
      msg: clean(kind === "rejection" ? (e && e.reason && (e.reason.message || e.reason)) : (e && (e.message || (e.error && e.error.message)))) }, CAP.errors * 4);
    on(L, w, "error", err("error")); on(L, w, "unhandledrejection", err("rejection"));
    const ev = (name) => () => push(L.events, { t: r2((now() - L.t0) / 1000), ev: name, vis: d ? d.visibilityState : null }, CAP.events);
    on(L, d, "visibilitychange", ev("visibility")); on(L, w, "pageshow", ev("pageshow")); on(L, w, "pagehide", ev("pagehide"));
    on(L, w, "orientationchange", ev("orientation")); on(L, w, "resize", ev("resize"));
    const dev = safe(() => renderer().backend.device, null);
    if (dev) {
      on(L, dev, "uncapturederror", (e) => push(L.errors, { t: r2((now() - L.t0) / 1000), kind: "gpu", msg: clean(e && e.error && e.error.message) }, CAP.errors * 4));
      safe(() => dev.lost.then((i) => { if (L.on) push(L.errors, { t: r2((now() - L.t0) / 1000), kind: "device-lost", msg: clean((i && i.reason) + ": " + (i && i.message)) }, CAP.errors * 4); crumb(L); }), null);
    }
    L.out.gpu.device = dev ? "webgpu" : "none";
    L.out.observers = {
      longtask: observe(L, "longtask", (e) => { L.lt.n++; L.lt.ms += e.duration; push(L.lt.top, { t: r2((e.startTime - L.t0) / 1000), ms: r2(e.duration) }, 400); }),
      loaf: observe(L, "long-animation-frame", (e) => { L.loaf.n++; L.loaf.ms += e.duration; L.loaf.blockMs += e.blockingDuration || 0;
        const s = (e.scripts || [])[0]; push(L.loaf.top, { t: r2((e.startTime - L.t0) / 1000), ms: r2(e.duration), block: r2(e.blockingDuration), src: s ? clean(s.sourceFunctionName || s.invoker || "", 60) : null }, 400); }),
    };
    // GPU timer on for the leg where the backend supports it (GPU TEST turns it on for its own phases anyway).
    const timer = safe(() => { for (const g of gfx()) if (g.gpuTimer) return g; return null; }, null);
    const was = timer ? safe(() => timer.gpuTimer(), null) : null;
    L.out.gpu.timer = was ? (was.supported ? "supported" : "unsupported") : "unsupported";
    if (was && was.supported && !was.on) { safe(() => timer.gpuTimer(true), null); L.undo.push(() => safe(() => timer.gpuTimer(false), null)); }
    L.gpuTimer = timer; L.gpuRenderer = renderer();
    L.gpuStartFrame = L.gpuStepFrame = gpuBoundary(L.gpuRenderer);
    let prev = 0;
    const raf = (ts) => { if (!L.on) return; if (prev) push(L.gaps, ts - prev, 20000); prev = ts; requestAnimationFrame(raf); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(raf);
    const tick = () => {
      if (!L.on) return;
      if (L.raceAt == null && _G && _G.state === "race") L.raceAt = now() - L.t0;
      pullLogs(L); push(L.timeline, snapLight(L), CAP.timeline); crumb(L);
    };
    const iv = setInterval(tick, TICK_MS); L.undo.push(() => clearInterval(iv));
    const fast = setInterval(() => { if (L.raceAt == null && _G && _G.state === "race") L.raceAt = now() - L.t0; }, 100);
    L.undo.push(() => clearInterval(fast));
    return true;
  }
  // Small per-step record for a measured window (bench-run measure()): what happened since the previous step.
  function step() {
    const L = _leg; if (!L) return null;
    pullLogs(L);
    const t = now() - L.t0, m = memory(), gpu = readGpu(L, L.gpuStepFrame, "step");
    const o = { heap: m.heapMB, geo: m.rGeo, tex: m.rTex, progs: m.progs, calls: m.calls, tris: m.tris,
      gpuPasses: gpu.passes, gpuSample: gpu.sample,
      compiles: compileStats(L.compiles, L.stepFrom, t), errors: L.errors.length - L.stepErr, longTasks: L.lt.n - L.stepLt };
    L.stepFrom = t; L.stepErr = L.errors.length; L.stepLt = L.lt.n;
    L.gpuStepFrame = gpuBoundary(renderer());
    return o;
  }
  function legEnd() {
    const L = _leg; if (!L) return null;
    pullLogs(L);
    const gpu = readGpu(L, L.gpuStartFrame, "leg");   // read before undo disables our timer
    L.on = false; _leg = null;
    for (const f of L.undo.reverse()) safe(f, null);
    safe(() => L.out._pressure && L.out._pressure.disconnect(), null); delete L.out._pressure;
    const end = now() - L.t0, entryT = L.raceAt != null ? L.raceAt : end;
    const top = (a, n) => a.slice().sort((x, y) => y.ms - x.ms).slice(0, n);
    const c = L.out;
    c.ms = r2(end); c.raceAtMs = r2(L.raceAt);
    c.end = memory();
    c.gpu.passes = gpu.passes || gpu.sample.state;
    c.gpu.sample = gpu.sample;
    c.compiles = { entry: compileStats(L.compiles, 0, entryT), after: compileStats(L.compiles, entryT, Infinity), top: top(L.compiles, CAP.compiles) };
    c.longTasks = c.observers.longtask === "on" ? { n: L.lt.n, ms: r2(L.lt.ms), top: top(L.lt.top, CAP.longTasks) } : "unsupported";
    c.loaf = c.observers.loaf === "on" ? { n: L.loaf.n, ms: r2(L.loaf.ms), blockMs: r2(L.loaf.blockMs), top: top(L.loaf.top, CAP.loaf) } : "unsupported";
    c.rafGaps = gapStats(L.gaps);
    c.entry = safe(() => { const s = RaceEntryProfile.snapshot(); return { entry: s.entry, windowMs: s.windowMs, blockMs: s.blockMs, maxBlockMs: s.maxBlockMs,
      supported: s.supported, legs: (s.legs || []).slice(-CAP.marks), marks: (s.marks || []).slice(-CAP.marks), longTasks: (s.longTasks || []).slice(0, CAP.longTasks) }; }, "unsupported");
    // TLX's entry warm by stage (scene/fx/post/shadow/mirror/draw ms): RaceEntryProfile's "Mirror" span waits on the whole warm.
    c.warm = safe(() => { const w = call("memState").warm; const o = {}; for (const k of Object.keys(w)) if (k !== "history") o[k] = w[k];
      o.history = (w.history || []).slice(-4); return o; }, "unsupported");
    c.errors = L.errors.slice(-CAP.errors); c.errorCount = L.errors.length;
    c.events = L.events.slice(-CAP.events);
    c.logs = L.logs.slice(-CAP.logs);
    c.timeline = L.timeline.slice(-CAP.timeline);
    clearCrumb();
    return c;
  }
  // The breadcrumb a leg left when the page died under it (bench-run marks that leg "reloaded").
  function recover() {
    const txt = safe(() => { const s = typeof GameStore !== "undefined" && GameStore.store; return s ? s.raw(CRUMB) : localStorage.getItem(CRUMB); }, null);
    clearCrumb();
    const c = safe(() => (txt ? JSON.parse(txt) : null), null);
    return c && c.v === VERSION ? c : null;
  }
  function clearCrumb() { safe(() => { const s = typeof GameStore !== "undefined" && GameStore.store; if (s) s.rawDel(CRUMB); else localStorage.removeItem(CRUMB); }, null); }

  // GAPS / clean stay module-local (gapStats + log/error paths use them; no external callers).
  return { VERSION, CRUMB, CAP, sampleLogs, gapStats, passTimes, compileStats, budget,
    legStart, step, legEnd, recover, active: () => !!_leg };
})();

Object.freeze(BenchCapture);
