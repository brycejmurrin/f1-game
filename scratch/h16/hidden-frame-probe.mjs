// H16: idle title on the phone profile (TLX, CPU x4); does the garage prebuild's hidden frame compile programs the TLX warm did not?
// node scratch/h16/hidden-frame-probe.mjs <url> [--wait 25000]
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const URL = argv[0], WAIT = +opt("wait", 25000);
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem("apex26.devApi", "1"); localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.logLevel", "buffer:info"); } catch (_) {}
  window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });
  const iv = setInterval(() => { const b = document.getElementById("mb-race"); if (b && b.onclick) { window.__int = Math.round(performance.now()); clearInterval(iv); } }, 10);
  // Every hidden garage frame: when it ran and whether the TLX warm was pending at its start.
  window.__hf = [];
  const hook = setInterval(() => { const t = window.GLX && GLX.__tlx; if (!t || !t.present || t.__h16) return; t.__h16 = 1; const p = t.present;
    t.present = function (o) { const a = performance.now(), w = t.warming ? t.warming() : null; const r = p.apply(this, arguments);
      const d = performance.now() - a; if (d > 150) window.__hf.push({ at: Math.round(a), ms: Math.round(d), warmingBefore: w, warmingAfter: t.warming ? t.warming() : null, setup: !!(window.__apex && __apex.info && __apex.info().setupPreview) }); return r; };
    clearInterval(hook); }, 20); });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const logs = []; page.on("console", (m) => { const s = m.text(); if (/garage prewarm|warm|compile/i.test(s)) logs.push(s.slice(0, 220)); });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 300000 });
await page.waitForFunction(() => window.__int, null, { timeout: 300000, polling: 50 });
await page.waitForTimeout(WAIT);
const r = await page.evaluate(() => { const t = window.GLX && GLX.__tlx, m = t && t.memState ? t.memState() : null, g = window.__apex && __apex.garagePrebuild ? __apex.garagePrebuild() : null;
  return { int: window.__int, lt: window.__lt.filter(([s, d]) => s >= window.__int - 300 && d > 200), hf: window.__hf,
    warm: m && m.warm ? m.warm.history : null, logs: (typeof Log !== "undefined" ? Log.records() : []).filter((x) => /garage|warm|compile/i.test(x.msg)).map((x) => Math.round(x.t) + " " + x.ns + " " + x.msg.slice(0, 160)), prebuild: g && { last: g.last, ready: g.ready, garageReady: g.garageReady, programsWarm: g.programsWarm, blockers: g.blockers } }; });
console.log(JSON.stringify(r));
console.log(logs.slice(-12).join("\n"));
await browser.close();
