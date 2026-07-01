#!/usr/bin/env node
// carshot — one tiny car-inspection render. Boots headless, parks the player,
// raises the __apex.studio() rig, orbits the car, and writes a small cropped
// JPEG (~5 KB) plus a numeric paint report. The cheap way to eyeball the car
// model without a full-frame screenshot pipeline.
//
//   node tools/carshot.mjs [az] [tod] [teamIdx] [outPath]
//   node tools/carshot.mjs 40 night 2 /tmp/car.jpg
//   node tools/carshot.mjs 130 day 1          # ferrari, day, default out
//
// az: orbit azimuth (0 = behind, 180 = head-on). tod: day|dusk|night|default.
// teamIdx: Teams.LIST index (0 merc, 1 ferrari, 2 mclaren, ...).

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const az = Number(process.argv[2] ?? 40);
const tod = process.argv[3] || "day";
const teamIdx = Number(process.argv[4] ?? 2);
const out = process.argv[5] || "/tmp/carshot.jpg";

const port = await new Promise((res) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
});
const srv = spawn("npx", ["serve", "-l", String(port), "."], { cwd: ROOT, stdio: "ignore" });
await sleep(1500);
const exe = ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ["--use-gl=angle"] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.addInitScript((i) => localStorage.setItem("apex26.team", String(i)), teamIdx);
page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 150)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__apex, null, { timeout: 30000 });
await page.evaluate(() => __apex.race("monza"));
await sleep(2500);
if (tod !== "default") {
  await page.evaluate((t) => __apex.setTimeOfDay(t), tod);
  await sleep(2200);
}
await page.evaluate(() => __apex.park(0.55));
await sleep(300);
await page.evaluate(() => { __apex.studio(); __apex.hud(false); });
await page.evaluate((a) => __apex.carOrbit(0, a, 9, 4.2), az);
await sleep(400);
// Crop to the car (it fills the frame centre at 4.2 m) and keep the file tiny.
await page.screenshot({ path: out, type: "jpeg", quality: 62,
  clip: { x: 96, y: 40, width: 288, height: 190 } });

// Numeric paint report over the crop
const rep = await page.evaluate(() => {
  const cv = document.querySelector("canvas");
  return { w: cv.width, h: cv.height };
});
const fs = await import("node:fs");
console.log(`carshot → ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)  az=${az} tod=${tod} team=${teamIdx} canvas=${rep.w}x${rep.h}`);
await browser.close();
srv.kill();
process.exit(0);
