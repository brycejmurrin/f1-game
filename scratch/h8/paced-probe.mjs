// Wrap Tracks.buildPaced to record slice CPU vs wall during the menu prep build.
import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const CPU = +opt("cpu", 4), TRACKS = opt("tracks", "bahrain").split(","), URL = opt("url", "http://apex.test:3457/");
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--host-resolver-rules=MAP apex.test 127.0.0.1", "--unsafely-treat-insecure-origin-as-secure=http://apex.test:3457"] });
for (const tr of TRACKS) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); try { localStorage.setItem("apex26.devApi", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__apex && __apex.info && document.getElementById("mb-race").onclick, null, { timeout: 180000, polling: 100 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const orig = Tracks.buildPaced; window.__pb = [];
    Tracks.buildPaced = async function (def, opts, alive, onAbandon, budgetMs) {
      // identical loop to tracks.js buildPaced, instrumented
      const it = Tracks.buildSteps(def, opts), budget = budgetMs > 0 ? budgetMs : 8; const rec = { id: def.id, t0: performance.now(), cpu: 0, slices: 0, steps: 0, maxSlice: 0 }; window.__pb.push(rec);
      let r;
      for (;;) { const t0 = performance.now(); do { r = it.next(); rec.steps++; } while (!r.done && performance.now() - t0 < budget); const d = performance.now() - t0; rec.cpu += d; rec.slices++; rec.maxSlice = Math.max(rec.maxSlice, d);
        if (r.done) { rec.wall = performance.now() - rec.t0; return r.value; }
        await new Promise((res) => requestAnimationFrame(res)); if (!alive()) { it.return(); rec.abandoned = true; rec.wall = performance.now() - rec.t0; if (onAbandon) onAbandon(null); return null; } }
    };
  });
  const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU }); const PROF = argv.includes("--prof"); if (PROF) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }
  await page.evaluate((t) => { const i = Tracks.LIST.findIndex(d => d.id === t); window.__want = i; }, tr);
  await page.evaluate(() => document.getElementById("mb-race").click());
  await page.locator("#select").waitFor({ state: "visible", timeout: 60000 });
  // pick the circuit via the API if the picker exposes it; else default
  await page.evaluate(() => { const el = document.querySelector('.track-row[data-track-idx="' + window.__want + '"]'); if (el) el.click(); window.__clicked = !!el; });
  await page.evaluate(() => document.getElementById("sel-go").click());
  await page.waitForFunction(() => (window.__pb || []).some(r => r.wall != null && !r.abandoned), null, { timeout: 600000, polling: 200 });
  if (PROF) { const { profile } = await cdp.send("Profiler.stop"); const byId = new Map(profile.nodes.map(n => [n.id, n])); const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const inBuild = (id) => { for (let x = id; x != null; x = parent.get(x)) { const fn = byId.get(x).callFrame.functionName; if (fn === "buildSteps" || fn === "buildPaced") return true; } return false; };
  const agg = new Map(); let tb = 0, to = 0; for (let i = 0; i < profile.samples.length; i++) { const id = profile.samples[i], d = profile.timeDeltas[i] || 0; if (inBuild(id)) { tb += d; continue; } to += d; const cf = byId.get(id).callFrame; const k = (cf.url.split("/").slice(-2).join("/").split("?")[0] || "(native)") + " " + (cf.functionName || "(anon)"); agg.set(k, (agg.get(k) || 0) + d); }
  console.log("inBuild ms", Math.round(tb / 1000), "other ms", Math.round(to / 1000)); [...agg].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(String(Math.round(v / 1000)).padStart(6), k)); }
  const pb = await page.evaluate(() => window.__pb.map(r => ({ ...r, t0: undefined, cpu: Math.round(r.cpu), wall: Math.round(r.wall), maxSlice: Math.round(r.maxSlice), duty: +(r.cpu / r.wall).toFixed(2) })));
  console.log(JSON.stringify({ want: tr, cpu: CPU, pb }));
  await ctx.close();
}
await browser.close();
