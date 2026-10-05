import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");
const Tracks = buildContext();
const { TrackSurface, TrackDef, TrackMesh } = Tracks._vmContext;
const raw = Tracks._vmContext.TrackDefs.find(d => d.id === "spa");
const def = TrackDef.fromRaw({ ...raw, terrainFalloffStart: 30 });
const track = Tracks.buildCenterline(def, { line: false });
const legacy = TrackSurface.profile({ ...def, terrainFalloffStart: undefined }, track);
const gradual = TrackSurface.profile(def, track);

test("gradual terrain preserves the road shelf and rails", () => {
  assert.deepEqual(gradual.rails, legacy.rails);
  for (let k = 0; k < track.n; k += 11)
    for (const side of [-1, 0, 1])
      for (const dist of [0, 2.2, 7, 12, 14, 25, 30])
        assert.equal(gradual.heightAt(k, dist, side), legacy.heightAt(k, dist, side));
  assert.equal(gradual.floorY, legacy.floorY);
});

test("the pit-side shelf remains level to the complex boundary", () => {
  const pitTrack = { ...track, pit: { side: -1, off: { outer: 25 }, bay: { depth: 12 },
    keep: new Float32Array(track.n).fill(45), w: new Float32Array(track.n).fill(1) } };
  const a = TrackSurface.profile({ ...def, terrainFalloffStart: undefined }, pitTrack);
  const b = TrackSurface.profile(def, pitTrack);
  for (let k = 0; k < track.n; k += 31)
    for (const dist of [2.2, 12, 30, 40, 45]) {
      // lerp(a,b,1) can differ by a few ulps when its first input changes.
      assert.ok(Math.abs(b.heightAt(k, dist, -1) - a.heightAt(k, dist, -1)) < 1e-10);
      assert.ok(Math.abs(b.heightAt(k, dist, -1) - (track.py[k] - .03)) < 1e-10);
    }
});

test("high terrain distributes its drop and joins the floor smoothly", () => {
  const k = Array.from(track.py).indexOf(Math.max(...track.py));
  const outer = gradual.outerW;
  const grade = (p, d) => (p.heightAt(k, d + .01) - p.heightAt(k, d - .01)) / .02;
  assert.ok(Math.abs(grade(gradual, outer - .01)) < .01);
  assert.ok(Math.abs(grade(gradual, 30) - grade(legacy, 30)) < .01);
  assert.ok(Math.abs(grade(gradual, outer * .9)) < Math.abs(grade(legacy, outer * .9)));
  let previous = gradual.heightAt(k, 30);
  for (let d = 30.25; d <= outer; d += .25) {
    const y = gradual.heightAt(k, d);
    assert.ok(Number.isFinite(y) && y <= previous + 1e-8);
    previous = y;
  }
  assert.equal(gradual.heightAt(k, outer), gradual.floorY);
});

test("invalid or absent falloff retains the legacy profile and definition shape", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, 29, gradual.outerW, "30"]) {
    const d = TrackDef.fromRaw({ ...raw, terrainFalloffStart: value });
    assert.equal(Object.hasOwn(d, "terrainFalloffStart"), false);
    const p = TrackSurface.profile(d, track);
    for (let k = 0; k < track.n; k += 101)
      for (const dist of [0, 12, 30, 48, 80, gradual.outerW])
        assert.equal(p.heightAt(k, dist), legacy.heightAt(k, dist));
  }
});

test("the opt-in keeps actual banked near-road terrain positions unchanged", () => {
  track.surface = legacy;
  const before = TrackMesh.buildTerrain(track);
  track.surface = gradual;
  const after = TrackMesh.buildTerrain(track);
  const rails = gradual.rails.length;
  for (let i = 0; i < after.pos.length / 3; i++) {
    if (gradual.rails[i % rails] > 30) continue;
    for (let c = 0; c < 3; c++)
      assert.equal(after.pos[i * 3 + c], before.pos[i * 3 + c]);
  }
});
