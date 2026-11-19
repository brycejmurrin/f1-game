const ScriptLoader = (function () {
"use strict";
let _lazyV;
function lazyVersions() {
  if (_lazyV !== undefined) return _lazyV;
  _lazyV = null;
  try {
    const el = typeof document !== "undefined" && document.getElementById && document.getElementById("apex-lazy-v");
    const m = el ? JSON.parse(el.textContent) : null;
    if (m && typeof m === "object") _lazyV = m;
  } catch (_) {  }
  return _lazyV;
}
let _lazyIntegrity;
function integrity(src) {
  if (_lazyIntegrity === undefined) {
    _lazyIntegrity = null;
    try {
      const el = document.getElementById && document.getElementById("apex-lazy-integrity");
      if (el && el.tagName === "SCRIPT" && el.type === "application/json") {
        _lazyIntegrity = {};
        const map = JSON.parse(el.textContent);
        if (map && typeof map === "object" && !Array.isArray(map)) _lazyIntegrity = map;
      }
    } catch (_) {  }
  }
  if (_lazyIntegrity === null) return null;
  const value = Object.prototype.hasOwnProperty.call(_lazyIntegrity, src) ? _lazyIntegrity[src] : null;
  return typeof value === "string" && /^sha256-[A-Za-z0-9+/]{43}=$/.test(value) ? value : false;
}
function url(src) {
  const m = lazyVersions();
  const h = m && Object.prototype.hasOwnProperty.call(m, src) ? m[src] : null;
  return src + "?v=" + (typeof h === "string" && /^[0-9a-f]{12}$/.test(h) ? h : ((typeof window !== "undefined" && window.__APEX_BUILD) || 0));
}
function preload(files, opts) {
  const low = !!(opts && opts.low);
  if (typeof document === "undefined" || !document.createElement || !document.head) return 0;
  let n = 0;
  for (const src of files || []) {
    const sri = integrity(src);
    if (sri === false) continue;
    const href = url(src);
    try { if (document.querySelector && document.querySelector('link[rel="preload"][href="' + href + '"]')) continue; }
    catch (_) {  }
    const el = document.createElement("link");
    el.rel = "preload";
    el.as = "script";
    el.href = href;
    el.crossOrigin = "anonymous";
    if (sri) el.integrity = sri;
    if (low) el.fetchPriority = "low";
    document.head.appendChild(el);
    n++;
  }
  return n;
}
function warm(hrefs) {
  if (typeof fetch !== "function" || !hrefs || !hrefs.length) return Promise.resolve(0);
  return Promise.all(hrefs.map(async (href) => {
    try {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res || !res.ok) return 0;
      if (typeof res.arrayBuffer === "function") await res.arrayBuffer();
      return 1;
    } catch (_) { return 0; }
  })).then((xs) => xs.reduce((a, b) => a + b, 0));
}
const SLOW_MS = 10000, DEADLINE_MS = 25000;
const TRANSIENT_RETRY_MS = [400, 1200];
const evaluated = new Set();
const evaluating = new Map();
const stranded = new Map();
function browserAttempt(src, href, sri, opts, onLoad) {
  return new Promise((resolve) => {
    const el = document.createElement("script");
    if (sri) el.integrity = sri;
    el.src = href;
    el.crossOrigin = "anonymous";
    if (el.dataset) el.dataset.apexLazy = "1";
    const slowMs = (opts && opts.slowMs) || SLOW_MS, deadlineMs = (opts && opts.deadlineMs) || DEADLINE_MS;
    let slowT = null, deadT = null;
    const W = typeof window !== "undefined" ? window : null, timed = !!(W && typeof W.setTimeout === "function");
    const settle = (ok, retry, late) => { if (timed) { W.clearTimeout(slowT); W.clearTimeout(deadT); } resolve({ ok, retry: !!retry, late }); };
    if (timed) {
    slowT = W.setTimeout(() => {
      try { if (opts && opts.onSlow) opts.onSlow(src); } catch (_) {  }
    }, slowMs);
    const tickMs = Math.max(10, Math.min(1000, Math.floor(deadlineMs / 10)));
    let budget = 0, last = Date.now();
    const beat = () => {
      const t = Date.now();
      budget += Math.max(0, Math.min(t - last, 2 * tickMs));
      last = t;
      if (budget < deadlineMs) { deadT = W.setTimeout(beat, tickMs); return; }
      if (typeof Log !== "undefined") Log.warn("game", "lazy load timed out after " + deadlineMs + " ms: " + src);
      let done;
      const late = new Promise((r) => { done = r; });
      el.onload = () => { let ok = false; try { ok = !!onLoad(); } catch (_) {  } done(ok); };
      el.onerror = () => done(false);
      if (el.remove) el.remove();
      settle(false, false, late);
    };
    deadT = W.setTimeout(beat, tickMs);
    }
    el.onload = () => {
      const ready = onLoad();
      settle(ready, false);
    };
    el.onerror = () => { if (el.remove) el.remove(); settle(false, true); };
    document.head.appendChild(el);
  });
}

function runLoadGraph(files, preds, pending, done, inflight, strict, loaded, opts, inject) {
  return new Promise((finish) => {
    let failed = false;
    const pump = () => {
      if (failed && strict) { if (!inflight.size) finish(false); return; }
      if (!pending.size && !inflight.size) { finish(!failed); return; }
      for (const src of files) {
        if (!pending.has(src)) continue;
        if (!preds.get(src).every((p) => done.has(p))) continue;
        pending.delete(src);
        inflight.add(src);
        inject(src).catch((e) => {
          if (typeof Log !== "undefined") Log.warn("game", "lazy load threw: " + src + " — " + (e && e.message));
          return false;
        }).then((ok) => {
          inflight.delete(src);
          if (ok) {
            done.add(src);
            if (loaded) loaded.add(src);
            try { if (opts && opts.onSettled) opts.onSettled(src); } catch (_) {  }
          }
          else { failed = true; if (!strict) done.add(src); }
          pump();
        });
      }
    };
    pump();
  });
}

function create() {
const BACKEND_EDGES = ApexRoster.DEFERRED_EDGES;
function loadBackendScripts(files, edges, opts) {
  const strict = !!(opts && opts.strict);
  const generationScope = {};
  const loaded = opts && opts.loaded;
  const pending = new Set(files.filter((f) => !loaded || !loaded.has(f)));
  const done = new Set(loaded || []), inflight = new Set();
  const preds = new Map(files.map((f) => [f, []]));
  for (const [a, b] of (edges || BACKEND_EDGES)) {
    if (preds.has(a) && preds.has(b)) preds.get(b).push(a);
  }
  const injectOnce = (src, cacheBust) => {
    if (typeof UpdateCheck !== "undefined" && UpdateCheck.blocksLazyLoad()) {
      if (typeof Log !== "undefined") Log.warn("game", "lazy load refused, a newer build is active: " + src);
      return Promise.resolve({ ok: false, retry: false });
    }
    const sri = integrity(src);
    if (sri === false) {
      if (typeof Log !== "undefined") Log.warn("game", "lazy load refused, no integrity key in the stamped shell: " + src);
      return Promise.resolve({ ok: false, retry: false });
    }
    let href = url(src);
    if (cacheBust) href += (href.indexOf("?") >= 0 ? "&" : "?") + "retry=" + cacheBust;
    return browserAttempt(src, href, sri, opts, () => {
      let ready = true;
      try { if (opts && opts.ready) ready = !!opts.ready(src); }
      catch (_) { ready = false; }
      if (ready) evaluated.add(src);
      return ready;
    }).then((r) => { if (r.late) stranded.set(src, r.late); return r; });
  };
  const awaitStranded = async (src) => {
    const late = stranded.get(src), W = typeof window !== "undefined" ? window : null;
    if (!late || !W || typeof W.setTimeout !== "function") return;
    let t;
    await Promise.race([late, new Promise((r) => { t = W.setTimeout(r, (opts && opts.deadlineMs) || DEADLINE_MS); })]);
    W.clearTimeout(t);
    stranded.delete(src);
  };
  const deferInjectRetry = (strict && (loaded || files.length > 1)) || (opts && opts.transientRetry === false);
  const injectFile = async (src) => {
    if (typeof UpdateCheck !== "undefined" && UpdateCheck.prepareLazyLoad && !(await UpdateCheck.prepareLazyLoad(generationScope))) return false;
    if (strict && !evaluated.has(src)) await awaitStranded(src);
    if (strict && evaluated.has(src)) return true;
    const optBust = opts && opts.cacheBust;
    if (deferInjectRetry) {
      const r = await injectOnce(src, optBust || 0);
      return r.ok;
    }
    const W = typeof window !== "undefined" ? window : null;
    const maxAttempts = TRANSIENT_RETRY_MS.length + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0 && W && typeof W.setTimeout === "function") {
        await new Promise((r) => W.setTimeout(r, TRANSIENT_RETRY_MS[attempt - 1]));
      }
      const bust = attempt > 0 ? attempt : (optBust || 0);
      const r = await injectOnce(src, bust);
      if (r.ok) return true;
      if (!r.retry) return false;
    }
    return false;
  };
  const inject = (src) => {
    if (!strict) return injectFile(src);
    const pending = evaluating.get(src);
    if (pending) return pending.then((ok) => {
      if (!ok) return false;
      try { return !opts.ready || !!opts.ready(src); } catch (_) { return false; }
    });
    const task = injectFile(src).finally(() => {
      if (evaluating.get(src) === task) evaluating.delete(src);
    });
    evaluating.set(src, task);
    return task;
  };
  const blocked = typeof UpdateCheck !== "undefined" && UpdateCheck.blocksLazyLoad && UpdateCheck.blocksLazyLoad();
  if (!blocked) preload([...pending].filter((f) => preds.get(f).some((p) => !done.has(p))));
  return runLoadGraph(files, preds, pending, done, inflight, strict, loaded, opts, inject);
}

return { load: loadBackendScripts };
}
  return { create, url, preload, warm };
})();
Object.freeze(ScriptLoader);
