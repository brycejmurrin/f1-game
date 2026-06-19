import { chromium } from "playwright";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3456";

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
const page = await ctx.newPage();
await page.goto(BASE + "/");
await page.locator("#mb-race").click();
await page.locator("#sel-go").click();
await page.locator("#rs-go").click();
await page.waitForFunction(() => window.__apex && window.__apex.info().track != null);

// find a real corner and start the race there at speed, centred, no input
const corners = await page.evaluate(() => window.__apex.corners());
const frac = corners.length ? corners[0] : 0.15;
await page.evaluate(() => window.__apex.go());
await page.evaluate((f) => window.__apex.jump(f, 55, 0), frac);

// sample lateral offset over ~1s of no-steer driving
const xs = [];
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(170);
  const x = await page.evaluate(() => window.__apex.cars().find((c) => c.p).x);
  xs.push(+x.toFixed(2));
}
console.log("corner frac:", frac);
console.log("player x over time (no steering):", xs.join(" -> "));
const moved = Math.abs(xs[xs.length - 1] - xs[0]);
console.log(moved > 1.0 ? "PASS: car drifts off line without steering (" + moved.toFixed(1) + " m)"
                        : "FAIL: car barely moved (" + moved.toFixed(1) + " m) — still auto-following");

await browser.close();
