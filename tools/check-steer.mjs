import { chromium } from "playwright";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3456";

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});

async function run(label, holdKey) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await page.locator("#rs-go").click();
  await page.waitForFunction(() => window.__apex && window.__apex.info().track != null);

  const corners = await page.evaluate(() => window.__apex.corners());
  const frac = corners.length ? corners[0] : 0.15;
  await page.evaluate(() => window.__apex.go());
  // enter the corner at a sensible speed, centred
  await page.evaluate((f) => window.__apex.jump(f, 38, 0), frac);
  if (holdKey) await page.keyboard.down(holdKey);

  const xs = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(150);
    const x = await page.evaluate(() => window.__apex.cars().find((c) => c.p).x);
    xs.push(+x.toFixed(2));
  }
  if (holdKey) await page.keyboard.up(holdKey);
  const moved = Math.abs(xs[xs.length - 1] - xs[0]);
  console.log(label + ": x " + xs.join(" -> ") + "  (|moved| " + moved.toFixed(1) + " m)");
  await ctx.close();
  return moved;
}

const noSteer = await run("NO STEER ", null);
const steerIn = await run("STEER IN ", "KeyA");   // steer left toward apex
const steerOut = await run("STEER OUT", "KeyD");   // steer right (wrong way)

console.log(noSteer > 1.5 ? "PASS: not steering runs you wide (not on-rails)"
                          : "FAIL: car still follows the corner without input");
console.log("Steering clearly changes the line: in=" + steerIn.toFixed(1) +
            " vs out=" + steerOut.toFixed(1) + " vs none=" + noSteer.toFixed(1));

await browser.close();
