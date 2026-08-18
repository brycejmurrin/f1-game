/* car-wing-foil.test.mjs — shared Car3D wing section stays sharp and under budget.
 *
 * GLX / WGX / TLX draw the SAME mesh. Soft wings were tessellation (four chord
 * stations, three span boards, unbeveled endplates), not a three.js-only model.
 * Locks the knife-TE sample, the outboard split, plate bevels, and the 2400
 * default-body ceiling.
 *
 * Run: node --test tests/unit/car-wing-foil.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/car/car3d.js"), "utf8");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  for (const f of ["js/mat4.js", "js/car/teams.js", "js/car/parts.js", "js/car/car3d.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext("({ Car3D, Parts, Teams })", ctx);
}

const { Car3D, Parts, Teams } = load();
const C1 = [0.7, 0.05, 0.05], C2 = [0.95, 0.8, 0.1];
const tris = (m) => m.idx.length / 3;

test("foil samples a knife trailing edge and splits the outboard span", () => {
  assert.match(SRC, /const FOIL_T = \[0, 0\.08, 0\.28, 0\.60, 0\.84, 1\]/);
  assert.match(SRC, /mid = half \* 0\.67/);
  assert.match(SRC, /\[-half, -mid\], \[-mid, -inner\], \[-inner, inner\], \[inner, mid\], \[mid, half\]/);
  assert.match(SRC, /function addBeveledSpan\(/);
  assert.match(SRC, /addBeveledSpan\(out,[\s\S]{0,180}\{ z: 2\.66/);
  assert.match(SRC, /addBeveledSpan\(out,[\s\S]{0,180}\{ z: _ep\.front\.z/);
});

test("wing elements stay knife-thin (not 32 mm planks)", () => {
  assert.match(SRC, /\[2\.72, 0\.048, 2\.40, 0\.086, 1\.00, 0\.024\]/);
  assert.match(SRC, /elemRecord\(\[-2\.30, upperTrailY - 0\.270\], \[-2\.52, upperTrailY - 0\.225\], 0\.024, 0\)/);
  assert.match(SRC, /0\.51, 0\.024, c1, 0\.8/);
});

test("one flap is a closed foil, not a 48-triangle plank", () => {
  const flap = Car3D.buildFlapGeom({
    le: [2.50, 0.092], te: [2.24, 0.146], half: 0.92, thick: 0.028,
    taper: 0.98, sweep: 0.04, rise: 0.04, attachHalf: 0.95, y: 0, z: 0,
  }, C1);
  // 5 span × 5 chord intervals × 2 faces × 2 tris.
  assert.equal(tris(flap), 100);
});

test("default body and cockpit stay under the absolute triangle ceilings", () => {
  const body = tris(Car3D.build(C1, C2, { noWheels: true }));
  const cockpit = tris(Car3D.build(C1, C2, { noWheels: true, noDriver: true, cockpit: true }));
  assert.ok(body <= 2400, `default body ${body} > 2400`);
  assert.ok(cockpit <= 1500, `cockpit ${cockpit} > 1500`);
});

test("single-option recipes stay within 1.6x the default triangle budget", () => {
  const teamFor = (opt) => ({
    id: opt.teams?.[0] || opt.team || "mclaren",
    engine: opt.suppliers?.[0] || opt.supplier || "Mercedes",
  });
  const baseParts = Parts.getVisualTiers({}, { id: "mclaren", engine: "Mercedes" });
  const base = tris(Car3D.build(C1, C2, { parts: baseParts }));
  const over = [];
  for (const cat of Parts.CATALOG) {
    for (const opt of cat.options) {
      const team = teamFor(opt);
      const parts = Parts.getVisualTiers({ [cat.id]: opt.id }, team);
      const n = tris(Car3D.build(C1, C2, { parts }));
      if (n > base * 1.6) over.push(`${cat.id}:${opt.id}:${n}`);
    }
  }
  assert.deepEqual(over, [], `over 1.6x default ${base}: ${over.join(", ")}`);
});

test("2026 body keeps a scooped pod, floor teeth, under-fences and a beveled halo", () => {
  assert.match(SRC, /z: 0\.50, inner: 0\.298/);
  assert.match(SRC, /z: -0\.38, inner: 0\.28/);
  assert.match(SRC, /z: -1\.05, inner: 0\.25/);
  assert.match(SRC, /\[-0\.48, -0\.24, 0, 0\.24, 0\.48\]/);
  assert.match(SRC, /fwHalf \* 0\.52/);
  assert.match(SRC, /addBeveledSpan\(out, \{ z: 0\.49, x: 0/);
  assert.match(SRC, /inlet\.width \* 0\.48/);
});

test("factory SIGNATURE wings stay heavier than a stripped low-drag kit", () => {
  const byId = Object.fromEntries(Teams.LIST.map((t) => [t.id, t]));
  const factory = (id) => tris(Car3D.build(C1, C2, {
    noWheels: true,
    parts: Parts.getVisualTiers(Parts.getFactorySetup(byId[id]), byId[id]),
    teamId: id,
  }));
  assert.ok(factory("ferrari") > factory("haas"),
    "Maranello kit should out-triangle Kannapolis low-drag");
});
