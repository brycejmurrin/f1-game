// H16 TLX heap lead: race-cycle-memory's loop (monza+spa x3, phone profile) for ONE backend,
// post-GC heap per menu visit and heap snapshots at the menu after cycles 1 and 3.
// node scratch/h16/heap-ab.mjs <url> --backend three|webgl2 --out artifacts/h16-heap
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
import { censusInitScript, censusAfterGc, waitFrames } from "../../tools/lib/mem-census.mjs";
import { mkdirSync, createWriteStream, writeFileSync } from "node:fs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const URL = argv[0], BE = opt("backend", "three"), OUT = opt("out", "artifacts/h16-heap");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--js-flags=--expose-gc"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript((be) => { try { localStorage.setItem("apex26.devApi", "1"); localStorage.setItem("apex26.gfxBackend", be); localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {} }, BE);
await page.addInitScript(censusInitScript);
const cdp = await ctx.newCDPSession(page);
await cdp.send("HeapProfiler.enable");
await page.goto(URL + "?three-devtools=1", { timeout: 300000 });
await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { polling: 100, timeout: 300000 });
const be = await page.evaluate(() => { try { return window.__apex.info().gfx || (typeof Gfx !== "undefined" && Gfx.backend) || null; } catch (_) { return null; } });
async function snap(name) {
  await cdp.send("HeapProfiler.collectGarbage");
  const ws = createWriteStream(`${OUT}/${name}.heapsnapshot`);
  const on = (e) => ws.write(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", on);
  await new Promise((r) => ws.end(r));
}
const rows = [];
for (let cycle = 1; cycle <= 3; cycle++) {
  for (const id of ["monza", "spa"]) {
    await page.evaluate((tid) => window.__apex.race(tid), id);
    await page.waitForFunction((tid) => { try { const i = window.__apex.info(); return i.track === tid && (i.state === "race" || i.state === "count"); } catch (_) { return false; } }, id, { polling: 200, timeout: 240000 });
    await page.evaluate(() => { const A = window.__apex; A.go(); A.headless(true); A.setInput({ throttle: true, steer: 0.02 }); A.step(1 / 60, 600); A.clearInput(); A.headless(false); });
    await page.evaluate(() => window.__apex.finishRace());
    await page.waitForFunction(() => window.__apex.info().state === "results", null, { polling: 200, timeout: 60000 });
    await page.evaluate(() => document.getElementById("res-menu").click());
    await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 200, timeout: 60000 });
    await waitFrames(page, 10);
    const m = await censusAfterGc(page, cdp);
    rows.push({ cycle, id, heapMB: m.heapMB, alive: m.aliveTracks, three: m.three && { g: m.three.geometries, t: m.three.textures } });
    console.log(JSON.stringify({ backend: BE, info: be, ...rows[rows.length - 1] }));
    if (id === "spa" && (cycle === 1 || cycle === 3)) await snap(`${BE}-c${cycle}`);
  }
}
writeFileSync(`${OUT}/${BE}.json`, JSON.stringify(rows, null, 1));
await browser.close();
