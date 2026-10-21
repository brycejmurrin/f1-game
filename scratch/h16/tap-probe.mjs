// H8 first-tap probe: cold boot on the phone profile, tap RACE or GARAGE `at` ms after the title wires, time tap -> screen.
// node scratch/h8/tap-probe.mjs <url> --target race|garage --at 500 [--cpu 4] [--net fast4g]
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const URL = argv[0], TARGET = opt("target", "race"), AT = +opt("at", 500), CPU = +opt("cpu", 4), NET = opt("net", "fast4g");
const NETS = { fast4g: { latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 }, none: null };
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem("apex26.devApi", "1"); } catch (_) {}
  window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });
  const iv = setInterval(() => { const b = document.getElementById("mb-race"); if (b && b.onclick) { window.__int = performance.now(); clearInterval(iv); } }, 10); });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
if (NETS[NET]) { await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETS[NET] }); }
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 300000 });
await page.waitForFunction(() => window.__int, null, { timeout: 300000, polling: 10 });
await page.waitForFunction((at) => performance.now() >= window.__int + at, AT, { timeout: 60000, polling: 10 });
const sel = TARGET === "garage" ? "#mb-garage" : "#mb-race";
// Dispatch from the page so Playwright's actionability waits do not hide the main-thread block.
const pre = await page.evaluate(() => { const g = window.__apex && __apex.garagePrebuild ? __apex.garagePrebuild() : null; return g ? { running: g.running, last: g.last && g.last.result, warm: g.garageWarm, ready: g.ready } : null; });
const t = await page.evaluate((s) => { const t = performance.now(); const el = document.querySelector(s);
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); el.click(); return t; }, sel);
if (TARGET === "garage") await page.waitForFunction(() => { const g = window.__apex && __apex.garagePrebuild && __apex.garagePrebuild(); return g && g.firstFrame; }, null, { timeout: 120000, polling: 16 });
else await page.waitForFunction(() => { const s = document.getElementById("select"); return s && !s.hidden; }, null, { timeout: 60000, polling: 16 });
const r = await page.evaluate((t) => { const g = window.__apex && __apex.garagePrebuild ? __apex.garagePrebuild() : null;
  return { int: Math.round(window.__int), tapAt: Math.round(t - window.__int), shownMs: Math.round(performance.now() - t),
    garage: g && g.firstFrame ? { tapMs: g.firstFrame.tapMs, prebuilt: g.firstFrame.prebuilt } : null, last: g && g.last ? g.last : null, running: g ? g.running : null,
    ltAfterTap: window.__lt.filter(([s]) => s >= t - 5).slice(0, 4) }; }, t);
console.log(JSON.stringify({ target: TARGET, at: AT, pre, ...r }));
await browser.close();
