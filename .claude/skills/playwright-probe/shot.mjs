#!/usr/bin/env node
// Deterministic scene screenshot via __apex camera hooks + headless Chromium.
// Usage: node .claude/skills/playwright-probe/shot.mjs <trackId> <frac> [cam] [out.png]
//   cam = park | eye | orbit | cinematic | trackside   (default: orbit)
// Boots a static server, waits for __apex, freezes, frames the camera, writes PNG.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const [trackId = "monza", fracArg = "0.1", cam = "orbit", outArg] =
  process.argv.slice(2);
const frac = parseFloat(fracArg);
const out = resolve(outArg || `scratch/${trackId}-${Math.round(frac * 100)}-${cam}.png`);

mkdirSync(dirname(out), { recursive: true });

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}

function pickChromium() {
  for (const p of ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"])
    if (existsSync(p)) return p;
  return undefined; // fall back to playwright's bundled build
}

const PORT = await freePort();

// Static server (python3 http.server matches the Playwright config webServer).
const server = spawn("python3", ["-m", "http.server", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
});
const done = () => { try { server.kill(); } catch {} };
process.on("exit", done);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Progress goes to stderr, timestamped, so a redirected/tailed log shows live
// progress instead of staying empty until the single log line at the end.
const t0 = Date.now();
const log = (msg) => process.stderr.write(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}\n`);

try {
  log(`server up on :${PORT}, waiting ~0.7s for it to settle`);
  await sleep(700); // let the server come up
  log(`launching chromium (${pickChromium() || "bundled playwright build"})`);
  const browser = await chromium.launch({
    executablePath: pickChromium(),
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  log(`navigating to http://127.0.0.1:${PORT}/`);
  await page.goto(`http://127.0.0.1:${PORT}/`);
  log(`waiting for window.__apex…`);
  await page.waitForFunction(() => window.__apex != null, { timeout: 10_000 });

  log(`loading track "${trackId}"…`);
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(
    () => window.__apex.info().track != null,
    { timeout: 15_000 }
  );
  log(`track loaded, settling ~1.5s for mesh build + first frames`);
  await sleep(1500); // mesh build + first frames

  log(`framing camera: frac=${frac} cam=${cam}`);
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
  log(`settling ~0.5s for camera + render`);
  await sleep(500); // settle camera + render

  log(`capturing screenshot -> ${out}`);
  const buf = await page.locator("canvas#game").screenshot({ path: out });
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`wrote ${out} (${kb} KB)` + (buf.length < 5000 ? "  ⚠ looks blank (<5KB)" : ""));

  await browser.close();
  log(`done`);
} catch (err) {
  log(`FAILED: ${err.message}`);
  console.error("shot failed:", err.message);
  process.exitCode = 1;
} finally {
  done();
}
