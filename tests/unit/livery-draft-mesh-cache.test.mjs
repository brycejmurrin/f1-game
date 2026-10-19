/* livery-draft-mesh-cache — issue #2796 item 4, on the REAL CarDraw (tests/helpers/car-draw-vm.mjs).
 * The race body caches (teamMesh, teamBodyMesh, playerBodyMesh, cockpit bodies) key on the SAVED
 * livery id, so a cache miss while the garage editor's draft was live stored the DRAFT's paint under
 * it, and CANCEL kept it. invalidateCustomMeshCaches(teamId) drops exactly that team's entries, and
 * the editor's endLivPreview (js/garage/setup-sheet.js) calls it.
 * Run: node --test tests/unit/livery-draft-mesh-cache.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

test("invalidateCustomMeshCaches(teamId) rebuilds that team's bodies and keeps every other team's", () => {
  const v = carDrawVm();
  const [a, b] = v.teams;
  const meshes = (t) => {
    const car = { team: t, num: t.drivers[0].num, isPlayer: true };
    return [v.carDraw.playerBodyMesh(t, car), v.carDraw.teamMesh(t, car, false), v.carDraw.teamBodyMesh(t, car)];
  };
  const a0 = meshes(a), b0 = meshes(b);
  const n0 = v.rec.builds.length;
  assert.deepEqual(meshes(a), a0, "warm: a repeat draw is a cache hit");
  assert.equal(v.rec.builds.length, n0);
  v.carDraw.invalidateCustomMeshCaches(a.id);
  const a1 = meshes(a), b1 = meshes(b);
  assert.equal(v.rec.builds.length, n0 + 3, "the edited team's three bodies are rebuilt");
  a1.forEach((m, i) => assert.notEqual(m, a0[i], `body ${i} of ${a.id} is a fresh build, not the draft-era mesh`));
  assert.deepEqual(b1, b0, "another team's bodies are untouched");
  assert.ok(v.rec.freed >= 3, "the dropped meshes are freed, not orphaned");
});

test("no argument keeps the MY TEAM meaning: only custom: entries go", () => {
  const v = carDrawVm();
  const t = v.teams[0], car = { team: t, num: t.drivers[0].num, isPlayer: true };
  // MY TEAM itself (Teams.DEFAULT_CUSTOM, id "custom"): the entries that MUST go.
  const custom = Object.assign({}, v.ctx.Teams.DEFAULT_CUSTOM, { drivers: [{ name: "You", code: "YOU", num: 99 }] });
  v.teams.push(custom);
  const cCar = { team: custom, num: 99, isPlayer: false };
  const m0 = v.carDraw.playerBodyMesh(t, car);
  const c0 = [v.carDraw.teamMesh(custom, cCar, false), v.carDraw.teamBodyMesh(custom, cCar)];
  const n0 = v.rec.builds.length;
  v.carDraw.invalidateCustomMeshCaches();
  assert.equal(v.carDraw.playerBodyMesh(t, car), m0, "a factory team's body is kept");
  const c1 = [v.carDraw.teamMesh(custom, cCar, false), v.carDraw.teamBodyMesh(custom, cCar)];
  c1.forEach((m, i) => assert.notEqual(m, c0[i], `MY TEAM mesh ${i} is rebuilt`));
  assert.deepEqual(v.rec.builds.slice(n0).map((x) => x.kind + ":" + x.team), ["whole:custom", "body:custom"],
    "exactly MY TEAM's two entries rebuilt");
});

// The cache itself: a repeat is a HIT, a new livery id is a MISS (its own key), and
// going back to the first livery hits the first mesh again — no stale-paint reuse.
test("a livery change misses; the saved livery's mesh is still a hit after it", () => {
  const v = carDrawVm();
  const t = v.teams[1], car = { team: t, num: t.drivers[0].num };
  let liv = "default";
  v.G.getLiveryId = () => liv;
  const m0 = v.carDraw.teamBodyMesh(t, car);
  const n0 = v.rec.builds.length;
  assert.equal(v.carDraw.teamBodyMesh(t, car), m0, "hit");
  assert.equal(v.rec.builds.length, n0);
  liv = "alt"; v.G.store.rev++;
  const m1 = v.carDraw.teamBodyMesh(t, car);
  assert.notEqual(m1, m0, "a new livery id is a miss");
  assert.equal(v.rec.builds.length, n0 + 1);
  liv = "default"; v.G.store.rev++;
  assert.equal(v.carDraw.teamBodyMesh(t, car), m0, "back on the saved livery: the first mesh, a hit");
  assert.equal(v.rec.builds.length, n0 + 1);
});

test("the livery editor drops the team's body caches when its draft ends", () => {
  const src = fs.readFileSync(new URL("../../js/garage/setup-sheet.js", import.meta.url), "utf8");
  const end = src.slice(src.indexOf("function endLivPreview("), src.indexOf("function openSetup("));
  assert.match(end, /invalidateCustomMeshCaches\(team\.id\)/);
});
