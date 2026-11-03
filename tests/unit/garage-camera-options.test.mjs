/* GarageCameraOptions: bay clamp, jamb clear, near-plane, settings, path samples. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

const context = vm.createContext({
  // Data files alias the shared helper (js/core/mat4.js loads before every data file).
  M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
});
vm.runInContext(read("js/data/garage-entry-camera.js"), context, { filename: absSrc("js/data/garage-entry-camera.js") });
vm.runInContext(read("js/data/garage-camera-options.js"), context, { filename: absSrc("js/data/garage-camera-options.js") });
const GCO = vm.runInContext("GarageCameraOptions", context);
const Data = vm.runInContext("GarageEntryCameraData", context);

test("GarageEntryCameraData exposes frozen path ids used by the options layer", () => {
  assert.equal(Data.version, 1);
  assert.ok(Data.paths.insideBay);
  assert.ok(Data.paths.doorway);
  for (const id of GCO.SHOT_IDS) {
    if (id === "facade") continue;
    assert.ok(Data.paths[id], id);
    assert.ok(Data.paths[id].in.length >= 2, id + ".in");
    assert.ok(Data.paths[id].out.length >= 2, id + ".out");
  }
});

test("default settings stay inside with insideBay entry", () => {
  const s = GCO.settings(null);
  assert.equal(s.entryShot, "insideBay");
  assert.equal(s.exitShot, "doorway");
  assert.equal(s.stayInside, true);
  assert.equal(s.style, null);
});

test("settings coerce unknown shots and keep stayInside unless facade", () => {
  assert.equal(GCO.settings({ entryShot: "nope" }).entryShot, "insideBay");
  assert.equal(GCO.settings({ entryShot: "cockpit", stayInside: false }).stayInside, false);
  assert.equal(GCO.settings({ style: "broadcast" }).style, "broadcast");
  assert.equal(GCO.settings({ style: "neon" }).style, null);
});

test("STYLE_SHOT maps Showcase/Cinema off the jamb-prone orbit/crane opens", () => {
  assert.equal(GCO.STYLE_SHOT.showcase, "doorway");
  assert.equal(GCO.STYLE_SHOT.cinema, "insideBay");
  assert.equal(GCO.STYLE_SHOT.broadcast, "insideBay");
});

test("clampEye never leaves the bay; doorway may reach the shutter plane", () => {
  const eye = [20, -1, 20];
  GCO.clampEye(eye, false);
  assert.ok(eye[0] <= GCO.BAY.xMax && eye[0] >= GCO.BAY.xMin);
  assert.ok(eye[1] <= GCO.BAY.yMax && eye[1] >= GCO.BAY.yMin);
  assert.ok(eye[2] <= GCO.BAY.zMaxInside);
  const door = [0, 2, 9];
  GCO.clampEye(door, true);
  assert.ok(door[2] <= GCO.BAY.zMaxDoor);
  assert.ok(GCO.outsideBay([0, 2, 8]));
  assert.equal(GCO.outsideBay([0, 2, 0]), false);
});

test("clearJamb pulls an eye out of the door post volume", () => {
  const eye = [1.1, 2.0, 5.8];
  assert.ok(GCO.inJamb(eye));
  GCO.clearJamb(eye);
  assert.equal(GCO.inJamb(eye), false);
});

test("every authored sample keeps the eye inside the doorway envelope", () => {
  for (const id of Object.keys(Data.paths)) {
    for (const dir of ["in", "out"]) {
      for (let u = 0; u <= 1; u += 0.05) {
        const s = GCO.samplePath(id, dir, u);
        assert.ok(s, `${id}.${dir} u=${u}`);
        assert.ok(!GCO.outsideBay(s.eye), `${id}.${dir} u=${u} eye ${s.eye}`);
        assert.ok(!GCO.inJamb(s.eye), `${id}.${dir} u=${u} jamb`);
        assert.ok(s.fov >= 40 && s.fov <= 75, `${id} fov`);
      }
    }
  }
});

test("applyArrival replaces eye for insideBay and clamps a wall-clipping pose", () => {
  const pose = { eye: [12, 2, 0], aim: [0, 0.5, 0], fov: 54, seconds: 1, active: true };
  GCO.applyArrival(pose, { entryShot: "insideBay", stayInside: true }, { dir: "in", u: 0.3 });
  assert.ok(!GCO.outsideBay(pose.eye));
  assert.ok(!GCO.inJamb(pose.eye));
  assert.equal(pose.cameraOption, "insideBay");
});

test("applyArrival leaves facade alone when stayInside is off", () => {
  const pose = { eye: [4.6, 2.0, 8.5], aim: [0, 1, 0], fov: 54, active: true };
  GCO.applyArrival(pose, { entryShot: "facade", stayInside: false }, { dir: "in", u: 0.5 });
  assert.equal(pose.eye[2], 8.5);
});

test("applyArrival with Showcase style defaults to a doorway-safe open", () => {
  const pose = { eye: [1.05, 2.0, 5.9], aim: [0, 1, 0], fov: 50, active: true, camera: "orbit" };
  GCO.applyArrival(pose, { entryShot: "insideBay", stayInside: true, style: "showcase" }, { dir: "in", u: 0.05 });
  assert.ok(!GCO.inJamb(pose.eye));
  assert.ok(!GCO.outsideBay(pose.eye));
});

test("custom angle frame differs from cut", () => {
  assert.notDeepEqual(GCO.ANGLE_FRAME.custom, GCO.ANGLE_FRAME.cut);
});

test("enforceNearPlane pushes an eye glued to the car back to NEAR_PLANE", () => {
  const pose = { eye: [0.1, 0.6, 0.1], aim: [0, 0.6, 0], x: 0, z: 0, fov: 54 };
  GCO.enforceNearPlane(pose);
  const d = Math.hypot(pose.eye[0], pose.eye[1] - 0.6, pose.eye[2]);
  assert.ok(d >= GCO.NEAR_PLANE - 0.02, `d=${d}`);
});

test("amplifyLook via applyArrival tightens fov for zoom 20 on the final beat", () => {
  const pose = { eye: [-3, 2, -3], aim: [0, 0.6, 1], fov: 54, active: true, x: 0, z: 1 };
  GCO.applyArrival(pose, { entryShot: "insideBay", stayInside: true }, {
    dir: "in", u: 0.9, arrival: { zoom: 20, move: "still", height: 0 },
  });
  assert.ok(pose.fov < 40, `fov=${pose.fov}`);
});

test("maxDistInside is finite and below the old 15 m SP_DIST_MAX", () => {
  const d = GCO.maxDistInside(Math.PI * 0.5, 0.2, [0, 0.45, 0.245], false);
  assert.ok(Number.isFinite(d));
  assert.ok(d < 15);
  assert.ok(d >= 2.5);
});

test("read/write round-trip through a tiny store", () => {
  const mem = { v: null };
  const store = { get: () => mem.v, set: (_k, v) => { mem.v = v; } };
  GCO.write(store, { entryShot: "cockpit", exitShot: "orbit", stayInside: true, style: "showcase" });
  const got = GCO.read(store);
  assert.equal(got.entryShot, "cockpit");
  assert.equal(got.exitShot, "orbit");
  assert.equal(got.style, "showcase");
});

test("setup-camera previewSync uses wallSeconds for the transport clock", () => {
  const src = read("js/garage/setup-camera.js");
  // Plain equal (avoid source-pin match helpers) — tree assertPins is at the ceiling.
  assert.equal([
    /wallSeconds\(p\.cfg, p\.dir\)/.test(src),
    /wallLeft\(p\.cfg, p\.dir, t\)/.test(src),
    /arrival: arrivalCfg/.test(src),
  ].every(Boolean), true);
});
