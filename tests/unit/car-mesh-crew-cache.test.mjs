// The pit-stop kit mesh (CarMesh.getCrewMesh) is cached per team COLOUR, and
// a livery editor or custom team mints a new colour per edit. The cache had
// no cap and no free, so every colour ever shown kept its GPU buffers for the
// page's life. It is now FIFO-capped like getAeroFlap, and an evicted mesh is
// handed to gfx.freeMesh. Runs the real js/car/car-mesh.js in a node vm with
// a counting gfx stub and a minimal GaragePrims.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/car/car-mesh.js"), "utf8");

function load() {
  const made = [], freed = [];
  const ctx = {
    Log: { info() {}, warn() {}, error() {} },
    GaragePrims: { block(out) { out.pos.push(0, 0, 0); out.idx.push(out.idx.length); } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "\n;this.CarMesh = CarMesh;", ctx, { filename: "car-mesh.js" });
  const gfx = {
    createMesh(d) { const m = { id: made.length, verts: d.pos.length / 3 }; made.push(m); return m; },
    freeMesh(m) { freed.push(m); },
  };
  ctx.CarMesh.init(gfx);
  return { CarMesh: ctx.CarMesh, made, freed };
}
const colour = (i) => [(i % 100) / 100, Math.floor(i / 100) / 100, 0.5];

test("a colour is built once and reused", () => {
  const { CarMesh, made, freed } = load();
  const a = CarMesh.getCrewMesh([0.1, 0.2, 0.3]);
  assert.ok(a && a.verts > 0);
  assert.equal(CarMesh.getCrewMesh([0.1, 0.2, 0.3]), a);
  // Same 0.01 key resolution as before the cap.
  assert.equal(CarMesh.getCrewMesh([0.101, 0.2, 0.3]), a);
  assert.equal(made.length, 1);
  assert.equal(freed.length, 0);
});

test("the cache is capped and frees the OLDEST colour's mesh", () => {
  const { CarMesh, made, freed } = load();
  const N = 200;
  for (let i = 0; i < N; i++) CarMesh.getCrewMesh(colour(i));
  assert.equal(made.length, N);
  const live = made.length - freed.length;
  assert.ok(live > 0 && live <= 64, `live crew meshes ${live} — the cache is not capped`);
  assert.equal(freed[0], made[0], "FIFO: the first colour is freed first");
  assert.equal(new Set(freed).size, freed.length, "a mesh was freed twice");
  // The newest colour is still resident (no rebuild).
  CarMesh.getCrewMesh(colour(N - 1));
  assert.equal(made.length, N);
  // An evicted colour is rebuilt, not returned freed.
  const again = CarMesh.getCrewMesh(colour(0));
  assert.equal(made.length, N + 1);
  assert.ok(!freed.includes(again));
});

test("no GaragePrims: nothing is built or cached", () => {
  const ctx = { Log: { info() {} } };
  vm.createContext(ctx);
  vm.runInContext(SRC + "\n;this.CarMesh = CarMesh;", ctx);
  let n = 0;
  ctx.CarMesh.init({ createMesh() { n++; return {}; }, freeMesh() {} });
  assert.equal(ctx.CarMesh.getCrewMesh([0.1, 0.1, 0.1]), null);
  assert.equal(n, 0);
});
