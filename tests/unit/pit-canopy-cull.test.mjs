// Pit canopy luminaires stay in the culled frame on the working lane at night
// (behind-cam bias, tail-light reserve with traffic, phone 24 and TLX-lite 16).
// Pure Node — same stack as lamp-fixture-anchor / frame-lights-shed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { seedLog } from "../helpers/seed-log.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

function loadLighting(trackEnv) {
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array, WeakMap, performance: { now: () => 1e9 } };
  sb.window = sb;
  vm.createContext(sb);
  seedLog(sb);
  sb.Tracks = {
    sample(track, s, out) {
      trackEnv.sandbox.TrackSpline.sample(track, s, out);
    },
  };
  for (const f of [
    "js/render/shared/light-budget.js",
    "js/lighting/knobs.js",
    "js/lighting/track-lights.js",
    "js/lighting/frame-lights.js",
  ]) vm.runInContext(readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), sb);
  return sb;
}

function pitEye(track, s, spline) {
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  spline.sample(track, s, smp);
  const lat = track.pit.side * (smp.hw + (track.pit.off.corrOut + track.pit.off.workOut) / 2);
  return {
    eye: [smp.p[0] + smp.r[0] * lat, smp.p[1] + 1.6, smp.p[2] + smp.r[2] * lat],
    fwd: [smp.t[0], 0, smp.t[2]],
  };
}

function inSet(lights, post) {
  if (!lights) return false;
  for (let o = 0; o < lights.length; o += 15) {
    if (Math.hypot(lights[o] - post.x, lights[o + 1] - post.y, lights[o + 2] - post.z) < 1.5) return true;
  }
  return false;
}

let sb;
const env = buildContext();
const FL = () => sb.FrameLights;
const LT = () => sb.LightKnobs.LT;

test("on the pit straight the six canopy lamps survive the night cull (budget tiers)", () => {
  sb = loadLighting(env);
  const T = env.Tracks;
  const track = env.release(T.build(T.LIST.find((d) => d.id === "bahrain"), { night: true }));
  env.trim(0);
  track._lights = sb.TrackLights.buildTrackLights(track);
  const pit = (track.lampPosts || []).filter((p) => p.pit && !p.entry);
  assert.equal(pit.length, 6);
  const mid = track.pit.row.boxes[5].s;
  const cam = pitEye(track, mid, env.sandbox.TrackSpline);
  const frame = { perChunkLights: 0, time: 10 };
  const player = { s: mid, x: 0, brakeHeat: 0 };
  const cars = [player];
  for (let i = 1; i < 8; i++) cars.push({ s: (mid + i * 14) % track.total, x: i % 2 ? 2 : -2, brakeHeat: 0.2 });

  const cases = [
    { label: "desktop-solo", mobile: false, slots: 48, emit: 0 },
    { label: "desktop-traffic", mobile: false, slots: 48, emit: 1 },
    { label: "phone-traffic", mobile: true, slots: 48, emit: 1 },
    { label: "tlx-lite-traffic", mobile: false, slots: 16, emit: 1 },
  ];

  for (const c of cases) {
    sb.LightBudget.setSlots(c.slots);
    LT().tailLightEmit = c.emit ? 1 : 0;
    frame.time += 1;
    sb.performance.now = () => frame.time * 1000;
    FL().setFrameLights(frame, track, cars, cam.eye, 0.26, cam.fwd, c.mobile, null);
    if (c.emit) FL().appendCarTailLights(frame, track, cars, player, c.mobile);
    const n = frame.lights ? frame.lights.length / 15 : 0;
    const cap = c.mobile ? 24 : Math.min(48, c.slots);
    assert.ok(n <= cap, `${c.label}: ${n} lights <= cap ${cap}`);
    if (c.emit) assert.equal(frame.tailCount | 0, 5, `${c.label}: five tail slots reserved`);
    let kept = 0, near = 0, nearKept = 0;
    for (const p of pit) {
      const on = inSet(frame.lights, p);
      if (on) kept++;
      const d = Math.hypot(cam.eye[0] - p.x, cam.eye[1] - p.y, cam.eye[2] - p.z);
      if (d <= 28) { near++; if (on) nearKept++; }
    }
    const want = c.label === "tlx-lite-traffic" ? 5 : 6;
    assert.ok(kept >= want, `${c.label}: ${kept}/6 canopy in frame (want >= ${want}, total lights ${n})`);
    assert.equal(nearKept, near, `${c.label}: every canopy within 28 m is lit (${nearKept}/${near})`);
  }
});
