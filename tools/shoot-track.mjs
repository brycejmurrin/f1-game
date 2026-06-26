/* Screenshot harness for visual scenery verification.
 *   node tools/shoot-track.mjs <id> [outdir]
 * Loads the track via __apex, then captures a ring of views around the lap:
 *  - orbit shots at several lap fractions (az/el/dist) to inspect landmarks from
 *    all sides, and a couple of eye-level driver framings.
 * Writes PNGs to <outdir>/<id>-<label>.png (default scratchpad/shots).
 * Requires the static server running on :3456. */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const id = process.argv[2];
if (!id) { console.log("usage: node tools/shoot-track.mjs <id> [outdir]"); process.exit(1); }
const outdir = process.argv[3] || "/tmp/claude-0/-home-user-f1-game/948d3bdd-9d85-501e-94e5-40b57d4094b5/scratchpad/shots";
fs.mkdirSync(outdir, { recursive: true });
const PORT = process.env.PORT || "3456";

// frac, az(deg), el(deg), dist(m) — a tour around the lap from varied angles.
const SHOTS = [
  ["q0-orbit",  0.00,  45, 20, 120],
  ["q1-orbit",  0.25, 135, 18, 130],
  ["q2-orbit",  0.50, 225, 20, 140],
  ["q3-orbit",  0.75, 315, 16, 120],
  ["start-low", 0.00,  20,  6,  70],
  ["high-wide", 0.50, 180, 45, 320],
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
await page.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (window.__apex) { clearInterval(t); r(); } }, 50);
}));
await page.evaluate((id) => window.__apex.race(id), id);
await page.waitForTimeout(2500); // track load + meshes

const meta = await page.evaluate(() => {
  try { return { tracks: window.__apex.tracks().length, ok: true }; } catch (e) { return { ok: false, err: String(e) }; }
});

for (const [label, frac, az, el, dist] of SHOTS) {
  try {
    await page.evaluate(([frac, az, el, dist]) => {
      window.__apex.park(frac);
      window.__apex.hud(false);
      window.__apex.orbit(frac, az, el, dist);
    }, [frac, az, el, dist]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outdir, `${id}-${label}.png`) });
  } catch (e) { errors.push(`${label}: ${e}`); }
}

await browser.close();
console.log(JSON.stringify({ id, meta, shots: SHOTS.map((s) => s[0]), errors }, null, 2));
