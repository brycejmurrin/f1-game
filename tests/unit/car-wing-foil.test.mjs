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
  for (const f of ["js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/helmets.js", "js/car/car3d.js"]) {
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
  // 3120 -> 3148: the nose running lights, measured. Two flank markers and a
  // crown bar, twelve triangles each as addBox lofts them; they are !ckpt, so
  // the cockpit ceiling below is untouched.
  // 3148 -> 3172: the rounded engine-cover crown. The cover loft is three
  // stacked blocks over Car3D.coverProfile (flank, lower facet, upper facet +
  // crown) instead of one trapezoid — two more addBlock lofts, twelve triangles
  // each. Measured 3172 exactly; !ckpt, so the cockpit ceiling is untouched.
  // 3172 -> 3472: the driver's head. It was a five-stack hemisphere in the
  // team's own paint — 120 triangles of beach ball, the same for both cars in
  // a team and invisible against the bodywork it matched. It is a full-face
  // helmet now (js/car/helmets.js): an ovoid swept from a real profile, with a
  // chin bar, a lens-shaped visor aperture on the glass surface, and a painted
  // design per race number. 432 triangles at 12 rings x 18 slices, the rings
  // bunched into the top 60% where the cockpit rim lets you see them — evenly
  // spread at the same resolution it came to 792. Measured 3472; the helmet is
  // built in BOTH passes, so the cockpit ceiling below moves with it.
  // 3472 -> 4136: the helmet at 20 rings x 28 slices, 1120 triangles against
  // 432. NOT a nicer curve — the shape was already right, traced off
  // photographs, and 12 x 18 draws it perfectly well. It is the DESIGNS. Per-
  // vertex colour can only paint what a vertex lands on, and at 12 rings the
  // gaps in t were 0.09: a keyline 0.024 wide fell between two rings and did
  // not exist in a frame, while an 18-slice shell puts 20 degrees between
  // vertices, so a 12-degree flash smeared across its neighbours instead of
  // reading as a stripe. Every driver's livery was therefore as coarse as a
  // dipped shell in the only place it matters, and looked correct only in the
  // per-pixel contact sheet. 20 x 28 puts the gaps at 0.05 and 12.9 degrees.
  // The car is drawn at most twenty times a frame; this is 664 triangles on
  // the one part of it that tells you WHO you are looking at, and the mesh is
  // cached per team, not rebuilt. Measured 4136.
  // 4136 -> 4232: THE COCKPIT APERTURE. The tub over the driver was one
  // closed loft, so a ray down the centreline crossed the deck and the old
  // surround slab and never found an opening — the helmet pierced a solid
  // car. The span is now a tub capped at the seat floor, a rail either side
  // with a dark liner and a coaming, a floor and a rear bulkhead; the slab it
  // replaces gave 12 back. +96 net, on the one hole every photo of the car
  // is taken through. Measured 4232.
  // 4232 -> 4400: THE OCCUPANT, and the opening reaching the wheel. The
  // aperture alone did not read as a cockpit — a hole with a floating
  // helmet in it is a hole — so the well now carries a torso, two arms,
  // gloves and a yoke (+84), and the opening runs forward from z 0.05 to
  // z 0.28 so the wheel is not roofed by solid monocoque (+84). Measured
  // 4400. This is the part of the car every photo is taken through.
  // 4400 -> 6800: the helmet PAINT. Flat paint made every colour edge a mesh
  // edge, so at 20x28 (12.9 degrees of azimuth per cell) every diagonal
  // boundary came out as a staircase — on the macos-latest GPU render of
  // 2026-09-09 (car-shot.yml run 34293766619) the busy designs read as static
  // rather than as designs. helmets.js now splits a quad only while its own
  // corners disagree about the paint, so triangles land on the boundary LINES
  // and nowhere else; the base grid is untouched, so the NORMALS and the shape
  // are bit-identical and this is a paint change only. MAX_SPLIT 1 is measured
  // at the size the helmet is actually seen (~110 px, the cockpit view): it is
  // a clear gain on no split, and depth 2 is barely separable from it while
  // costing 9,292 triangles against 3,292. Default body measured 5360; the
  // busiest of the 22 designs measured 6572, and the ceiling has to clear the
  // WHOLE FIELD, not the default livery. The cockpit ceiling below does NOT
  // move: the helmet is not built in that pass (measured 1428, unchanged).
  assert.ok(body <= 6800, `default body ${body} > 6800`);
  // ...AND FOR EVERY DRIVER, not just the default livery. The helmet paint is
  // per-design, so the busiest of the 22 costs more triangles than the
  // generated default this test builds: #1 at 6398 against a default of 5360.
  // (The 6572 in the raise note above was measured before the doodle replaced
  // the cell speckle, which shortened the paint boundary; this assertion is
  // now the live number and that one is history.) That gap lived only in a
  // COMMENT, which is the same "documented
  // but not asserted" hole the parts-physics duplicate above was deleted for —
  // a design could have grown past 6800 with every test green.
  let worst = { num: null, tris: 0 };
  for (const t of Teams.LIST)
    for (const d of t.drivers) {
      const n = tris(Car3D.build(C1, C2, { noWheels: true, num: d.num }));
      if (n > worst.tris) worst = { num: d.num, tris: n };
    }
  assert.ok(worst.tris <= 6800, `#${worst.num} body ${worst.tris} over the ceiling — the busiest helmet design, which the default build does not reach`);
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

test("a shadow silhouette keeps the helmet shape without paint-split cost", () => {
  const full = tris(Car3D.build(C1, C2, { noWheels: true }));
  const sil = tris(Car3D.build(C1, C2, { noWheels: true, silhouette: true }));
  const empty = tris(Car3D.build(C1, C2, { noWheels: true, noDriver: true }));
  assert.ok(sil < full, `silhouette ${sil} should be under full ${full}`);
  assert.ok(sil > empty, `silhouette ${sil} dropped the helmet (noDriver is ${empty})`);
  const caster = tris(Car3D.build(C1, C2, { silhouette: true }));
  const painted = tris(Car3D.build(C1, C2, {}));
  assert.ok(caster < painted, `shadow caster ${caster} still carries paint-split helmet (${painted})`);
  // Field AI bodies (opts.field) drop paint-edge splits; torso stays (unlike :sh).
  // Norris (#1) is a busy lid — flat designs can match at either split depth.
  const field = tris(Car3D.build(C1, C2, { noWheels: true, field: true, num: 1 }));
  const splitBody = tris(Car3D.build(C1, C2, { noWheels: true, num: 1 }));
  assert.ok(field < splitBody, `field ${field} should drop paint-split vs ${splitBody}`);
  assert.ok(field > sil, `field ${field} still carries the in-tub torso :sh drops (${sil})`);
  assert.match(SRC, /sil \|\| field/);
  const GAME = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.match(GAME, /teamMeshKey\(team\) \+ ":sh"/);
  assert.match(GAME, /silhouette: true/);
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
