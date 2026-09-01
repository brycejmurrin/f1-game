#!/usr/bin/env node
// Deterministic scene screenshot via __apex camera hooks + headless Chromium.
// Usage:
//   node tools/capture/shot.mjs <trackId> <frac> [cam] [out.png]
//     [--az N] [--el N] [--dist N] [--side -1|1] [--hud] [--tod day|dusk|dawn|night]
//
// cam = park | eye | orbit | cinematic | trackside   (default: orbit)
//
// Free-cam modes (eye/orbit/cinematic/trackside) set G.dbgCam instantly —
// NEVER call snapCam() after them (it clears dbgCam back to chase). Only
// `park` uses snapCam, because the chase camera eases.
//
// When assets/pack has baked models, this waits for Assets.loadModels() and
// rebuilds the race once they are resident so scenery()'s bakedModel() calls
// actually emit geometry (boot's first loadTrack can race the prefetch).
//
// Screenshots use page.screenshot({ clip: canvas box }), not locator.screenshot:
// a continuously-animating WebGL canvas never passes Playwright's stability
// check (survey-track.mjs has the same idiom).

import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../harness.mjs";
import {
  assertSafePathToken,
  resolveRepoDefault,
} from "../output-paths.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return fallback;
  return argv[i + 1];
}
function has(argv, name) {
  return argv.includes(name);
}

const argv = process.argv.slice(2);
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    if (argv[i] !== "--hud" && i + 1 < argv.length && !argv[i + 1].startsWith("--")) i++;
    continue;
  }
  positionals.push(argv[i]);
}
const [trackId = "monza", fracArg = "0.1", cam = "orbit", outArg] = positionals;

const safeTrackId = assertSafePathToken(trackId, "track id");
const safeCam = assertSafePathToken(cam, "camera");
const frac = parseFloat(fracArg);
const az = parseFloat(flag(argv, "--az", "45"));
const el = parseFloat(flag(argv, "--el", "18"));
const dist = parseFloat(flag(argv, "--dist", "45"));
// Boot budget, seconds. Default 120: generous on a fast box, survivable on a
// loaded container where a cold boot is ~45 s.
const WAIT_MS = Math.max(5, parseFloat(flag(argv, "--wait", "120"))) * 1000;
const side = parseInt(flag(argv, "--side", "1"), 10) || 1;
const tod = flag(argv, "--tod", "day");
const showHud = has(argv, "--hud");

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

const srv = await startStaticServer(ROOT);

try {
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto(srv.url);
  // 10 s was the boot budget of a fast box. A cold navigation on a loaded
  // 4-core container costs ~45 s just to define the globals (measured
  // 2026-09-01, docs/TESTING.md "A boot is 45 s now"), so this tool failed with
  // a bare "page.waitForFunction: Timeout 10000ms exceeded" that reads like a
  // broken page rather than a short bound. --wait=SECONDS overrides.
  await page.waitForFunction(() => window.__apex != null, null, { timeout: WAIT_MS, polling: 100 });

  // Prefer models resident BEFORE the track build so bakedModel() emits.
  const modelInfo = await page.evaluate(async () => {
    if (typeof Assets === "undefined" || !Assets.loadModels) return { n: 0 };
    try {
      const n = await Assets.loadModels();
      return { n, ids: Assets.models() };
    } catch (e) {
      return { n: 0, err: String(e) };
    }
  });

  await page.evaluate((id) => window.__apex.race(id), safeTrackId);
  await page.waitForFunction(
    () => window.__apex.info().track != null,
    null, { timeout: WAIT_MS, polling: 100 }
  );
  await sleep(1200);

  const frame = await page.evaluate(
    ({ frac, cam, az, el, dist, side, tod, showHud }) => {
      const a = window.__apex;
      a.go();
      a.park(frac);
      a.freeze(true);
      if (a.setTimeOfDay) a.setTimeOfDay(tod);
      if (a.hud) a.hud(!!showHud);

      // Free-cam hooks — no snapCam (that clears dbgCam).
      if (cam === "eye") a.eyeAt(frac, 0, 2.5);
      else if (cam === "orbit") a.orbit(frac, az, el, dist);
      else if (cam === "cinematic") a.cinematic(frac, { dist, el });
      else if (cam === "trackside")
        a.view({ s: frac, side, dist, height: Math.max(3, el * 0.35), look: "in" });
      else a.snapCam(); // park/chase only

      a.step && a.step(1 / 60, 4);
      const vs = a.viewState ? a.viewState() : null;
      const cs = a.camState ? a.camState() : null;
      return {
        camera: a.camera(),
        dbgCamActive: !!(vs && vs.dbgCamActive) || !!(cs && cs.debug),
        models: typeof Assets !== "undefined" && Assets.models ? Assets.models().length : 0,
        camState: cs,
      };
    },
    { frac, cam: safeCam, az, el, dist, side, tod, showHud }
  );

  await sleep(400);

  // boundingBox() THROWS on timeout, it does not return null — so the full-frame
  // fallback below could never fire, and a loaded box (where the animating canvas
  // starves Playwright's stability check) failed the whole shot instead of just
  // losing the clip. Catch it and fall through: an unclipped frame still shows
  // the scene, which is the point of the tool.
  const box = await page.locator("canvas#game").boundingBox({ timeout: 15000 })
    .catch(() => null);
  const buf = box
    ? await page.screenshot({ path: out, clip: box, timeout: 60000 })
    : await page.screenshot({ path: out, timeout: 60000 });
  const kb = (buf.length / 1024).toFixed(1);
  const warn = buf.length < 5000 ? "  ⚠ looks blank (<5KB)" : "";
  const camWarn = safeCam !== "park" && !frame.dbgCamActive
    ? "  ⚠ free-cam inactive (chase?)"
    : "";
  console.log(`wrote ${out} (${kb} KB)${warn}${camWarn}`);
  console.log(JSON.stringify({ modelsPrefetch: modelInfo, frame }, null, 2));
} catch (err) {
  console.error("shot failed:", err.message);
  process.exitCode = 1;
} finally {
  await shutdown();
}
