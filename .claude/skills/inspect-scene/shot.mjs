#!/usr/bin/env node
// Deterministic scene screenshot via __apex camera hooks + headless Chromium.
// Usage: node .claude/skills/inspect-scene/shot.mjs <trackId> <frac> [cam] [out.png]
//   cam = park | eye | orbit | cinematic | trackside   (default: orbit)
// Boots a static server, waits for __apex, freezes, frames the camera, writes PNG.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [trackId = "monza", fracArg = "0.1", cam = "orbit", outArg] =
  process.argv.slice(2);
const frac = parseFloat(fracArg);
const out = resolve(outArg || `scratch/${trackId}-${Math.round(frac * 100)}-${cam}.png`);
const PORT = 3457;
const ROOT = resolve(process.cwd());

mkdirSync(dirname(out), { recursive: true });

// Static server (python3 http.server matches the Playwright config webServer).
const server = spawn("python3", ["-m", "http.server", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
});
const done = () => { try { server.kill(); } catch {} };
process.on("exit", done);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await sleep(700); // let the server come up
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__apex != null, { timeout: 10_000 });

  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(
    () => window.__apex.info().track != null,
    { timeout: 15_000 }
  );
  await sleep(1500); // mesh build + first frames

  await page.evaluate(
    ({ frac, cam }) => {
      const a = window.__apex;
      a.park(frac);
      a.freeze(true);
      if (cam === "eye") a.eyeAt(frac, 0, 2.5);
      else if (cam === "orbit") a.orbit(frac, 45, 18, 45);
      else if (cam === "cinematic") a.cinematic(frac);
      else if (cam === "trackside")
        a.view({ s: frac, side: 1, dist: 25, height: 6, look: "in" });
      // "park" leaves the default chase framing
    },
    { frac, cam }
  );
  await sleep(500); // settle camera + render

  const buf = await page.locator("canvas#game").screenshot({ path: out });
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`wrote ${out} (${kb} KB)` + (buf.length < 5000 ? "  ⚠ looks blank (<5KB)" : ""));

  await browser.close();
} catch (err) {
  console.error("shot failed:", err.message);
  process.exitCode = 1;
} finally {
  done();
}
