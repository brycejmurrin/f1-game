import { chromium } from "playwright";
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3456";
const browser = await chromium.launch({ executablePath: EXEC, args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(BASE + "/");
await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
await page.evaluate(() => window.__apex.race("monaco", "day", "dry"));
await page.waitForFunction(() => window.__apex.info().state === "race", { timeout: 8000 });
await page.evaluate(() => window.__apex.go());
await page.evaluate(() => window.__apex.jump(0.3, 55, 0));
for (const m of ["overhead", "heli", "reverse", "side", "cinematic"]) {
  const set = await page.evaluate((id) => window.__apex.camera(id), m);
  await page.evaluate(() => window.__apex.step(1/60, 30));  // let damping settle + car move
  await page.waitForTimeout(250);
  await page.screenshot({ path: `/tmp/cam-${m}.png` });
  console.log(`cam ${m}: ${set}`);
}
console.log("pageerrors:", errs.slice(0, 3));
await browser.close();
