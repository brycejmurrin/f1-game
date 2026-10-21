// Race entry on a phone shape: how many Car3D.build / Helmets.build / buildAtlas / createTexture calls, and their ms.
import { startStaticServer, launchChromium } from "../../tools/lib/harness.mjs";
const srv = await startStaticServer(process.argv[3] || "/home/user/f1-game");
const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
const phone = process.argv[2] !== "desktop";
const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {} });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(new URL("/?three-devtools=1", srv.url).href);
await page.waitForFunction(() => window.__apex != null && typeof Teams !== "undefined", null, { timeout: 240000, polling: 200 });
await page.waitForFunction(() => typeof Car3D !== "undefined" && typeof LiveryTex !== "undefined" && typeof Helmets !== "undefined", null, { timeout: 120000, polling: 250 })
  .catch(() => console.log("globals:", "late"));
console.log("globals", await page.evaluate(() => [typeof Car3D, typeof LiveryTex, typeof Helmets, !!window.renderer].join(",")));
await page.evaluate(() => {
  const S = window.__s = {};
  const wrap = (obj, k, name, f2) => { const f = obj[k]; obj[k] = function () { const t0 = performance.now(); try { return f.apply(this, arguments); } finally {
    const r = S[name] || (S[name] = { n: 0, ms: 0, keys: {} }); r.n++; r.ms += performance.now() - t0; if (f2) { const kk = f2(arguments); r.keys[kk] = (r.keys[kk] || 0) + 1; } } }; };
  wrap(Car3D, "build", "Car3D.build");
  wrap(Helmets, "build", "Helmets.build"); /* frozen: no-op */
  wrap(LiveryTex, "buildAtlas", "buildAtlas", (a) => a[0] + "#" + a[2] + (a[3] ? "P" : ""));
  const b = window.renderer && window.renderer.backend;
  if (b && b.createTexture) wrap(b, "createTexture", "createTexture");
  window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: "longtask" });
});
const t0 = Date.now();
await page.evaluate(() => __apex.race("monza"));
await page.waitForFunction(() => { const i = __apex.info && __apex.info(); return i && (i.state === "race" || i.state === "countdown" || i.state === "grid"); }, null, { timeout: 240000, polling: 250 }).catch((e) => console.log("wait:", e.message));
await page.waitForTimeout(5000);
const out = await page.evaluate(() => { const S = window.__s; for (const k in S) S[k].ms = Math.round(S[k].ms); return { S, lt: window.__lt.sort((a, b) => b - a).slice(0, 6), info: __apex.info && __apex.info().state, mobile: LiveryTex.IS_MOBILE, phone: LiveryTex.IS_PHONE }; });
out.wallMs = Date.now() - t0;
console.log(JSON.stringify(out, null, 1));
await browser.close(); await srv.close?.();
console.log("= race entry probe done");
