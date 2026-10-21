// B·H15: road split pixel proof in ONE page on ONE frozen frame: split ON, OFF, ON again (control).
// Two page loads are not comparable (the race clock drifts between loads), so this toggles __tlx.roadSplit live.
import { startStaticServer, launchChromium } from "../../tools/lib/harness.mjs";
import { gotoGame } from "../../tools/shot/probe-page.mjs";
import { raceGate } from "../../tools/lib/census-entry.mjs";
import sharp from "sharp"; import fs from "node:fs";
const [track, tod = "day"] = process.argv.slice(2);
const POS = (process.env.H15_POS || "0.05,0.4,0.75").split(",").map(Number);
const out = "artifacts/h15-pix"; fs.mkdirSync(out, { recursive: true });
const server = await startStaticServer(".");
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
const shot = async (on) => {
  const n = await page.evaluate(async (on) => {
    const A = window.__apex, T = GLX.__tlx, be = T.renderer.backend, o = be.draw; let split = 0, all = 0;
    T.roadSplit(on);
    be.draw = function (ro) { all++; const g = ro.geometry; if (g.drawRange && g.drawRange.count !== Infinity && g.index && g.drawRange.count < g.index.count) split++; return o.apply(this, arguments); };
    for (let t = 0; t < 30 && !all; t++) { A.snapCam(true); if (!all) await new Promise((r) => setTimeout(r, 1000)); }
    be.draw = o; A.snapCam(true);
    return { split, all };
  }, on);
  const buf = await page.screenshot({ timeout: 180000 });
  return { n, raw: await sharp(buf).raw().toBuffer({ resolveWithObject: true }), buf };
};
const diff = (a, b) => { let d = 0, m = 0; const ch = a.info.channels, n = a.info.width * a.info.height;
  for (let i = 0; i < n; i++) { let x = 0; for (let c = 0; c < 3; c++) x = Math.max(x, Math.abs(a.data[i * ch + c] - b.data[i * ch + c])); if (x) d++; if (x > m) m = x; } return { px: d, max: m }; };
for (const pos of POS) {
  await page.evaluate((pos) => { const A = window.__apex; A.hud(false); A.freeze(false); A.jump(pos, 0); A.freeze(true); for (let i = 0; i < 3; i++) A.snapCam(true); }, pos);
  const on1 = await shot(true), off = await shot(false), on2 = await shot(true);
  fs.writeFileSync(`${out}/${track}-${tod}-${pos}-on.png`, on1.buf); fs.writeFileSync(`${out}/${track}-${tod}-${pos}-off.png`, off.buf);
  console.log(JSON.stringify({ track, tod, pos, drawsOn: on1.n, drawsOff: off.n, onVsOff: diff(on1.raw, off.raw), onVsOn: diff(on1.raw, on2.raw), offVsOn2: diff(off.raw, on2.raw) }));
}
console.log("gpuErrors", await page.evaluate(() => { try { return window.__apex.info().gpuErrors ?? null; } catch (_) { return null; } }));
await browser.close(); process.exit(0);
