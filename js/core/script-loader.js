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
// Full SHA-256 SRI pins the response bytes even when Pages ignores an old
// query key, or a deploy races the generation check. Never derive SRI from
// the twelve-hex URL key: it is not a complete digest.
let _lazyIntegrity;
function integrity(src) {
  if (_lazyIntegrity === undefined) {
    _lazyIntegrity = null;
    try {
      const el = document.getElementById && document.getElementById("apex-lazy-integrity");
      // Only the deployment metadata script defines a map. A preview or
      // inert DOM may expose an unrelated element with this id.
      if (el && el.tagName === "SCRIPT" && el.type === "application/json") {
        _lazyIntegrity = {};
        const map = JSON.parse(el.textContent);
        if (map && typeof map === "object" && !Array.isArray(map)) _lazyIntegrity = map;
      }
    } catch (_) { /* a present but malformed block fails closed */ }
  }
  if (_lazyIntegrity === null) return null; // dev and older deployed shells
  const value = Object.prototype.hasOwnProperty.call(_lazyIntegrity, src) ? _lazyIntegrity[src] : null;
  return typeof value === "string" && /^sha256-[A-Za-z0-9+/]{43}=$/.test(value) ? value : false;
}
function url(src) {
  const m = lazyVersions();
  const h = m && Object.prototype.hasOwnProperty.call(m, src) ? m[src] : null;
  return src + "?v=" + (typeof h === "string" && /^[0-9a-f]{12}$/.test(h) ? h : ((typeof window !== "undefined" && window.__APEX_BUILD) || 0));
}
// FETCH EVERY WAVE AT ONCE, EVALUATE IN ORDER (B·H8 load hunt, 2026-10-20). A file
// is injected only after its edges' predecessors have EVALUATED, so a bundle of
// depth N paid N network round trips back to back: cold GLX boot fetched its ten
// files in three waves, 4255 -> 4957 ms after navigation start, the bandwidth idle
// while each wave evaluated (4x CPU, Fast 4G). A <link rel=preload> under the
// exact URL, CORS mode and SRI inject() will use starts every gated file's fetch
// now; the <script> still runs only when its turn comes, so evaluation order,
// strict failure and the deadline are unchanged. A file inject() would refuse
// (integrity false) is not fetched. Returns how many links it added. opts.low: a
// speculative hint (renderer-boot's unsure guess, #3515) asks for fetchPriority low.
function preload(files, opts) {
  const low = !!(opts && opts.low);
  if (typeof document === "undefined" || !document.createElement || !document.head) return 0;
  let n = 0;
  for (const src of files || []) {
    const sri = integrity(src);
    if (sri === false) continue;
    const href = url(src);
    try { if (document.querySelector && document.querySelector('link[rel="preload"][href="' + href + '"]')) continue; }
    catch (_) { /* an odd href: add the link anyway */ }
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
// A hung lazy file (a stalled phone connection) never fires load OR error, so
// the caller's loading card waited forever (#2582). After SLOW_MS `opts.onSlow`
// fires (the UI may say "still loading"); after DEADLINE_MS of main-thread-responsive time the file counts as
// failed, exactly like onerror, so every caller's existing fallback and its
// memo-clear-on-failure retry path run. Overridable per load: opts.slowMs / deadlineMs.
const SLOW_MS = 10000, DEADLINE_MS = 25000;
// PAGE-LEVEL: classic scripts that have already evaluated in this tab (#3295).
// A fresh ScriptLoader (career UI retry clears its memo and calls create()
// again) has an empty opts.loaded; re-appending a const IIFE redeclares and the
// door stays on could-not-load until a full reload. Only STRICT loads skip the
// second insert — non-strict callers (scenery / circuit payloads) intentionally
// re-fetch when their registry entry was cleared ("next ask fetches again").
const evaluated = new Set();
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
    // Strict retry: already evaluated in this tab — no second <script>.
    if (strict && evaluated.has(src)) { resolve(true); return; }
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
    const sri = integrity(src);
    if (sri === false) { resolve(false); return; }
    const el = document.createElement("script");
    if (sri) el.integrity = sri;
    el.src = url(src);
    el.crossOrigin = "anonymous";
    // MARKED so index.html's broken-install repair (sweeps every SW cache and
    // reloads) leaves it alone: that repair is right for a shell tag the CDN
    // has not published yet, but a load error here already RESOLVES (a missing
    // global IS the fallback), so a reload would throw away a working
    // degradation path — and loop, since the one-shot guard already cleared.
    if (el.dataset) el.dataset.apexLazy = "1";   // guarded: a stubbed element has none
    const slowMs = (opts && opts.slowMs) || SLOW_MS, deadlineMs = (opts && opts.deadlineMs) || DEADLINE_MS;
    let slowT = null, deadT = null;
    const W = typeof window !== "undefined" ? window : null, timed = !!(W && typeof W.setTimeout === "function");   // window timers only: inert/fake-timer test contexts opt out
    const settle = (ok) => { if (timed) { W.clearTimeout(slowT); W.clearTimeout(deadT); } resolve(ok); };
    if (timed) {
    slowT = W.setTimeout(() => {
      try { if (opts && opts.onSlow) opts.onSlow(src); } catch (_) { /* UI hook only */ }
    }, slowMs);
    // THE DEADLINE COUNTS RESPONSIVE TIME, NOT WALL CLOCK (#3157). One 25 s
    // timer fires on a starved main thread (TLX right after a race on a slow
    // GPU, minutes of long tasks) in the same stall in which the fetched
    // script's load event is still queued, so a file that ARRIVED was counted
    // failed. A heartbeat adds at most two ticks per beat: a stall that
    // swallowed many beats buys the file its load task, a real hang still
    // reaches deadlineMs of live beats.
    const tickMs = Math.max(10, Math.min(1000, Math.floor(deadlineMs / 10)));
    let budget = 0, last = Date.now();
    const beat = () => {
      const t = Date.now();
      budget += Math.max(0, Math.min(t - last, 2 * tickMs));
      last = t;
      if (budget < deadlineMs) { deadT = W.setTimeout(beat, tickMs); return; }
      if (typeof Log !== "undefined") Log.warn("game", "lazy load timed out after " + deadlineMs + " ms: " + src);
      el.onload = el.onerror = null;
      if (el.remove) el.remove();
      settle(false);
    };
    deadT = W.setTimeout(beat, tickMs);
    }
    el.onload = () => {
      let ready = true;
      try { if (opts && opts.ready) ready = !!opts.ready(src); }
      catch (e) { ready = false; }
      if (ready) evaluated.add(src);
      settle(ready);
    };
    el.onerror = () => { if (el.remove) el.remove(); settle(false); };
    document.head.appendChild(el);
  });
  };
  // Only files that WAIT for a predecessor: the first wave is injected below at once.
  const blocked = typeof UpdateCheck !== "undefined" && UpdateCheck.blocksLazyLoad && UpdateCheck.blocksLazyLoad();
  if (!blocked) preload([...pending].filter((f) => preds.get(f).some((p) => !done.has(p))));
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
        // A throw in UpdateCheck.prepareLazyLoad (or the Promise executor) rejects
        // inject(); unhandled, inflight never drained and pump() never finished,
        // so the caller awaited forever. Count it as a failed file instead.
        inject(src).catch((e) => {
          if (typeof Log !== "undefined") Log.warn("game", "lazy load threw: " + src + " — " + (e && e.message));
          return false;
        }).then((ok) => {
          inflight.delete(src);
          if (ok) {
            done.add(src);
            if (loaded) loaded.add(src);
            try { if (opts && opts.onSettled) opts.onSettled(src); } catch (_) { /* boot progress hook */ }
          }
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
  return { create, url, preload };
})();
Object.freeze(ScriptLoader);
