// Mugello Arrabbiata identity + mid-lap survey orbit clearance (#3375).
//
// Survey scenery preset (frac 0.50, az 45, el 22, dist 45) put the eye inside
// FOLIAGE at ~30 m lateral of the Arrabbiata apex — forestEdge gap 14/30 and
// close roadside scatter. Hills also read generic pine (pineFrac 0.12 + PINE
// cols) instead of Tuscan cypress ranks + the hillside casale.
//
// This rebuilds mugello in track-build-vm and asserts:
//   1. Survey mid-lap orbit eye is outside every FOLIAGE AABB and has no
//      FOLIAGE prim centre within 6 m.
//   2. Arrabbiata sector (s 0.47–0.54) still carries tall foliage past 55 m
//      lateral (cypress ranks + far belt) and the mugello-casale modelGroup.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));

const MAT_FOLIAGE = 6;
const SURVEY = { frac: 0.5, az: 45, el: 22, dist: 45, h: 1.5 };

function orbitEye(track, frac, az, el, dist, h) {
  const n = track.n;
  const i = Math.round((((frac % 1) + 1) % 1) * (n - 1));
  const p = [track.px[i], track.py[i], track.pz[i]];
  const tv = [track.tx[i], track.ty[i], track.tz[i]];
  const rv = [track.rx[i], track.ry[i], track.rz[i]];
  const a = az * Math.PI / 180;
  const e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
  let fwd = [tv[0], 0, tv[2]], rt = [rv[0], 0, rv[2]];
  const fl = Math.hypot(fwd[0], fwd[2]) || 1;
  const rl = Math.hypot(rt[0], rt[2]) || 1;
  fwd[0] /= fl; fwd[2] /= fl; rt[0] /= rl; rt[2] /= rl;
  const dir = [
    Math.cos(a) * fwd[0] + Math.sin(a) * rt[0],
    0,
    Math.cos(a) * fwd[2] + Math.sin(a) * rt[2],
  ];
  const eye = [
    p[0] + dir[0] * Math.cos(e) * dist,
    Math.max(p[1] + h + Math.sin(e) * dist, p[1] + 1.2),
    p[2] + dir[2] * Math.cos(e) * dist,
  ];
  return { eye, p, tv, rv, i, hw: track.hw[i] };
}

test("mugello mid-lap survey orbit clears Arrabbiata canopy (#3375)", () => {
  const env = buildContext();
  const def = env.Tracks.LIST.find((d) => d.id === "mugello");
  assert.ok(def, "mugello def");
  const from = env.mark();
  const track = env.Tracks.build(def, {});
  const prims = env.prims.slice(from);
  const { eye, p, tv, rv, hw } = orbitEye(
    track, SURVEY.frac, SURVEY.az, SURVEY.el, SURVEY.dist, SURVEY.h);

  let inside = 0;
  let near = 0;
  const nearHits = [];
  for (const pr of prims) {
    if (pr.mat !== MAT_FOLIAGE) continue;
    const cx = (pr.minX + pr.maxX) / 2;
    const cy = (pr.minY + pr.maxY) / 2;
    const cz = (pr.minZ + pr.maxZ) / 2;
    const d = Math.hypot(cx - eye[0], cy - eye[1], cz - eye[2]);
    if (d < 6) {
      near++;
      if (nearHits.length < 6) {
        const lat = (cx - p[0]) * rv[0] + (cz - p[2]) * rv[2];
        nearHits.push({ d: +d.toFixed(1), lat: +lat.toFixed(1), h: +(pr.maxY - pr.minY).toFixed(1) });
      }
    }
    if (eye[0] >= pr.minX && eye[0] <= pr.maxX
      && eye[1] >= pr.minY && eye[1] <= pr.maxY
      && eye[2] >= pr.minZ && eye[2] <= pr.maxZ) {
      inside++;
    }
  }
  assert.equal(inside, 0,
    `survey orbit eye inside ${inside} FOLIAGE AABB(s) at mid-lap (eye lat~${((eye[0] - p[0]) * rv[0] + (eye[2] - p[2]) * rv[2]).toFixed(1)} hw=${hw})`);
  assert.equal(near, 0,
    `survey orbit has ${near} FOLIAGE centres within 6 m: ${JSON.stringify(nearHits)}`);

  env.release(track);
});

test("mugello Arrabbiata keeps cypress ranks + casale cue (#3375)", () => {
  const env = buildContext();
  const def = env.Tracks.LIST.find((d) => d.id === "mugello");
  const from = env.mark();
  let sawCasale = false;
  const orig = env.sandbox.TrackScenery.mugello;
  env.sandbox.TrackScenery.mugello = function (api) {
    const real = api.modelGroup;
    api.modelGroup = function (id, ...rest) {
      if (id === "mugello-casale") sawCasale = true;
      return real.call(this, id, ...rest);
    };
    return orig(api);
  };
  const track = env.Tracks.build(def, {});
  const prims = env.prims.slice(from);
  const n = track.n;
  // Arrabbiata window: sample nodes 0.47–0.54 and count tall foliage past 55 m lat.
  let tallFar = 0;
  const i0 = Math.round(0.47 * (n - 1));
  const i1 = Math.round(0.54 * (n - 1));
  for (let i = i0; i <= i1; i += 4) {
    const p = [track.px[i], track.py[i], track.pz[i]];
    const rv = [track.rx[i], track.ry[i], track.rz[i]];
    const tv = [track.tx[i], track.ty[i], track.tz[i]];
    const hw = track.hw[i];
    for (const pr of prims) {
      if (pr.mat !== MAT_FOLIAGE) continue;
      const h = pr.maxY - pr.minY;
      if (h < 8) continue;
      const cx = (pr.minX + pr.maxX) / 2;
      const cz = (pr.minZ + pr.maxZ) / 2;
      const lat = (cx - p[0]) * rv[0] + (cz - p[2]) * rv[2];
      const along = (cx - p[0]) * tv[0] + (cz - p[2]) * tv[2];
      if (Math.abs(along) > 40) continue;
      const gap = Math.abs(lat) - hw;
      if (gap >= 55 && gap <= 90) tallFar++;
    }
  }
  assert.ok(sawCasale, "mugello-casale modelGroup must still emit (hillside casale cue)");
  assert.ok(tallFar >= 20,
    `Arrabbiata needs tall foliage ranks past 55 m lat (cypress identity); got ${tallFar}`);
  env.release(track);
});
