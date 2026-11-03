#!/usr/bin/env node
// @doc Records garage entry/exit clips (style×angle×tune), contact sheets, timing JSON + auto-flags.
// @skill playwright-probe
//
// Headless Chromium + recordVideo (rAF is frozen without it — see motion-capture.mjs).
// Opens SETTINGS → ADVANCED VISUALS → GARAGE ENTER & LEAVE, applies STYLE / ANGLE /
// HOLD BEAT, plays PREVIEW PIT STOP / RACE START / RETURN, samples car + eye,
// writes clip.webm + frames, a contact sheet, timing.json and flags.json.
//
// Pure flags live in garage-video-checks.mjs (unit-tested). Usage:
//   node tools/shot/garage-video.mjs --plan
//   node tools/shot/garage-video.mjs --limit=2
//   node tools/shot/garage-video.mjs --style=broadcast --angle=cut --dir=in --tune=hold=0
//   node tools/shot/garage-video.mjs --analytic --style=all --dir=in,out
//   node tools/shot/garage-video.mjs --checks-only=scratch/captures/garage-video/timing.json
//
// Docs: docs/notes/GARAGE-VIDEO-HARNESS.md

import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { exitIfHelp, parseFlags } from "../lib/cli-args.mjs";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { resolveRepoDefault, assertOutputDir } from "../lib/output-paths.mjs";
import { chromiumArgsForBackend, installProbeInit, gotoGame } from "./probe-page.mjs";
import {
  STYLE_IDS, ANGLE_IDS, DIR_IDS,
  buildMatrix, flagReport, clipId,
  parseTuneList, parseCsvList,
} from "./garage-video-checks.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const USAGE = `garage-video — record garage entry/exit clips + contact sheets + flags

  node tools/shot/garage-video.mjs [flags]

  --plan                 print the clip matrix as JSON and exit
  --analytic             sample poses in a Node VM only (no Chromium)
  --checks-only=<json>   re-flag an existing timing.json
  --style=<ids|all>      default: broadcast,cinema
  --angle=<ids|all>      default: cut,crane
  --dir=<ids|all>        default: in,out
  --tune=<a|b>           default: default|hold=0  (pipe = alternate tunes)
  --limit=N              cap the matrix (smoke)
  --out=<dir>            default: scratch/captures/garage-video/
  --backend=three|webgl2 default: three
  --settle=MS            extra settle after preview start (default 400)
  --sheet=0              skip contact sheets
  --cols=N               contact-sheet columns (default 4)
  --json                 print the flags report as one JSON line

Flags (auto): ends-early, car-still, camera-oob, never-finishes.
See docs/notes/GARAGE-VIDEO-HARNESS.md.`;

const argv = process.argv.slice(2);
exitIfHelp(argv, USAGE);
const flags = parseFlags(argv, [
  "--plan", "--analytic", "--checks-only", "--style", "--angle", "--dir", "--tune",
  "--limit", "--out", "--backend", "--settle", "--sheet", "--cols", "--json",
]);

const want = (name, d) => flags.flag(name, d);
const has = (name) => flags.has(name);

function loadArrival() {
  const ctx = vm.createContext({});
  for (const f of ["js/garage/crew-draw.js", "js/garage/arrival.js", "js/track/core/pit.js"]) {
    vm.runInContext(readFileSync(resolve(ROOT, f), "utf8"), ctx, { filename: f });
  }
  try {
    vm.runInContext(readFileSync(resolve(ROOT, "js/garage/garage-data.js"), "utf8"), ctx, { filename: "js/garage/garage-data.js" });
  } catch (_) { /* lazy data optional for cut cams */ }
  try {
    vm.runInContext(readFileSync(resolve(ROOT, "js/data/garage-entrance-motion.js"), "utf8"), ctx, { filename: "js/data/garage-entrance-motion.js" });
    vm.runInContext(readFileSync(resolve(ROOT, "js/garage/entrance-motion.js"), "utf8"), ctx, { filename: "js/garage/entrance-motion.js" });
  } catch (_) { /* authored entrance optional */ }
  return vm.runInContext("GarageArrival", ctx);
}

function sampleClip(Arrival, { style, angle, dir, tune }, { fps = 12 } = {}) {
  let cfg = Arrival.settings({ angle, ...(tune || {}) });
  if (style && Arrival.STYLES[style]) cfg = Arrival.applyStyle(cfg, style);
  const expectedSec = Arrival.duration(cfg, dir);
  const fn = Arrival.poseFor(dir);
  const n = Math.max(2, Math.ceil(expectedSec * fps));
  const samples = [];
  for (let i = 0; i <= n; i++) {
    const t = Math.min(expectedSec, (i / n) * expectedSec);
    const p = fn(t, cfg, false);
    samples.push({
      t: Math.round(t * 1000) / 1000,
      x: p.x, z: p.z, yaw: p.yaw,
      eye: Array.isArray(p.eye) ? p.eye.map((v) => Math.round(v * 1000) / 1000) : null,
      active: !!p.active,
      camera: p.camera, label: p.label,
    });
  }
  return {
    id: clipId({ style: style || "default", angle, dir, tune }),
    style: style || null, angle, dir, tune: tune || {},
    expectedSec: Math.round(expectedSec * 1000) / 1000,
    recordedSec: Math.round(expectedSec * 1000) / 1000,
    wallSec: Math.round(expectedSec * 1000) / 1000,
    samples,
    source: "analytic",
  };
}

function ffmpegBin() {
  const cands = [
    ...(() => {
      try {
        return readdirSync(`${process.env.HOME}/Library/Caches/ms-playwright`)
          .filter((d) => d.startsWith("ffmpeg-"))
          .map((d) => `${process.env.HOME}/Library/Caches/ms-playwright/${d}/ffmpeg-mac`);
      } catch { return []; }
    })(),
    ...(() => {
      try {
        return readdirSync("/opt/pw-browsers")
          .filter((d) => d.startsWith("ffmpeg-"))
          .map((d) => `/opt/pw-browsers/${d}/ffmpeg-linux`);
      } catch { return []; }
    })(),
    "/opt/pw-browsers/ffmpeg-linux", "ffmpeg",
  ];
  return cands.find((p) => p === "ffmpeg" || existsSync(p)) || "ffmpeg";
}

function extractFrames(clipPath, frameDir, every = 8) {
  mkdirSync(frameDir, { recursive: true });
  for (const f of readdirSync(frameDir)) {
    if (/^f_\d+\.png$/.test(f)) rmSync(join(frameDir, f), { force: true });
  }
  const FF = ffmpegBin();
  const r = spawnSync(FF, ["-y", "-i", clipPath, "-vf", `select=not(mod(n\\,${every}))`, "-vsync", "vfr", join(frameDir, "f_%04d.png")], { stdio: "ignore" });
  if (r.error || r.status !== 0) return [];
  return readdirSync(frameDir).filter((f) => /^f_\d+\.png$/.test(f)).sort();
}

function writeContactSheet(framePaths, outPng, cols = 4) {
  if (!framePaths.length) return false;
  if (spawnSync("sh", ["-c", "command -v montage"]).status !== 0) return false;
  const tile = `${cols}x`;
  const r = spawnSync("montage", [
    ...framePaths, "-tile", tile, "-geometry", "320x148+2+2",
    "-background", "#111", "-fill", "#eee", outPng,
  ], { timeout: 120000 });
  return r.status === 0 && existsSync(outPng);
}

function probeDurationSec(clipPath) {
  const FF = ffmpegBin();
  const r = spawnSync(FF, ["-i", clipPath], { encoding: "utf8" });
  const text = `${r.stderr || ""}\n${r.stdout || ""}`;
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}

async function openArrivalPanel(page) {
  await page.evaluate(() => {
    const click = (id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error("missing #" + id);
      el.click();
    };
    click("mb-settings");
  });
  await page.waitForFunction(() => {
    const el = document.getElementById("pmsettings");
    return el && !el.hidden;
  }, null, { polling: 100, timeout: 30000 });
  await page.evaluate(() => {
    const vis = document.getElementById("pm-open-visual");
    if (vis) vis.click();
    else {
      const sum = document.querySelector("#pm-visual-tuners > summary");
      if (sum) sum.click();
    }
  });
  await page.evaluate(() => {
    const el = document.getElementById("pm-garrival");
    if (!el) throw new Error("missing #pm-garrival");
    el.click();
  });
  await page.waitForFunction(() => {
    const el = document.getElementById("garrival");
    return el && !el.hidden;
  }, null, { polling: 100, timeout: 30000 });
}

async function applyTuner(page, { style, angle, tune }) {
  await page.evaluate(({ styleId, angleId, tuneObj }) => {
    const $ = (id) => document.getElementById(id);
    if (styleId) {
      const b = $("ga-style-" + styleId);
      if (b) b.click();
    }
    const ang = $("ga-angle");
    if (ang && angleId) {
      ang.value = angleId;
      ang.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (tuneObj && Object.prototype.hasOwnProperty.call(tuneObj, "hold")) {
      const hold = $("ga-hold");
      if (hold) {
        hold.value = tuneObj.hold == null ? "auto" : String(tuneObj.hold);
        hold.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (tuneObj && Number.isFinite(tuneObj.speed)) {
      const speed = $("ga-speed");
      if (speed) {
        speed.value = String(tuneObj.speed);
        speed.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (tuneObj && Number.isFinite(tuneObj.carSpeed)) {
      const cs = $("ga-carspeed");
      if (cs) {
        cs.value = String(tuneObj.carSpeed);
        cs.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }, { styleId: style, angleId: angle, tuneObj: tune || {} });
}

async function playAndSample(page, dir, expectedSec, settleMs) {
  const btn = dir === "out" ? "ga-preview-out" : dir === "home" ? "ga-preview-home" : "ga-preview-in";
  await page.evaluate((id) => {
    const tools = document.querySelector("#garrival .ew-tools");
    if (tools && !tools.open) {
      const sum = tools.querySelector(":scope > summary");
      if (sum) sum.click();
    }
    const el = document.getElementById(id);
    if (!el) throw new Error("missing #" + id);
    el.click();
  }, btn);
  await sleep(settleMs);
  const t0 = Date.now();
  const samples = [];
  const stepMs = 200;
  const budget = Math.max(expectedSec * 1000 + 2500, 4000);
  while (Date.now() - t0 < budget) {
    const elapsed = (Date.now() - t0) / 1000;
    const snap = await page.evaluate(({ d, elapsedSec }) => {
      const stop = document.getElementById("ga-preview-stop");
      const playing = !!(stop && !stop.hidden);
      // Wall-clock show time (not the scrub): playback speed can differ from
      // 1, but scrub was observed stuck at 0 while the car moved on screen.
      let pose = null;
      try {
        const raw = localStorage.getItem("apex26.garageArrival");
        const saved = raw ? JSON.parse(raw) : null;
        const cfg = GarageArrival.settings(saved);
        const speed = Number.isFinite(cfg.speed) && cfg.speed > 0 ? cfg.speed : 1;
        const t = Math.min(GarageArrival.duration(cfg, d), elapsedSec * speed);
        const p = GarageArrival.poseFor(d)(t, cfg, false);
        pose = {
          t: Math.round(t * 1000) / 1000,
          x: p.x, z: p.z, yaw: p.yaw,
          eye: Array.isArray(p.eye) ? p.eye.slice() : null,
          active: !!p.active,
          camera: p.camera,
        };
      } catch (_) { /* pose optional */ }
      return { playing, pose };
    }, { d: dir, elapsedSec: elapsed });
    if (snap.pose) samples.push(snap.pose);
    if (!snap.playing && samples.length > 2) break;
    await sleep(stepMs);
  }
  const wallSec = (Date.now() - t0) / 1000;
  // Stop if still playing (hang).
  await page.evaluate(() => {
    const stop = document.getElementById("ga-preview-stop");
    if (stop && !stop.hidden) stop.click();
  }).catch(() => {});
  return { samples, wallSec };
}

async function recordMatrix(rows, opts) {
  const outDir = opts.outDir;
  mkdirSync(outDir, { recursive: true });
  const Arrival = loadArrival();
  const srv = await startStaticServer(ROOT);
  const clips = [];
  try {
    for (const row of rows) {
      const analytic = sampleClip(Arrival, row);
      const clipDir = join(outDir, analytic.id);
      mkdirSync(clipDir, { recursive: true });
      const videoTmp = join(clipDir, ".video-tmp");
      rmSync(videoTmp, { recursive: true, force: true });
      mkdirSync(videoTmp, { recursive: true });

      const browser = await launchChromium({
        headless: true,
        args: chromiumArgsForBackend(opts.backend),
      });
      let recordedSec = null;
      let samples = analytic.samples;
      let wallSec = analytic.expectedSec;
      let videoPath = null;
      try {
        const ctx = await browser.newContext({
          viewport: { width: 844, height: 390 },
          hasTouch: true,
          recordVideo: { dir: videoTmp, size: { width: 844, height: 390 } },
        });
        const page = await ctx.newPage();
        // Keep motion ON so the arrival plays (probe default forces reduce).
        await installProbeInit(page, { backend: opts.backend, motion: true });
        await page.addInitScript((seed) => {
          try {
            localStorage.setItem("apex26.garageArrival", JSON.stringify(seed));
          } catch (_) { /* private */ }
        }, Arrival.settings({ angle: row.angle, ...(row.tune || {}) }));
        await gotoGame(page, srv.url);
        await openArrivalPanel(page);
        await applyTuner(page, row);
        const played = await playAndSample(page, row.dir, analytic.expectedSec, opts.settleMs);
        samples = played.samples.length >= 2 ? played.samples : analytic.samples;
        wallSec = played.wallSec;
        await ctx.close();
        await browser.close();
        const webm = readdirSync(videoTmp).find((f) => f.endsWith(".webm"));
        if (webm) {
          videoPath = join(clipDir, "clip.webm");
          renameSync(join(videoTmp, webm), videoPath);
          recordedSec = probeDurationSec(videoPath);
          if (opts.sheet) {
            const frames = extractFrames(videoPath, join(clipDir, "frames"));
            const sheet = join(clipDir, "sheet.png");
            if (frames.length) {
              writeContactSheet(frames.map((f) => join(clipDir, "frames", f)), sheet, opts.cols);
            }
          }
        }
      } catch (err) {
        try { await browser.close(); } catch (_) { /* already closed */ }
        const msg = String(err && err.message || err);
        writeFileSync(join(clipDir, "error.json"), JSON.stringify({ error: msg }, null, 2));
        // Pose samples may still be complete (e.g. recordVideo needs Playwright's
        // ffmpeg binary). Prefer last-sample / wall time over recordedSec=0 so a
        // missing webm does not false-flag ends-early when the show finished.
        const lastT = samples.length && Number.isFinite(+samples[samples.length - 1].t)
          ? +samples[samples.length - 1].t : 0;
        const finished = samples.some((s) => s && s.active === false);
        clips.push({
          ...analytic,
          recordedSec: finished ? Math.max(lastT, wallSec || 0) : 0,
          wallSec: wallSec || 0,
          samples,
          source: "browser-error",
          error: msg,
          video: null,
        });
        rmSync(videoTmp, { recursive: true, force: true });
        continue;
      }
      rmSync(videoTmp, { recursive: true, force: true });
      const clip = {
        ...analytic,
        recordedSec: recordedSec != null ? recordedSec : wallSec,
        wallSec,
        samples,
        source: "browser",
        video: videoPath ? "clip.webm" : null,
        sheet: existsSync(join(clipDir, "sheet.png")) ? "sheet.png" : null,
      };
      writeFileSync(join(clipDir, "clip.json"), JSON.stringify(clip, null, 2));
      clips.push(clip);
      console.error(`= clip ${clip.id} expected=${clip.expectedSec}s recorded=${clip.recordedSec}s samples=${clip.samples.length}`);
    }
  } finally {
    await srv.close();
    await shutdown();
  }
  return clips;
}

function analyticMatrix(rows) {
  const Arrival = loadArrival();
  return rows.map((row) => sampleClip(Arrival, row));
}

function writeOutputs(outDir, clips) {
  mkdirSync(outDir, { recursive: true });
  const timing = {
    tool: "tools/shot/garage-video.mjs",
    note: "docs/notes/GARAGE-VIDEO-HARNESS.md",
    generatedAt: new Date().toISOString(),
    clips,
  };
  const timingPath = join(outDir, "timing.json");
  writeFileSync(timingPath, JSON.stringify(timing, null, 2) + "\n");
  const report = flagReport(clips);
  const flagsPath = join(outDir, "flags.json");
  writeFileSync(flagsPath, JSON.stringify(report, null, 2) + "\n");
  return { timingPath, flagsPath, report };
}

function matrixFromFlags() {
  const styles = parseCsvList(want("--style", "broadcast,cinema"), STYLE_IDS);
  const angles = parseCsvList(want("--angle", "cut,crane"), ANGLE_IDS);
  const dirs = parseCsvList(want("--dir", "in,out"), DIR_IDS);
  const tunes = parseTuneList(want("--tune", "default|hold=0"));
  let rows = buildMatrix({ styles, angles, dirs, tunes });
  const limit = Math.max(0, +want("--limit", "0") || 0);
  if (limit > 0) rows = rows.slice(0, limit);
  return rows;
}

async function main() {
  if (has("--checks-only")) {
    const path = resolve(String(want("--checks-only", "")));
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const report = flagReport(doc.clips || doc);
    if (has("--json")) console.log(JSON.stringify(report));
    else {
      console.log(`= flags ${report.flagged}/${report.total} flagged`);
      for (const [k, ids] of Object.entries(report.byFlag)) {
        if (ids.length) console.log(`  ${k}: ${ids.join(", ")}`);
      }
    }
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  const rows = matrixFromFlags();
  if (has("--plan")) {
    console.log(JSON.stringify({ count: rows.length, clips: rows }, null, 2));
    return;
  }

  const outDir = assertOutputDir(
    has("--out") ? resolve(ROOT, String(want("--out", "")))
      : resolveRepoDefault(ROOT, "scratch", "captures", "garage-video"),
    ROOT,
    "--out",
  );

  let clips;
  if (has("--analytic")) {
    clips = analyticMatrix(rows);
  } else {
    clips = await recordMatrix(rows, {
      outDir,
      backend: String(want("--backend", "three")),
      settleMs: Math.max(0, +want("--settle", "400") || 0),
      sheet: String(want("--sheet", "1")) !== "0",
      cols: Math.max(1, +want("--cols", "4") || 4),
    });
  }

  const { timingPath, flagsPath, report } = writeOutputs(outDir, clips);
  if (has("--json")) console.log(JSON.stringify({ outDir, timingPath, flagsPath, report }));
  else {
    console.log(`= wrote ${timingPath}`);
    console.log(`= wrote ${flagsPath}`);
    console.log(`= flags ${report.flagged}/${report.total} flagged`);
    for (const [k, ids] of Object.entries(report.byFlag)) {
      if (ids.length) console.log(`  ${k}: ${ids.join(", ")}`);
    }
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
