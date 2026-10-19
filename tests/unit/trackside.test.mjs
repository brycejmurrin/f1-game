/* trackside.test.mjs — fixed corner cameras + pick hysteresis. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const Tracks = {
    sample(track, s, out) {
      out.p[0] = 0; out.p[1] = 2; out.p[2] = s;
      out.t[0] = 0; out.t[1] = 0; out.t[2] = 1;
      out.r[0] = 1; out.r[1] = 0; out.r[2] = 0;
      out.hw = 7;
      return out;
    },
  };
  const FlybySeq = {
    cornerS(track) {
      track._fbCorners = [{ f: 0.1 }, { f: 0.4 }, { f: 0.7 }];
      return track._fbCorners[0].f * track.total;
    },
    cornerSide: (track, n) => (n % 2 ? 1 : -1),
    clearEye: (t, e) => e,
  };
  const CamAvoid = { freeEye: (t, e) => e };
  const ctx = { Tracks, FlybySeq, CamAvoid, Log: { info() {} } };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js/camera/trackside.js"), "utf8") + "\nthis.exported = TracksideCams;",
    ctx);
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js/camera/fov-fit.js"), "utf8") + "\nthis.fovFit = CamFovFit;", ctx);
  return { ...ctx.exported, fitFovY: ctx.fovFit.fitFovY };
}

test("build places one cam per measured corner outside the half-width", () => {
  const TS = load();
  const track = { total: 1000, id: "test" };
  const cams = TS.build(track);
  assert.equal(cams.length, 3);
  assert.ok(cams[0].eye[0] > 7, "outside to +right when cornerSide is +1");
  assert.ok(cams[0].eye[1] > 2, "raised above the road");
  assert.equal(track._tsCams, cams, "cached on the track");
});

test("pick advances as the car passes each cam, with hysteresis", () => {
  const TS = load();
  const cams = [
    { s: 100, eye: [0, 0, 0] },
    { s: 400, eye: [0, 0, 0] },
    { s: 700, eye: [0, 0, 0] },
  ];
  assert.equal(TS.pick(cams, 150, 1000, 0), 0, "just past first → still first");
  assert.equal(TS.pick(cams, 430, 1000, 0), 1, "well past second → second");
  // Near the switch with prev=0: stay on 0 until HYST_M past the new cam.
  assert.equal(TS.pick(cams, 405, 1000, 0), 0, "hysteresis holds the previous index");
  assert.equal(TS.pick(cams, 400 + TS.HYST_M + 1, 1000, 0), 1);
});

test("pose tightens the lens when the car is far and opens it when the car is close", () => {
  const TS = load();
  const track = { total: 1000, id: "test" };
  const near = TS.pose(track, 100, 0, { carPos: [0, 100] });
  track._tsIdx = 0;
  const far = TS.pose(track, 280, 0, { carPos: [0, 280] });
  assert.ok(near.fov > far.fov, `close shot should be wider (${near.fov} vs ${far.fov})`);
  assert.ok(far.fov <= 22, `a distant car should be on the long lens, got ${far.fov}`);
  assert.ok(near.fov <= 50 && far.fov >= 18, "fov stays inside the clamp");
});

test("far-subject trackside long lens survives final landscape FOV fitting", () => {
  const TS = load();
  const track = { total: 1000, id: "test" };
  const shot = TS.pose(track, 280, 0, { carPos: [0, 280] });
  assert.equal(shot.fov, 18, "far subject reaches the authored telephoto clamp");
  const authored = shot.fov * Math.PI / 180;
  assert.equal(TS.fitFovY(authored, 16 / 9, { cine: false }), authored,
    "normal TRACKSIDE must retain the long lens after the gameplay aspect fit");
});

test("pose aims at the subject car when carPos is supplied", () => {
  const TS = load();
  const track = { total: 1000, id: "test" };
  const p = TS.pose(track, 160, 0, { carPos: [3, 160] });
  assert.ok(p);
  assert.equal(p.tgt[0], 3);
  assert.equal(p.tgt[2], 160);
  assert.equal(p.count, 3);
});

test("trackside snap selects the seek destination without inheriting hysteresis", () => {
  const TS = load(), track = { total: 1000 };
  for (const previous of [0, 2]) {
    track._tsIdx = previous;
    assert.equal(TS.pose(track, 405, 0, { carPos: [0, 405] }).index, previous,
      "continuous playback retains its hysteresis");
    const shot = TS.pose(track, 405, 0, { carPos: [0, 405], snap: true });
    assert.equal(shot.index, 1, "forward and backward seeks use the destination camera");
    assert.equal(shot.eye[2], 400);
    assert.equal(shot.cut, true);
    assert.equal(TS.pose(track, 405, 0, { snap: true }).cut, false, "repeated paused snaps stay put");
  }
  assert.equal(TS.pose(track, 1105, 0, { snap: true }).index, 0, "seek also wraps the lap");
});

test("CAM_MODES keeps trackside at its saved index 14 (apex26.camMode is the index)", () => {
  // Run the real mode table, not a regex over its source: the index IS the persisted camMode.
  const win = {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8"), vm.createContext({ window: win }),
    { filename: "js/camera/mode-switch.js" });
  const ids = win.CamModes.CAM_MODES.map((m) => m.id);
  assert.equal(ids.indexOf("trackside"), 14, "saved camMode 14 must stay trackside; append, never reorder");
  assert.equal(ids[13], "visor", "visor stays directly before it");
});
