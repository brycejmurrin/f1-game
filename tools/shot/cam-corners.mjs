#!/usr/bin/env node
// cam-corners.mjs — how much does each camera CHANGE between a straight and
// a corner, on real circuits? A flat number means the rig is glued to the car.
// @doc Straight-vs-corner camera swing on Monaco, Spa, Suzuka, Monza, and Zandvoort.
//
//   node tools/shot/cam-corners.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

const TRACKS = ["monaco", "spa", "suzuka", "monza", "zandvoort"];
const MODES = ["chase", "far", "drift", "low", "reverse", "heli", "side", "cinematic", "overhead"];
const SPEED = 55;

function boot() {
  const Tracks = buildContext(undefined, { quiet: true });
  const ctx = Tracks._vmContext;
  const run = (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(src, ctx, { filename: rel });
  };
  for (const f of [
    "js/camera/drive-chase.js",
    "js/camera/drive-broadcast.js",
    "js/camera/drive-onboard.js",
    "js/camera/feel.js",
    "js/camera/extra-rigs.js",
    "js/camera/vantage.js",
  ]) run(f);
  ctx.GameCams.init({ vmax: 72 });
  return { Tracks, cams: ctx.GameCams, feel: ctx.CamFeel };
}

function corners(Tracks, track) {
  const step = 8;
  let straight = { s: 0, k: Infinity }, left = { s: 0, k: 0 }, right = { s: 0, k: 0 };
  for (let s = 0; s < track.total; s += step) {
    const k = Tracks.curvature(track, s);
    if (Math.abs(k) < Math.abs(straight.k)) straight = { s, k };
    if (k > left.k) left = { s, k };
    if (k < right.k) right = { s, k };
  }
  return { straight, left, right };
}

function pose(env, track, s) {
  const at = ((s % track.total) + track.total) % track.total;
  const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  env.Tracks.sample(track, at, smp);
  const head = Math.atan2(smp.t[0], smp.t[2]);
  return { at, smp, head, carPos: [smp.p[0], smp.p[2]] };
}

function frameAt(env, track, mode, s) {
  env.feel.resetFollow();
  let last = null;
  for (let u = s - 140; u <= s; u += 4) {
    const p = pose(env, track, u);
    const v = env.cams.vantage(track, mode, p.at, 0, SPEED, 0, {
      dt: 4 / SPEED, carPos: p.carPos, carHead: p.head,
    });
    last = { v, p };
  }
  const dx = last.v.eye[0] - last.p.smp.p[0];
  const dy = last.v.eye[1] - last.p.smp.p[1];
  const dz = last.v.eye[2] - last.p.smp.p[2];
  const smp = last.p.smp;
  return {
    lat: dx * smp.r[0] + dy * smp.r[1] + dz * smp.r[2],
    along: dx * smp.t[0] + dy * smp.t[1] + dz * smp.t[2],
    up: dy,
  };
}

const env = boot();
const rows = [];
for (const id of TRACKS) {
  const def = env.Tracks.LIST.find((d) => d.id === id);
  if (!def) { console.error("missing " + id); process.exit(1); }
  const track = env.Tracks.buildCenterline(def);
  const marks = corners(env.Tracks, track);
  for (const mode of MODES) {
    const a = frameAt(env, track, mode, marks.straight.s);
    const l = frameAt(env, track, mode, marks.left.s);
    const r = frameAt(env, track, mode, marks.right.s);
    const swing = Math.abs(l.lat - r.lat);
    const dive = Math.max(Math.abs(l.along - a.along), Math.abs(r.along - a.along));
    rows.push({ id, mode, swing, dive, kL: marks.left.k, kR: marks.right.k });
  }
  console.log(id + "  left k " + marks.left.k.toFixed(4) + "  right k " + marks.right.k.toFixed(4));
}

console.log("\ntrack        mode         swing    dive");
for (const r of rows) {
  console.log([
    r.id.padEnd(12),
    r.mode.padEnd(12),
    r.swing.toFixed(1).padStart(6),
    r.dive.toFixed(1).padStart(7),
  ].join("  "));
}

const weak = [];
const avg = (mode, key) => {
  const mine = rows.filter((r) => r.mode === mode);
  return mine.reduce((s, r) => s + r[key], 0) / mine.length;
};
for (const mode of MODES) {
  const swing = avg(mode, "swing");
  const dive = avg(mode, "dive");
  const need = mode === "far" ? 3 : 4;
  if (swing < need && dive < 1.5) weak.push(`${mode}  swing ${swing.toFixed(1)}  dive ${dive.toFixed(1)}`);
}
if (avg("chase", "swing") <= avg("far", "swing")) {
  weak.push("chase should swing through a corner more than far");
}
if (weak.length) {
  console.log("\nfrozen through a corner:\n" + weak.join("\n"));
  process.exit(2);
}
console.log("\nevery camera moves between a straight and a corner");
