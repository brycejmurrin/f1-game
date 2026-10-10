#!/usr/bin/env node
// Deterministic scene screenshot via __apex camera hooks + headless Chromium.
// @doc One Chromium session for one or many framed shots (`--batch`); JPEG/raster modes for cheaper sweeps.
// @skill playwright-probe
// Usage:
//   node tools/shot/shot.mjs <trackId> <frac> [cam] [out.png|out.jpg]
//     [--az N] [--el N] [--dist N] [--side -1|1] [--hud] [--tod day|dusk|dawn|night]
//     [--jpeg] [--raster] [--team <id>] [--wait <s>]
//   node tools/shot/shot.mjs --batch jobs.json [--jpeg] [--raster]
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
// Screenshots use screenshotPresentedCanvas (soft/#game-soft → CDP), not
// locator.screenshot: a continuously-animating WebGL canvas never passes
// Playwright's stability check.

import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../lib/harness.mjs";
import sharp from "sharp";
import { awaitPresentedFrame, screenshotPresentedCanvas } from "./probe-page.mjs";
import {
  SHOT_USAGE,
  parseShotArgv,
  groupJobsByTrack,
} from "./shot-jobs.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

const argv = process.argv.slice(2);
exitIfHelp(argv, SHOT_USAGE);

let plan;
try {
  plan = parseShotArgv(argv, ROOT);
} catch (err) {
  console.error("shot:", err.message);
  process.exit(2);
}

// Team ORDER is the roster order in js/data/teams.js, which is what the stored
// index means. Read from the source rather than duplicated here.
function teamIdsFromSource() {
  const src = readFileSync(new URL("../../js/data/teams.js", import.meta.url), "utf8");
  return Array.from(src.matchAll(/^ *id: "([a-z]+)",/gm)).map((m) => m[1]);
}

async function pinTeam(page, team) {
  if (!team) return;
  const ids = teamIdsFromSource();
  const idx = ids.indexOf(team);
  if (idx < 0) {
    console.error(`unknown team "${team}" — one of: ${ids.join(", ")}`);
    process.exit(2);
  }
  await page.addInitScript((i) => {
    try {
      localStorage.setItem("apex26.team", String(i));
      localStorage.setItem("apex26.driver", "0");
    } catch (_) { /* ignore */ }
  }, idx);
}

async function raceTrack(page, trackId, waitMs) {
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(
    () => window.__apex.info().track != null,
    null, { timeout: waitMs, polling: 100 },
  );
  await sleep(1200);
}

async function frameCamera(page, job) {
  return page.evaluate(
    ({ frac, cam, az, el, dist, side, tod, showHud }) => {
      const a = window.__apex;
      a.go();
      a.park(frac);
      a.freeze(true);
      if (a.setTimeOfDay) a.setTimeOfDay(tod);
      if (a.hud) a.hud(!!showHud);

      if (cam === "eye") a.eyeAt(frac, 0, 2.5);
      else if (cam === "orbit") a.orbit(frac, az, el, dist);
      else if (cam === "cinematic") a.cinematic(frac, { dist, el });
      else if (cam === "trackside")
        a.view({ s: frac, side, dist, height: Math.max(3, el * 0.35), look: "in" });
      else a.snapCam();

      a.step && a.step(1 / 60, 4);
      const vs = a.viewState ? a.viewState() : null;
      const cs = a.camState ? a.camState() : null;
      const dbgCamActive = !!(vs && vs.dbgCamActive) || !!(cs && cs.debug);
      const camera = a.camera();
      if (dbgCamActive && cam !== "park" && camera && typeof camera === "object") {
        camera.mode = cam;
        camera.freeCam = true;
      }
      const raster = a.render ? a.render({ what: "view", cols: 48, rows: 18 }) : null;
      return {
        camera,
        dbgCamActive,
        models: typeof Assets !== "undefined" && Assets.models ? Assets.models().length : 0,
        camState: cs,
        raster,
      };
    },
    job,
  );
}

async function captureJob(page, job, waitMs, modelInfo) {
  const frame = await frameCamera(page, job);
  await sleep(400);

  if (job.raster) {
    mkdirSync(dirname(job.out), { recursive: true });
    const payload = {
      out: job.out.replace(/\.(png|jpe?g)$/i, ".raster.json"),
      trackId: job.trackId,
      frac: job.frac,
      cam: job.cam,
      raster: frame.raster,
      camera: frame.camera,
    };
    writeFileSync(payload.out, JSON.stringify(payload, null, 2));
    console.log(`wrote ${payload.out} (raster, no Chromium pixels)`);
    console.log(JSON.stringify({ modelsPrefetch: modelInfo, frame: { camera: frame.camera, dbgCamActive: frame.dbgCamActive } }, null, 2));
    return;
  }

  mkdirSync(dirname(job.out), { recursive: true });
  const presentMs = Math.min(waitMs, 90000);
  if (await awaitPresentedFrame(page, presentMs) === false) {
    throw new Error(`no new frame presented within ${presentMs / 1000} s of the camera move — ` +
      "refusing to save the previous blit as this frame (raise --wait on a loaded box)");
  }
  const shotOpts = {
    path: job.out,
    skipAwait: true,
    timeout: 60000,
    type: job.type,
  };
  if (job.type === "jpeg" && job.quality != null) shotOpts.quality = job.quality;
  const shot = await screenshotPresentedCanvas(page, shotOpts).catch(async () => {
    const buf = await page.screenshot({
      path: job.out,
      timeout: 60000,
      type: job.type === "jpeg" ? "jpeg" : "png",
      ...(job.type === "jpeg" ? { quality: job.quality ?? 85 } : {}),
    });
    return { buf, bytes: buf.length };
  });
  const buf = shot.buf;
  const kb = (buf.length / 1024).toFixed(1);
  const st = await sharp(buf).stats();
  const spread = Math.max(...st.channels.slice(0, 3).map((c) => c.stdev));
  const opaque = st.channels.length < 4 || st.channels[3].max > 0;
  if (!opaque || spread < 2) {
    throw new Error(`wrote ${job.out} but it is blank (${opaque ? `pixel spread ${spread.toFixed(2)}` : "every pixel transparent"})`);
  }
  const camWarn = job.cam !== "park" && !frame.dbgCamActive
    ? "  ⚠ free-cam inactive (chase?)"
    : "";
  console.log(`wrote ${job.out} (${kb} KB, ${job.type}, pixel spread ${spread.toFixed(1)})${camWarn}`);
  console.log(JSON.stringify({ modelsPrefetch: modelInfo, frame: { camera: frame.camera, dbgCamActive: frame.dbgCamActive, models: frame.models } }, null, 2));
}

const srv = await startStaticServer(ROOT);

try {
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });

  // Pin the first job's team (batch jobs with mixed teams need separate boots).
  const team = plan.jobs[0].team || plan.team;
  await pinTeam(page, team);

  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null, null, {
    timeout: plan.waitMs, polling: 100,
  });

  const modelInfo = await page.evaluate(async () => {
    if (typeof Assets === "undefined" || !Assets.loadModels) return { n: 0 };
    try {
      const n = await Assets.loadModels();
      return { n, ids: Assets.models() };
    } catch (e) {
      return { n: 0, err: String(e) };
    }
  });

  const groups = groupJobsByTrack(plan.jobs);
  if (plan.mode === "batch") {
    console.error(`[shot] batch: ${plan.jobs.length} job(s), ${groups.length} track boot(s), one Chromium`);
  }

  for (const group of groups) {
    await raceTrack(page, group.trackId, plan.waitMs);
    for (const job of group.jobs) {
      if (job.team && team && job.team !== team) {
        throw new Error(`batch mixes --team values (${team} vs ${job.team}); run separate batches per team`);
      }
      await captureJob(page, job, plan.waitMs, modelInfo);
    }
  }
} catch (err) {
  console.error("shot failed:", err.message);
  process.exitCode = 1;
} finally {
  await shutdown();
}
