// Survey a circuit with the debug camera and save inspection shots the agent can read.
// Usage: node tools/survey-track.mjs <trackId> <label> [baseUrl]
// Saves /tmp/survey-<id>-<label>-{aerial,s00,s25,s50,s75}.png
import { chromium } from "playwright";
const [, , id, label = "before", base = "http://localhost:3456"] = process.argv;
if (!id) { console.error("usage: survey-track.mjs <id> <label> [base]"); process.exit(2); }
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXEC, args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
await page.goto(base + "/");
await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
// race the track, retry if a concurrent edit briefly broke the page
let ok = false;
for (let t = 0; t < 5 && !ok; t++) {
  await page.evaluate((tid) => window.__apex.race(tid, "day", "dry"), id);
  ok = await page.waitForFunction(() => window.__apex.info().state === "race" && window.__apex.info().track != null, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!ok) await page.waitForTimeout(500);
}
if (!ok) { console.error("FAILED to enter race for " + id + " (scenery may throw)"); await browser.close(); process.exit(1); }
await page.evaluate(() => window.__apex.hud(false));
async function shot(name, viewArg) {
  await page.evaluate((v) => window.__apex.view(v), viewArg);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `/tmp/survey-${id}-${label}-${name}.png` });
}
await shot("aerial", { elevation: 60, azimuth: 35, zoom: 1.1 });
await shot("s00", { s: 0.0, side: "L", dist: 16, height: 10 });
await shot("s25", { s: 0.25, side: "R", dist: 16, height: 10 });
await shot("s50", { s: 0.5, side: "L", dist: 16, height: 10 });
await shot("s75", { s: 0.75, side: "R", dist: 16, height: 10 });
console.log(`survey ${id} ${label}: OK (pageerrors: ${errs.length})`);
if (errs.length) console.log(errs.slice(0, 3).join(" | "));
await browser.close();
