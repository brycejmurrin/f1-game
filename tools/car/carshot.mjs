#!/usr/bin/env node
// carshot — one tiny car-inspection render. Boots headless, parks the player,
// @doc Cropped studio-orbit car JPEG, self-booting: `carshot.mjs [az] [tod] [teamIdx] [out]` → `artifacts/tmp/carshot.jpg`.
// @skill playwright-probe / car-viewer
// raises the __apex.studio() rig, orbits the car, and writes a small cropped
// JPEG (~5 KB). The cheap way to eyeball the car
// model without a full-frame screenshot pipeline.
//
//   node tools/car/carshot.mjs [az] [tod] [teamIdx] [outPath]
//   node tools/car/carshot.mjs 40 night 2 artifacts/tmp/car.jpg
//   node tools/car/carshot.mjs 130 day 1          # ferrari, day, default out
//
// az: orbit azimuth (0 = behind, 180 = head-on). tod: day|dusk|night|default.
// teamIdx: Teams.LIST index (0 merc, 1 ferrari, 2 mclaren, ...).

import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

const az = Number(process.argv[2] ?? 40);
const tod = process.argv[3] || "day";
const teamIdx = Number(process.argv[4] ?? 2);
const defaultOut = join(ROOT, "artifacts", "tmp", "carshot.jpg");
mkdirSync(join(ROOT, "artifacts", "tmp"), { recursive: true });
const out = process.argv[5] || defaultOut;

const srv = await startStaticServer(ROOT);
try {
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-background-timer-throttling"],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.addInitScript((i) => localStorage.setItem("apex26.team", String(i)), teamIdx);
  page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 150)));
  await page.goto(srv.url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 30000 });
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

  const rep = await page.evaluate(() => {
    const cv = document.querySelector("canvas");
    return { w: cv.width, h: cv.height };
  });
  console.log(`carshot → ${out} (${(statSync(out).size / 1024).toFixed(1)} KB)  az=${az} tod=${tod} team=${teamIdx} canvas=${rep.w}x${rep.h}`);
} finally {
  await shutdown();
}
process.exit(0);
