#!/usr/bin/env node
// carshot — one tiny car-inspection render. Boots headless, parks the player,
// @doc Cropped studio-orbit car JPEG, self-booting: `carshot.mjs [az] [tod] [teamIdx] [out]` → `artifacts/tmp/carshot.jpg`.
// @skill playwright-probe
// Shared profiles / GPU / browser flags work here too. Camera mutation and
// presentation replace guessed sleeps; a stalled renderer is a failed capture.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pixelEvidence } from "../shot/capture-contract.mjs";
import { launchChromium, shutdown, startStaticServer, chromiumLaunchInfo } from "../lib/harness.mjs";
import { installProbeInit, gotoGame, mutateCaptureScene, awaitCaptureReady,
  withCaptureRendering, screenshotPresentedCanvas, screenshotNativeCanvas } from "../shot/probe-page.mjs";
import { parseCaptureOptions, captureContextOptions, captureLaunchOptions, applyCaptureProfile } from "../shot/capture-options.mjs";
import { captureBrowserDiagnostics, assertCaptureGpuCapability, startCaptureTrace } from "../shot/capture-diagnostics.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node tools/car/carshot.mjs [az] [tod] [teamIdx] [outPath]
  [--backend three|webgl2] [--profile preview|comparison] [--browser auto|chromium|shell]
  [--gpu swiftshader|llvmpipe|hardware|lavapipe] [--type png|jpeg] [--quality 1..100]
  [--scope scene|page] [--width N --height N --dpr N] [--seed N] [--trace] [--cache-assets]

Cropped studio-orbit car JPEG via Chromium + __apex.studio().
  Three.js uses native scene pixels; page scope requires --backend webgl2.
  az default 40; tod day|dawn|dusk|night|default; teamIdx Teams.LIST index; out → artifacts/tmp/carshot.jpg`);
  process.exit(0);
}
const options = parseCaptureOptions(process.argv.slice(2));
let backend = "three";
const argv = [];
for (let i = 0; i < options.positionals.length; i++) {
  const arg = options.positionals[i];
  if (arg === "--backend") backend = options.positionals[++i];
  else if (arg.startsWith("--backend=")) backend = arg.slice("--backend=".length);
  else if (arg.startsWith("--")) throw new Error(`carshot: unknown flag ${arg}`);
  else argv.push(arg);
}
if (!["three", "webgl2"].includes(backend)) throw new Error("carshot: --backend must be three or webgl2");
if (backend === "three" && options.scope === "page") throw new Error("carshot: Three.js native capture is scene-only; use --scope scene or --backend webgl2 for page scope");
if (argv.length > 4) throw new Error("carshot: expected az, tod, teamIdx, outPath");
const az = Number(argv[0] ?? 40), tod = argv[1] || "day", teamIdx = Number(argv[2] ?? 2);
if (!Number.isFinite(az) || !Number.isInteger(teamIdx) || teamIdx < 0) throw new Error("carshot: az must be finite and teamIdx a nonnegative integer");
if (!["day", "dawn", "dusk", "night", "default"].includes(tod)) throw new Error("carshot: invalid time of day");
const fallbackType = options.type || (argv[3] && extname(argv[3]).toLowerCase() === ".png" ? "png" : "jpeg");
if (fallbackType === "png" && options.quality != null) throw new Error("carshot: --quality requires JPEG output");
const out = argv[3] || join(ROOT, "artifacts", "tmp", `carshot.${fallbackType === "jpeg" ? "jpg" : "png"}`);
mkdirSync(dirname(out), { recursive: true });
const started = Date.now();
let trace, server;
try {
  server = await startStaticServer(ROOT, options.cacheAssets ? { immutableAssets: { namespace: "carshot-" + Date.now() } } : {});
  const browser = await launchChromium(captureLaunchOptions(options, { backend }));
  const browserDiagnostics = await captureBrowserDiagnostics(browser, {
    requested: { gpu: options.gpu, flavor: options.browser }, executable: chromiumLaunchInfo(browser),
  });
  assertCaptureGpuCapability(browserDiagnostics, options);
  if (options.trace) trace = await startCaptureTrace(browser, { path: options.tracePath || out + ".trace.json" });
  const context = captureContextOptions(options, { width: 480, height: 270 });
  const page = await browser.newPage(context), errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await installProbeInit(page, { backend, team: teamIdx });
  const url = new URL(server.snapshotUrl || server.url);
  if (options.seed != null) url.searchParams.set("seed", options.seed);
  await gotoGame(page, url.href, 90000);
  await page.evaluate((index) => {
    window.__apex.agentHelp();
    if (!Teams.LIST[index]) throw new Error("unknown team index " + index);
  }, teamIdx);
  await applyCaptureProfile(page, options);
  await page.evaluate(({ track, tod }) => window.__apex.race(track, tod, "dry"), { track: "monza", tod });
  await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 90000 });
  await page.evaluate(() => window.__apex.headless(true));
  const result = await withCaptureRendering(page, async () => {
    await mutateCaptureScene(page, (angle) => {
      const a = window.__apex;
      a.go(); a.park(0.55); a.studio(); a.hud(false); a.carOrbit(0, angle, 9, 4.2);
    }, az);
    let readiness;
    const screen = await page.evaluate(() => ({
      visible: [...document.querySelectorAll('.screen, #overlay')].filter(el => !el.hidden && getComputedStyle(el).display !== 'none').map(el => ({id:el.id,opacity:getComputedStyle(el).opacity,visibility:getComputedStyle(el).visibility})),
      canvases: ['game','game-soft'].map(id=>{const el=document.getElementById(id);return el?{id,visibility:getComputedStyle(el).visibility,opacity:getComputedStyle(el).opacity,rect:el.getBoundingClientRect().toJSON()}:null;})
    }));
    const { width, height } = context.viewport;
    const clip = options.scope === "page" ? { x: 0, y: 0, width, height }
      : { x: width * 96 / 480, y: height * 40 / 270, width: width * 288 / 480, height: height * 190 / 270 };
    const imageOptions = {
      path: out, type: fallbackType, ...(fallbackType === "jpeg" ? { quality: options.quality ?? 62 } : {}),
      timeout: 60000, clip, skipAwait: true, forceCdp: options.scope === "page", pauseRender: true,
    };
    let shot = backend === "three" ? await screenshotNativeCanvas(page, imageOptions) : null;
    if (shot) readiness = shot.readiness;
    else {
      readiness = await awaitCaptureReady(page, { timeoutMs: 60000, pauseRender: true });
      shot = await screenshotPresentedCanvas(page, imageOptions);
    }
    const pixels = await pixelEvidence(shot.buf);
    if (!pixels.meaningful) {
      writeFileSync(out + ".failure.json", JSON.stringify({screen,pixels,readiness},null,2));
      throw new Error("carshot: invalid frame: " + pixels.classification);
    }
    const diag = await page.evaluate(() => window.__apex.diag({ download: false }));
    if (diag.env.backend !== backend) throw new Error(`carshot: requested ${backend}, bound ${diag.env.backend}`);
    if (errors.length) throw new Error("carshot: page errors: " + errors.join("; "));
    return { readiness, screen, pixels, via: shot.via, bytes: shot.bytes, timings: shot.timings, diag };
  });
  writeFileSync(out + ".json", JSON.stringify({ ...result, browser: browserDiagnostics, viewport: context,
    az, tod, teamIdx, profile: options.profile, elapsedMs: Date.now() - started, errors }, null, 2));
  console.log(`carshot → ${out} (${(result.bytes / 1024).toFixed(1)} KB) az=${az} tod=${tod} team=${teamIdx} backend=${backend} via=${result.via}`);
} finally {
  try { if (trace) await trace.stop(); }
  finally { await shutdown(); if (server) await server.close(); }
}
