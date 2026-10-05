#!/usr/bin/env node
// cam-videos.mjs — one short mp4 per camera, for an HTML page to play.
// @doc Record one silent mp4 per camera, plus a page a phone can autoplay.
//
// Headless recordVideo does not pick up this game's WebGL canvas (the file
// stays on the first cockpit frame while the sim moves on). Each frame is
// stepped, rendered once, and read off the canvas, then ffmpeg stitches the
// jpegs into a silent h264 mp4. WebKit will autoplay a file with no audio
// track when the page is muted, playsinline, and looping. Each clip also
// gets a one-video HTML page.
//
//   node tools/shot/cam-videos.mjs --cam chase --out /path/to/dir
//   node tools/shot/cam-videos.mjs --only chase,heli --out /path/to/dir
//
// --cam records ONE camera properly: a few seconds of throttle, a turn, and
// a brake, at a resolution a phone can actually watch. --only is the short
// survey (six frames) used to compare every mode.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { installProbeInit } from "./probe-page.mjs";

// The checkout this file sits in, not one host's path: it served /workspace/f1-game,
// which exists on no other box, so the page it recorded was a 404.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const CAMS = [
  ["chase", "Chase", "Pulls back with speed, tucks in on the brakes, swings outside the turn."],
  ["far", "Far", "A heavier, lazier pull-back. Almost no side swing."],
  ["drift", "Drift", "Stays close and hangs wide when the car slides."],
  ["cockpit", "Cockpit", "Bolted to the car. Only the lens breathes."],
  ["hood", "Hood", "A few centimetres of dive under braking, nothing more."],
  ["overhead", "Overhead", "Rises with speed and stays centred. It does not slide off the car."],
  ["heli", "Helicopter", "Climbs and swings wide. It does not dive on the brakes."],
  ["reverse", "Reverse", "Opens air in front of the nose, then closes it when you brake."],
  ["side", "TV side", "Runs ahead of the car instead of chasing it."],
  ["cinematic", "Cinematic", "A slow crane. Short rise, small swing."],
  ["low", "Low", "Stays on the road and drops under braking."],
  ["tcam", "T-cam", "A few centimetres of lift. The camera stays on the car."],
  ["rear", "Rear", "Eye fixed, looking back. The lens opens when you brake."],
  ["visor", "Visor", "The cockpit with the wheel out of the way. Lens only."],
  ["trackside", "Trackside", "A fixed corner camera. The eye does not move."],
  ["rival", "Rival lock", "A medium chase so both cars stay in frame."],
  ["pitwall", "Pit wall", "The eye stays on the wall. The aim dips under braking."],
  ["drone", "Drone", "The loosest tether: high, far back, wide swing."],
];

const PHASES = [
  { throttle: true, steer: 0, brake: false },
  { throttle: true, steer: 0, brake: false },
  { throttle: true, steer: 0.9, brake: false },
  { throttle: true, steer: 0.9, brake: false },
  { throttle: false, steer: 0, brake: true },
  { throttle: false, steer: 0, brake: true },
];

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 && args[onlyIdx + 1] ? new Set(args[onlyIdx + 1].split(",")) : null;
const camIdx = args.indexOf("--cam");
const camArg = camIdx >= 0 ? String(args[camIdx + 1] || "").toLowerCase() : "";
const FULL_FRAMES = 36;
const SIM_PER_FRAME = 4;
const PLAY_FPS = 12;
const outIdx = args.indexOf("--out");
const OUT = resolve(ROOT, outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "scratch/captures/cam-videos");
mkdirSync(OUT, { recursive: true });
const framesDir = join(OUT, ".frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

function inputAt(i, n) {
  const u = i / n;
  if (u < 1 / 3) return { throttle: true, steer: 0, brake: false };
  if (u < 2 / 3) return { throttle: true, steer: 0.85, brake: false };
  return { throttle: false, steer: 0.15, brake: true };
}

function encode(id, pattern, fps) {
  const dest = join(OUT, `${id}.mp4`);
  // No audio track. WebKit only autoplays a video that is silent or muted,
  // and a silent file is the one iPhone will start inside this preview.
  const ff = spawnSync("ffmpeg", [
    "-y", "-framerate", String(fps), "-start_number", "0", "-i", pattern,
    "-an",
    "-vf", "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.0", "-pix_fmt", "yuv420p",
    "-preset", "veryfast", "-crf", "20", "-r", String(fps),
    "-movflags", "+faststart", dest,
  ], { encoding: "utf8" });
  if (ff.status !== 0) throw new Error(`encode ${id}: ${(ff.stderr || "").slice(-300)}`);
  return dest;
}

function writePage(id, title) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  html, body { margin: 0; background: #000; }
  video { display: block; width: 100%; height: auto; background: #000; }
</style>
</head>
<body>
<video autoplay muted loop playsinline webkit-playsinline preload="auto" width="640" height="360">
  <source src="/cams/${id}.mp4#t=0.001" type="video/mp4">
</video>
</body>
</html>
`;
  writeFileSync(join(OUT, `${id}.html`), html);
}

const srv = await startStaticServer(ROOT);
const clips = [];
try {
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(180000);
  await installProbeInit(page, { backend: "webgl2", motion: true });
  await page.goto(srv.url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 180000 });
  log("booted");
  await page.evaluate(() => window.__apex.race("monaco", "day", "dry", { laps: 1 }));
  await page.waitForFunction(() => window.__apex.info().track === "monaco", null, { polling: 100, timeout: 180000 });
  log("track up");
  await page.evaluate(() => {
    window.__apex.renderScale(0.75);
    window.__apex.hud(false);
    window.__apex.go();
    window.__apex.jump(0.22, 42, 0);
    window.__apex.setInput({ throttle: true, steer: 0, brake: false });
    window.__apex.step(1 / 60, 8);
    window.__apex.snapCam(1 / 60);
  });
  log("warm");

  const wanted = camArg
    ? CAMS.filter((c) => c[0] === camArg)
    : CAMS.filter((c) => !only || only.has(c[0]));
  if (camArg && wanted.length === 0) throw new Error("unknown camera " + camArg);

  for (const [id, title, note] of wanted) {
    const t = Date.now();
    await page.evaluate((cam) => {
      window.__apex.camera(cam);
      window.__apex.jump(0.22, 42, 0);
      window.__apex.setInput({ throttle: true, steer: 0, brake: false });
    }, id);
    const frames = camArg ? FULL_FRAMES : PHASES.length;
    const steps = camArg ? SIM_PER_FRAME : 5;
    const batch = camArg ? 4 : 1;
    let fov0 = 0;
    let fov1 = 0;
    let speed = 0;
    let mode = id;
    for (let start = 0; start < frames; start += batch) {
      const inputs = [];
      for (let i = start; i < Math.min(start + batch, frames); i++) {
        inputs.push(camArg ? inputAt(i, frames) : PHASES[i]);
      }
      const shots = await page.evaluate(({ inputs, steps }) => {
        const canvas = document.querySelector("#game canvas") || document.querySelector("canvas");
        const out = [];
        for (const input of inputs) {
          window.__apex.setInput(input);
          window.__apex.step(1 / 60, steps);
          window.__apex.snapCam(1 / 60);
          const c = window.__apex.camState();
          const p = window.__apex.probe();
          out.push({
            b64: canvas ? canvas.toDataURL("image/jpeg", 0.86) : "",
            fov: +c.fov.toFixed(1),
            speed: +(+p.speed).toFixed(1),
            mode: window.__apex.viewState().camMode,
          });
        }
        return out;
      }, { inputs, steps });
      shots.forEach((shot, k) => {
        if (!shot.b64.includes(",")) throw new Error("no canvas for " + id);
        const n = String(start + k).padStart(3, "0");
        writeFileSync(join(framesDir, `${id}-${n}.jpg`), Buffer.from(shot.b64.split(",")[1], "base64"));
        if (start + k === 0) fov0 = shot.fov;
        fov1 = shot.fov;
        speed = shot.speed;
        mode = shot.mode;
      });
      if (camArg) log(`  ${id} ${Math.min(start + batch, frames)}/${frames}`);
    }
    encode(id, join(framesDir, `${id}-%03d.jpg`), camArg ? PLAY_FPS : 4);
    writePage(id, title);
    clips.push({
      id, title, note, src: `${id}.mp4`, fov: [fov0, fov1], speed, mode,
      full: !!camArg,
    });
    log(`clip ${id} saw ${mode} fov ${fov0}→${fov1} @ ${speed} m/s ${Date.now() - t}ms`);
  }
  await browser.close();
} finally {
  await shutdown();
  rmSync(framesDir, { recursive: true, force: true });
}

const made = Object.fromEntries(clips.map((c) => [c.id, c]));
const all = [];
for (const [id, title, note] of CAMS) {
  if (!existsSync(join(OUT, `${id}.mp4`))) continue;
  all.push(made[id] || { id, title, note, src: `${id}.mp4` });
}
const full = all.some((c) => c.full);
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
  heading: "Apex 26",
  note: full
    ? "The marked clip is a full pass: throttle, a turn, then the brakes. Tap to play."
    : "One clip per camera. Throttle, then a turn, then a brake. Tap to play.",
  clips: all,
}, null, 2));
log(`done ${all.length} clips → ${OUT}`);
if (!only && all.length !== CAMS.length) process.exit(1);
