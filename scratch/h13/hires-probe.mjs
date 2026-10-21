// Desktop (not phone) garage: how long is the deferred 2048 player hi-res paint, and what long task does it make?
import { startStaticServer, launchChromium } from "../../tools/lib/harness.mjs";
const srv = await startStaticServer("/home/user/f1-game");
const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); } catch (_) {}
});
await page.goto(srv.url);
await page.waitForFunction(() => window.__apex != null && typeof LiveryTex !== "undefined", null, { timeout: 240000, polling: 200 });
await page.evaluate(() => { const f = LiveryTex.buildAtlas; window.__hi = [];
  LiveryTex.buildAtlas = function (team, l, num, isPlayer, hiRes) { const t0 = performance.now(); const r = f.apply(this, arguments);
    if (hiRes) window.__hi.push(Math.round(performance.now() - t0)); return r; }; });
const out = { IS_MOBILE: await page.evaluate(() => LiveryTex.IS_MOBILE), IS_PHONE: await page.evaluate(() => LiveryTex.IS_PHONE) };
await page.locator("#mb-race").click();
await page.locator("#select").waitFor({ state: "visible", timeout: 120000 });
await page.locator("#sel-car").click();
await page.locator("#carsetup").waitFor({ state: "visible", timeout: 120000 });
await page.evaluate(() => { window.__lt = []; });
await page.waitForFunction(() => window.__hi.length > 0, null, { timeout: 90000, polling: 250 }).catch(() => {});
await page.waitForTimeout(3000);
Object.assign(out, await page.evaluate(() => ({ hiResPaintMs: window.__hi.slice(), longTasksMs: window.__lt.slice().sort((a, b) => b - a).slice(0, 5) })));
console.log(JSON.stringify(out));
await browser.close(); await srv.close?.();
console.log("= hires probe done");
