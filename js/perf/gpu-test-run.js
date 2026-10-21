/* Apex 26 — GpuTestRun: the one-tap GPU TEST on a real phone (SETTINGS > METRICS > PHONE TEST > GPU TEST).

   The only real-GPU instrument the project has for a handset (docs/notes/PHONE-GPU-TEST-2026-10-21.md;
   the CI Mac is a paravirtual GPU whose frame time does not answer to pixels). One tap starts SoakRun's
   hands-free race (dry Monza, the HELMET camera so the rear mirror is up), PhoneRecorder records it, and
   this module walks fixed PHASES while the car drives, then stops the run and leaves SHARE ready:

     default  the player's own settings (the reference)
     s50/s75/s100  RESOLUTION pinned at 0.5 / 0.75 / 1.0 (governor off): frame time against pixel count
                   gives the FILL SLOPE on this GPU, no timer needed
     mirrorOff     HUD > MIRROR OFF at the player's scale: what the mirror pass costs here
     again         the default once more: drift (heat, throttling) between the first and last phase

   Each phase settles SETTLE_MS, then measures MEASURE_MS: rAF interval p50/p95/p99, the GPU timer when the
   device has one (EXT_disjoint_timer_query_webgl2 / WebGPU timestamp-query, via the bound backend's
   gpuTimer — most phones report it unsupported, which is itself the answer), and the program links and
   render pipelines the page created (a non-zero count mid-race is a first-draw hitch). Every setting it
   touches (render scale, auto-res, mirror mode) is restored when the run ends, however it ends. */
const GpuTestRun = (function () {
  "use strict";

  const SETTLE_MS = 5000, MEASURE_MS = 20000;
  const PHASES = [
    { id: "default" }, { id: "s50", scale: 0.5 }, { id: "s75", scale: 0.75 }, { id: "s100", scale: 1.0 },
    { id: "mirrorOff", mirror: "off" }, { id: "again" },
  ];
  const TOTAL_MIN = Math.ceil(PHASES.length * (SETTLE_MS + MEASURE_MS) / 60000 * 10) / 10 + 0.2;

  const r2 = (n) => (n != null && Number.isFinite(+n) ? Math.round(+n * 100) / 100 : null);
  function pct(sorted, q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] : null; }
  // One phase's numbers from its raw samples. Pure: tests/unit/gpu-test-run.test.mjs.
  function phaseStats(deltas, gpuMs, counts) {
    const d = deltas.slice().sort((a, b) => a - b), gp = gpuMs.filter((x) => x >= 0).sort((a, b) => a - b);
    const sum = d.reduce((a, b) => a + b, 0);
    return { frames: d.length, p50: r2(pct(d, 0.5)), p95: r2(pct(d, 0.95)), p99: r2(pct(d, 0.99)), max: r2(d.length ? d[d.length - 1] : null),
      fps: d.length ? r2(1000 * d.length / sum) : null, over50: d.length ? r2(100 * d.filter((x) => x > 50).length / d.length) : null,
      gpu: gp.length ? { n: gp.length, p50: r2(pct(gp, 0.5)), p95: r2(pct(gp, 0.95)) } : null,
      links: counts.links, pipes: counts.pipes };
  }
  // Least-squares fit of frame p50 (ms) against the scaled pixel fraction (scale²) over the sweep phases:
  // slope = ms a full-resolution frame spends on pixels, intercept = everything else. Pure.
  function fillSlope(rows) {
    const pts = rows.filter((r) => r && r.scale > 0 && r.p50 > 0).map((r) => [r.scale * r.scale, r.p50]);
    if (pts.length < 2) return null;
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    const sxx = pts.reduce((a, p) => a + (p[0] - mx) * (p[0] - mx), 0);
    if (!(sxx > 0)) return null;
    const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
    return { msPerFullFrame: r2(slope), interceptMs: r2(my - slope * mx), points: n };
  }

  let _run = null, _last = { state: "idle" };
  const backend = () => (typeof GLX !== "undefined" ? (GLX.__tlx || GLX) : null);
  function log(msg) { try { Log.info("game", "GpuTestRun " + msg); } catch (_) { /* Log not loaded */ } }

  // Counts program links and render pipelines while the run is up (prototype wraps, removed at the end).
  function hookCounts(c) {
    const undo = [];
    const wrap = (proto, name, key) => {
      if (!proto || typeof proto[name] !== "function") return;
      const o = proto[name];
      proto[name] = function () { c[key]++; return o.apply(this, arguments); };
      undo.push(() => { proto[name] = o; });
    };
    try { wrap(typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext.prototype : null, "linkProgram", "links"); } catch (_) { /* no WebGL2 */ }
    try { wrap(typeof GPUDevice !== "undefined" ? GPUDevice.prototype : null, "createRenderPipeline", "pipes"); } catch (_) { /* no WebGPU */ }
    return () => undo.forEach((f) => { try { f(); } catch (_) { /* already gone */ } });
  }

  function apply(ph, saved) {
    const B = backend();
    if (ph.scale) {
      try { PerfGov.setAutoRes(false); } catch (_) { /* governor absent */ }
      try { if (B && B.setRenderScale) B.setRenderScale(ph.scale); } catch (_) { /* backend refused */ }
    } else {
      try { if (B && B.setRenderScale) B.setRenderScale(saved.scale); } catch (_) { /* backend refused */ }
      try { PerfGov.setAutoRes(saved.autoRes); } catch (_) { /* governor absent */ }
    }
    const mp = typeof MirrorPass !== "undefined" && MirrorPass.instance ? MirrorPass.instance() : null;
    try { if (mp) mp.setMode(ph.mirror || saved.mirror); } catch (_) { /* mirror absent */ }
  }

  function tick(ts) {
    const r = _run;
    if (!r) return;
    r.raf = requestAnimationFrame(tick);
    const st = typeof SoakRun !== "undefined" ? SoakRun.status() : null;
    if (!st || st.state === "done" || st.state === "idle") { finish(st && st.reason ? "soak-" + st.reason : "soak-ended"); return; }
    if (st.state !== "racing") return;
    const now = performance.now();
    if (r.i < 0) { r.i = 0; r.phaseAt = now; apply(PHASES[0], r.saved); r.prev = 0; }
    const ph = PHASES[r.i], age = now - r.phaseAt;
    if (r.prev && age >= SETTLE_MS) {
      r.deltas.push(ts - r.prev);
      const B = backend();
      try { const ms = B && B.gpuMs ? B.gpuMs() : -1; if (ms >= 0) r.gpu.push(ms); } catch (_) { /* no timer */ }
      if (!r.measuring) { r.measuring = true; r.c0 = { links: r.counts.links, pipes: r.counts.pipes }; }
    }
    r.prev = ts;
    if (age >= SETTLE_MS + MEASURE_MS) {
      const B = backend();
      const row = Object.assign({ id: ph.id, scale: r2(B && B.getRenderScale ? B.getRenderScale() : null),
        mirror: ph.mirror || r.saved.mirror, tier: (() => { try { return PerfGov.tier(); } catch (_) { return null; } })() },
      phaseStats(r.deltas, r.gpu, { links: r.counts.links - (r.c0 ? r.c0.links : 0), pipes: r.counts.pipes - (r.c0 ? r.c0.pipes : 0) }));
      r.rows.push(row);
      r.deltas = []; r.gpu = []; r.measuring = false; r.c0 = null;
      r.i++;
      if (r.i >= PHASES.length) { finish("complete"); return; }
      r.phaseAt = now; r.prev = 0;
      apply(PHASES[r.i], r.saved);
    }
  }

  function finish(reason) {
    const r = _run;
    if (!r) return false;
    _run = null;
    if (r.raf) cancelAnimationFrame(r.raf);
    apply({}, r.saved);
    r.unhook();
    const B = backend();
    try { if (B && B.gpuTimer) B.gpuTimer(r.saved.gpuOn); } catch (_) { /* no timer */ }
    const sweep = r.rows.filter((x) => /^s\d+$/.test(x.id));
    const result = { schema: "apex26.gpu-test/1", reason, settleMs: SETTLE_MS, measureMs: MEASURE_MS, gpuTimer: r.timer,
      phases: r.rows, fill: fillSlope(sweep),
      mirrorMs: (() => { const a = r.rows.find((x) => x.id === "default"), b = r.rows.find((x) => x.id === "mirrorOff");
        return a && b && a.p50 != null && b.p50 != null ? r2(a.p50 - b.p50) : null; })(),
      driftMs: (() => { const a = r.rows.find((x) => x.id === "default"), b = r.rows.find((x) => x.id === "again");
        return a && b && a.p50 != null && b.p50 != null ? r2(b.p50 - a.p50) : null; })() };
    try { if (typeof PhoneRecorder !== "undefined" && PhoneRecorder.attach) PhoneRecorder.attach("gpuTest", result); } catch (_) { /* recorder gone */ }
    try { if (typeof SoakRun !== "undefined" && SoakRun.active()) SoakRun.stop("gpu-test-" + reason); } catch (_) { /* soak gone */ }
    _last = { state: "done", reason, phases: r.rows.length };
    log("end " + reason + " phases " + r.rows.length);
    if (r.onDone) try { r.onDone(result); } catch (_) { /* UI gone */ }
    return true;
  }

  function start(opts) {
    opts = opts || {};
    if (_run || typeof SoakRun === "undefined" || SoakRun.active()) return Promise.resolve(false);
    const B = backend();
    const mp = typeof MirrorPass !== "undefined" && MirrorPass.instance ? MirrorPass.instance() : null;
    const saved = { scale: B && B.getRenderScale ? B.getRenderScale() : 1, autoRes: (() => { try { return PerfGov.autoRes(); } catch (_) { return true; } })(),
      mirror: (() => { try { return mp ? mp.state().mode : "auto"; } catch (_) { return "auto"; } })(), gpuOn: false };
    let timer = null;
    try { timer = B && B.gpuTimer ? B.gpuTimer(true) : null; } catch (_) { timer = null; }
    const counts = { links: 0, pipes: 0 };
    _run = { raf: 0, i: -1, phaseAt: 0, prev: 0, deltas: [], gpu: [], rows: [], measuring: false, c0: null, saved, counts,
      timer: timer ? { supported: !!timer.supported } : { supported: false }, unhook: hookCounts(counts), onDone: opts.onDone || null };
    _last = { state: "starting" };
    log("start " + PHASES.length + " phases");
    return Promise.resolve(SoakRun.start({ minutes: TOTAL_MIN + 1, weather: "dry", cam: "helmet" })).then((ok) => {
      if (!ok) { finish("soak-refused"); return false; }
      if (_run) _run.raf = requestAnimationFrame(tick);
      return true;
    }, () => { finish("soak-failed"); return false; });
  }

  return {
    PHASES, SETTLE_MS, MEASURE_MS, TOTAL_MIN, phaseStats, fillSlope,
    start, stop: () => finish("stopped"), active: () => !!_run,
    status: () => Object.assign({}, _last, _run ? { state: _run.i < 0 ? "starting" : "phase " + (_run.i + 1) + "/" + PHASES.length + " " + PHASES[_run.i].id } : null),
  };
})();

Object.freeze(GpuTestRun);
