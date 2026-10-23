// injected after page-helpers.js; defines window.__dp (deep probe). Read-only instrumentation.
window.__dp = window.__dp || (function () {
  const gaps = []; let gapOn = false, last = 0;
  const lt = []; let ltSup = false;
  try { const t = PerformanceObserver.supportedEntryTypes || []; ltSup = t.includes('longtask');
    if (ltSup) new PerformanceObserver(l => { for (const e of l.getEntries()) if (lt.length < 400) lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration), n: e.name, a: (e.attribution || []).map(a => a.containerSrc || a.name).join('|') }); }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
  try { performance.setResourceTimingBufferSize && performance.setResourceTimingBufferSize(5000); } catch (_) {}
  function loop(t) { if (gapOn) { if (last && t - last > 50 && gaps.length < 2000) gaps.push({ t: Math.round(last), d: Math.round(t - last) }); last = t; } requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  const G_ = () => (typeof gfx !== 'undefined' && gfx) || (window.G && G.gfx) || null;
  function render() { const g = G_(), o = {};
    try { let bs = g && g.backendState && g.backendState(); if (!bs) { try { bs = __apex.diag({ download: false }).gfx.backendState; } catch (_) {} } if (bs) { o.api = bs.api || bs.backend || null; o.calls = bs.calls; o.drawMatMode = bs.drawMatMode; o.gpuErrors = bs.gpuErrors; o.warmStages = bs.warmStages || bs.warm || null; o.bsKeys = Object.keys(bs).slice(0, 80).join(','); } } catch (e) { o.bsErr = String(e).slice(0, 80); }
    try { const x = g && g.xrInfo && g.xrInfo(); if (x) { o.calls3 = x.calls; o.tris = x.triangles; } } catch (_) {}
    try { const L = (typeof GLX !== 'undefined' && GLX) || window.GLX; const m = L && L.__tlx && L.__tlx.memState && L.__tlx.memState(); if (m) { o.mem = JSON.parse(JSON.stringify(m)); for (const k of ['matMissKeys', 'gpuRecentErrors']) delete o.mem[k]; } else o.mem = 'n/a:' + (typeof L); } catch (e) { o.mem = 'err:' + String(e).slice(0, 80); }
    try { o.occl = __apex.occlusionCull(); } catch (_) {} try { o.md = __apex.multiDraw(); } catch (_) {}
    try { const r = __apex.renderScale(); o.scale = r.scale; o.tier = r.tier; o.autoTier = r.autoTier; o.floorMs = r.floorMs; o.autoShed = r.autoShed; } catch (_) {}
    try { o.gpu = __apex.gpuTimer(); } catch (_) {}
    try { if (performance.memory) o.heapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1); } catch (_) {}
    try { const a = __apex.assets(); o.assets = a && JSON.stringify(a).slice(0, 300); } catch (_) {}
    return o; }
  function perf(reset) { let r = null; try { r = __apex.perf(reset ? { on: true, reset: true } : undefined); } catch (e) { return { err: String(e) }; }
    const s = r && r.spans; const out = {}; if (s) for (const k of Object.keys(s)) { const v = s[k]; out[k] = { p50: v.p50 != null ? +(+v.p50).toFixed(2) : v.p50, p95: v.p95 != null ? +(+v.p95).toFixed(2) : v.p95, p99: v.p99 != null ? +(+v.p99).toFixed(2) : v.p99, max: v.max != null ? +(+v.max).toFixed(1) : v.max, mean: v.mean != null ? +(+v.mean).toFixed(2) : v.mean, n: v.n || v.count }; }
    return { spans: out, raw: s ? null : JSON.stringify(r).slice(0, 400), gpu: r && r.gpu }; }
  function res(sinceMs) { const e = performance.getEntriesByType('resource').filter(x => x.startTime >= (sinceMs || 0)); const by = {};
    for (const x of e) { const k = (x.name.split('?')[0].match(/\.(\w+)$/) || [, 'other'])[1]; const b = by[k] || (by[k] = { n: 0, kb: 0, ms: 0 }); b.n++; b.kb += (x.transferSize || x.encodedBodySize || 0) / 1024; b.ms = Math.max(b.ms, x.responseEnd - x.startTime); }
    for (const k in by) { by[k].kb = Math.round(by[k].kb); by[k].ms = Math.round(by[k].ms); }
    const top = e.sort((a, b) => (b.responseEnd - b.startTime) - (a.responseEnd - a.startTime)).slice(0, 12).map(x => ({ u: x.name.replace(/^.*f1-game\//, '').slice(0, 80), ms: Math.round(x.responseEnd - x.startTime), st: Math.round(x.startTime), kb: Math.round((x.transferSize || x.encodedBodySize || 0) / 1024) }));
    return { n: e.length, by, top }; }
  function marks(since) { return performance.getEntriesByType('mark').concat(performance.getEntriesByType('measure')).filter(m => m.startTime >= (since || 0) && !/^apex:/.test(m.name)).slice(0, 200).map(m => ({ n: m.name, t: Math.round(m.startTime), d: Math.round(m.duration) })); }
  return { gapsOn(v) { gapOn = v; last = 0; if (v) gaps.length = 0; return performance.now(); }, gaps: () => gaps.slice(), lt: () => ({ sup: ltSup, e: lt.slice() }), render, perf, res, marks, now: () => performance.now() };
})();
