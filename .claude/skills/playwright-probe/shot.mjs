#!/usr/bin/env node
// Deterministic scene screenshot via __apex camera hooks + headless Chromium.
// Usage: node .claude/skills/playwright-probe/shot.mjs <trackId> <frac> [cam] [out.png]
//   cam = park | eye | orbit | cinematic | trackside   (default: orbit)
// Boots a static server, waits for __apex, freezes, frames the camera, writes PNG.
// Default output path: scratch/captures/playwright-probe/<track>-<pct>-<cam>.png

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../../../tools/harness.mjs";
import {
  assertSafePathToken,
  resolveRepoDefault,
} from "../../../tools/output-paths.mjs";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

const [trackId = "monza", fracArg = "0.1", cam = "orbit", outArg] =
  process.argv.slice(2);
const safeTrackId = assertSafePathToken(trackId, "track id");
const safeCam = assertSafePathToken(cam, "camera");
const frac = parseFloat(fracArg);
const out = outArg
  ? resolve(outArg)
  : resolveRepoDefault(
      ROOT,
      "scratch",
      "captures",
      "playwright-probe",
      `${safeTrackId}-${Math.round(frac * 100)}-${safeCam}.png`
    );

mkdirSync(dirname(out), { recursive: true });

// Static server runs in THIS process (see tools/harness.mjs) — a spawned
// `python3 -m http.server` outlived every signalled run.
const srv = await startStaticServer(ROOT);

try {
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null, { timeout: 10_000 });

  await page.evaluate((id) => window.__apex.race(id), safeTrackId);
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
} catch (err) {
  console.error("shot failed:", err.message);
  process.exitCode = 1;
} finally {
  await shutdown(); // browser + server, on the throw path too
}
