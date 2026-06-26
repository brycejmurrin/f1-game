/* Chase-camera tour around a lap: park the car at a series of lap fractions and
 * capture the default CHASE follow-cam at each, the way a player sees the track.
 *   node tools/shoot-chase.mjs <id> [outdir] [count]
 * Server must be running (PORT env, default 3456). */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const id = process.argv[2] || "montreal";
const outdir = process.argv[3] || `/tmp/claude-0/-home-user-f1-game/948d3bdd-9d85-501e-94e5-40b57d4094b5/scratchpad/chase/${id}`;
const count = parseInt(process.argv[4] || "12", 10);
const PORT = process.env.PORT || "3456";
fs.mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
await page.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (window.__apex) { clearInterval(t); r(); } }, 50);
}));
await page.evaluate((id) => window.__apex.race(id), id);
await page.waitForTimeout(2500);

// Use the built-in lap tour to get evenly-spaced fractions, then frame each with
// the built-in dolly() free-cam set BEHIND the point looking FORWARD down the
// track — a clean forward chase view without the low gameplay framing.
const fracs = await page.evaluate((count) => {
  window.__apex.hud(false);
  return window.__apex.tourShots(count).map((s) => s.frac);
}, count);

const files = [];
for (const frac of fracs) {
  try {
    await page.evaluate((frac) => {
      // dolly: 24 m behind the point, 4.5 m up, looking ~0.02 lap ahead (forward).
      window.__apex.dolly(frac, -24, 0, 4.5, { lookF: frac + 0.02, lookH: 1.2, fov: 60 });
      window.__apex.hud(false);
    }, frac);
    await page.waitForTimeout(350);
    const f = path.join(outdir, `${id}-fwd-${String(Math.round(frac * 100)).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  } catch (e) { errors.push(`frac ${frac}: ${e}`); }
}

await browser.close();
console.log(JSON.stringify({ id, count, files: files.length, outdir, errors: errors.slice(0, 5) }, null, 2));
