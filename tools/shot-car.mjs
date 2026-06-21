import { chromium } from "playwright";
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3456";
const browser = await chromium.launch({ executablePath: EXEC, args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 506 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await page.goto(BASE + "/");
await page.locator("#mb-race").click();
await page.locator("#sel-go").click();
await page.locator("#rs-go").click();
await page.waitForFunction(() => window.__apex && window.__apex.info().track != null);
// park the player on a straight at a standstill for a clean, framed shot of the car
await page.evaluate(() => window.__apex.park(0.0));
await page.waitForTimeout(1200);   // let the chase camera settle behind the car
await page.screenshot({ path: "/tmp/car-static.png" });
// a moving shot to exercise wheel spin + a steered shot
await page.evaluate(() => { window.__apex.jump(0.0, 30, 0); window.__apex.setInput({ steer: 1, throttle: true }); window.__apex.step(1/60, 20); });
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/car-moving.png" });
console.log("console errors:", errs.filter((e) => !e.includes("favicon")).slice(0, 5));
console.log("done");
await browser.close();
