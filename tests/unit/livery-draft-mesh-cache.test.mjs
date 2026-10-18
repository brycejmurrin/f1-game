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
  const m0 = v.carDraw.playerBodyMesh(t, car);
  v.carDraw.invalidateCustomMeshCaches();
  assert.equal(v.carDraw.playerBodyMesh(t, car), m0);
});

test("the livery editor drops the team's body caches when its draft ends", () => {
  const src = fs.readFileSync(new URL("../../js/garage/setup-sheet.js", import.meta.url), "utf8");
  const end = src.slice(src.indexOf("function endLivPreview("), src.indexOf("function openSetup("));
  assert.match(end, /invalidateCustomMeshCaches\(team\.id\)/);
});
