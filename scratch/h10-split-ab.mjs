// Road split A/B (B·H10): per-pass tris/draws + a still per position. Run once per tree (ROOT arg), diff the stills after.
import { startStaticServer, launchChromium } from "../tools/lib/harness.mjs";
import { gotoGame } from "../tools/shot/probe-page.mjs";
import { raceGate } from "../tools/lib/census-entry.mjs";
import fs from "node:fs";
const [root, tag, track, tod = "day"] = process.argv.slice(2);
const POS = (process.env.H10_POS || "0.05,0.4,0.75").split(",").map(Number);
const outDir = `artifacts/h10-split/${tag}`; fs.mkdirSync(outDir, { recursive: true });
const server = await startStaticServer(root);
const browser = await launchChromium({});
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__TEST_MODE = true;
  localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.tlxForceGL", "1");
  localStorage.setItem("apex26.forceMobileTier", "1"); sessionStorage.setItem("apex26.wgxCapture", "0");
});
await gotoGame(page, server.url, 180000);
await page.evaluate(async ([t, tod]) => { const A = window.__apex; await A.race(t, tod); A.go(); }, [track, tod]);
await page.waitForFunction(raceGate, null, { polling: 500, timeout: 400000 });
await page.evaluate(() => { const A = window.__apex; try { A.camera("helmet"); } catch (_) {} A.renderClock(12, true); try { A.govHold(true); } catch (_) {} });
const rows = [];
for (const pos of POS) {
  const r = await page.evaluate(async (pos) => {
    const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
    const be = GLX.__tlx.renderer.backend, D = { on: false, by: {} };
    const o = be.draw;
    be.draw = function (ro) {
      if (D.on) try {
        const ms = A.mirror(), mw = ms && ms.backend ? ms.backend.w : -1, w = ro.context && ro.context.width, g = ro.geometry, ob = ro.object;
        const idx = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
        const dr = g.drawRange && g.drawRange.count !== Infinity ? Math.min(g.drawRange.count, idx) : idx;
        const k = w === mw ? "mirror" : "w" + w, b = D.by[k] || (D.by[k] = { draws: 0, tris: 0 });
        if (g.drawRange && g.drawRange.count !== Infinity) { const sk = k + "Split"; const sb = D.by[sk] || (D.by[sk] = { draws: 0, tris: 0 }); sb.draws++; sb.tris += Math.round(dr / 3); }
        b.draws++; b.tris += Math.round(dr / 3 * (ob.isInstancedMesh ? ob.count : (g.instanceCount || 1)));
      } catch (_) {}
      return o.apply(this, arguments);
    };
    A.freeze(false); A.jump(pos, 0); A.freeze(true); try { A.snapCam(); } catch (_) {}
    for (let i = 0; i < 10; i++) await raf();
    for (let a = 0; a < 20 && !Object.keys(D.by).length; a++) { D.on = true; await raf(); D.on = false; }
    be.draw = o;
    for (let i = 0; i < 2; i++) await raf();
    return D.by;
  }, pos);
  await page.screenshot({ path: `${outDir}/${track}-${tod}-${pos}.png` });
  rows.push({ track, tod, pos, ...r });
  console.log(JSON.stringify({ tag, track, tod, pos, ...r }));
}
const errs = await page.evaluate(() => { try { return window.__apex.info().gpuErrors ?? null; } catch (_) { return null; } });
console.log("gpuErrors", errs);
await browser.close(); server.close && server.close(); process.exit(0);
