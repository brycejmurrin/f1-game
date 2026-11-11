// SCRATCH MEASUREMENT (#5387) — never merged. The race's prime frame: its present ms and the render objects / bind
// groups it made, against the 30 frames after it; then the census windows as the spec counts them.
import { BOOT_MS } from "./fixtures.js";
import { measureIdleWindows } from "../../tools/perf/idle-pipeline-census.mjs";

function primeHooks() {
  const P = window.__pf = { ro: 0, bg: 0, frames: [], prime: null };
  const iv2 = setInterval(() => { try { const A = window.__apex; if (!A || A.__raceWrapped || typeof A.race !== "function") return; const r = A.race; A.race = function () { P.raceAt = performance.now(); return r.apply(this, arguments); }; A.__raceWrapped = true; clearInterval(iv2); } catch (_) {} }, 20);
  document.addEventListener("apex-scratch-prime", (e) => { window.__primeMark = e.detail; P.marks = (P.marks || 0) + 1; if (P.ro0 == null) { P.ro0 = P.ro; P.bg0 = P.bg; } });
  const iv = setInterval(() => {
    try {
      const T = GLX.__tlx, r = T && T.renderer;
      if (!r || !r._objects || P.armed || typeof GLX.present !== "function") return;
      P.armed = true; clearInterval(iv);
      const cro = r._objects.createRenderObject; r._objects.createRenderObject = function () { P.ro++; return cro.apply(this, arguments); };
      const dev = r.backend && r.backend.device;
      if (dev && dev.createBindGroup) { const cb = dev.createBindGroup; dev.createBindGroup = function () { P.bg++; return cb.apply(this, arguments); }; }
      const pres = GLX.present;
      GLX.present = function () {
        const m = window.__primeMark, t0 = performance.now(), ro0 = P.ro, bg0 = P.bg;
        const out = pres.apply(this, arguments);
        const t1 = performance.now();
        if (m) { window.__primeMark = null; (P.primes = P.primes || []).push({ off: m.off, n: m.n, presentMs: +(t1 - t0).toFixed(1), loadMs: P.raceAt ? Math.round(t1 - P.raceAt) : null, loopToEndMs: +(t1 - m.t).toFixed(1), ro: P.ro - ro0, bg: P.bg - bg0, warming: !!(GLX.warming && GLX.warming()) }); P.prime = P.primes[P.primes.length - 1]; P.frames = []; }
        else if (P.prime && P.frames.length < 30) P.frames.push([+(t1 - t0).toFixed(1), P.ro - ro0, P.bg - bg0]);
        P.roTotal = P.ro; P.bgTotal = P.bg;
        if (P.ro0 != null && !P.firstFree && !(GLX.warming && GLX.warming())) P.firstFree = { ms: +(t1 - t0).toFixed(1), loadMs: P.raceAt ? Math.round(t1 - P.raceAt) : null, ro: P.ro - ro0, bg: P.bg - bg0 };
        return out;
      };
    } catch (_) { /* not yet */ }
  }, 20);
}

export function primeBody({ forceGL, off }) {
  return async ({ page }) => {
    if (off) await page.addInitScript(() => { try { localStorage.setItem("apex26.scratchRacePrime", "0"); } catch (_) {} });
    await page.addInitScript(primeHooks);
    let err = null, res = null;
    try { res = await measureIdleWindows(page, { forceGL, bootMs: BOOT_MS * 2, gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) }); } catch (e) { err = String(e && e.message || e).slice(0, 200); }
    const pf = await page.evaluate(() => window.__pf).catch((e) => ({ err: String(e) }));
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
    const after = (pf.frames || []).map((f) => f[0]);
    throw new Error("MEASURE " + JSON.stringify({ forceGL, off, hook: res && res.hook, err, firstFree: pf.firstFree, nPrimes: (pf.primes || []).length, primes: (pf.primes || []).slice(0, 3), roSinceMark: pf.roTotal - pf.ro0, bgSinceMark: pf.bgTotal - pf.bg0, after30: { medMs: med(after), maxMs: after.length ? Math.max(...after) : null, ro: (pf.frames || []).reduce((a, f) => a + f[1], 0), bg: (pf.frames || []).reduce((a, f) => a + f[2], 0) },
      gov: res && res.gov, replay: res && res.replay, soft: res && res.soft, w: res && res.windows.map((w) => [w.pipelines, w.bindGroups, w.buffers]) }));
  };
}
