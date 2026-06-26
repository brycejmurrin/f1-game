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

// Each shot is either an orbit (az/el/dist around a lap point) or an eye-level
// ground view (eyeAt: frac/lat/height). A wide tour catches ground gaps, water,
// floating buildings and blandness from many directions.
// type "o": [label, "o", frac, az(deg), el(deg), dist(m)]
// type "e": [label, "e", frac, lat(m), height(m)]
const SHOTS = [
  ["o-f00-a045", "o", 0.00,  45, 18, 120],
  ["o-f12-a200", "o", 0.12, 200, 16, 130],
  ["o-f25-a135", "o", 0.25, 135, 20, 140],
  ["o-f38-a300", "o", 0.38, 300, 16, 120],
  ["o-f50-a225", "o", 0.50, 225, 22, 150],
  ["o-f62-a020", "o", 0.62,  20, 16, 130],
  ["o-f75-a315", "o", 0.75, 315, 18, 120],
  ["o-f88-a160", "o", 0.88, 160, 20, 140],
  ["eye-f00",    "e", 0.00,  0,  3.5],
  ["eye-f30",    "e", 0.30,  0,  3.5],
  ["eye-f55",    "e", 0.55,  0,  3.5],
  ["eye-f80",    "e", 0.80,  0,  3.5],
  ["topdown",    "o", 0.50, 180, 78, 420],
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

for (const shot of SHOTS) {
  const [label, type] = shot;
  try {
    await page.evaluate((shot) => {
      const [, type, frac, a, b, c] = shot;
      window.__apex.park(frac);
      window.__apex.hud(false);
      if (type === "e") window.__apex.eyeAt(frac, a, b);
      else window.__apex.orbit(frac, a, b, c);
    }, shot);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outdir, `${id}-${label}.png`) });
  } catch (e) { errors.push(`${label}: ${e}`); }
}

await browser.close();
console.log(JSON.stringify({ id, meta, shots: SHOTS.map((s) => s[0]), errors }, null, 2));
