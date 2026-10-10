/* Apex 26 — ScriptLoader: extracted runtime orchestration.
   Contract: docs/ARCHITECTURE.md. */
const ScriptLoader = (function () {
"use strict";
// THE URL OF A LAZY FILE (R3-PHONE-8). The deploy (tools/ci/bump-cache.mjs)
// writes a `path -> content hash` map into the staged shell as
// <script type="application/json" id="apex-lazy-v">, so a lazy file keeps its
// URL — and its HTTP-cache and SW entries — across every deploy that did not
// change it. `?v=<build>` changed every one of ~200 URLs per deploy. No map (the
// committed shell, a dev server) or no entry → the build, as before; sw.js's
// install stamp makes the same choice from the same block.
let _lazyV;
function lazyVersions() {
  if (_lazyV !== undefined) return _lazyV;
  _lazyV = null;
  try {
    const el = typeof document !== "undefined" && document.getElementById && document.getElementById("apex-lazy-v");
    const m = el ? JSON.parse(el.textContent) : null;
    if (m && typeof m === "object") _lazyV = m;
  } catch (_) { /* a malformed map: build-keyed URLs */ }
  return _lazyV;
}
function url(src) {
  const m = lazyVersions();
  const h = m && Object.prototype.hasOwnProperty.call(m, src) ? m[src] : null;
  return src + "?v=" + (typeof h === "string" && /^[0-9a-f]{12}$/.test(h) ? h : ((typeof window !== "undefined" && window.__APEX_BUILD) || 0));
}
function create() {
const BACKEND_EDGES = ApexRoster.DEFERRED_EDGES;
function loadBackendScripts(files, edges, opts) {
  const strict = !!(opts && opts.strict);
  const generationScope = {};   // legacy-worker timeout fallback belongs only to this load
  const loaded = opts && opts.loaded;
  const pending = new Set(files.filter((f) => !loaded || !loaded.has(f)));
  const done = new Set(loaded || []), inflight = new Set();
  const preds = new Map(files.map((f) => [f, []]));
  for (const [a, b] of (edges || BACKEND_EDGES)) {
    if (preds.has(a) && preds.has(b)) preds.get(b).push(a);
  }
  const inject = async (src) => {
    if (typeof UpdateCheck !== "undefined" && UpdateCheck.prepareLazyLoad && !(await UpdateCheck.prepareLazyLoad(generationScope))) return false;
    return new Promise((resolve) => {
    // NEVER MIX BUILDS. A lazy file is asked for as `?v=<booted build>`; once a
    // newer deploy's worker controls this tab it has swept that generation, the
    // request misses, and Pages (which ignores the query) answers with the NEW
    // file for the OLD code. Refuse it — a missing global is every caller's
    // fallback — and let UpdateCheck put up UPDATE READY instead.
    if (typeof UpdateCheck !== "undefined" && UpdateCheck.blocksLazyLoad()) {
      if (typeof Log !== "undefined") Log.warn("game", "lazy load refused, a newer build is active: " + src);
      resolve(false);
      return;
    }
    const el = document.createElement("script");
    el.src = url(src);
    el.crossOrigin = "anonymous";
    // MARKED so index.html's broken-install repair (sweeps every SW cache and
    // reloads) leaves it alone: that repair is right for a shell tag the CDN
    // has not published yet, but a load error here already RESOLVES (a missing
    // global IS the fallback), so a reload would throw away a working
    // degradation path — and loop, since the one-shot guard already cleared.
    if (el.dataset) el.dataset.apexLazy = "1";   // guarded: a stubbed element has none
    el.onload = () => {
      let ready = true;
      try { if (opts && opts.ready) ready = !!opts.ready(src); }
      catch (e) { ready = false; }
      resolve(ready);
    };
    el.onerror = () => { if (el.remove) el.remove(); resolve(false); };
    document.head.appendChild(el);
  });
  };
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
        inject(src).then((ok) => {
          inflight.delete(src);
          if (ok) { done.add(src); if (loaded) loaded.add(src); }
          else { failed = true; if (!strict) done.add(src); }
          pump();
        });
      }
    };
    pump();
  });
}

return { load: loadBackendScripts };
}
  return { create, url };
})();
Object.freeze(ScriptLoader);
