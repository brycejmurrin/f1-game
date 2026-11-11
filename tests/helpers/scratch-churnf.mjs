// SCRATCH MEASUREMENT (#5387) — never merged. Tip census + pool-churn logging; arms: CPU burn, prune idle override.
import fs from "node:fs";
import { test, expect, BOOT_MS } from "./fixtures.js";
import { measureIdleWindows } from "../../tools/perf/idle-pipeline-census.mjs";

function roHookInit() {
  const R = window.__roc = { log: [], win: [] };
  const iv = setInterval(() => {
    try {
      const T = typeof GLX !== "undefined" ? GLX.__tlx : null, r = T && T.renderer, os = r && r._objects;
      if (!os || typeof os.createRenderObject !== "function" || !window.__bpp) return;
      clearInterval(iv);
      const objs = new WeakSet(), geos = new WeakMap(), o = os.createRenderObject;
      os.createRenderObject = function (nodes, g, rr, object, material, scene, camera, lightsNode, renderContext) {
        const objSeen = objs.has(object); objs.add(object);
        const geo = object && object.geometry; const gPrev = geo ? geos.get(geo) : undefined;
        if (geo) geos.set(geo, (gPrev | 0) + 1);
        if (window.__bpp.gpuLogOn && R.log.length < 400) {
          R.log.push({ at: window.__bpp.frames, t: Math.round(performance.now()), objSeen, geoSeen: gPrev | 0, mat: (material.type || "") + ":" + (material.name || ""),
            ctx: renderContext && renderContext.id, par: object.parent ? (object.parent.name || object.parent.type) : "-",
            verts: geo && geo.attributes && geo.attributes.position ? geo.attributes.position.count : null,
            pin: !!(geo && geo.__tlxPin), seenAge: object && object.__tlxSeen ? Math.round(performance.now() - object.__tlxSeen) : null });
        }
        return o.apply(this, arguments);
      };
      const mem = () => { try { const c = T.memState().churn; return { t: Math.round(performance.now()), f: window.__bpp.frames, poolNew: c.poolNew, poolPruned: c.poolPruned, pruneLog: c.pruneLog }; } catch (e) { return { err: String(e) }; } };
      R.mem = mem;
    } catch (_) { /* not yet */ }
  }, 50);
}

export function scratchTest(name, { burn, pruneIdleMs }) {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test.describe.configure({ retries: 0 });
  test(name, async ({ page }) => {
    test.setTimeout(900000);
    if (burn) await page.addInitScript((ms) => { const b = () => { const t = performance.now(); while (performance.now() - t < ms) { /* burn */ } requestAnimationFrame(b); }; requestAnimationFrame(b); }, burn);
    if (pruneIdleMs) await page.addInitScript((v) => { try { localStorage.setItem("apex26.scratchPruneIdleMs", String(v)); } catch (_) {} }, pruneIdleMs);
    await page.addInitScript(roHookInit);
    // sample the pool counters every 500 ms in-page
    await page.addInitScript(() => { const S = window.__memS = []; setInterval(() => { try { if (window.__roc && window.__roc.mem && window.__bpp && window.__bpp.gpuLogOn !== undefined) S.push(window.__roc.mem()); if (S.length > 600) S.shift(); } catch (_) {} }, 500); });
    let err = null, res = null;
    try { res = await measureIdleWindows(page, { forceGL: false, bootMs: BOOT_MS * 2, gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) }); } catch (e) { err = String(e && e.message || e).slice(0, 300); }
    const W = res && res.windows && res.windows.map((w) => ({ w: w.window, p: w.pipelines, bg: w.bindGroups, b: w.buffers }));
    const roc = await page.evaluate(() => ({ log: window.__roc && window.__roc.log, end: window.__roc && window.__roc.mem && window.__roc.mem(), memS: (window.__memS || []).filter((_, i, a) => i === 0 || a[i - 1].poolNew !== a[i].poolNew || a[i - 1].poolPruned !== a[i].poolPruned).map((m) => [m.t, m.f, m.poolNew, m.poolPruned]), gpuLogOnAt: null })).catch((e) => ({ err: String(e) }));
    const g = {};
    for (const r of (roc.log || [])) { const k = [r.objSeen ? "OLDOBJ" : "NEWOBJ", "geoSeen" + Math.min(r.geoSeen, 2), r.par, r.mat, "ctx" + r.ctx, r.pin ? "pin" : "", r.verts].join("|"); const a = g[k] || (g[k] = { n: 0, at0: r.at, at1: r.at }); a.n++; a.at1 = r.at; }
    throw new Error("MEASURE " + JSON.stringify({ burn, pruneIdleMs: pruneIdleMs || 20000, err, W, end: roc.end, memS: roc.memS && roc.memS.slice(-60), ro: Object.entries(g).sort((a, b) => b[1].n - a[1].n).slice(0, 14) }));
  });
}
