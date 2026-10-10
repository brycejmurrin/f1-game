/* cam-avoid.test.mjs — open-circuit wall/building step-in for broadcast cams. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = fs.readFileSync(path.join(ROOT, "js/camera/cam-avoid.js"), "utf8");

function load(FlybySeq, Tracks) {
  const ctx = { FlybySeq, Tracks, Log: { info() {} } };
  vm.runInNewContext(src + "\nthis.exported = CamAvoid;", ctx);
  return ctx.exported;
}

test("applies only to broadcast modes (heli/side/cinematic/low)", () => {
  const CamAvoid = load({ insideProp: () => null, clearEye: (t, e) => e });
  assert.equal(CamAvoid.applies("heli"), true);
  assert.equal(CamAvoid.applies("side"), true);
  assert.equal(CamAvoid.applies("cinematic"), true);
  assert.equal(CamAvoid.applies("low"), true);
  assert.equal(CamAvoid.applies("chase"), false);
  assert.equal(CamAvoid.applies("trackside"), false);
  assert.equal(CamAvoid.applies("cockpit"), false);
});

test("open circuit: steps eye toward the road until clear, then clearEye lifts", () => {
  let clears = 0;
  const box = { x: 20, y: 5, z: 0, w: 10, d: 10, h: 12 };
  const FlybySeq = {
    insideProp(track, eye, m) {
      const M = m || 0;
      if (Math.abs(eye[0] - box.x) < box.w / 2 + M &&
          Math.abs(eye[2] - box.z) < box.d / 2 + M &&
          eye[1] > box.y - box.h / 2 - M && eye[1] < box.y + box.h / 2 + M) return box;
      return null;
    },
    clearEye(track, eye) {
      clears++;
      if (FlybySeq.insideProp(track, eye, 2)) eye[1] = box.y + box.h / 2 + 2;
      return eye;
    },
  };
  const CamAvoid = load(FlybySeq);
  const track = { def: { street: false } };
  const frame = { p: [0, 0, 0], r: [1, 0, 0], hw: 7 };
  const eye = [20, 4, 0];   // inside the box, 20 m to the right of centreline
  CamAvoid.freeEye(track, eye, frame);
  assert.ok(eye[0] < 20, "stepped toward the centreline (x decreases)");
  assert.ok(eye[0] >= frame.hw, "did not cross onto the tarmac past the edge");
  assert.equal(clears, 1, "clearEye ran as the roof safety net");
  assert.equal(FlybySeq.insideProp(track, eye, 2), null, "eye is clear of the box");
});

test("street circuit: skips lateral step-in (corr already owns width)", () => {
  let insides = 0;
  const FlybySeq = {
    insideProp() { insides++; return null; },
    clearEye(track, eye) { return eye; },
  };
  const CamAvoid = load(FlybySeq);
  const eye = [25, 4, 0];
  const before = eye[0];
  CamAvoid.freeEye({ def: { street: true } }, eye, { p: [0, 0, 0], r: [1, 0, 0], hw: 7 });
  assert.equal(eye[0], before, "street path does not shove laterally");
  assert.ok(insides >= 0);
});

// A straight road along +z through the origin (hw 8, right = +x, road at y=0)
// and one prop box whose footprint reaches x=3: a gantry's / angled stand's AABB.
function roadWorld(box) {
  const FlybySeq = {
    insideProp(track, eye, m) {
      const M = m || 0;
      return Math.abs(eye[0] - box.x) < box.w / 2 + M && Math.abs(eye[2] - box.z) < box.d / 2 + M &&
        eye[1] > box.y - box.h / 2 - M && eye[1] < box.y + box.h / 2 + M ? box : null;
    },
    clearEye(track, eye) {
      const hit = FlybySeq.insideProp(track, eye, 2);
      if (hit) eye[1] = hit.y + hit.h / 2 + 2;
      return eye;
    },
  };
  const Tracks = {
    project: (t, x, z) => ({ s: z, lat: x }),
    sample: (t, s, out) => { out.p = [0, 0, s]; out.r = [1, 0, 0]; out.hw = 8; return out; },
  };
  return load(FlybySeq, Tracks);
}

test("the road is clear: an eye on the corridor is not lifted by a box over the tarmac", () => {
  const gantry = { x: 0, y: 4.6, z: 0, w: 20, d: 3, h: 9.2 };   // spans the road
  const CamAvoid = roadWorld(gantry);
  const frame = { p: [0, 0, 0], r: [1, 0, 0], hw: 8 };
  const eye = [1, 0.8, 0];
  CamAvoid.freeEye({ def: { street: false } }, eye, frame);
  assert.equal(eye[1], 0.8, "eye under the gantry keeps its height");
});

test("the road is clear: a box that only its 2 m margin reaches does not lift a road-edge eye", () => {
  const stand = { x: 14, y: 5, z: 0, w: 10, d: 20, h: 10 };      // faces x = 9, eye at x = 8
  const CamAvoid = roadWorld(stand);
  const eye = [8, 0.8, 0];
  CamAvoid.freeEye({ def: { street: false } }, eye, { p: [0, 0, 0], r: [1, 0, 0], hw: 8 });
  assert.equal(eye[1], 0.8);
});

test("off the corridor a solid box still lifts the eye", () => {
  const stand = { x: 20, y: 5, z: 0, w: 10, d: 20, h: 10 };      // spans x 15..25
  const CamAvoid = roadWorld(stand);
  const eye = [22, 4, 0];                                         // 14 m from the centre, past hw + 2
  CamAvoid.freeEye({ def: { street: true } }, eye, { p: [0, 0, 0], r: [1, 0, 0], hw: 8 });
  assert.equal(eye[1], 12, "lifted to the roof plus the 2 m margin");
});

test("vantage.js calls CamAvoid for broadcast modes after look-back", () => {
  const v = fs.readFileSync(path.join(ROOT, "js/camera/vantage.js"), "utf8");
  assert.match(v, /CamAvoid\.applies\(mode\)/);
  assert.match(v, /CamAvoid\.freeEye\(track, eye, cvA\)/);
  assert.match(v, /mode === "trackside"/);
});
