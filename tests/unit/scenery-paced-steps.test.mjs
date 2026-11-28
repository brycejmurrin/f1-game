/* PACED SCENERY (#6401, runtime hunt A #2): the garage exterior build and the race
 * build slice between iterator steps, so one step must never hold a whole circuit
 * closure. Monaco and monza's scenery() return a step iterator when stepped (the
 * bahrain.js form), and the visor index bins by cell inserts, not record count.
 * Deterministic: emitted vertices per step and yield counts, never a wall clock. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");

function stepShares(id) {
  const h = buildContext({ assets: false });
  const T = h.sandbox.TrackScenery, orig = T[id];
  const grow = [];
  let syncCalls = 0;
  T[id] = function (api, stepped) {
    if (!stepped) syncCalls++;
    const it = orig(api, true);
    assert.equal(typeof (it && it.next), "function", `${id}: scenery(api, true) returns a step iterator`);
    return (function* () {
      let last = api.out.pos.length, r;
      for (;;) {
        r = it.next();
        grow.push(api.out.pos.length - last); last = api.out.pos.length;
        if (r.done) return;
        yield;
      }
    })();
  };
  h.Tracks.build(h.Tracks.LIST.find((d) => d.id === id));
  assert.equal(syncCalls, 0, "the engine asks for steps");
  const total = grow.reduce((a, b) => a + b, 0);
  return { steps: grow.length, maxShare: Math.max(...grow) / total, total };
}

for (const id of ["monaco", "monza"]) {
  test(`${id} scenery() is paced: many steps, none holding over a third of its geometry`, () => {
    const r = stepShares(id);
    assert.ok(r.total > 100000, `${id} emitted its scenery (${r.total} floats)`);
    assert.ok(r.steps >= 12, `${id}: ${r.steps} steps (the tip: 1)`);
    assert.ok(r.maxShare <= 0.35, `${id}: largest step ${(r.maxShare * 100).toFixed(1)}% of the closure's vertices`);
  });
}

test("a synchronous scenery caller still gets the whole closure (the stepped form drains itself)", () => {
  const emitted = (sync) => {
    const h = buildContext({ assets: false }), orig = h.sandbox.TrackScenery.monza;
    let floats = 0;
    h.sandbox.TrackScenery.monza = function (api, stepped) {
      const before = api.out.pos.length;
      if (sync) { orig(api); floats = api.out.pos.length - before; return undefined; }   // a harness wrapper that never steps
      const it = orig(api, stepped);
      return (function* () { yield* it; floats = api.out.pos.length - before; })();
    };
    h.Tracks.build(h.Tracks.LIST.find((d) => d.id === "monza"));
    return floats;
  };
  const stepped = emitted(false);
  assert.ok(stepped > 100000);
  assert.equal(emitted(true), stepped, "the same geometry, stepped or not");
});

test("the visor index yields by cell inserts: wide slabs cannot pile into one step", () => {
  const h = buildContext({ assets: false });
  const TG = h.sandbox.TrackGeom;
  // The widest slabs a cell still bins: 8 x 8 = 64 cells of 16 m each (#7388 lists wider ones apart).
  const STRIDE = 18, span = 8, count = 4096, records = [];
  for (let i = 0; i < count; i++) {
    const r = new Array(STRIDE).fill(0);
    r[12] = 0; r[14] = i * 16; r[15] = span * 16 - 1; r[17] = i * 16 + span * 16 - 1; r[13] = 0; r[16] = 1;
    records.push(...r);
  }
  const it = TG.lightIndexSteps(records);
  let yields = 0, n;
  while (!(n = it.next()).done) yields++;
  const inserts = count * span * span;
  assert.ok(yields >= inserts / 8192 - 1, `${yields} yields for ${inserts} cell inserts (the tip: record batches of 2048 gave ~1)`);
  assert.equal(n.value.boxes.length, records.length);
  assert.equal(n.value.large.length, 0, "an 8 x 8-cell slab is binned");
  // A 64 x 64-cell slab (4096 inserts before #7388) is one entry of the always-tested list.
  const wide = new Array(STRIDE).fill(0);
  wide[15] = 64 * 16 - 1; wide[17] = 64 * 16 - 1; wide[16] = 1;
  const one = TG.lightIndex(wide);
  assert.deepEqual([...one.large], [0]);
  assert.equal(one.cells.size, 0);
});
