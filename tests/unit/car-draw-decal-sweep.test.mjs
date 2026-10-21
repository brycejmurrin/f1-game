/* car-draw-decal-sweep — the race sweep of js/car/car-draw.js, on the REAL CarDraw (tests/helpers/car-draw-vm.mjs):
 *   - a garage browse leaves atlases nobody draws in the race; while the race flushes decals they are freed
 *     once they have gone DECAL_STALE_FRAMES flushes undrawn, the drawn ones are kept, and a freed car
 *     re-mints on its next draw;
 *   - the garage (no flush), a non-race state and photo mode never sweep;
 *   - the summed _decalTexBytes equals the live set (decalBytes: one record per cached key, none left behind).
 * Run: node --test tests/unit/car-draw-decal-sweep.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

function rig() {
  const v = carDrawVm({});
  const freed = [];
  v.G.gfx.createTexture = (canvas) => ({ canvas });
  v.G.gfx.freeTexture = (t) => freed.push(t.canvas.id);
  v.G.gfx.drawDecal = () => {};
  v.ctx.LiveryTex = {
    IS_MOBILE: false,
    playerHiResDeferred: () => true,
    buildAtlas: (teamId, _liv, num) => ({ id: teamId + "#" + num, width: 512, height: 512 }),
  };
  v.ctx.requestIdleCallback = () => {};
  v.ctx.setTimeout = () => {};
  return { ...v, freed };
}
const team = (id) => ({ id, drivers: [{ num: 1 }] });
const m = new Float32Array(16);
const flush = (r, n, drawn) => {
  for (let i = 0; i < n; i++) {
    r.carDraw.beginDecals();
    for (const t of drawn) r.carDraw.queueCarDecals(t, m, 1, false, false);
    r.carDraw.flushDecals(false);
  }
};

test("a race frees the atlases it no longer draws and keeps the field's", () => {
  const r = rig(), keep = [team("a"), team("b")], gone = [team("x"), team("y"), team("z")];
  for (const t of keep.concat(gone)) r.carDraw.getCarDecalTexture(t, 1, false);   // the garage browse + the warm
  assert.equal(r.carDraw.decalBytes().live, 5);
  r.G.state = "race";
  flush(r, 1200, keep);
  assert.deepEqual(r.freed.sort(), ["x#1", "y#1", "z#1"]);
  const d = r.carDraw.decalBytes();
  assert.equal(d.live, 2);
  assert.equal(d.recorded, d.live, "one byte record per live atlas");
  assert.equal(d.bytes, 2 * Math.round(512 * 512 * 4 * 4 / 3), "summed bytes == the live set");
  r.carDraw.getCarDecalTexture(gone[0], 1, false);   // a freed car draws again: it re-mints
  assert.equal(r.carDraw.decalBytes().live, 3);
});

test("a rival still in the field keeps its atlas though no decal of it is queued", () => {
  const r = rig(), far = team("far"), gone = team("x");
  r.G.cars = [{ team: far, num: 1 }];   // racing, but past the LOD range / behind the eye: never queued
  for (const t of [far, gone]) r.carDraw.getCarDecalTexture(t, 1, false);
  r.G.state = "race";
  flush(r, 1200, []);
  assert.deepEqual(r.freed, ["x#1"], "only the non-field atlas goes");
  assert.equal(r.carDraw.decalBytes().live, 1);
});

test("the garage, the menu and photo mode never sweep", () => {
  for (const [state, photo] of [["garage", false], ["menu", false], ["race", true]]) {
    const r = rig();
    for (const t of [team("a"), team("x")]) r.carDraw.getCarDecalTexture(t, 1, false);
    r.G.state = state; r.G.photoMode = photo;
    flush(r, 1200, [team("a")]);
    assert.equal(r.freed.length, 0, state + (photo ? " + photo" : ""));
  }
});
