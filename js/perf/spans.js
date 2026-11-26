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

   FRAME-PHASE LEDGER (#6941): setOn(true) preallocates the PHASES below, so the first frame of a
   recording allocates nothing. Start times live in one shared Float64Array (not on span objects).
   The names in ACCUM (update, car.brake/long/lat/bike/adv) fire many times a frame (update up to 5,
   car.* 22 cars x 5 stages a step): each call SUMS into a Float64Array slot and end("frame")
   flushes the sum into the ring as ONE sample, so their p50/p95/p99 are per-frame totals, not
   per-call. begin("frame") drops an unflushed sum (a stepped __apex.step run outside tickBody).
   Nesting: update inside physics; car.* inside ai; present inside render. Recording ON costs
   about 220 performance.now() calls per physics step at 22 cars, so it perturbs what it measures;
   read the shape, not the absolute milliseconds. A phase that never ran is absent from stats().
   Accumulated names skip the per-call performance.measure() track (it would flood the timeline).

   LoAF: PerformanceObserver "long-animation-frame" (Chrome 123+), feature-
   detected, the last LOAF_CAP entries with their top scripts. Software-GL
   (SwiftShader) timings make CPU JS cost meaningful and GPU/fill numbers not. */
const PerfSpans = (() => {
  "use strict";

  const RING = 512;       // samples kept per span (~8.5 s at 60 fps)
  const LOAF_CAP = 32;    // long-animation-frame entries kept
  const LOAF_SCRIPTS = 4; // scripts kept per entry (the longest)
  const TRACK_COLOR = { frame: "primary", input: "secondary", physics: "tertiary-dark", update: "tertiary-light", ai: "tertiary", "car.brake": "warning", "car.long": "warning", "car.lat": "warning", "car.bike": "warning", "car.adv": "warning", collide: "warning", camera: "secondary-light", audio: "primary-light", render: "primary-dark", present: "primary-dark", hud: "secondary-dark" };
  const PHASES = ["frame", "input", "physics", "update", "ai", "car.brake", "car.long", "car.lat", "car.bike", "car.adv", "collide", "audio", "camera", "render", "present", "hud"];
  const ACCUM = { update: 1, "car.brake": 1, "car.long": 1, "car.lat": 1, "car.bike": 1, "car.adv": 1 };
  const START_CAP = 32;   // slots before the shared arrays grow (once, off the hot path)

  function create(clock) {
    const now = clock || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    const spans = Object.create(null);
    let on = false, measure = false;
    let loafObs = null, loafSupported = null;
    // Fixed LoAF ring: shifting the array on every overflow was O(LOAF_CAP).
    // Top-script picks reuse loafScriptScratch so a LoAF callback avoids
    // .map().sort().slice() allocating a full scripts array each time.
    let nSlots = 0;
    let starts = new Float64Array(START_CAP).fill(-1);   // open start per slot, -1 = none
    let accum = new Float64Array(START_CAP);             // accumulator sums, flushed at end("frame")
    let touched = new Uint8Array(START_CAP);
    const accList = [];
    const loafBuf = new Array(LOAF_CAP);
    let loafHead = 0, loafLen = 0;
    const loafScriptScratch = new Array(LOAF_SCRIPTS);

    function slot(name) {
      let s = spans[name];
      if (s) return s;
      if (nSlots >= starts.length) {
        const cap = starts.length * 2;
        const st = new Float64Array(cap).fill(-1); st.set(starts); starts = st;
        const ac = new Float64Array(cap); ac.set(accum); accum = ac;
        const tc = new Uint8Array(cap); tc.set(touched); touched = tc;
      }
      s = spans[name] = { buf: new Float64Array(RING), n: 0, head: 0, max: 0, sum: 0, count: 0, i: nSlots++, acc: ACCUM[name] === 1, measures: 0 };
      if (s.acc) accList.push(s);
      return s;
    }
    function record(s, d) {
      s.buf[s.head] = d; s.head = (s.head + 1) % RING;
      if (s.n < RING) s.n++;
      if (d > s.max) s.max = d;
      s.sum += d; s.count++;
    }
    function flushAccum() {
      for (let k = 0; k < accList.length; k++) {
        const s = accList[k];
        if (touched[s.i]) { record(s, accum[s.i]); accum[s.i] = 0; touched[s.i] = 0; }
      }
    }
    function dropAccum() {
      for (let k = 0; k < accList.length; k++) { const i = accList[k].i; accum[i] = 0; touched[i] = 0; }
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
      const s = spans[name] || slot(name);
      if (name === "frame") dropAccum();
      starts[s.i] = now();
    }
    function end(name) {
      if (!on) return;
      const s = spans[name];
      if (!s) return;
      const t0 = starts[s.i];
      if (t0 < 0) return;
      const t1 = now(), d = t1 - t0;
      starts[s.i] = -1;
      if (s.acc) { accum[s.i] += d; touched[s.i] = 1; return; }
      if (measure && typeof performance !== "undefined" && performance.measure) {
        try {
          performance.measure("apex:" + name, { start: t0, end: t1, detail: { devtools: { dataType: "track-entry", track: name, trackGroup: "Apex 26", color: TRACK_COLOR[name] || "primary" } } });
          if (++s.measures >= RING) clearMeasures(name, s);
        } catch (_) { /* a stub clock is not a timeline */ }
      }
      record(s, d);
      if (name === "frame") flushAccum();
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
        if (!s.count) continue;   // preallocated, never ran
        const a = Array.from(s.n < RING ? s.buf.subarray(0, s.n) : s.buf).sort((x, y) => x - y);
        out[name] = { n: s.count, window: s.n, p50: r3(pct(a, 0.5)), p95: r3(pct(a, 0.95)), p99: r3(pct(a, 0.99)), max: r3(s.max), mean: r3(s.count ? s.sum / s.count : 0) };
      }
      return out;
    }
    function reset() {
      clearMeasured();
      for (const name of Object.keys(spans)) delete spans[name];
      nSlots = 0; accList.length = 0; starts.fill(-1); accum.fill(0); touched.fill(0);
      loafHead = 0; loafLen = 0;
    }
    function setOn(v) {
      on = !!v;
      if (on) { for (let i = 0; i < PHASES.length; i++) slot(PHASES[i]); observeLoaf(); }
      else {
        clearMeasured();
        if (loafObs) { try { loafObs.disconnect(); } catch (_) { /* gone */ } loafObs = null; }
      }
      return on;
    }
    return {
      create,
      begin, end, reset, stats, phases: PHASES.slice(),
      isOn: () => on,
      on: setOn,
      measure: (v) => { if (v !== undefined) { measure = !!v; if (!measure) clearMeasured(); } return measure; },
      loaf: () => ({ supported: loafSupported, entries: loafEntries() }),
      report: () => ({ on, measure, unit: "ms", ring: RING, spans: stats(), loaf: { supported: loafSupported, entries: loafEntries() } }),
    };
  }
  return create();
})();
