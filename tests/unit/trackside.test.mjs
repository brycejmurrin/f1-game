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
  return ctx.exported;
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

test("pose aims at the subject car when carPos is supplied", () => {
  const TS = load();
  const track = { total: 1000, id: "test" };
  const p = TS.pose(track, 160, 0, { carPos: [3, 160] });
  assert.ok(p);
  assert.equal(p.tgt[0], 3);
  assert.equal(p.tgt[2], 160);
  assert.equal(p.count, 3);
});

test("CAM_MODES appends trackside last (save-index contract)", () => {
  const ms = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  const ids = [...ms.matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids[ids.length - 1], "trackside");
  assert.ok(ids.includes("visor"), "visor stays before the append");
  assert.ok(ids.indexOf("visor") < ids.indexOf("trackside"));
});
