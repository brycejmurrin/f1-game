// Per livery pick in the garage: CPU profile + long tasks, attributed by function. 844x390 touch, CPU x4.
import { startStaticServer, launchChromium } from "../../tools/lib/harness.mjs";
import fs from "node:fs";
const N = +(process.argv[2] || 6), THR = +(process.argv[3] || 4), ROOT = process.argv[4] || "/home/user/f1-game", TAG = process.argv[5] || "now";
const srv = await startStaticServer(ROOT);
const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch (_) {} });
await page.goto(srv.url);
await page.waitForFunction(() => window.__apex != null && document.getElementById("mb-garage"), null, { timeout: 240000, polling: 200 });
const cdp = await ctx.newCDPSession(page);
await page.waitForTimeout(3000);
await page.evaluate(() => document.getElementById("mb-garage").click());
await page.waitForFunction(() => { const c = document.getElementById("carsetup"); return c && !c.hidden && getComputedStyle(c).display !== "none"; }, null, { timeout: 240000, polling: 250 });
await page.waitForTimeout(8000);
await page.evaluate(() => { const t = document.getElementById("cs-tab-livery"); if (t) t.click(); });
await page.waitForTimeout(6000);
const ids = await page.evaluate(() => [...document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus)")].map((e, i) => i));
console.log(`swatches: ${ids.length}, throttle x${THR}, root ${ROOT}`);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: THR });
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
const KEYS = /buildAtlas|paint|drawNumber|measureText|getImageData|putImageData|uploadTexture|texImage2D|createTexture|createImageBitmap|build$|buildComplete|refinish|previewMesh|buildStatic|roomKeys|resolveLivery|schedulePlayerHiRes|weld|createMesh|outline|drawImage|toBlob|toDataURL/;
const rows = [];
for (let k = 0; k < Math.min(N, ids.length); k++) {
  const idx = (k + 1) % ids.length;
  await page.evaluate(() => { window.__lt = []; });
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  await page.evaluate((i) => { const s = [...document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus)")][i]; s && s.click(); }, idx);
  await page.waitForTimeout(5000);
  const { profile: p } = await cdp.send("Profiler.stop");
  const lt = await page.evaluate(() => window.__lt.slice());
  const byId = new Map(p.nodes.map((n) => [n.id, n])), par = new Map(); for (const n of p.nodes) for (const c of n.children || []) par.set(c, n.id);
  const cnt = new Map(); for (const s of p.samples) cnt.set(s, (cnt.get(s) || 0) + 1);
  const iv = (p.endTime - p.startTime) / p.samples.length / 1000;
  const incl = new Map(); let busy = 0;
  for (const [id, c] of cnt) { const top = byId.get(id).callFrame.functionName; if (!["(idle)", "(program)", "(garbage collector)"].includes(top) || top === "(garbage collector)") busy += c * iv;
    let cur = id; const seen = new Set();
    while (cur != null) { const n = byId.get(cur), nm = n.callFrame.functionName; if (KEYS.test(nm) && !seen.has(nm)) { seen.add(nm); const key = nm + " " + (n.callFrame.url || "").split("/").pop().split("?")[0] + ":" + (n.callFrame.lineNumber + 1); incl.set(key, (incl.get(key) || 0) + c * iv); } cur = par.get(cur); } }
  fs.writeFileSync(`artifacts/profiles/h13-garage-${TAG}-${k}.cpuprofile`, JSON.stringify(p));
  const ltSum = lt.reduce((a, b) => a + b[1], 0), ltMax = lt.reduce((a, b) => Math.max(a, b[1]), 0);
  rows.push({ k, idx, busyMs: Math.round(busy), longTasks: lt.length, ltSum: Math.round(ltSum), ltMax: Math.round(ltMax), top: [...incl].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, v]) => [n, Math.round(v)]) });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
fs.writeFileSync(`artifacts/profiles/h13-garage-${TAG}.json`, JSON.stringify(rows, null, 1));
await browser.close(); await srv.close?.();
console.log("= garage probe done");
