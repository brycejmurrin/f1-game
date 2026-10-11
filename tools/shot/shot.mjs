#!/usr/bin/env node
// Deterministic scene screenshot via __apex camera hooks + headless Chromium.
// @doc One deterministic framed screenshot via `__apex` camera hooks: `shot.mjs <trackId> <frac> [cam] [out.png]`.
// @skill playwright-probe
// Usage:
//   node tools/shot/shot.mjs <trackId> <frac> [cam] [out.png]
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
import { exitIfHelp } from "../lib/cli-args.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../lib/harness.mjs";
import {
  assertSafePathToken,
  resolveRepoDefault,
} from "../lib/output-paths.mjs";
import sharp from "sharp";
import { awaitPresentedFrame, screenshotPresentedCanvas } from "./probe-page.mjs";

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
exitIfHelp(argv, `usage: node tools/shot/shot.mjs <trackId> <frac> [cam] [out.png] [--az N] [--el N] [--dist N] [--side -1|1] [--tod day|dusk|dawn|night] [--hud] [--team <id>]
  One deterministic framed screenshot via the __apex camera hooks (boots its own server + Chromium; TLX unless pinned).
  cam: park | eye | orbit | cinematic | trackside. Default out: scratch/captures/playwright-probe/<track>-<frac%>-<cam>.png`);
const TEAM = flag(argv, "--team", null);
// Team ORDER is the roster order in js/data/teams.js, which is what the stored
// index means. Read from the source rather than duplicated here.
function teamIdsFromSource() {
  const src = readFileSync(new URL("../../js/data/teams.js", import.meta.url), "utf8");
  return Array.from(src.matchAll(/^ *id: "([a-z]+)",/gm)).map((m) => m[1]);
}
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
  // --team <id>: whose car is on track. The CAR STUDIO renders any team, but
  // this tool could only shoot whichever team the profile happened to hold, so
  // "does this livery read from a race camera?" was unanswerable per team. The
  // index has to be in storage BEFORE the page evaluates: game.js reads
  // apex26.team once, at eval time, into teamIdx — setting the store after boot
  // updates the store and not the player's car, which is how the first attempt
  // shot four identical orange cars.
  if (TEAM) {
    const ids = teamIdsFromSource();
    const idx = ids.indexOf(TEAM);
    if (idx < 0) { console.error(`unknown team "${TEAM}" — one of: ${ids.join(", ")}`); process.exit(2); }
    await page.addInitScript((i) => {
      try { localStorage.setItem("apex26.team", String(i)); localStorage.setItem("apex26.driver", "0"); } catch (_) {}
    }, idx);
  }
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
      const dbgCamActive = !!(vs && vs.dbgCamActive) || !!(cs && cs.debug);
      // Free-cam (orbit/eye/…) leaves CamModes on the last game mode (often helmet);
      // echo the requested free-cam id so MCP / agents do not assert the wrong mode.
      const camera = a.camera();
      if (dbgCamActive && cam !== "park" && camera && typeof camera === "object") {
        camera.mode = cam;
        camera.freeCam = true;
      }
      return {
        camera,
        dbgCamActive,
        models: typeof Assets !== "undefined" && Assets.models ? Assets.models().length : 0,
        camState: cs,
      };
    },
    { frac, cam: safeCam, az, el, dist, side, tod, showHud }
  );

  await sleep(400);

  // A NEW frame, or no file. The first TLX present after the camera move
  // measured 17.6 s on SwiftShader at 1280x720 (2026-10-02); the helper's 8 s
  // default timed out silently and this saved the last blit — the menu's
  // garage, or an all-transparent canvas — as the requested frame, exit 0.
  const presentMs = Math.min(WAIT_MS, 90000);
  if (await awaitPresentedFrame(page, presentMs) === false) {
    throw new Error(`no new frame presented within ${presentMs / 1000} s of the camera move — ` +
      "refusing to save the previous blit as this frame (raise --wait on a loaded box)");
  }
  const shot = await screenshotPresentedCanvas(page, { path: out, skipAwait: true, timeout: 60000 }).catch(async () => {
    const buf = await page.screenshot({ path: out, timeout: 60000 });
    return { buf, bytes: buf.length };
  });
  const buf = shot.buf;
  const kb = (buf.length / 1024).toFixed(1);
  // Judge the pixels, not the byte count: an all-transparent 1280x720 PNG is
  // 20 KB and passed the old "<5KB looks blank" check.
  const st = await sharp(buf).stats();
  const spread = Math.max(...st.channels.slice(0, 3).map((c) => c.stdev));
  const opaque = st.channels.length < 4 || st.channels[3].max > 0;
  if (!opaque || spread < 2) {
    throw new Error(`wrote ${out} but it is blank (${opaque ? `pixel spread ${spread.toFixed(2)}` : "every pixel transparent"})`);
  }
  const camWarn = safeCam !== "park" && !frame.dbgCamActive
    ? "  ⚠ free-cam inactive (chase?)"
    : "";
  console.log(`wrote ${out} (${kb} KB, pixel spread ${spread.toFixed(1)})${camWarn}`);
  console.log(JSON.stringify({ modelsPrefetch: modelInfo, frame }, null, 2));
} catch (err) {
  console.error("shot failed:", err.message);
  process.exitCode = 1;
} finally {
  await shutdown();
}
