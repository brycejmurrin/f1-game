// Profile title -> RACE -> setup prep; report inclusive time of named functions + the longest tasks.
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const URL = opt("url", "http://localhost:3456/"), CPU = +opt("cpu", 1), TRACK = opt("track", "");
const NAMES = opt("fns", "sceneOf,offRoad,propBoxes,spanBoxes,project,planSteps,frame,camera").split(",");
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--js-flags=--trace-deopt-verbose=false"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); try { localStorage.setItem("apex26.devApi", "1"); localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) {} });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__apex && __apex.menuPrep && document.getElementById("mb-race").onclick, null, { timeout: 180000, polling: 100 });
const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 250 }); await cdp.send("Profiler.start");
await page.evaluate(() => document.getElementById("mb-race").click());
await page.locator("#select").waitFor({ state: "visible", timeout: 60000 });
if (TRACK) await page.evaluate((t) => { const i = Tracks.LIST.findIndex(d => d.id === t); const el = document.querySelector('.track-row[data-track-idx="' + i + '"]'); if (el) el.click(); }, TRACK);
await page.evaluate(() => document.getElementById("sel-go").click());
await page.waitForFunction(() => { const p = __apex.menuPrep(); return p.done; }, null, { timeout: 900000, polling: 200 });
const { profile } = await cdp.send("Profiler.stop");
const byId = new Map(profile.nodes.map(n => [n.id, n])); const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const incl = Object.fromEntries(NAMES.map(n => [n, 0]));
for (let i = 0; i < profile.samples.length; i++) { const d = profile.timeDeltas[i] || 0; const seen = new Set(); for (let x = profile.samples[i]; x != null; x = parent.get(x)) { const cf = byId.get(x).callFrame; const fn = cf.functionName; if (fn in incl && !seen.has(fn) && /flyby|tracks|spline|space|geom/.test(cf.url)) { incl[fn] += d; seen.add(fn); } } }
console.log("track", await page.evaluate(() => __apex.menuPrep().trackId), "cpu", CPU);
for (const [k, v] of Object.entries(incl)) console.log(k.padEnd(12), Math.round(v / 1000), "ms");
await browser.close();
