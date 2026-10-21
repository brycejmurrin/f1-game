// B·H19: are the pack's decoded layer bytes (and the readback `data`) still reachable after the pack is live?
// Wraps Assets.readLayerBytesAsync (4th arg = the DataArrayTexture's `data`, 2nd = layer bytes/bitmaps),
// reloads the pack, forces GC, and derefs the WeakRefs. usage: node scratch/h19/pack-retain.mjs [--root DIR]
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, sleep } from "../../tools/lib/harness.mjs";
const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const i = process.argv.indexOf("--root"); const ROOT = i > 0 ? resolve(process.argv[i + 1]) : HERE;
const srv = await startStaticServer(ROOT);
const browser = await launchChromium({ args: ["--enable-precise-memory-info", "--use-angle=swiftshader"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" });
  await ctx.addInitScript(() => { window.__TEST_MODE = true; try { localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {} });
  await ctx.route("https://api.jolpi.ca/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("https://api.openf1.org/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1", { waitUntil: "load" });
  await page.waitForFunction(() => window.__apex && window.__apex.info && typeof Assets !== "undefined", null, { polling: 200, timeout: 180000 });
  await page.waitForFunction(() => typeof window.renderer !== "undefined" || typeof window.__tlx !== "undefined" || (window.Gfx && /three|tlx/i.test(String(window.Gfx.name || window.Gfx.backendName || ""))), null, { polling: 500, timeout: 90000 }).catch(() => console.log("no TLX global within 60s"));
  if (!(await page.evaluate(() => typeof window.renderer !== "undefined"))) { await page.evaluate(() => window.__apex.race("monza", null, null, { laps: 2 })); await page.waitForFunction(() => typeof window.renderer !== "undefined", null, { polling: 500, timeout: 120000 }).catch(() => console.log("still no renderer")); }
  await sleep(2000);
  await page.evaluate(() => {
    window.__h19 = { data: [], imgs: [] };
    const wrap = (name) => { const o = Assets[name]; Assets[name] = function (size, images, n, data, cb) { (window.__h19.calls = window.__h19.calls || []).push(name);
      window.__h19.data.push({ w: new WeakRef(data), mb: data.byteLength / 1048576 });
      let mb = 0; const seen = new Set();
      for (const im of images) if (im && im.buffer && !seen.has(im.buffer)) { seen.add(im.buffer); mb += im.buffer.byteLength / 1048576; }
      window.__h19.imgs.push({ w: new WeakRef(images), bufs: [...seen].map((b) => new WeakRef(b)), mb });
      return o.apply(this, arguments);
    }; };
    wrap("readLayerBytesAsync"); wrap("readLayerBytes");
    window.__apex.assetLoad && window.__apex.assetLoad(false);
  });
  await sleep(500);
  console.log("backend", await page.evaluate(() => JSON.stringify({ keys: Object.keys(window).filter((k) => /tlx|three|gfx|glx/i.test(k)), env: (window.__apex.diag().env || {}) })));
  console.log("state after unload", await page.evaluate(() => JSON.stringify(Assets.state && Assets.state())));
  await page.evaluate(() => window.__apex.assetLoad(true));
  await page.waitForFunction(() => Assets.state && (Assets.state().uploaded || Assets.state().tier !== "off"), null, { polling: 250, timeout: 120000 }).catch(() => {});
  await sleep(2000);
  if (process.argv.includes('--race')) { await page.evaluate(() => window.__apex.race('monza', null, null, { laps: 2 })); await sleep(8000); }
  for (let k = 0; k < 3; k++) { await cdp.send("HeapProfiler.collectGarbage"); await sleep(300); }
  console.log(JSON.stringify(await page.evaluate(() => ({
    state: Assets.state && Assets.state(),
    calls: window.__h19.calls, dropped: window.__h19.dropped, data: window.__h19.data.map((d) => ({ mb: +d.mb.toFixed(2), alive: !!d.w.deref() })),
    imgs: window.__h19.imgs.map((d) => ({ mb: +d.mb.toFixed(2), arrAlive: !!d.w.deref(), bufsAlive: d.bufs.map((b) => !!b.deref()) })),
  })), null, 1));
} finally { await browser.close().catch(() => {}); await shutdown(); }
