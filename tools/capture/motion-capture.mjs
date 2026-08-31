#!/usr/bin/env node
// motion-capture.mjs — capture RENDERED MOTION headless (the one thing screenshots
// can't do here). Headless Chromium under SwiftShader freezes requestAnimationFrame
// at 0 fps, so the game loop never advances on its own and consecutive
// page.screenshot()s of a "driven" lap are identical. `__apex.step()` advances
// physics but does NOT paint. The trick: enabling recordVideo makes the compositor
// screencast TICK the rAF loop, so the car actually drives and the video contains
// real motion. We record a driven clip, extract frames, and (optionally) diff
// consecutive driving-window frames for a per-frame "flicker" score — the objective
// signal for z-fighting / shadow-boil / geometry-pop that only appears in motion.
//
// Usage:
//   node tools/capture/motion-capture.mjs <track> [seconds] [speed] [outdir]
//     writes scratch/captures/motion-capture/<track>/clip.webm + f_*.png frames, prints a flicker report.
//   node tools/capture/motion-capture.mjs monaco 4 50
//   node tools/capture/motion-capture.mjs spa 6 60 scratch/captures/custom/spa-eau-rouge
//
// A/B a rendering change: run once on your branch, revert the change, run again,
// compare the p90 flicker (the typical-frame floor — more stable than the mean,
// which is dominated by occasional scene-change spikes).
//
// Notes / gotchas (learned the hard way, keep them):
//   • rAF is 0 fps headless WITHOUT recordVideo — the car won't move otherwise.
//   • CDP HeadlessExperimental.beginFrame would be more deterministic but needs
//     enableBeginFrameControl, which is "headless shell only, not on macOS yet"
//     and Playwright doesn't expose it — so recordVideo is the portable route.
//   • Playwright's bundled ffmpeg is STRIPPED: it can DECODE vp8/vp9 and ENCODE
//     png, but has NO png demuxer and NO raw/pgm muxer. So we go webm --ffmpeg-->
//     png frames, then decode the pngs in a second Chromium page (canvas 2D).

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  assertSafePathToken,
  resolveContainedChild,
  resolveRepoDefault,
} from "../output-paths.mjs";
import { launchChromium, shutdown, sleep, startStaticServer } from "../harness.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

const [trackArg = "monaco", secArg = "4", speedArg = "50", outArg] = process.argv.slice(2);
const track = assertSafePathToken(trackArg, "track");
const SEC = +secArg, SPEED = +speedArg;
const vdir = outArg
  ? resolve(outArg)
  : resolveRepoDefault(ROOT, "scratch", "captures", "motion-capture", track);
const clipPath = resolveContainedChild(vdir, "clip.webm", "motion capture clip");
const videoDir = resolveContainedChild(vdir, ".motion-capture-video", "video temp dir");
mkdirSync(vdir, { recursive: true });
rmSync(videoDir, { recursive: true, force: true });
mkdirSync(videoDir, { recursive: true });
rmSync(clipPath, { force: true });
for (const file of readdirSync(vdir)) {
  if (/^f_\d+\.png$/.test(file)) {
    rmSync(resolveContainedChild(vdir, file, "motion capture frame"), {
      force: true,
    });
  }
}

// ffmpeg: bundled with Playwright (stripped build — see note above).
function ffmpeg() {
  const cands = [
    `${process.env.HOME}/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac`,
    ...(() => { try { return readdirSync(`${process.env.HOME}/Library/Caches/ms-playwright`).filter((d) => d.startsWith("ffmpeg-")).map((d) => `${process.env.HOME}/Library/Caches/ms-playwright/${d}/ffmpeg-mac`); } catch { return []; } })(),
    // Sandbox layouts vary: the binary has lived at both /opt/pw-browsers/
    // ffmpeg-linux and /opt/pw-browsers/ffmpeg-<rev>/ffmpeg-linux.
    ...(() => { try { return readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("ffmpeg-")).map((d) => `/opt/pw-browsers/${d}/ffmpeg-linux`); } catch { return []; } })(),
    "/opt/pw-browsers/ffmpeg-linux", "ffmpeg",
  ];
  return cands.find((p) => p === "ffmpeg" || existsSync(p)) || "ffmpeg";
}

const srv = await startStaticServer(ROOT);
try {
// ── record a driven clip ─────────────────────────────────────────────────────
const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  recordVideo: { dir: videoDir, size: { width: 844, height: 390 } },
});
const pg = await ctx.newPage();
await pg.goto(srv.url);
await pg.waitForFunction(() => window.__apex != null, null, { timeout: 20000 });
await pg.evaluate((t) => window.__apex.race(t), track);
await pg.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: 20000 });
await sleep(1200);
await pg.evaluate(({ s }) => { window.__apex.go(); window.__apex.jump(0.05, s, 0); window.__apex.camera("chase"); window.__apex.hud(false); window.__apex.setInput({ throttle: true, steer: 0 }); }, { s: SPEED });
const t0 = Date.now(); let lastS = 0;
while ((Date.now() - t0) < SEC * 1000) { await sleep(200); lastS = await pg.evaluate(() => window.__apex.probe().s); }
await pg.evaluate(() => window.__apex.clearInput());
await ctx.close(); await browser.close();   // video is flushed on context close

// ── extract frames (webm → png; ffmpeg has no png demuxer, only encoder) ──────
const webm = readdirSync(videoDir).find((f) => f.endsWith(".webm"));
if (!webm) throw new Error("no video recorded — recordVideo failed");
renameSync(resolveContainedChild(videoDir, webm, "recorded video"), clipPath);
rmSync(videoDir, { recursive: true, force: true });
// Fail LOUDLY here: an unchecked spawn error used to fall through to a
// 0-frame flicker report (mean/p90/max 0.00) that read exactly like a pass.
const FF = ffmpeg();
const ff = spawnSync(FF, ["-i", clipPath, join(vdir, "f_%04d.png")], { stdio: "ignore" });
if (ff.error || ff.status !== 0) {
  throw new Error(`ffmpeg failed (${FF}): ${ff.error ? ff.error.message : `exit ${ff.status}`} — no frames extracted`);
}
const pngs = readdirSync(vdir).filter((f) => /^f_\d+\.png$/.test(f)).sort();
if (pngs.length === 0) {
  throw new Error(`ffmpeg (${FF}) extracted 0 frames from ${clipPath} — nothing to score`);
}

// ── decode pngs → gray arrays in a second Chromium page ───────────────────────
const W = 150, H = 70;
const b2 = await launchChromium({ args: ["--use-angle=swiftshader"] });
const p2 = await b2.newPage();
await p2.setContent("<canvas id=c></canvas>");
await p2.evaluate(({ w, h }) => { const c = document.getElementById("c"); c.width = w; c.height = h; window.__cx = c.getContext("2d", { willReadFrequently: true }); }, { w: W, h: H });
const lums = [];
for (const f of pngs) {
  const b64 = readFileSync(`${vdir}/${f}`).toString("base64");
  const arr = await p2.evaluate(({ b64, w, h }) => new Promise((res) => { const im = new Image(); im.onload = () => { window.__cx.drawImage(im, 0, 0, w, h); const d = window.__cx.getImageData(0, 0, w, h).data; const g = new Uint8Array(w * h); for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) | 0; res(Array.from(g)); }; im.src = "data:image/png;base64," + b64; }), { b64, w: W, h: H });
  lums.push(Uint8Array.from(arr));
}
await b2.close();

// ── flicker report over the driving window (drop the pre-race menu prefix) ────
const drive = lums.slice(Math.floor(lums.length * 0.45));
const scores = [];
for (let i = 1; i < drive.length; i++) { const a = drive[i - 1], c = drive[i]; let hard = 0; for (let j = 0; j < c.length; j++) if (Math.abs(a[j] - c[j]) > 120) hard++; scores.push(hard / c.length * 100); }
const mean = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
const sorted = [...scores].sort((a, b) => b - a);
const p90 = sorted[Math.floor(scores.length * 0.1)] || 0, max = sorted[0] || 0;
console.log(`\n=== ${track} motion-capture: ${SEC}s @ ${SPEED} m/s ===`);
console.log(`  ${pngs.length} video frames, ${drive.length} driving-window frames; car s advanced to ${lastS.toFixed(0)} m`);
console.log(`  flicker (hard-flip %/frame):  mean ${mean.toFixed(2)}   p90 ${p90.toFixed(2)}   max ${max.toFixed(2)}`);
console.log(`  → for A/B, compare p90 (stable typical-frame floor); mean & max are dominated by scene-change spikes`);
console.log(`  clip: ${clipPath}`);
console.log(`  frames: ${join(vdir, "f_*.png")}`);
} finally {
  await shutdown();
}
