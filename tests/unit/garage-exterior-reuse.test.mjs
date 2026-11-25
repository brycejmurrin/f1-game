/* GARAGE EXTERIOR REUSE (#6401, runtime hunt A #1): a garage close parks the one
 * built exterior set (LRU 1, keyed by geometryKey) instead of freeing it, so the
 * next open of the same circuit/team/night re-shows it with no rebuild. Another
 * key, or a hard cancel (race start), frees it. Fake gfx + stub builder in a VM. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = "js/garage/exterior.js";

function rig() {
  const live = new Set(), freed = [];
  let nextId = 1, builds = 0;
  const mesh = () => ({ pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [], col: [], idx: [0, 1, 2] });
  const ctx = vm.createContext({
    performance: { now: () => 0 }, setTimeout, Promise, JSON, Date, Math, Object, Array, Number, String, Error,
    GarageExteriorGeometry: {
      *buildSteps(def) {
        builds++;
        yield; yield;
        return { supported: true, trackId: def.id, ground: mesh(), road: mesh(), props: mesh(), lamps: [[0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
          surface: null, anchor: { side: 1, yaw: 0 }, stats: { vertices: 9 } };
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, SRC), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc(SRC) });
  const gfx = {
    createMesh() { const h = { id: nextId++ }; live.add(h); return h; },
    freeMesh(h) { assert.ok(live.delete(h), "freed a live mesh exactly once"); freed.push(h); },
    draw() {},
  };
  const exterior = ctx.GarageExterior.create({ gfx, load: async (s) => ({ id: s.trackId }), yieldTask: () => Promise.resolve() });
  return { exterior, live, freed, builds: () => builds };
}
const pick = (trackId, over = {}) => Object.assign({ trackId, teamId: "ferrari", weather: "dry", tod: "day", night: false, def: { id: trackId } }, over);

test("a second garage open of the same geometry key reuses the parked set: one build, nothing freed", async () => {
  const r = rig(), base = pick("monaco");
  r.firstDef = base.def;
  assert.equal(await r.exterior.request(base), true);
  const meshes = new Set(r.live);
  r.exterior.release();   // #carsetup hidden
  assert.equal(r.exterior.ready(), false, "a parked set is not drawn");
  assert.equal(r.exterior.draw(), false);
  assert.equal(r.exterior.state().parked, true);
  assert.equal(r.freed.length, 0, "release keeps the built meshes");
  const again = pick("monaco", { weather: "rain", tod: "dusk" });
  again.def = r.firstDef;   // the garage passes the same Tracks.LIST def object every time
  assert.equal(await r.exterior.request(again), true, "weather/tod are appearance, not geometry");
  assert.equal(r.builds(), 1, "no rebuild for the same geometry key");
  assert.deepEqual([...r.live].filter((h) => !meshes.has(h)).length <= 1, true, "only the rain sheet is new");
  assert.equal(r.exterior.state().reuses, 1);
  assert.equal(r.exterior.draw(), true);
});

test("a different key rebuilds and frees the parked set before it allocates (LRU 1)", async () => {
  const r = rig();
  await r.exterior.request(pick("monaco"));
  const first = new Set(r.live);
  r.exterior.release();
  const pending = r.exterior.request(pick("monza"));
  assert.ok([...first].every((h) => !r.live.has(h)), "the parked monaco set is gone before the monza build runs");
  assert.equal(await pending, true);
  assert.equal(r.builds(), 2);
  assert.equal(r.live.size, 3, "one exterior resident: ground + road + props");
  r.exterior.release();
  await r.exterior.request(pick("monza", { teamId: "mclaren" }));
  assert.equal(r.builds(), 3, "the team is part of the geometry key");
  assert.equal(r.live.size, 3);
});

test("cancel (race start) is a hard free: the next open rebuilds", async () => {
  const r = rig();
  await r.exterior.request(pick("monaco"));
  r.exterior.release();
  r.exterior.cancel();
  assert.equal(r.live.size, 0, "cancel frees a parked set");
  assert.equal(r.exterior.state().parked, false);
  await r.exterior.request(pick("monaco"));
  assert.equal(r.builds(), 2);
});

test("a parked set feeds no lights, anchor or palette to a closed garage", async () => {
  const r = rig();
  await r.exterior.request(pick("monaco", { night: true, tod: "night" }));
  r.exterior.release();
  const rig15 = [];
  assert.doesNotThrow(() => r.exterior.appendLights(rig15, 1, 1));
  assert.equal(rig15.length, 0);
  assert.equal(r.exterior.state().anchor, null);
});

test("a release during an unfinished build drops it; nothing half-built is parked", async () => {
  const r = rig();
  const pending = r.exterior.request(pick("monaco"));
  r.exterior.release();
  assert.equal(await pending, false);
  assert.equal(r.live.size, 0);
  assert.equal(r.exterior.state().parked, false);
  assert.equal(await r.exterior.request(pick("monaco")), true, "the next open builds afresh");
  assert.equal(r.live.size, 3);
});

test("a parked set is reused only for the def it was built from (a re-made circuit def rebuilds)", async () => {
  const r = rig(), a = pick("custom"), same = pick("custom"), remade = pick("custom");
  same.def = a.def;   // hydrate fills a def in place: the same object
  await r.exterior.request(a);
  r.exterior.release();
  await r.exterior.request(same);
  assert.equal(r.builds(), 1, "the same def object re-shows the parked set");
  r.exterior.release();
  assert.notEqual(remade.def, a.def);
  assert.equal(await r.exterior.request(remade), true);
  assert.equal(r.builds(), 2, "a new def object with the same id rebuilds");
  assert.equal(r.live.size, 3, "and the stale set was freed");
});
