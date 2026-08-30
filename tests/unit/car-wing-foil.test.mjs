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
  // 2400 -> 2505: the round-halo tube (15 rings x 6 sides = 168 tris, the two
  // extra rings buying the rounded shoulders) replaced the 64-tri
  // beveled-span chevron. Measured 2496 on the raise.
  // 2505 -> 2545: regulation mirrors — the C14.2.2 inboard-toe housing cant,
  // top winglet, and C3.7.5 outer stay (+48 tris). Measured 2532.
  // 2545 -> 2690: the DIFFUSER. It was one closed loft, so from directly behind
  // — the view a chase camera holds for most of a lap — the back of the car was
  // a featureless grey slab with the brake light floating on it
  // (scratch/renders/car/rb4-diffuser.png). Two tunnels either side of the
  // crash structure, each with a ramped ceiling, an outer wall and two strakes,
  // plus a trailing gurney: +131 tris on the single largest unmodelled surface
  // the car had. Measured 2676.
  // 2690 -> 2830: the RADIATOR INLET. It was one flat dark slab pinned on the
  // pod face — two triangles — so at the audit camera's ~6 mm per pixel the
  // biggest opening on the car had no relief at all and every engine tier
  // photographed the same rectangle at a different size. Now a duct: four
  // throat walls raking to 70% of the mouth over 55 mm, a two-bar proud lip
  // (the lower and inboard bars are cut — they face the undercut and the
  // chassis), and a dark core face at the back. +130 tris for both pods.
  // Measured 2820.
  // 2830 -> 2960: the DETAIL PASS. Most of it was free — a box, a tapered/raked
  // `addSpan` and a 2-station `addStationLoft` are all 6 quads, so the DRS pod,
  // the four rear-endplate louvres, all four uprights, the hub carriers and the
  // crash-structure tail cap changed SHAPE at zero triangles, and the square
  // single tailpipe became an 8-sided `addTube` for +4. The +120 is the front
  // brake ducts: they were plain prisms with no mouth, the same flat-dark-face
  // defect the radiator inlet had, and `addInletMouth` (written for that, never
  // applied here) costs 4 throat walls a side with the lip suppressed. The
  // COCKPIT build skips those mouths — from the seat they are behind the wheels
  // — which is why the cockpit figure did not move at all. Measured 2948.
  // 2960 -> 3120: the second detail pass, all of it shared geometry so every car
  // on the grid gets it. T-camera pod on the roll hoop (+36) — the highest point
  // of the silhouette and bare until now. Rear DRIVESHAFTS (+72), because
  // nothing spanned gearbox to upright and from dead astern the rear wheels
  // floated in clear air. The SPLITTER/tea-tray (+24): the floor's leading edge
  // is z 1.30 and there was nothing ahead of it at all. FOOTPLATES under the
  // primary turning vane (+28) — a default car runs vane 1, which was one blade
  // standing alone on each side. Measured 3112 on the raise.
  assert.ok(body <= 3120, `default body ${body} > 3120`);
  // Cockpit ceiling UNCHANGED at 1500: the six-point harness (+60, measured
  // 1428) fits the existing budget. The straps sit between the eye and the dash
  // coaming, filling the lower frame that the coaming never reaches.
  assert.ok(cockpit <= 1500, `cockpit ${cockpit} > 1500`);
  // THE WHEELS LIVE HERE NOW. tests/specs/parts-physics.spec.js carried a second
  // copy of the body/cockpit/wheel ceilings, drifted from these by two raises,
  // and was red without anyone seeing it — a ratchet with two owners has none.
  // That copy is gone; this file is the sole owner, so the wheel numbers had to
  // come with it or they would have had no owner at all. 500 -> 750: the 500 was
  // written for SEG 18 tyres and never followed the SEG 18 -> 24 raise that made
  // 18-gon tyres stop reading polygonal in a close shot. Measured 692.
  const frontWheel = tris(Car3D.buildWheel(0.32));
  const rearWheel = tris(Car3D.buildWheel(0.38));
  // 750 -> 800: the brake disc gained its OUTER EDGE. It was two flat annuli
  // 16 mm apart with nothing joining them, so `rotorScale` moved rotorOuter by
  // 13.1 mm and measured 12.66 mm WEAK — a flat annulus has no silhouette, so
  // the radius grew and no camera could tell. One SEG-segment cylindrical band
  // per wheel, +48. Measured 740.
  // 800 -> 840: the TYRE SHOULDER. The default profile was [[0,1],[1,1]] — a
  // perfectly cylindrical tread meeting the sidewall at a hard 90 deg corner,
  // i.e. a can, on the object closest to both the chase and the cockpit camera.
  // A real slick rounds off over roughly the outer 30 mm of a 355 mm tread and
  // gives up ~12 mm of its 360 mm radius doing it; TYRE_CROWN/CROWN_W are that
  // measurement at this model's scale. Two extra profile rings = two extra
  // tread bands = +2 x SEG x 2 = +96. The `shoulder` recipe keeps its
  // exaggerated 0.945 / 0.90 balloons above the new default. Measured 836.
  assert.ok(frontWheel <= 840, `front wheel ${frontWheel} > 840`);
  assert.ok(rearWheel <= 840, `rear wheel ${rearWheel} > 840`);
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

test("2026 duct/board/slot knobs are inert at 0 and each deforms the mesh", () => {
  const bare = Car3D.build(C1, C2, { noWheels: true });
  const probe = (visual) => Car3D.build(C1, C2, {
    noWheels: true,
    parts: { aero: 1, _visual: { aero: Object.assign({ id: "probe", tier: 1 }, visual) } },
  });
  const same = (a, b) => a.idx.length === b.idx.length
    && a.pos.every((v, i) => Math.abs(v - b.pos[i]) < 1e-6);
  const neutral = {
    lvl: 2, beam: 0, drs: 0, vane: 1, plate: 1, casc: null, swan: 0, tvane: null,
    duct: 0, board: 0, slot: 0,
    frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
    rearSweep: 0.03, rearTaper: 0.98, floorEdge: 1, floorCut: 0.04, diffuserRise: 1,
  };
  assert.ok(same(probe(neutral), bare), "neutral 2026 knobs must match the default body");
  assert.ok(!same(probe({ ...neutral, duct: 2 }), bare), "duct 2 should add the upper ram");
  assert.ok(!same(probe({ ...neutral, board: 2 }), bare), "board 2 should add the wakeboard");
  assert.ok(!same(probe({ ...neutral, slot: 1 }), bare), "slot 1 should cut the floor corner");
  const aero = Parts.CATALOG.find((c) => c.id === "aero").options;
  for (const id of ["wake_board", "pod_duct", "reg26_concept"]) {
    assert.ok(aero.some((o) => o.id === id), `missing aero option ${id}`);
  }
  const prints = new Map();
  for (const opt of aero) {
    const key = JSON.stringify(Object.fromEntries(
      Object.keys(opt.visual || {}).sort().map((k) => [k, opt.visual[k]])));
    const prev = prints.get(key);
    assert.equal(prev, undefined, `duplicate aero recipe ${prev} vs ${opt.id}`);
    prints.set(key, opt.id);
  }
});

test("2026 body keeps a scooped pod, floor teeth, under-fences and a round halo", () => {
  assert.match(SRC, /z: 0\.50, inner: 0\.298/);
  assert.match(SRC, /z: -0\.38, inner: 0\.28/);
  assert.match(SRC, /z: -1\.05, inner: 0\.25/);
  assert.match(SRC, /\[-0\.48, -0\.24, 0, 0\.24, 0\.48\]/);
  assert.match(SRC, /fwHalf \* 0\.52/);
  // The halo is a smooth swept TUBE whose top bar reads LEVEL with a shallow
  // arch — round in plan, never peaking or dipping toward the centre: pin the
  // primitive, the path builder (crownY + HALO_RISE arch), and the
  // collar/apex datums at the call site.
  assert.match(SRC, /function addTube\(/);
  assert.match(SRC, /function haloHoopPath\(/);
  assert.match(SRC, /crownY \+ HALO_RISE \* Math\.sin\(a\)/);
  assert.match(SRC, /haloHoopPath\(0\.235, 0\.505, -0\.46, 0\.30, 0\.02, crownY, 0\.49\)/);
  assert.match(SRC, /addTube\(out, hoop, hr, 6/);
  assert.match(SRC, /inlet\.width \* 0\.48/);
});

test("recipe-gated part knobs are inert at 0 and each deforms the mesh", () => {
  const bare = Car3D.build(C1, C2, { noWheels: true });
  const probe = (cat, visual) => Car3D.build(C1, C2, {
    noWheels: true,
    parts: { [cat]: 1, _visual: { [cat]: Object.assign({ id: "probe", tier: 1 }, visual) } },
  });
  const same = (a, b) => a.idx.length === b.idx.length
    && a.pos.every((v, i) => Math.abs(v - b.pos[i]) < 1e-6);
  const knobs = [
    ["engine", { scoopLip: 0 }, { scoopLip: 2 }],
    ["exhaust", { lip: 0, shield: 0 }, { lip: 2 }],
    ["exhaust", { lip: 0, shield: 0 }, { shield: 1 }],
    ["fuel", { filler: 0, hatch: 0, vent: 0 }, { hatch: 1 }],
    ["fuel", { filler: 0, hatch: 0, vent: 0 }, { vent: 1 }],
    ["gearbox", { heatFins: 0, ribs: 0 }, { heatFins: 5 }],
    ["gearbox", { heatFins: 0, ribs: 0 }, { ribs: 3 }],
    ["floor", { plank: 0, gurney: 0, scroll: 0 }, { plank: 1 }],
    ["floor", { plank: 0, gurney: 0, scroll: 0 }, { gurney: 1 }],
    ["floor", { plank: 0, gurney: 0, scroll: 0 }, { scroll: 1 }],
    ["ers", { led: null, conduit: 0, blister: 0 }, { blister: 2 }],
    ["suspension", { heave: 0, rocker: 0, push: 0, pull: 0 }, { heave: 1 }],
    ["cockpit", { halo: 0, headrest: 0 }, { halo: 2 }],
    ["cockpit", { halo: 0, headrest: 0 }, { headrest: 1 }],
    ["cockpit", { halo: 0, headrest: 0 }, { headrest: 2 }],
    ["ers", { led: null, conduit: 0, blister: 0, coolerIntake: 0 }, { coolerIntake: 1 }],
    ["ers", { led: null, conduit: 0, blister: 0, coolerIntake: 0 }, { coolerIntake: 2 }],
    ["fuel", { filler: 0, hatch: 0, vent: 0, breather: 0 }, { breather: 1 }],
    ["fuel", { filler: 0, hatch: 0, vent: 0, breather: 0 }, { breather: 2 }],
  ];
  for (const [cat, off, on] of knobs) {
    assert.ok(same(probe(cat, off), bare), `${cat} ${JSON.stringify(off)} must match default body`);
    assert.ok(!same(probe(cat, { ...off, ...on }), bare), `${cat} ${JSON.stringify(on)} should add faces`);
  }
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
