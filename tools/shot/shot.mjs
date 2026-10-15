#!/usr/bin/env node
// Deterministic scene screenshot via __apex camera hooks + headless Chromium.
// @doc One Chromium session for one or many framed shots (`--batch`); JPEG/raster modes for cheaper sweeps.
// @skill playwright-probe
// Usage:
//   node tools/shot/shot.mjs <trackId> <frac> [cam] [out.png|out.jpg]
//     [--az N] [--el N] [--dist N] [--side -1|1] [--hud]
//     [--tod day|dusk|dawn|night] [--weather dry|wet|rain|overcast|fog|storm]
//     [--present-timeout S] [--capture-retries N]
//     [--jpeg] [--raster] [--team <id>] [--wait <s>] [--through]
//   node tools/shot/shot.mjs --batch jobs.json [--jpeg] [--raster]
//
// cam = park | eye | orbit | cinematic | trackside   (default: orbit)
//
// Free-cam modes (eye/orbit/cinematic/trackside) set G.dbgCam instantly —
// NEVER call snapCam() after them (it clears dbgCam back to chase). Only
// `park` uses snapCam, because the chase camera eases. orbit/cinematic/trackside
// step round terrain and props between eye and car (camera.clear says how far);
// --through keeps the asked-for placement even when it is blocked.
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
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import {
  launchChromium,
  shutdown,
  chromiumLaunchInfo,
  startStaticServer,
} from "../lib/harness.mjs";
import sharp from "sharp";
import { pixelEvidence, rendererEvidence } from "./capture-contract.mjs";
import { awaitCaptureReady, mutateCaptureScene, installProbeInit, screenshotPresentedCanvas } from "./probe-page.mjs";
import {
  SHOT_USAGE,
  parseShotArgv,
  groupJobsByTrack,
  isRetryableCaptureError,
} from "./shot-jobs.mjs";

import { captureContextOptions, captureLaunchOptions, applyCaptureProfile } from "./capture-options.mjs";
import { captureBrowserDiagnostics, assertCaptureGpuCapability, startCaptureTrace } from "./capture-diagnostics.mjs";

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
    throw new Error(`unknown team "${team}" — one of: ${ids.join(", ")}`);
  }
  await page.addInitScript((i) => {
    try {
      localStorage.setItem("apex26.team", String(i));
      localStorage.setItem("apex26.driver", "0");
    } catch (_) { /* ignore */ }
  }, idx);
}

async function raceTrack(page, trackId, { tod, weather }, waitMs) {
  await page.evaluate(({ id, tod: t, wx }) => {
    window.__apex.headless(false);
    return window.__apex.race(id, t || undefined, wx || undefined);
  }, { id: trackId, tod, wx: weather });
  await page.waitForFunction(
    (id) => window.__apex.info().track === id,
    trackId, { timeout: waitMs, polling: 100 },
  );
}

async function frameCamera(page, job) {
  return mutateCaptureScene(page,
    ({ frac, cam, az, el, dist, side, tod, weather, showHud, through }) => {
      const a = window.__apex;
      a.headless(false);
      a.go();
      a.park(frac);
      a.freeze(true);
      if (a.setTimeOfDay && a.setTimeOfDay() !== tod) a.setTimeOfDay(tod);
      if (a.weather && weather && a.weather() !== weather) a.weather(weather);
      if (a.hud) a.hud(!!showHud);

      // clear: the free cams step round a hill, building or tree between eye
      // and car (js/agent/shot-clear.js); --through keeps the asked-for placement.
      const clear = !through;
      let placed = null;
      if (cam === "eye") a.eyeAt(frac, 0, 2.5);
      else if (cam === "orbit") placed = a.orbit(frac, az, el, dist, 1.5, { clear });
      else if (cam === "cinematic") placed = a.cinematic(frac, { dist, el, clear });
      else if (cam === "trackside")
        placed = a.view({ s: frac, side, dist, height: Math.max(3, el * 0.35), look: "in", clear });
      else a.snapCam();

      a.step && a.step(1 / 60, 4);
      const vs = a.viewState ? a.viewState() : null;
      const cs = a.camState ? a.camState() : null;
      const dbgCamActive = !!(vs && vs.dbgCamActive) || !!(cs && cs.debug);
      const camera = a.camera();
      if (dbgCamActive && cam !== "park" && camera && typeof camera === "object") {
        camera.mode = cam;
        camera.freeCam = true;
        if (placed && placed.clear) camera.clear = placed.clear;
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

async function captureJob(page, job, waitMs, presentMs, modelInfo, diagnostics) {
  const frame = await frameCamera(page, job);

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
  const readiness = await awaitCaptureReady(page, { timeoutMs: presentMs });
  const pageScope = job.showHud || job.capture.scope === "page";
  const shot = await screenshotPresentedCanvas(page, {
    path: job.out, skipAwait: true, pauseRender: true, timeout: 60000, type: job.type,
    ...(job.type === "jpeg" ? { quality: job.quality ?? 85 } : {}),
    ...(pageScope ? { forceCdp: true, clip: { x: 0, y: 0, ...page.viewportSize() } } : {}),
  });
  const buf = shot.buf;
  const kb = (buf.length / 1024).toFixed(1);
  const pixels = await pixelEvidence(buf);
  if (!pixels.meaningful) throw new Error(`wrote ${job.out} but scene evidence is ${pixels.classification}`);
  const state = await page.evaluate(() => {
    const a = window.__apex, diag = a.diag({ download: false });
    return { diag: { env: { backend: diag.env?.backend, backendState: diag.env?.backendState } },
      seed: a.seed(), renderClock: a.renderClock(), render: a.renderScale(), camera: a.cameraState(), info: a.info() };
  });
  const renderer = rendererEvidence(state.diag, pixels, job.backend);
  writeFileSync(`${job.out}.capture.json`, JSON.stringify({ job, browser: diagnostics, state, renderer, readiness, pixels,
    image: { path: job.out, bytes: shot.bytes, via: shot.via, scope: pageScope ? "page" : "scene" } }, null, 2) + "\n");
  if (!renderer.positive) throw new Error(`capture requested ${job.backend} but renderer evidence is not healthy: ${JSON.stringify(renderer)}`);
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
  console.log(JSON.stringify({ modelsPrefetch: modelInfo, readiness, pixels, renderer, scope: pageScope ? "page" : "scene", frame: { camera: frame.camera, dbgCamActive: frame.dbgCamActive, models: frame.models } }, null, 2));
}

async function captureJobWithRetries(page, job, plan, modelInfo, diagnostics, failedShots) {
  const attempts = 1 + (plan.captureRetries ?? 2);
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await captureJob(page, job, plan.waitMs, plan.presentMs, modelInfo, diagnostics);
      return;
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableCaptureError(err);
      if (!retryable || attempt >= attempts) break;
      console.error(`[shot] retry ${attempt}/${attempts - 1} for ${job.out}: ${err.message}`);
      await page.evaluate(() => window.__apex.headless(false)).catch(() => {});
    }
  }
  failedShots.push({ out: job.out, trackId: job.trackId, frac: job.frac, cam: job.cam, error: lastErr?.message || String(lastErr) });
  console.error(`shot failed: ${job.out} — ${lastErr?.message || lastErr}`);
}

let trace = null;
const failedShots = [];
const srv = await startStaticServer(ROOT, plan.capture.cacheAssets
  ? { immutableAssets: { namespace: randomUUID() } } : {});

try {
  // GPU/binary are browser-process choices: fail before launch for mixed requests.
  for (const job of plan.jobs) {
    if (job.capture.gpu !== plan.capture.gpu || job.capture.browser !== plan.capture.browser) {
      throw new Error("batch GPU/browser profiles must match the command's --gpu/--browser flags");
    }
    if (job.team && !teamIdsFromSource().includes(job.team)) throw new Error(`unknown team "${job.team}"`);
  }
  const browser = await launchChromium(captureLaunchOptions(plan.capture, { backend: plan.jobs.some((job) => job.backend === "webgpu") ? "webgpu" : "three" }));
  const diagnostics = await captureBrowserDiagnostics(browser, {
    requested: { gpu: plan.capture.gpu, flavor: plan.capture.browser }, executable: chromiumLaunchInfo(browser),
  });
  assertCaptureGpuCapability(diagnostics, plan.capture);
  console.error(`[shot] browser: ${JSON.stringify(diagnostics)}`);
  if (plan.capture.trace) trace = await startCaptureTrace(browser, {
    path: plan.capture.tracePath || `${plan.jobs[0].out}.trace.json`,
  });
  const groups = groupJobsByTrack(plan.jobs);
  if (plan.mode === "batch") {
    console.error(`[shot] batch: ${plan.jobs.length} job(s), ${groups.length} compatible scene group(s), one Chromium`);
  }
  let context, page, sessionKey, modelInfo, currentTrack;
  for (const group of groups) {
    const first = group.jobs[0];
    if (!context || group.sessionKey !== sessionKey || first.capture.isolated) {
      if (context) await context.close();
      context = await browser.newContext(captureContextOptions(first.capture, { width: 1280, height: 720 }));
      page = await context.newPage();
      sessionKey = group.sessionKey; currentTrack = null;
      await installProbeInit(page, { backend: first.backend, tlxForceGL: plan.capture.gpu === "llvmpipe" });
      await pinTeam(page, first.team);
      const url = new URL(srv.snapshotUrl || srv.url);
      if (first.capture.seed != null) url.searchParams.set("seed", first.capture.seed);
      await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: plan.waitMs });
      await page.waitForFunction(() => window.__apex != null, null, { timeout: plan.waitMs, polling: 100 });
      await applyCaptureProfile(page, first.capture);
      modelInfo = await page.evaluate(async () => {
        if (typeof Assets === "undefined" || !Assets.loadModels) return { n: 0 };
        try { const n = await Assets.loadModels(); return { n, ids: Assets.models() }; }
        catch (e) { return { n: 0, err: String(e) }; }
      });
    }
    if (currentTrack !== group.trackId) {
      const lead = group.jobs[0];
      await raceTrack(page, group.trackId, { tod: lead.tod, weather: lead.weather }, plan.waitMs);
      currentTrack = group.trackId;
    }
    for (const job of group.jobs) {
      try { await captureJobWithRetries(page, job, plan, modelInfo, diagnostics, failedShots); }
      finally { await page.evaluate(() => window.__apex.headless(true)).catch(() => {}); }
    }
  }
  if (context) await context.close();
  if (failedShots.length) {
    console.error(`[shot] ${failedShots.length} failed shot(s):`);
    for (const f of failedShots) console.error(`  ${f.out} (${f.trackId} ${f.frac} ${f.cam}): ${f.error}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error("shot failed:", err.message);
  process.exitCode = 1;
} finally {
  try { if (trace) console.error(`[shot] trace: ${JSON.stringify(await trace.stop())}`); }
  catch (error) { console.error("shot trace failed:", error.message); process.exitCode = 1; }
  await shutdown();
}
