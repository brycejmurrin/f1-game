import { chromium } from "playwright";
import { mkdirSync } from "fs";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3456";
const OUT  = "/tmp/cam-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXEC, args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));

// Choose track, lap position and weather for the shots
const TRACK   = process.argv[2] || "monaco";
const FRAC    = parseFloat(process.argv[3] ?? "0.3");
const SPEED   = parseFloat(process.argv[4] ?? "55");
const WEATHER = process.argv[5] || "dry";

await page.goto(BASE + "/");
await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
await page.evaluate(([t, w]) => window.__apex.race(t, "day", w), [TRACK, WEATHER]);
await page.waitForFunction(() => window.__apex.info().state === "race", { timeout: 8000 });
await page.evaluate(() => window.__apex.go());
await page.evaluate(([f, s]) => window.__apex.jump(f, s, 0), [FRAC, SPEED]);

// Capture every camera mode
const modes = await page.evaluate(() => window.__apex.camera().modes);
console.log(`Track: ${TRACK}  frac: ${FRAC}  speed: ${SPEED}  weather: ${WEATHER}`);
console.log(`Modes: ${modes.join(", ")}\n`);

for (const m of modes) {
  await page.evaluate((id) => window.__apex.camera(id), m);
  await page.evaluate(() => window.__apex.step(1 / 60, 60));  // let damping settle
  await page.waitForTimeout(200);
  const file = `${OUT}/${m}.png`;
  await page.screenshot({ path: file });
  console.log(`  ✓ ${m.padEnd(12)} → ${file}`);
}

if (errs.length) console.warn("\nPage errors:", errs.slice(0, 5));
await browser.close();
console.log(`\nDone. ${modes.length} screenshots in ${OUT}/`);
