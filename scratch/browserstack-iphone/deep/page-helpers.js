// injected into the page; defines window.__bs
window.__bs = window.__bs || (function () {
  const errs = []; addEventListener('error', e => errs.push(String(e.message).slice(0,200))); addEventListener('unhandledrejection', e => errs.push('rej:' + String(e.reason).slice(0,200)));
  const oe = console.error; console.error = function () { try { errs.push('console:' + [...arguments].map(String).join(' ').slice(0,200)); } catch (_) {} return oe.apply(console, arguments); };
  function stats(f) {
    if (!f.length) return null;
    const s = [...f].sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    return { frames: f.length, avgFps: +(1000 / avg).toFixed(1), p5Fps: +(1000 / q(0.95)).toFixed(1), p1Fps: +(1000 / q(0.99)).toFixed(1),
      worstMs: +s[s.length - 1].toFixed(0), gt33: f.filter(x => x > 33.4).length, gt50: f.filter(x => x > 50).length, gt100: f.filter(x => x > 100).length };
  }
  // sample frame deltas for ms; bucketMs splits into drift buckets
  function sample(ms, bucketMs, cb) {
    const f = []; let last = performance.now(); const t0 = last, end = t0 + ms;
    function tick(t) { f.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else {
      const out = stats(f); if (bucketMs) { out.buckets = []; let acc = 0, b = []; for (const d of f) { b.push(d); acc += d; if (acc >= bucketMs) { out.buckets.push(+(1000 * b.length / acc).toFixed(1)); b = []; acc = 0; } } }
      cb(out); } }
    requestAnimationFrame(tick);
  }
  // closed-loop autopilot (port of js/perf/soak-run.js control law, dry numbers from autopilot spec)
  const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
  let ap = null;
  function apStart() {
    if (ap) return; const st = { hold: 0, lastS: null, stalled: 0, maxKph: 0, s0: null, offRoad: 0, n: 0 };
    const A_LAT = 9, A_BRAKE = 16, VMAX = 94, KP = 2.4; let lastT = performance.now();
    function loop(t) {
      if (!ap) return; const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
      try {
        const p = __apex.probe(); if (p) {
          if (st.s0 == null) st.s0 = p.s;
          const sc = __apex.scan(DISTS); const steerLook = Math.max(9, p.speed * 0.4); let kSteer = p.k;
          let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(A_LAT / Math.abs(p.k)) : VMAX;
          sc.forEach((r, j) => { const d = DISTS[j]; if (d <= steerLook) kSteer = r.k; const vc = Math.abs(r.k) > 1e-4 ? Math.sqrt(A_LAT / Math.abs(r.k)) : VMAX; const va = Math.sqrt(vc * vc + 2 * A_BRAKE * d); if (va < vT) vT = va; });
          vT = Math.max(11, Math.min(VMAX, vT)); st.hold = Math.min(vT, st.hold + 30 * dt); vT = st.hold;
          const L = Math.max(8, Math.min(38, p.speed * 0.6)), lat = kSteer * L * L * 0.5;
          let steer = Math.max(-1, Math.min(1, KP * (Math.atan2(lat - p.x, L) - p.angle)));
          const off = Math.abs(p.x) - p.hw > 0.4; if (off) st.offRoad++;
          if (st.lastS != null && Math.abs(p.s - st.lastS) < 0.05) st.stalled++; else st.stalled = 0; st.lastS = p.s;
          let throttle = p.speed < vT, brake = p.speed > vT * 1.04;
          if (st.stalled > 10) { steer = Math.max(-0.4, Math.min(0.4, steer)); throttle = true; brake = false; } else if (off) throttle = false;
          if (st.stalled > 180) { st.stalled = 0; try { __apex.rescuePlayer && __apex.rescuePlayer(); } catch (_) {} }
          st.maxKph = Math.max(st.maxKph, p.speed * 3.6); st.n++; st.lastP = p;
          __apex.setInput({ steer, throttle, brake });
        }
      } catch (e) { st.err = String(e).slice(0, 200); }
      requestAnimationFrame(loop);
    }
    ap = st; requestAnimationFrame(loop);
  }
  function apStop() { const s = ap; ap = null; try { __apex.clearInput(); } catch (_) {} return s && { maxKph: +s.maxKph.toFixed(0), offRoadFrames: s.offRoad, ticks: s.n, err: s.err || null, lastSpeedKph: s.lastP ? +(s.lastP.speed * 3.6).toFixed(0) : null }; }
  function gfxInfo() {
    const r = {};
    try { r.liveBackend = (typeof RendererPicker !== 'undefined' && RendererPicker.liveBackend) ? RendererPicker.liveBackend() : null; } catch (e) { r.liveBackend = 'err'; }
    try { r.bound = sessionStorage.getItem('apex26.gfxBound'); r.fallbackWhy = sessionStorage.getItem('apex26.gfxFallbackWhy'); } catch (_) {}
    try { r.pin = localStorage.getItem('apex26.gfxBackend'); r.presetKey = localStorage.getItem('apex26.gfxPreset'); r.gfxHigh = localStorage.getItem('apex26.gfxHigh'); } catch (_) {}
    try { r.preset = (typeof GfxQuality !== 'undefined' && GfxQuality.current) ? GfxQuality.current() : null; } catch (_) {}
    try { const rs = __apex.renderScale(); r.renderScale = rs.scale; r.tier = rs.tier; r.autoTier = rs.autoTier; r.userTier = rs.userTier; r.autoRes = rs.auto; } catch (e) { r.rsErr = String(e); }
    try { r.upscale = __apex.spatialUpscale(); } catch (_) {}
    try { r.gpuTimer = __apex.gpuTimer(); } catch (_) {}
    try { r.navGpu = !!navigator.gpu; r.dpr = devicePixelRatio; r.vp = [innerWidth, innerHeight]; } catch (_) {}
    return JSON.parse(JSON.stringify(r));
  }
  return { errs, sample, stats, apStart, apStop, gfxInfo };
})();
true;
