/* Apex 26 — PerfSpans: the per-subsystem frame budget. begin(name)/end(name)
   bracket a phase of the frame loop (game.js tickBody: frame, input, physics,
   ai, collide, debris, render, hud); __apex.perf() reads p50/p95/p99/max per
   span as JSON, plus the Long Animation Frames ring and the GPU timer.

   OFF by default and then costs one boolean test per call. ON, a span writes one
   Float64 into a fixed ring: no per-frame allocation (the first sight of a name
   allocates its ring, once). Spans may nest (physics contains ai); each name
   keeps ONE open start, so recursion of the same name is not supported.

   measure(true) additionally emits performance.measure() per span so the phases
   show as User Timing tracks in a Chrome / Perfetto trace; that path allocates,
   so it is a separate opt-in used by tools/perf/profile.mjs --mode trace. Each measure carries
   detail.devtools (a track-entry: trackGroup "Apex 26", one named track per phase), so the
   Chrome Performance panel's Timings lane shows physics / audio / render / hud on their own
   tracks (developer.chrome.com/docs/devtools/performance/extension); other consumers ignore it.
   The browser's apex:<span> timeline entries are cleared in batches of RING and on
   stop/reset: trace recordings and active observers keep their own copies.

   LoAF: PerformanceObserver "long-animation-frame" (Chrome 123+), feature-
   detected, the last LOAF_CAP entries with their top scripts. Software-GL
   (SwiftShader) timings make CPU JS cost meaningful and GPU/fill numbers not. */
const PerfSpans = (() => {
  "use strict";

  const RING = 512;       // samples kept per span (~8.5 s at 60 fps)
  const LOAF_CAP = 32;    // long-animation-frame entries kept
  const LOAF_SCRIPTS = 4; // scripts kept per entry (the longest)
  const TRACK_COLOR = { frame: "primary", input: "secondary", physics: "tertiary-dark", ai: "tertiary", collide: "warning", camera: "secondary-light", audio: "primary-light", render: "primary-dark", hud: "secondary-dark" };

  function create(clock) {
    const now = clock || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    const spans = Object.create(null);
    let on = false, measure = false;
    let loafObs = null, loafSupported = null;
    // Fixed LoAF ring: shifting the array on every overflow was O(LOAF_CAP).
    // Top-script picks reuse loafScriptScratch so a LoAF callback avoids
    // .map().sort().slice() allocating a full scripts array each time.
    const loafBuf = new Array(LOAF_CAP);
    let loafHead = 0, loafLen = 0;
    const loafScriptScratch = new Array(LOAF_SCRIPTS);

    function slot(name) {
      return spans[name] || (spans[name] = { buf: new Float64Array(RING), n: 0, head: 0, max: 0, sum: 0, count: 0, t0: -1, measures: 0 });
    }
    function clearMeasures(name, s) {
      if (!s.measures || typeof performance === "undefined" || typeof performance.clearMeasures !== "function") return;
      try { performance.clearMeasures("apex:" + name); s.measures = 0; } catch (_) { /* timeline unavailable */ }
    }
    function clearMeasured() {
      for (const name of Object.keys(spans)) clearMeasures(name, spans[name]);
    }
    function begin(name) {
      if (!on) return;
      slot(name).t0 = now();
    }
    function end(name) {
      if (!on) return;
      const s = spans[name];
      if (!s || s.t0 < 0) return;
      const t1 = now(), d = t1 - s.t0;
      if (measure && typeof performance !== "undefined" && performance.measure) {
        try {
          performance.measure("apex:" + name, { start: s.t0, end: t1, detail: { devtools: { dataType: "track-entry", track: name, trackGroup: "Apex 26", color: TRACK_COLOR[name] || "primary" } } });
          if (++s.measures >= RING) clearMeasures(name, s);
        } catch (_) { /* a stub clock is not a timeline */ }
      }
      s.t0 = -1;
      s.buf[s.head] = d; s.head = (s.head + 1) % RING;
      if (s.n < RING) s.n++;
      if (d > s.max) s.max = d;
      s.sum += d; s.count++;
    }

    function observeLoaf() {
      if (loafObs || loafSupported === false) return;
      try {
        const types = (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes) || [];
        loafSupported = types.indexOf("long-animation-frame") >= 0;
        if (!loafSupported) return;
        loafObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const raw = e.scripts || [];
            for (let i = 0; i < LOAF_SCRIPTS; i++) loafScriptScratch[i] = null;
            let kept = 0;
            for (let i = 0; i < raw.length; i++) {
              const x = raw[i];
              const d = Math.round(x.duration * 10) / 10;
              let slot = kept < LOAF_SCRIPTS ? kept : -1;
              if (slot < 0) {
                let worst = 0;
                for (let j = 1; j < LOAF_SCRIPTS; j++) {
                  if (loafScriptScratch[j].duration < loafScriptScratch[worst].duration) worst = j;
                }
                if (d <= loafScriptScratch[worst].duration) continue;
                slot = worst;
              }
              loafScriptScratch[slot] = {
                sourceURL: x.sourceURL || "",
                sourceFunctionName: x.sourceFunctionName || "",
                duration: d,
              };
              if (kept < LOAF_SCRIPTS) kept++;
            }
            // Copy out of scratch: the next LoAF reuses those slots.
            const scripts = new Array(kept);
            for (let i = 0; i < kept; i++) {
              const s = loafScriptScratch[i];
              scripts[i] = { sourceURL: s.sourceURL, sourceFunctionName: s.sourceFunctionName, duration: s.duration };
            }
            scripts.sort((a, b) => b.duration - a.duration);
            loafBuf[loafHead] = { start: Math.round(e.startTime), duration: Math.round(e.duration * 10) / 10, blockingDuration: Math.round((e.blockingDuration || 0) * 10) / 10, scripts };
            loafHead = (loafHead + 1) % LOAF_CAP;
            if (loafLen < LOAF_CAP) loafLen++;
          }
        });
        loafObs.observe({ type: "long-animation-frame", buffered: false });
      } catch (_) { loafSupported = false; loafObs = null; }
    }
    function loafEntries() {
      const out = [];
      const start = loafLen < LOAF_CAP ? 0 : loafHead;
      for (let i = 0; i < loafLen; i++) out.push(loafBuf[(start + i) % LOAF_CAP]);
      return out;
    }

    function pct(sorted, q) {
      if (!sorted.length) return 0;
      const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
      return sorted[i];
    }
    const r3 = (x) => Math.round(x * 1000) / 1000;

    function stats() {
      const out = {};
      for (const name of Object.keys(spans)) {
        const s = spans[name];
        const a = Array.from(s.n < RING ? s.buf.subarray(0, s.n) : s.buf).sort((x, y) => x - y);
        out[name] = { n: s.count, window: s.n, p50: r3(pct(a, 0.5)), p95: r3(pct(a, 0.95)), p99: r3(pct(a, 0.99)), max: r3(s.max), mean: r3(s.count ? s.sum / s.count : 0) };
      }
      return out;
    }
    function reset() {
      clearMeasured();
      for (const name of Object.keys(spans)) delete spans[name];
      loafHead = 0; loafLen = 0;
    }
    function setOn(v) {
      on = !!v;
      if (on) observeLoaf();
      else {
        clearMeasured();
        if (loafObs) { try { loafObs.disconnect(); } catch (_) { /* gone */ } loafObs = null; }
      }
      return on;
    }
    return {
      create,
      begin, end, reset, stats,
      isOn: () => on,
      on: setOn,
      measure: (v) => { if (v !== undefined) { measure = !!v; if (!measure) clearMeasured(); } return measure; },
      loaf: () => ({ supported: loafSupported, entries: loafEntries() }),
      report: () => ({ on, measure, unit: "ms", ring: RING, spans: stats(), loaf: { supported: loafSupported, entries: loafEntries() } }),
    };
  }
  return create();
})();
