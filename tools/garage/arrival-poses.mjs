#!/usr/bin/env node
// @doc Samples the real GarageArrival poses (pit stop, race start, after-race home) to JSON frames for the Blender previz.
/* The garage arrival and drive-out are analytic functions of time in
 * js/garage/arrival.js. This loads that file (and crew-draw.js, its ease) in a
 * Node VM — no browser — and samples car x/z/yaw, the camera eye/aim/fov, the
 * shutter and the caption at --fps, so tools/gen/blender/garage-previz.py keys
 * the same motion the game plays instead of porting the maths a second time.
 *
 *   node tools/garage/arrival-poses.mjs [--dir in|out|home|both|all] [--angle cut|left|right|high|low|door|director]
 *        [--result win|podium|points|finish|dnf] [--crew current] [--fps 24] [--calm] [--out artifacts/garage-previz/poses.json]
 *
 * `home` is AFTER THE RACE (poseHome) for --result; `all` is in, out and home.
 *
 * The bay (TrackPit.BAY: w, depth, h, doorW, doorH) rides along for the room.
 * Game coordinates: metres, +Y up, the parked car at the origin nose to +Z (the
 * door at z = 6.4). Times are seconds of show time (speed 1). */
import vm from 'node:vm';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function loadArrival() {
  const ctx = vm.createContext({});
  for (const f of ['js/garage/crew-draw.js', 'js/garage/arrival.js', 'js/track/core/pit.js']) {
    vm.runInContext(readFileSync(resolve(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { Arrival: vm.runInContext('GarageArrival', ctx), bay: vm.runInContext('TrackPit.BAY', ctx) };
}

const r3 = (v) => Math.round(v * 1000) / 1000 || 0;   // no -0 (yaw = side * 0)

/** Frames of one playback: `dir` "in" (pose), "out" (poseOut) or "home" (poseHome, for `result`). */
export function sample(Arrival, { dir = 'in', angle = 'cut', crew = 'current', fps = 24, calm = false, result = 'win' } = {}) {
  const key = dir === 'out' ? 'leaveCrew' : dir === 'home' ? 'homeCrew' : 'enterCrew';
  const cfg = Arrival.settings({ angle, [key]: crew, result });
  const fn = Arrival.poseFor(dir);
  const length = Arrival.duration(cfg, dir), n = Math.ceil(length * fps);
  const frames = [];
  for (let i = 0; i <= n; i++) {
    const t = Math.min(length, i / fps), p = fn(t, cfg, calm);
    frames.push({ t: r3(t), x: r3(p.x), z: r3(p.z), yaw: r3(p.yaw), door: r3(p.door),
      eye: p.eye.map(r3), aim: p.aim.map(r3), fov: p.fov, label: p.label, camera: p.camera });
  }
  return Object.assign({ dir, angle, crew: cfg[key], fps, calm, length: r3(length), frames }, dir === 'home' ? { result: cfg.result } : {});
}

function main(argv) {
  const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
  if (argv.includes('--help')) {
    console.log('usage: node tools/garage/arrival-poses.mjs [--dir in|out|home|both|all] [--angle cut|left|right|high|low|door|director] [--result win|podium|points|finish|dnf] [--crew current] [--fps 24] [--calm] [--out <json>]');
    return;
  }
  const dir = opt('dir', 'both'), angle = opt('angle', 'cut'), crew = opt('crew', 'current'), result = opt('result', 'win');
  const fps = Number(opt('fps', 24)), calm = argv.includes('--calm');
  const out = resolve(opt('out', 'artifacts/garage-previz/poses.json'));
  const { Arrival, bay } = loadArrival();
  if (!['in', 'out', 'home', 'both', 'all'].includes(dir) || !Arrival.ANGLES.includes(angle) || angle === 'custom' || !Arrival.RESULTS[result] || !(fps > 0 && fps <= 120)) {
    console.error('bad --dir / --angle / --result / --fps; use --help'); process.exit(2);
  }
  const dirs = dir === 'both' ? ['in', 'out'] : dir === 'all' ? ['in', 'out', 'home'] : [dir];
  const clips = dirs.map((d) => sample(Arrival, { dir: d, angle, crew, fps, calm, result }));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ source: 'js/garage/arrival.js', bay: { ...bay }, clips }) + '\n');
  console.log(JSON.stringify({ out, clips: clips.map((c) => ({ dir: c.dir, length: c.length, frames: c.frames.length })) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
