// Which code is the ~1.2 s long task right after the title wires? CPU profile on the phone profile, top self-time in that window.
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
const URL = process.argv[2] || "http://localhost:3462/", BE = process.argv[3] || "three";
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript((be) => { localStorage.setItem("apex26.gfxBackend", be); window.__lt = [];
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });
  const iv = setInterval(() => { const b = document.getElementById("mb-race"); if (b && b.onclick) { window.__int = Math.round(performance.now()); clearInterval(iv); } }, 25); }, BE);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
await page.goto(URL, { waitUntil: "load", timeout: 300000 });
await page.waitForFunction(() => window.__int, null, { timeout: 300000, polling: 50 });
await page.waitForTimeout(1000); await cdp.send("Profiler.start"); await page.waitForTimeout(8000);
const { profile } = await cdp.send("Profiler.stop");
const { int, lt, origin } = await page.evaluate(() => ({ int: window.__int, lt: window.__lt, origin: performance.timeOrigin }));
const big = lt.filter(([s, d]) => s >= int - 300 && d > 300).sort((a, b) => b[1] - a[1])[0];
console.log("int", int, "long tasks after int", JSON.stringify(lt.filter(([s]) => s >= int - 300).slice(0, 8)), "target", big);
// Map samples to time (profile timestamps are µs, monotonic; align by startTime vs timeOrigin through the first sample).
const nodes = new Map(profile.nodes.map(n => [n.id, n])); const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
let t = profile.startTime; const self = new Map(), incl = new Map();
// performance.now() base: profile times are in the same monotonic clock as timeOrigin*1000 roughly; use the throttled task window by offset.
const t0 = profile.startTime;
const nowAt = (us) => (us - t0) / 1000;   // ms since profiler start (~ navigation start)
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i];
  const ms = nowAt(t);
  
  const id = profile.samples[i]; const n = nodes.get(id); const f = n.callFrame;
  const k = `${f.functionName || "(anon)"} ${f.url.split("/").slice(-2).join("/")}:${f.lineNumber + 1}`;
  self.set(k, (self.get(k) || 0) + 1);
  const seen = new Set(); let p = id;
  while (p != null) { const cf = nodes.get(p).callFrame; const kk = `${cf.functionName || "(anon)"} ${cf.url.split("/").slice(-2).join("/")}:${cf.lineNumber + 1}`; if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + 1); } p = parent.get(p); }
}
const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${v}\t${k}`).join("\n");
console.log("== self (samples ~1ms)\n" + top(self) + "\n== inclusive\n" + top(incl));
await browser.close();
