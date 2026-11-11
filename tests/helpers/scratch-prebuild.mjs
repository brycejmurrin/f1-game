// SCRATCH MEASUREMENT (#5387) — never merged. What would pre-building every track wrapper at load cost?
// Upper bound by touring: right after the race is interactive, teleport the car round the whole lap in 25 m steps,
// one rendered frame each, so every wrapper / render object the lap draws is minted; time it. Then drive one lap
// (teleport at 55 m/s wall clock) and count what is still minted.
import { BOOT_MS } from "./fixtures.js";
import { raceGate } from "../../tools/lib/census-entry.mjs";

function pageHooks() {
  const P = window.__pb = { frames: 0, bg: 0, buf: 0, ubo: 0, uboN: 0, perFrameBg: 0 };
  const sizes = new WeakMap();
  const tick = () => { P.frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const iv = setInterval(() => {
    try {
      const dev = GLX.__tlx.renderer.backend.device;
      if (!dev || P.armed) return;
      P.armed = true; clearInterval(iv);
      const cb = dev.createBindGroup, cbuf = dev.createBuffer;
      dev.createBindGroup = function () { P.bg++; P.perFrameBg++; return cb.apply(this, arguments); };
      dev.createBuffer = function (d) { P.buf++; const b = cbuf.apply(this, arguments); try { if (d.usage & 64) { sizes.set(b, d.size | 0); P.ubo += d.size | 0; P.uboN++; } } catch (_) {} return b; };
      const ds = GPUBuffer.prototype.destroy;
      GPUBuffer.prototype.destroy = function () { const s = sizes.get(this); if (s != null) { P.ubo -= s; P.uboN--; sizes.delete(this); } return ds.apply(this, arguments); };
    } catch (_) { /* not yet */ }
  }, 50);
}

export function prebuildBody({ track, tour }) {
  return async ({ page }) => {
    page.setDefaultTimeout(600000);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.tlxForceGL", "0");
        localStorage.setItem("apex26.gfxPreset", '"medium"'); localStorage.setItem("apex26.gfxBootStepMs", "45000");
      } catch (_) {}
    });
    await page.addInitScript(pageHooks);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null && typeof GLX !== "undefined" && !!GLX.__tlx, null, { polling: 100, timeout: BOOT_MS * 2 });
    const t0 = await page.evaluate((t) => { window.__t0 = performance.now(); window.__apex.race(t); return 0; }, track);
    await page.waitForFunction((t) => { try { const i = window.__apex.info(); return i.track === t && (i.state === "race" || i.state === "count"); } catch (_) { return false; } }, track, { polling: 100, timeout: 300000 });
    const tCount = await page.evaluate(() => Math.round(performance.now() - window.__t0));
    await page.evaluate(() => window.__apex.go());
    await page.waitForFunction(raceGate, null, { polling: 100, timeout: 300000 });
    const tReady = await page.evaluate(() => Math.round(performance.now() - window.__t0));
    const snap = () => page.evaluate(() => { const T = GLX.__tlx, ms = T.memState(), P = window.__pb; return { t: Math.round(performance.now() - window.__t0), f: P.frames, bg: P.bg, buf: P.buf, poolNew: ms.churn.poolNew, pool: ms.pool, uboKB: +(P.ubo / 1024).toFixed(1), uboN: P.uboN }; });
    const s0 = await snap();
    let tourRes = null;
    if (tour) {
      tourRes = await page.evaluate(() => new Promise((res) => {
        const total = window.__apex.info().total, step = 25, n = Math.ceil(total / step), P = window.__pb, T = GLX.__tlx; let k = 0, maxBg = 0, peak = 0;
        const t1 = performance.now(), bg1 = P.bg, new1 = T.memState().churn.poolNew;
        const go = () => {
          if (P.perFrameBg > maxBg) maxBg = P.perFrameBg; P.perFrameBg = 0;
          const pool = T.memState().pool; if (pool > peak) peak = pool;
          if (k >= n) { res({ ms: Math.round(performance.now() - t1), frames: n, bindGroups: P.bg - bg1, minted: T.memState().churn.poolNew - new1, peakPool: peak, maxBgFrame: maxBg }); return; }
          try { window.__apex.jump((k * step) / total % 1, 60); window.__apex.snapCam(); } catch (_) {}
          k++; requestAnimationFrame(go);
        };
        requestAnimationFrame(go);
      }));
    }
    const s1 = await snap();
    await page.keyboard.down("ArrowUp");
    const lap = await page.evaluate(() => new Promise((res) => {
      const V = 55, P = window.__pb, T = GLX.__tlx, total = window.__apex.info().total, t1 = performance.now(), bg1 = P.bg, new1 = T.memState().churn.poolNew; let maxBg = 0, f = 0, peak = 0;
      P.perFrameBg = 0;
      const go = () => {
        f++; if (P.perFrameBg > maxBg) maxBg = P.perFrameBg; P.perFrameBg = 0;
        if (f % 15 === 0) { const pool = T.memState().pool; if (pool > peak) peak = pool; }
        const d = V * (performance.now() - t1) / 1000;
        if (d >= total) { res({ secs: +((performance.now() - t1) / 1000).toFixed(1), frames: f, bindGroups: P.bg - bg1, minted: T.memState().churn.poolNew - new1, peakPool: peak, maxBgFrame: maxBg }); return; }
        try { window.__apex.jump(d / total, V); window.__apex.snapCam(); } catch (_) {}
        requestAnimationFrame(go);
      };
      requestAnimationFrame(go);
    }));
    const s2 = await snap();
    let heapMB = null; try { const cdp = await page.context().newCDPSession(page); await cdp.send("HeapProfiler.collectGarbage"); heapMB = +((await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576).toFixed(1); } catch (_) {}
    throw new Error("MEASURE " + JSON.stringify({ track, tour, t0, tCount, tReady, s0, tourRes, s1, lap, s2, heapMB }));
  };
}
