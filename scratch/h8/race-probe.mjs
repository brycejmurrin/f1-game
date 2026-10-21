// node scratch/h8/race-probe.mjs [--cpu 4] [--settle 0] [--track id] [--backend unset] [--gpu]
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
import { WEBGPU_CHROMIUM_ARGS } from "../../tools/lib/harness.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const URL = opt("url", "http://apex.test:3457/"), CPU = +opt("cpu", 4), SETTLE = +opt("settle", 0), BE = opt("backend", "unset"), TRACK = opt("track", "");
const base = argv.includes("--gpu") ? [...WEBGPU_CHROMIUM_ARGS] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
const browser = await chromium.launch({ executablePath: chromiumPath(), args: [...base, "--host-resolver-rules=MAP apex.test 127.0.0.1", "--unsafely-treat-insecure-origin-as-secure=http://apex.test:3457"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript((be) => {
  Object.defineProperty(navigator, "webdriver", { get: () => false });
  try { localStorage.setItem("apex26.devApi", "1"); if (be !== "unset") localStorage.setItem("apex26.gfxBackend", be); if (be === "webgpu") localStorage.setItem("apex26.gfxWgxAllowSoftware", "1"); } catch (_) {}
  window.addEventListener("unhandledrejection", (e) => { if (String(e.reason && (e.reason.message || e.reason)).includes("Transition was skipped")) e.preventDefault(); }, true);
}, BE);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
const cdp = await ctx.newCDPSession(page);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__apex && __apex.info && document.getElementById("mb-race").onclick, null, { timeout: 180000, polling: 100 });
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
const T = {}; const t0 = Date.now();
if (TRACK) await page.evaluate((t) => { try { const i = Tracks.LIST.findIndex(d => d.id === t); if (i >= 0) localStorage.setItem("apex26.track", JSON.stringify(i)); } catch (_) {} }, TRACK);
await page.evaluate(() => document.getElementById("mb-race").click());
await page.locator("#select").waitFor({ state: "visible", timeout: 60000 }); T.select = Date.now() - t0;
await page.evaluate(() => document.getElementById("sel-go").click());
await page.locator("#race-settings").waitFor({ state: "visible", timeout: 60000 }); T.setup = Date.now() - t0;
if (SETTLE) await page.waitForTimeout(SETTLE);
const prep = await page.evaluate(() => (__apex.menuPrep ? __apex.menuPrep() : null));
const tGo = Date.now();
await page.evaluate(() => {
  const t0 = performance.now(); window.__gaps = []; let last = t0; window.__run = true;
  const tick = () => { const n = performance.now(); window.__gaps.push(n - last); last = n; if (window.__run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  document.getElementById("rs-go").click();
});
await page.waitForFunction(() => { const a = __apex, L = document.getElementById("loading"); return L.hidden && ["count", "race"].includes(a.info().state) && (a.raceEntryProfile()?.marks || []).some(m => m.n === "present:ready"); }, null, { timeout: 600000, polling: 100 }).catch(() => errors.push("no race in 600s"));
T.goToRace = Date.now() - tGo;
const ev = await page.evaluate(() => { window.__run = false; const g = window.__gaps; return { stages: __apex.raceEntryStages(), marks: __apex.raceEntryProfile().marks, frames: g.length, worst: Math.round(Math.max(...g)), over50: g.filter(x => x > 50).length, backend: __apex.diag().env.backend, track: __apex.info().track }; });
console.log(JSON.stringify({ cpu: CPU, settle: SETTLE, prep, T, ...ev, errors }));
await browser.close();
