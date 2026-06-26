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

const files = [];
for (let i = 0; i < count; i++) {
  const frac = +(i / count).toFixed(3);
  try {
    await page.evaluate((frac) => {
      // jump() teleports the car to the lap fraction at speed, so its heading is
      // aligned with the track tangent (facing FORWARD); freeze holds it there.
      window.__apex.jump(frac, 22, 0);
      window.__apex.freeze(true);
      window.__apex.camera("chase");     // default chase follow-cam, looking forward
      window.__apex.hud(false);
    }, frac);
    await page.waitForTimeout(450);
    const f = path.join(outdir, `${id}-chase-${String(Math.round(frac * 100)).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  } catch (e) { errors.push(`frac ${frac}: ${e}`); }
}

await browser.close();
console.log(JSON.stringify({ id, count, files: files.length, outdir, errors: errors.slice(0, 5) }, null, 2));
