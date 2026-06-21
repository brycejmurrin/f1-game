import { chromium } from "playwright";
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3456";

const browser = await chromium.launch({ executablePath: EXEC, args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
const page = await ctx.newPage();
await page.goto(BASE + "/");
await page.locator("#mb-race").click();
await page.locator("#sel-go").click();
await page.locator("#rs-go").click();
await page.waitForFunction(() => window.__apex && window.__apex.info().track != null);
await page.evaluate(() => window.__apex.go());
await page.evaluate(() => window.__apex.jump(0.0, 50, 0));

// hold throttle so the car drives (DRIVING-HELP assist steers); sample state
await page.keyboard.down("KeyW");
let prevProg = null, ok = true, finite = true, totalGain = 0;
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => {
    const c = window.__apex.cars().find((c) => c.p);
    return { x: c.x, prog: c.prog, speed: c.speed };
  });
  if (![st.x, st.prog, st.speed].every(Number.isFinite)) finite = false;
  if (prevProg != null) totalGain += st.prog - prevProg;
  prevProg = st.prog;
}
await page.keyboard.up("KeyW");
console.log("finite state throughout:", finite);
console.log("total progress over ~3s holding throttle:", totalGain.toFixed(1), "m");
// finite state = no NaN/blow-up; >50 m forward = not stuck/spinning in place
// (holding throttle into Turn 1 runs wide onto grass, so it won't hit full speed).
console.log(finite && totalGain > 50 ? "PASS: stable, continuous forward motion with combined-slip"
                                     : "FAIL: instability or stuck");
await browser.close();
