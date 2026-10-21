// H8 boot probe: cold+warm boot phases. node scratch/h8/boot-probe.mjs <url> [--cpu 4] [--net slow4g|fast4g|none] [--backend three|webgl2|unset] [--runs 1]
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
import { WEBGPU_CHROMIUM_ARGS } from "../../tools/lib/harness.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const URL = argv[0] || "http://localhost:3456/";
const CPU = +opt("cpu", 4), NET = opt("net", "none"), BE = opt("backend", "unset"), RUNS = +opt("runs", 1), TAP = argv.includes("--tap");
const NETS0 = { slow4g: { latency: 150, downloadThroughput: 1.6e6 / 8 * 1.0, uploadThroughput: 750e3 / 8 }, fast4g: { latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 }, none: null }; const NETS = NETS0;
const args = argv.includes("--gpu") ? [...WEBGPU_CHROMIUM_ARGS] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
if (URL.includes("apex.test")) args.push("--host-resolver-rules=MAP apex.test 127.0.0.1", "--unsafely-treat-insecure-origin-as-secure=http://apex.test:3457");
const browser = await chromium.launch({ executablePath: chromiumPath(), args });
async function boot(page, label) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  if (NETS[NET]) { await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETS[NET] }); }
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: "load", timeout: 300000 });
  // "ready": menu handler wired = backend bound; detect via the Log ring.
  await page.waitForFunction(() => window.__h8ready, null, { timeout: 300000, polling: 100 }).catch(() => {});
  // First tap: as soon as RACE is wired, tap it; time tap -> #select shown, plus the click's event-timing duration.
  let tap = null;
  if (TAP) {
    await page.waitForFunction(() => window.__h8int, null, { timeout: 300000, polling: 25 }).catch(() => {});
    const t = await page.evaluate(() => performance.now());
    await page.tap("#mb-race").catch(() => {});
    await page.waitForFunction(() => { const s = document.getElementById("select"); return s && !s.hidden; }, null, { timeout: 60000, polling: 16 }).catch(() => {});
    tap = await page.evaluate((t) => ({ at: Math.round(t), toSelect: Math.round(performance.now() - t), ev: (window.__h8ev || []).filter(e => e.s >= t - 5).map(e => [e.n, Math.round(e.d)]).slice(0, 4) }), t);
  }
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource");
    const paint = Object.fromEntries(performance.getEntriesByType("paint").map(p => [p.name, Math.round(p.startTime)]));
    const by = {};
    for (const e of res) {
      const u = new URL(e.name); const p = u.pathname;
      const k = /\/vendor\/three/.test(p) ? "three-vendor" : /\/render\/(three|glx|webgpu)\//.test(p) ? "backend" : /\/assets\//.test(p) ? "assets" : /\.js$/.test(p) ? "js" : /\.css$/.test(p) ? "css" : "other";
      const b = by[k] || (by[k] = { n: 0, xfer: 0, enc: 0, end: 0, start: 1e9 });
      b.n++; b.xfer += e.transferSize; b.enc += e.encodedBodySize; b.end = Math.max(b.end, Math.round(e.responseEnd)); b.start = Math.min(b.start, Math.round(e.startTime));
    }
    const lt = (window.__h8lt || []); const late = res.filter(e => /render\/(glx|three|webgpu)\/|vendor\/three|game\.js|renderer-boot/.test(e.name)).map(e => [new URL(e.name).pathname.slice(1, 60), Math.round(e.startTime), Math.round(e.responseEnd), e.transferSize]);
    return { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), paint, lcp: window.__h8lcp, ready: window.__h8ready, int: window.__h8int, readyWhy: window.__h8readyWhy,
      late, ltList: lt.map(x => [Math.round(x.s), Math.round(x.d)]), longTasks: { n: lt.length, ms: Math.round(lt.reduce((a, b) => a + b.d, 0)), max: Math.round(Math.max(0, ...lt.map(x => x.d))) }, by,
      backend: (window.__apex && __apex.diag && __apex.diag().env && __apex.diag().env.backend) || null,
      sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) };
  });
  r.tap = tap; r.wallMs = Date.now() - t0; r.label = label;
  return r;
}
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: false, deviceScaleFactor: 2 });
  await ctx.addInitScript((be) => {
    try { if (be !== "unset") localStorage.setItem("apex26.gfxBackend", be); if (be === "webgpu") localStorage.setItem("apex26.gfxWgxAllowSoftware", "1"); localStorage.setItem("apex26.devApi", "1"); } catch (_) {}
    window.__h8lt = []; try { performance.setResourceTimingBufferSize(5000); } catch (_) {}
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__h8lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: "longtask", buffered: true }); } catch (_) {}
    window.__h8ev = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__h8ev.push({ n: e.name, s: e.startTime, d: e.duration }); }).observe({ type: "event", durationThreshold: 16, buffered: true }); } catch (_) {}
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__h8lcp = Math.round(e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); } catch (_) {}
    // ready = the first Log record from the game after the backend bound OR __apex present.
    const iv = setInterval(() => {
      const b = document.getElementById("mb-race"); if (b && b.onclick && !window.__h8int) window.__h8int = Math.round(performance.now());
      if (window.__apex && window.__apex.info) { window.__h8ready = Math.round(performance.now()); window.__h8readyWhy = "__apex"; clearInterval(iv); }
    }, 25);
  }, BE);
  const page = await ctx.newPage();
  page.on("pageerror", e => console.error("pageerror", e.message));
  console.log(JSON.stringify(await boot(page, "cold#" + i)));
  const swT0 = Date.now(); const swOk = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(r => !!r.active), new Promise(r => setTimeout(() => r(false), 180000))])); await page.waitForTimeout(8000); console.error("sw ready", swOk, Date.now() - swT0, "ms"); await page.close(); const p2 = await ctx.newPage(); console.log(JSON.stringify(await boot(p2, "warm#" + i)));
  await ctx.close();
}
await browser.close();
