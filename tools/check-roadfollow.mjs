import { chromium } from "playwright";
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3456";
const browser = await chromium.launch({ executablePath: EXEC, args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 506 } });
const page = await ctx.newPage();
await page.goto(BASE + "/");
await page.waitForFunction(() => window.__apex != null);
await page.evaluate(() => window.__apex.race("bahrain", "day", "dry"));
await page.waitForFunction(() => window.__apex.info().track != null);
await page.evaluate(() => window.__apex.go());
const res = await page.evaluate(() => {
  const out = [];
  const corners = window.__apex.corners();
  for (const v of [30, 40, 50]) {
    let widest = 0, hw = 7;
    for (const f of corners) {
      window.__apex.jump((f - 0.02 + 1) % 1, v, 0);
      window.__apex.setInput({ steer: 0, throttle: false });
      hw = window.__apex.probe().hw;
      for (let i = 0; i < 70; i++) { window.__apex.step(1/60, 1); widest = Math.max(widest, Math.abs(window.__apex.probe().x)); }
    }
    out.push({ v, widest: +widest.toFixed(1), hw: +hw.toFixed(1), limit: +(hw + 8).toFixed(1) });
  }
  window.__apex.clearInput();
  return out;
});
for (const r of res) console.log(`speed ${r.v}: widest ${r.widest}  (limit hw+8=${r.limit}, wall hw+9=${(r.hw+9).toFixed(1)}) ${r.widest < r.limit ? "OK road-follow holds" : "runs to runoff/wall"}`);
await browser.close();
