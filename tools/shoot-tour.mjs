/* Dense whole-lap tour, multiple cameras per point, for scenery review.
 *   node tools/shoot-tour.mjs <id> [outdir] [N]
 * N points around the lap (default 36 = every 10°). At each point captures:
 *   <id>-NN-a-fwd.png  forward chase (dolly behind, looking ahead)
 *   <id>-NN-b-orb.png  orbit (alternating side, the built-in tourShots angle)
 * Server must be running (PORT env, default 3456). */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const id = process.argv[2] || "montreal";
const outdir = process.argv[3] || `/home/user/f1-game/.shots/tour_${id}`;
const N = parseInt(process.argv[4] || "36", 10);
const PORT = process.env.PORT || "3456";
fs.mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
await page.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (window.__apex) { clearInterval(t); r(); } }, 50);
}));
await page.evaluate((id) => window.__apex.race(id), id);
await page.waitForTimeout(2500);

const shots = await page.evaluate((N) => {
  window.__apex.hud(false);
  return window.__apex.tourShots(N, { dist: 95, el: 22 });
}, N);

const files = [];
let i = 0;
for (const s of shots) {
  const nn = String(i).padStart(2, "0");
  const deg = Math.round((s.frac * 360));
  // (a) forward chase
  try {
    await page.evaluate((frac) => {
      window.__apex.dolly(frac, -24, 0, 4.5, { lookF: frac + 0.02, lookH: 1.2, fov: 60 });
      window.__apex.hud(false);
    }, s.frac);
    await page.waitForTimeout(280);
    const f = path.join(outdir, `${id}-${nn}-${String(deg).padStart(3, "0")}deg-a-fwd.png`);
    await page.screenshot({ path: f }); files.push(f);
  } catch (e) { errors.push(`${nn} fwd: ${e}`); }
  // (b) orbit (built-in tour angle)
  try {
    await page.evaluate((s) => {
      window.__apex.orbit(s.frac, s.az, s.el, s.dist);
      window.__apex.hud(false);
    }, s);
    await page.waitForTimeout(280);
    const f = path.join(outdir, `${id}-${nn}-${String(deg).padStart(3, "0")}deg-b-orb.png`);
    await page.screenshot({ path: f }); files.push(f);
  } catch (e) { errors.push(`${nn} orb: ${e}`); }
  i++;
}

await browser.close();
console.log(JSON.stringify({ id, points: shots.length, files: files.length, outdir, errors: errors.slice(0, 6) }, null, 2));
