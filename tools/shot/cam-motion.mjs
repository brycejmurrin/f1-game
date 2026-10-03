#!/usr/bin/env node
// cam-motion.mjs — does each camera come out of the RIG different, and does
// the live lens leave that pose alone?
// @doc Chase/far/heli speed-open and per-mode corner pose, from the rig not a second dolly.
//
//   node tools/shot/cam-motion.mjs
//
// A parked solve (no dt) must put the eye in the same place as a live frame.
// The lens may open. Chase and far, taken on the same car, must not match.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const S = 200;
const SPEED = 60;

function loadRig() {
  const ctx = vm.createContext({
    console, Math, Object, Array, isFinite, Number, JSON,
    CamTune: { get: () => 0, cornerLead: () => 0, apply: (_m, _e, _t, fov) => fov },
    Log: { info() {} },
  });
  const files = [
    "js/core/mat4.js",
    "js/camera/drive-chase.js",
    "js/camera/drive-broadcast.js",
    "js/camera/drive-onboard.js",
    "js/camera/feel.js",
    "js/camera/extra-rigs.js",
    "js/camera/vantage.js",
  ];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  const track = makeTrack();
  ctx.Tracks = makeTracks(track);
  const cams = vm.runInContext("GameCams", ctx);
  const feel = vm.runInContext("CamFeel", ctx);
  cams.init({ vmax: 72 });
  return { cams, feel, track };
}

function makeTrack() {
  const total = 4000, n = Math.round(total / 4), ds = total / n, hw = 6;
  const py = new Float64Array(n), pz = new Float64Array(n), px = new Float64Array(n);
  for (let k = 0; k < n; k++) pz[k] = k * ds;
  return {
    total, n, px, py, pz,
    rx: new Float64Array(n).fill(1), ry: new Float64Array(n), rz: new Float64Array(n),
    hw: new Float64Array(n).fill(hw),
    def: {},
    surface: { heightAt: (k) => py[((Math.round(k) % n) + n) % n] },
  };
}

function makeTracks(track) {
  const at = (arr, s) => {
    const n = track.n, L = track.total;
    let v = s % L; if (v < 0) v += L;
    const fi = v / L * n, i = Math.floor(fi) % n, j = (i + 1) % n;
    return arr[i] + (arr[j] - arr[i]) * (fi - Math.floor(fi));
  };
  return {
    sample(t, s, out) {
      out.p[0] = at(t.px, s); out.p[1] = at(t.py, s); out.p[2] = at(t.pz, s);
      out.t[0] = 0; out.t[1] = 0; out.t[2] = 1;
      out.r[0] = 1; out.r[1] = 0; out.r[2] = 0;
      out.hw = at(t.hw, s);
      return out;
    },
    curvature: () => 0,
    banking: (_t, _s, _lat, scr) => { if (scr) { scr.dy = 0; scr.roll = 0; return scr; } return { dy: 0, roll: 0 }; },
  };
}

function shot(rig, mode, extra) {
  const v = rig.cams.vantage(rig.track, mode, S, 0, SPEED, 0, extra);
  return {
    eye: v.eye.slice(),
    tgt: v.tgt.slice(),
    fov: v.fov,
    back: S - v.eye[2],
    lift: v.eye[1],
    lat: v.eye[0],
  };
}

const LIVE = { dt: 1 / 60, att: {}, slipLat: 0, carPos: [0, S], carHead: 0 };
const PARK = { att: {}, slipLat: 0, carPos: [0, S], carHead: 0 };

/** One frame of every mode, from the rig, parked and live. */
export function checkCamMotion() {
  const rig = loadRig();
  const modes = [
    "chase", "far", "drift", "low", "reverse",
    "heli", "side", "cinematic", "overhead", "drone", "rival", "pitwall", "trackside",
    "cockpit", "hood", "visor", "tcam", "rear",
  ];
  const rows = [];
  for (const mode of modes) {
    rig.feel.resetFollow();
    const parked = shot(rig, mode, PARK);
    rig.feel.resetFollow();
    const live = shot(rig, mode, LIVE);
    const moved = Math.hypot(live.eye[0] - parked.eye[0], live.eye[1] - parked.eye[1], live.eye[2] - parked.eye[2]);
    rows.push({ mode, parked, live, moved });
  }
  const by = Object.fromEntries(rows.map((r) => [r.mode, r]));
  const failures = [];
  const must = (cond, msg) => { if (!cond) failures.push(msg); };

  for (const r of rows) {
    const opens = r.mode === "chase" || r.mode === "far" || r.mode === "heli";
    if (!opens) must(r.moved < 0.02, `${r.mode} eye moved ${r.moved.toFixed(3)} m when the lens went live`);
  }
  const chaseOpen = by.chase.live.back - by.chase.parked.back;
  const farOpen = by.far.live.back - by.far.parked.back;
  must(chaseOpen > 0.8, "chase opens with speed, got " + chaseOpen.toFixed(2));
  must(farOpen > chaseOpen + 0.6, "far opens further than chase");
  must(by.heli.live.lift > by.heli.parked.lift + 0.8, "heli climbs with speed");
  must(by.cockpit.moved < 0.02, "cockpit stays bolted");
  must(by.far.live.back > by.chase.live.back + 2, "far sits further back than chase");
  must(by.heli.live.lift > by.chase.live.lift + 8, "heli is a different height from chase");
  must(by.overhead.live.lift > by.heli.live.lift + 8, "overhead is above the helicopter");
  must(by.low.live.lift < by.chase.live.lift - 0.4, "low cam stays under the chase cam");
  must(Math.abs(by.side.live.lat) > Math.abs(by.chase.live.lat) + 4, "the TV cam sits out to the side");
  must(by.chase.live.fov + 0.01 >= by.chase.parked.fov, "chase lens does not close when a frame has dt");

  rig.feel.resetFollow();
  const hooked = shot(rig, "drift", PARK);
  rig.feel.resetFollow();
  const slid = shot(rig, "drift", { ...PARK, slipLat: 6 });
  must(Math.abs(slid.lat - hooked.lat) > 2, "drift swings outside a slide");

  rig.feel.resetFollow();
  const coast = shot(rig, "chase", PARK);
  rig.feel.resetFollow();
  const braked = shot(rig, "chase", { ...PARK, att: { baPitch: 0.024 } });
  must(braked.back < coast.back - 0.15, "chase tucks in under braking");

  return { ok: failures.length === 0, rows, failures };
}

function table(rows) {
  const line = (r) => [
    r.mode.padEnd(10),
    r.live.back.toFixed(1).padStart(7),
    r.live.lift.toFixed(1).padStart(7),
    r.live.lat.toFixed(1).padStart(7),
    r.live.fov.toFixed(1).padStart(7),
    r.moved.toFixed(3).padStart(7),
  ].join("  ");
  return ["mode         back    lift     lat     fov   moved", ...rows.map(line)].join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = checkCamMotion();
  console.log(table(r.rows));
  if (!r.ok) {
    console.error("\n" + r.failures.join("\n"));
    process.exit(1);
  }
  console.log("\n" + r.rows.length + " cameras, pose from the rig, lens only on top");
}
