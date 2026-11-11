// SCRATCH MEASUREMENT (#5387 round 7) — never merged. Full-lap pool census per prune option.
import { BOOT_MS } from "./fixtures.js";
import { raceGate } from "../../tools/lib/census-entry.mjs";

function pageHooks() {
  const P = window.__lp = { frames: 0, bg: 0, buf: 0, live: 0, liveN: 0, perFrameBg: 0, laps: [], cur: null };
  const sizes = new WeakMap();
  const iv = setInterval(() => {
    try {
      const T = GLX.__tlx, be = T.renderer.backend, dev = be && be.device;
      if (!dev || P.armed) return;
      P.armed = true; clearInterval(iv);
      const cb = dev.createBindGroup, cbuf = dev.createBuffer;
      dev.createBindGroup = function () { P.bg++; P.perFrameBg++; return cb.apply(this, arguments); };
      dev.createBuffer = function (d) { P.buf++; const b = cbuf.apply(this, arguments); try { sizes.set(b, d.size | 0); P.live += d.size | 0; P.liveN++; } catch (_) {} return b; };
      const ds = GPUBuffer.prototype.destroy;
      GPUBuffer.prototype.destroy = function () { const s = sizes.get(this); if (s != null) { P.live -= s; P.liveN--; sizes.delete(this); } return ds.apply(this, arguments); };
    } catch (_) { /* not yet */ }
  }, 50);
}

export function lapBody({ track, knobs }) {
  return async ({ page }) => {
    const V = 55, LAPS = 3;   // average m/s along the lap (wall clock), laps driven
    page.setDefaultTimeout(600000);
    await page.addInitScript((k) => {
      try {
        localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.tlxForceGL", "0");
        localStorage.setItem("apex26.gfxPreset", '"medium"'); localStorage.setItem("apex26.gfxBootStepMs", "45000");
        for (const [n, v] of Object.entries(k)) localStorage.setItem("apex26.scratch" + n, String(v));
      } catch (_) {}
    }, knobs);
    await page.addInitScript(pageHooks);
    const cdp = await page.context().newCDPSession(page);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null && typeof GLX !== "undefined" && !!GLX.__tlx, null, { polling: 100, timeout: BOOT_MS * 2 });
    await page.evaluate((t) => { window.__apex.race(t); }, track);
    await page.waitForFunction((t) => { try { const i = window.__apex.info(); return i.track === t && (i.state === "race" || i.state === "count"); } catch (_) { return false; } }, track, { polling: 200, timeout: 300000 });
    await page.evaluate(() => window.__apex.go());
    await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
    await page.keyboard.down("ArrowUp");
    // Drive by teleport at a wall-clock pace: frac = V * t / total. Per-lap stats are cut at each wrap.
    await page.evaluate(([v]) => {
      const P = window.__lp, T = GLX.__tlx, total = window.__apex.info().total, t0 = performance.now();
      const snap = () => { const ms = T.memState(); const ro = T.renderer._objects && T.renderer._objects._renderObjects; return { pool: ms.pool, rObj: ro ? ro.size : null, poolNew: ms.churn.poolNew, poolPruned: ms.churn.poolPruned }; };
      const open = (lap) => { const s = snap(); P.cur = { lap, t0: performance.now(), f0: P.frames, bg0: P.bg, buf0: P.buf, new0: s.poolNew, pr0: s.poolPruned, peakPool: s.pool, peakRObj: s.rObj, maxBgFrame: 0, maxBgAt: 0, wrapBg: 0 }; };
      P.total = total; open(0);
      const tick = () => {
        P.frames++;
        const c = P.cur;
        if (P.perFrameBg > c.maxBgFrame) { c.maxBgFrame = P.perFrameBg; c.maxBgAt = +((performance.now() - c.t0) / 1000).toFixed(1); }
        if (performance.now() - c.t0 < 3000) c.wrapBg += P.perFrameBg;   // the first 3 s after the line
        P.perFrameBg = 0;
        const d = v * (performance.now() - t0) / 1000, lap = Math.floor(d / total);
        if (P.frames % 15 === 0) { const s = snap(); if (s.pool > c.peakPool) c.peakPool = s.pool; if (s.rObj > c.peakRObj) c.peakRObj = s.rObj; }
        if (lap !== c.lap) {
          const s = snap();
          P.laps.push({ lap: c.lap, secs: +((performance.now() - c.t0) / 1000).toFixed(1), frames: P.frames - c.f0, bindGroups: P.bg - c.bg0, buffers: P.buf - c.buf0,
            minted: s.poolNew - c.new0, pruned: s.poolPruned - c.pr0, peakPool: c.peakPool, endPool: s.pool, peakRObj: c.peakRObj, endRObj: s.rObj,
            maxBgFrame: c.maxBgFrame, maxBgAt: c.maxBgAt, wrapBg3s: c.wrapBg, gpuLiveMB: +(P.live / 1048576).toFixed(2), gpuLiveN: P.liveN });
          open(lap);
        }
        try { window.__apex.jump(d / total % 1, v); window.__apex.snapCam(); } catch (_) {}
        if (lap < 99) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, [V]);
    const heap = [];
    for (let k = 1; k <= LAPS; k++) {
      await page.waitForFunction((n) => window.__lp.laps.length >= n, k, { polling: 500, timeout: 600000 });
      await cdp.send("HeapProfiler.collectGarbage"); const h = await cdp.send("Runtime.getHeapUsage");
      heap.push(+(h.usedSize / 1048576).toFixed(1));
    }
    const out = await page.evaluate(() => ({ total: window.__lp.total, laps: window.__lp.laps }));
    throw new Error("MEASURE " + JSON.stringify({ track, knobs, V, total: out.total, heapMBAfterGcAtLapEnd: heap, laps: out.laps }));
  };
}
