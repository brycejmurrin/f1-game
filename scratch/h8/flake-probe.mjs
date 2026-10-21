import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
const URL = process.argv[2] || "http://localhost:3456/";
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
await ctx.addInitScript(() => { try { localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) {} });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(URL); await page.waitForFunction(() => window.__apex && __apex.race, null, { timeout: 180000 });
const step = async (n, fn, arg) => { const t = Date.now(); const r = await page.evaluate(fn, arg); console.log(n, Date.now() - t, "ms", JSON.stringify(r).slice(0, 300)); return r; };
// headless-api loadRace + control loop
await step("race monza", () => window.__apex.race("monza").then((x) => !!x, (e) => "err:" + e.message));
await page.waitForFunction(() => __apex.info().track != null, null, { timeout: 300000 });
await step("jump+loop", () => { __apex.jump(0.1, 40, 0); __apex.headless(true); __apex.reset(0.1, 40, 0); let o; for (let i = 0; i < 50; i++) { o = __apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1); if (o.done) break; } __apex.headless(false); return __apex.info(); });
// logging loadTrack (shared): syncFactoryMcLarenSeat + race monaco
await step("seat", () => { const S = GameStore.store; S.set("team", 2); S.set("driver", 0); S.set("parts.mclaren", {}); document.getElementById("mb-race").click(); document.getElementById("sel-back").click(); return __apex.info(); });
const mark = await page.evaluate(() => (Log.records({}).slice(-1)[0] || { id: 0 }).id);
await step("race monaco", () => window.__apex.race("monaco").then((x) => "ok:" + !!x, (e) => "err:" + e.message));
const logs = await page.evaluate((m) => Log.records({ since: m }).filter((r) => r.level !== "debug" && r.level !== "trace").map((r) => Math.round(r.t) + " [" + r.ns + "] " + r.level + ": " + r.msg.slice(0, 200)), mark);
console.log(logs.join("\n"));
console.log("info", JSON.stringify(await page.evaluate(() => __apex.info())));
await browser.close();
