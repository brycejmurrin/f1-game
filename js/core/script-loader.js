/* Apex 26 — ScriptLoader: extracted runtime orchestration.
   Contract: docs/ARCHITECTURE.md. */
const ScriptLoader = (function () {
"use strict";
function create() {
const BACKEND_EDGES = ApexRoster.DEFERRED_EDGES;
function loadBackendScripts(files, edges, opts) {
  const strict = !!(opts && opts.strict);
  const loaded = opts && opts.loaded;
  const pending = new Set(files.filter((f) => !loaded || !loaded.has(f)));
  const done = new Set(loaded || []), inflight = new Set();
  const preds = new Map(files.map((f) => [f, []]));
  for (const [a, b] of (edges || BACKEND_EDGES)) {
    if (preds.has(a) && preds.has(b)) preds.get(b).push(a);
  }
  const inject = (src) => new Promise((resolve) => {
    const el = document.createElement("script");
    el.src = src + "?v=" + (window.__APEX_BUILD || 0);
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
  return { create };
})();
Object.freeze(ScriptLoader);
