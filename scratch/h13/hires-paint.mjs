// Time the 2048x2560 player paint (the deferred hi-res kick's buildAtlas) against the 1024 preview, no renderer frames involved.
import { startStaticServer, launchChromium } from "../../tools/lib/harness.mjs";
const srv = await startStaticServer("/home/user/f1-game");
const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await page.goto(srv.url);
await page.waitForFunction(() => typeof LiveryTex !== "undefined" && typeof Teams !== "undefined" && document.fonts.status === "loaded", null, { timeout: 240000, polling: 200 });
const r = await page.evaluate(() => {
  const res = {};
  for (const id of ["ferrari", "mclaren", "redbull"]) {
    const t = Teams.LIST.find((x) => x.id === id), liv = { c1: t.color, c2: t.color2 };
    LiveryTex.buildAtlas(id, liv, 16, true, false);   // warm fonts/paths
    const time = (hi) => { const a = []; for (let i = 0; i < 4; i++) { const t0 = performance.now(); const c = LiveryTex.buildAtlas(id, liv, 16, true, hi); a.push(performance.now() - t0); res[id + (hi ? "_hiSize" : "_prevSize")] = c.width + "x" + c.height; } a.sort((x, y) => x - y); return Math.round(a[1]) + "-" + Math.round(a[3]); };
    res[id + "_preview1024_ms"] = time(false);
    res[id + "_hires2048_ms"] = time(true);
  }
  return res;
});
console.log(JSON.stringify(r, null, 1));
await browser.close(); await srv.close?.();
console.log("= paint probe done");
