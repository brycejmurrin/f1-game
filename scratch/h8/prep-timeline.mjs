// Title -> RACE -> setup; poll __apex.menuPrep() every 50 ms; print field transitions until prep ready.
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
import { WEBGPU_CHROMIUM_ARGS } from "../../tools/lib/harness.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const BE = opt("backend", "three"), URL = opt("url", "http://apex.test:3457/"), CPU = +opt("cpu", 1);
const base = argv.includes("--gpu") ? [...WEBGPU_CHROMIUM_ARGS] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
const browser = await chromium.launch({ executablePath: chromiumPath(), args: [...base, "--host-resolver-rules=MAP apex.test 127.0.0.1", "--unsafely-treat-insecure-origin-as-secure=http://apex.test:3457"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript((be) => { Object.defineProperty(navigator, "webdriver", { get: () => false }); try { localStorage.setItem("apex26.devApi", "1"); localStorage.setItem("apex26.gfxBackend", be); if (be === "three" && !location.search.includes("hw")) localStorage.setItem("apex26.tlxForceGL", "1"); if (be === "webgpu") localStorage.setItem("apex26.gfxWgxAllowSoftware", "1"); } catch (_) {} }, BE);
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__apex && __apex.menuPrep && document.getElementById("mb-race").onclick, null, { timeout: 180000, polling: 100 });
const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
const be = await page.evaluate(() => __apex.diag().env.backend);
await page.evaluate(() => {
  window.__tl = []; const t0 = performance.now(); window.__t0abs = t0; let last = {};
  window.__st = {}; const oST = window.setTimeout; window.setTimeout = function (fn, ms, ...a) { const k = String(ms | 0); const e = window.__st[k] || (window.__st[k] = { n: 0, stack: {} }); e.n++; if ((ms | 0) >= 8 && (ms | 0) <= 1200) { const ss = (new Error().stack || "").split("\n"); const st = [2,3,4,5].map(i => (ss[i] || "").trim().replace(/^at /, "").replace(/https?:\/\/[^/]+\//g, "").replace(/\?v=[^:]*/g, "")).join(" <- "); const kk = st.replace(/\?v=[^:]*/, "").replace(/^\s*at\s*/, "").replace(/http:\/\/[^/]+\//g, "").slice(0, 260); e.stack[kk] = (e.stack[kk] || 0) + 1; } return oST.call(window, fn, ms, ...a); };
  const keys = (p) => ({ world: p.world, building: p.building, done: p.done, warmKey: !!p.warmKey, warmed: p.warmed, warmFrames: p.warmFrames, warming: p.warming, garageReady: p.garageReady, cars: !!p.cars });
  window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 200) window.__lt.push([Math.round(e.startTime - t0), Math.round(e.duration)]); }).observe({ type: "longtask" }); } catch (_) {}
  const tick = () => { const p = __apex.menuPrep(), k = keys(p); const ch = Object.keys(k).filter(x => k[x] !== last[x]).map(x => x + "=" + k[x]); if (ch.length) window.__tl.push([Math.round(performance.now() - t0), ch.join(" ")]); last = k; window.__tlT = setTimeout(tick, 50); };
  tick(); document.getElementById("mb-race").click();
});
await page.locator("#select").waitFor({ state: "visible", timeout: 60000 });
await page.evaluate(() => { window.__tl.push([0, "--select"]); document.getElementById("sel-go").click(); });
await page.waitForFunction(() => { const p = __apex.menuPrep(); return p.world && !p.building && p.done && (!p.warmable || p.warmed) && p.warmFrames === 0 && !p.warming && p.garageReady; }, null, { timeout: 900000, polling: 100 }).catch(() => console.log("TIMEOUT"));
const tl = await page.evaluate(() => { clearTimeout(window.__tlT); return { tl: window.__tl, lt: window.__lt, cars: __apex.menuPrep().cars, st: window.__st }; });
console.log("backend", be); for (const r of tl.tl) console.log(String(r[0]).padStart(7), r[1]); console.log("longtasks>200", JSON.stringify(tl.lt)); const t0abs = await page.evaluate(() => window.__t0abs); const wT = (tl.tl.find(r => r[1].includes("world=true")) || [0])[0]; console.log("cars", JSON.stringify(tl.cars), "carsEndRel", tl.cars ? Math.round(tl.cars.at - t0abs) : null, "worldAt", wT, "carSpan", tl.cars ? Math.round(tl.cars.at - t0abs - wT) : null); for (const [k, v] of Object.entries(tl.st)) if (+k >= 8 && v.n > 2) console.log("setTimeout", k, "ms x", v.n, "=", +k * v.n, "ms", JSON.stringify(v.stack));
await browser.close();
