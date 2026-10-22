/* lazy-race-geom-warm.test.mjs — D·DP3: warmFlaps mints the flap meshes the
 * race draw hits, not only the hinge solve. Behaviour pins via VM counters.
 *
 * Run: node --test tests/unit/lazy-race-geom-warm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

test("race warmFlaps path mints flap set meshes for every rival", () => {
  const rec = { set: 0, flap: 0, solves: 0 };
  const flaps = [
    { wing: "front", y: 0, z: 0, zAngle: 0, xAngle: 0.2 },
    { wing: "rear", y: 0, z: 0, zAngle: 0, xAngle: 0.3, paint: "rearWing" },
  ];
  const v = carDrawVm({ casters: true });
  v.ctx.Car3D.aeroFlaps = () => { rec.solves++; return flaps; };
  // warmFlaps reads CarMesh.getAeroFlapSet / getAeroFlap on the global (not the
  // create-time destructure). Swap before re-create.
  v.ctx.CarMesh = {
    getAeroFlapSet: () => { rec.set++; return { set: true }; },
    getAeroFlap: () => { rec.flap++; return { flap: true }; },
    getExhaustFlame: () => ({ flame: true }),
    getErsLight: () => ({ ers: true }),
    getBrakeRing: () => ({ br: true }),
    getSpinDisc: () => ({ sd: true }),
    getCompoundRing: () => ({ cr: true }),
    getCarDecalMesh: () => ({}), getCockpitDecalMesh: () => ({}),
    getCockpitWheel: () => ({}), getCockpitDash: () => ({}), getCockpitCabin: () => ({}),
    getCockpitGlass: () => ({}), getMirrorFallback: () => ({}), getMirrorGlass: () => ({}),
    getLedStrip: () => ({}), getGearDigit: () => ({}), getSpeedDigit: () => ({}),
    getErsBar: () => ({}), getOtLamp: () => ({}), drawWheelExtras() {},
  };
  const src = fs.readFileSync(path.join(process.cwd(), "js/car/car-draw.js"), "utf8")
    .replace(/^const\b/gm, "var");
  vm.runInContext(src, v.ctx, { filename: absSrc("js/car/car-draw.js") });
  const deps = {
    resolveLivery: (team) => ({ c1: team.color, c2: team.color2, wing: team.color2 }),
    partsVisualKey: () => "x",
    drawAeroFlaps() {},
    damp: (a, b) => b,
    isTimeTrial: () => false,
    isQuali: () => false,
  };
  v.G.getTeamParts = () => ({});
  const carDraw = v.ctx.CarDraw.create(v.G, deps);
  v.field((c, i) => 3000 - 9 * i);
  carDraw.warmCarAssets();
  // 21 rivals (lodWarm) + the player (warmLazyRaceMeshes): closed + open each.
  assert.equal(rec.set, 22 * 2, "closed + open flap set per field car (21 rivals + player)");
  assert.equal(rec.flap, 22 * 2, "each flap element mesh per field car");
  assert.ok(rec.solves >= 22, "hinge solve still runs");
});
