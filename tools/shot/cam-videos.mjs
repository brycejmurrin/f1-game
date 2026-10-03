#!/usr/bin/env node
// cam-videos.mjs — one short mp4 per camera, for an HTML page to play.
//
// Headless recordVideo does not pick up this game's WebGL canvas (the file
// stays on the first cockpit frame while the sim moves on). Each frame is
// stepped, rendered once, and read off the canvas, then ffmpeg stitches the
// jpegs into an h264 mp4 a phone can play.
//
//   node tools/shot/cam-videos.mjs --out /path/to/dir
//
// Writes <id>.mp4 and manifest.json. Monaco, a few frames each: throttle,
// a turn, then a brake.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { installProbeInit } from "./probe-page.mjs";

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
const outIdx = args.indexOf("--out");
const OUT = resolve(outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "scratch/captures/cam-videos");
mkdirSync(OUT, { recursive: true });
const framesDir = join(OUT, ".frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

const srv = await startStaticServer("/workspace/f1-game");
const clips = [];
try {
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.setDefaultTimeout(180000);
  await installProbeInit(page, { backend: "webgl2", motion: true });
  await page.goto(srv.url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { timeout: 180000 });
  log("booted");
  await page.evaluate(() => window.__apex.race("monaco", "day", "dry", { laps: 1 }));
  await page.waitForFunction(() => window.__apex.info().track === "monaco", null, { timeout: 180000 });
  log("track up");
  await page.evaluate(() => {
    window.__apex.renderScale(0.5);
    window.__apex.hud(false);
    window.__apex.go();
    window.__apex.jump(0.18, 58, 0);
    window.__apex.setInput({ throttle: true, steer: 0, brake: false });
    window.__apex.step(1 / 60, 8);
    window.__apex.snapCam(1 / 60);
  });
  log("warm");

  for (const [id, title, note] of CAMS) {
    if (only && !only.has(id)) continue;
    const t = Date.now();
    let fov = [0, 0];
    let speed = 0;
    let mode = id;
    for (let i = 0; i < PHASES.length; i++) {
      const input = PHASES[i];
      const shot = await page.evaluate(async ({ cam, input, i }) => {
        window.__apex.camera(cam);
        window.__apex.setInput(input);
        window.__apex.step(1 / 60, 5);
        window.__apex.snapCam(1 / 60);
        const canvas = document.querySelector("#game canvas") || document.querySelector("canvas");
        const c = window.__apex.camState();
        const p = window.__apex.probe();
        return {
          b64: canvas ? canvas.toDataURL("image/jpeg", 0.72) : "",
          fov: +c.fov.toFixed(1),
          speed: p.speed,
          mode: window.__apex.viewState().camMode,
        };
      }, { cam: id, input, i });
      if (!shot.b64.includes(",")) throw new Error("no canvas for " + id);
      writeFileSync(join(framesDir, `${id}-${i}.jpg`), Buffer.from(shot.b64.split(",")[1], "base64"));
      if (i === 1) fov[0] = shot.fov;
      if (i === PHASES.length - 1) { fov[1] = shot.fov; speed = shot.speed; mode = shot.mode; }
    }
    const dest = join(OUT, `${id}.mp4`);
    const ff = spawnSync("ffmpeg", [
      "-y", "-framerate", "4", "-i", join(framesDir, `${id}-%d.jpg`),
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
      "-movflags", "+faststart", dest,
    ], { encoding: "utf8" });
    if (ff.status !== 0) {
      log(`encode failed ${id}: ${(ff.stderr || "").slice(-300)}`);
      continue;
    }
    clips.push({ id, title, note, src: `${id}.mp4`, fov, speed, mode });
    log(`clip ${id} saw ${mode} fov ${fov[0]}→${fov[1]} ${Date.now() - t}ms`);
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
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
  heading: "Apex 26",
  note: "One clip per camera. Throttle, then a turn, then a brake. Tap to play.",
  clips: all,
}, null, 2));
log(`done ${all.length} clips → ${OUT}`);
if (!only && all.length !== CAMS.length) process.exit(1);
