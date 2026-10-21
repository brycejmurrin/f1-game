// B·H15: why does the split A/B record no draws? Count raw backend.draw calls per rAF.
import { startStaticServer, launchChromium } from "../../tools/lib/harness.mjs";
import { gotoGame } from "../../tools/shot/probe-page.mjs";
import { raceGate } from "../../tools/lib/census-entry.mjs";
const [root, track, tod = "day"] = process.argv.slice(2);
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
const r = await page.evaluate(async () => {
  const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
  const R = GLX.__tlx.renderer, be = R.backend, o = be.draw; let n = 0, rn = 0; const or = R.render; R.render = function () { rn++; return or.apply(this, arguments); };
  be.draw = function () { n++; return o.apply(this, arguments); };
  const inf = A.info(); const out = { gfx: inf.gfx || inf.renderer || Object.keys(inf).join(","), frames0: inf.frames, hasDraw: typeof o, beName: be.constructor && be.constructor.name, perFrame: [] };
  out.snaps = [];
  for (const pos of [0.05, 0.4, 0.75]) {
    A.freeze(false); A.jump(pos, 0); A.freeze(true);
    for (let i = 0; i < 4; i++) { n = 0; rn = 0; let err = null; try { A.snapCam(true); } catch (e) { err = String(e); } out.snaps.push(pos + ':' + n + '/' + rn + (err ? ' ' + err : '') + ' st=' + A.info().state + ' hl=' + A.headless()); }
    for (let i = 0; i < 5; i++) { n = 0; rn = 0; await raf(); out.perFrame.push(n + '/' + rn); }
  }
  out.frames1 = A.info().frames; out.gl = window.GFX && GFX.name; out.sameRenderer = GLX.__tlx.renderer === R; out.sameBackend = GLX.__tlx.renderer.backend === be;
  be.draw = o; R.render = or; return out;
});
console.log(JSON.stringify(r));
await browser.close(); process.exit(0);
