/* car-wing-foil.test.mjs — shared Car3D wing section stays sharp and under budget.
 *
 * GLX / WGX / TLX draw the SAME mesh. Soft wings were tessellation (four chord
 * stations, three span boards, unbeveled endplates), not a three.js-only model.
 * Locks the knife-TE sample, the outboard split, knife-thin elements, and the
 * measured triangle budget in tests/data/car-wing-foil-tris.json.
 *
 * Run: node --test tests/unit/car-wing-foil.test.mjs
 * Re-measure the budget after a deliberate geometry change (review the diff):
 *      node tests/unit/car-wing-foil.test.mjs --update
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { writeFileSync } from "node:fs";
import { seedLog } from "../helpers/seed-log.mjs";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/car/car3d.js"), "utf8");
const BODY_SRC = readFileSync(join(ROOT, "js/car/car-body-geom.js"), "utf8");
const GEOMETRY_SRC = readFileSync(join(ROOT, "js/car/car-geometry.js"), "utf8");
// Geometry builders moved to car-body-geom.js (pure move); scan both.
const CAR_SRC = SRC + "\n" + BODY_SRC;

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  // Deliberately omit car-shade.js: this suite pins the flat-loft car; car-shade.test covers rounding.
  for (const f of ["js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/helmets.js", "js/car/car-geometry.js", "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js", "js/car/car-body-geom.js", "js/car/car3d.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  }
  return vm.runInContext("({ Car3D, Parts, Teams })", ctx);
}

const { Car3D, Parts, Teams } = load();
const C1 = [0.7, 0.05, 0.05], C2 = [0.95, 0.8, 0.1];
const tris = (m) => m.idx.length / 3;

// MEASURED triangle budget (tests/data/car-wing-foil-tris.json). The old
// ceilings were typed constants raised eight-fold with prose; the file is the
// measurement itself, so a geometry change shows up as a reviewable diff.
const BASELINE_PATH = join(ROOT, "tests/data/car-wing-foil-tris.json");
const OPTION_LIMIT = 1.6;
const teamFor = (opt) => ({ id: opt.teams?.[0] || opt.team || "mclaren", engine: opt.suppliers?.[0] || opt.supplier || "Mercedes" });
const optionTris = (cat, opt) => tris(Car3D.build(C1, C2, { parts: Parts.getVisualTiers({ [cat.id]: opt.id }, teamFor(opt)) }));
const defaultTris = () => tris(Car3D.build(C1, C2, { parts: Parts.getVisualTiers({}, { id: "mclaren", engine: "Mercedes" }) }));
function measureFixed() {
  let worst = { num: null, tris: 0 };
  for (const t of Teams.LIST) for (const d of t.drivers) {
    const n = tris(Car3D.build(C1, C2, { noWheels: true, num: d.num }));
    if (n > worst.tris) worst = { num: d.num, tris: n };
  }
  return {
    body: tris(Car3D.build(C1, C2, { noWheels: true })),
    cockpit: tris(Car3D.build(C1, C2, { noWheels: true, noDriver: true, cockpit: true })),
    worstDriver: worst,
    frontWheel: tris(Car3D.buildWheel(0.32)),
    rearWheel: tris(Car3D.buildWheel(0.38)),
    optionBase: defaultTris(),
  };
}
const optionKeys = () => Parts.CATALOG.flatMap((cat) => cat.options.map((opt) => [`${cat.id}:${opt.id}`, cat, opt]));
if (process.argv.includes("--update")) {
  const fixed = measureFixed(), options = {};
  for (const [k, cat, opt] of optionKeys()) options[k] = optionTris(cat, opt);
  const over = Object.entries(options).filter(([, n]) => n > fixed.optionBase * OPTION_LIMIT).map(([k, n]) => `${k}:${n}`);
  if (over.length) { console.error(`refusing to write: over ${OPTION_LIMIT}x the default ${fixed.optionBase}: ${over.join(", ")}`); process.exit(1); }
  writeFileSync(BASELINE_PATH, JSON.stringify({ _note: "measured triangle counts; regenerate with: node tests/unit/car-wing-foil.test.mjs --update", ...fixed, options }, null, 2) + "\n");
  console.log(`wrote ${BASELINE_PATH}`);
  process.exit(0);
}
const BASE = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const REMEASURE = "re-measure with: node tests/unit/car-wing-foil.test.mjs --update (review the diff)";

test("foil samples a knife trailing edge and splits the outboard span", () => {
  const half = 0.92, attachHalf = 0.95;
  const flap = Car3D.buildFlapGeom({
    le: [2.50, 0.092], te: [2.24, 0.146], half, thick: 0.028,
    taper: 0.98, sweep: 0.04, rise: 0.04, attachHalf, y: 0, z: 0,
  }, C1);
  const p = flap.pos, near = (a, b) => Math.abs(a - b) < 1e-3;
  // Leading-edge row (the stations are not tapered there): the span is cut at
  // +-34 % and +-67 % of the half-span, the tip pinned to the attach width.
  const leX = new Set();
  for (let i = 0; i < p.length; i += 3) leX.add(+Math.abs(p[i]).toFixed(3));
  for (const want of [half * 0.34, half * 0.67, attachHalf]) assert.ok([...leX].some((x) => near(x, want)), `no span station at ${want.toFixed(3)} (${[...leX]})`);
  // Chordwise: six stations (le, 0.08, 0.28, 0.60, 0.84, te) on the centre column.
  const centre = new Map();
  for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i]) < 0.32 && Math.abs(p[i]) > 0.30) centre.set(+p[i + 2].toFixed(4), 1);
  assert.equal(centre.size, 6, `inboard column carries ${centre.size} chord stations, not six`);
  // Knife edges: upper and lower skin meet at the trailing edge (section h = 0)
  // and at the nose, while mid-chord has real thickness.
  const spread = new Map();
  for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i]) > 0.30 && Math.abs(p[i]) < 0.32) {
    const k = +p[i + 2].toFixed(4), a = spread.get(k) || [Infinity, -Infinity];
    spread.set(k, [Math.min(a[0], p[i + 1]), Math.max(a[1], p[i + 1])]);
  }
  const rows = [...spread.entries()].sort((a, b) => a[0] - b[0]).map(([, a]) => a[1] - a[0]);
  assert.ok(rows[0] < 1e-6, `trailing edge is not a knife: ${rows[0]}`);
  assert.ok(rows[rows.length - 1] < 1e-6, `leading edge is not closed: ${rows[rows.length - 1]}`);
  assert.ok(Math.max(...rows) > 0.005, "mid-chord has no thickness");
});

test("wing elements stay knife-thin (not 32 mm planks)", () => {
  for (let lvl = 0; lvl <= 4; lvl++) {
    const els = Car3D.aeroFlaps(lvl, null);
    assert.ok(els.length >= 2, `aero level ${lvl} has a wing`);
    for (const e of els) assert.ok(e.thick > 0 && e.thick <= 0.026, `${e.id} at level ${lvl} is ${e.thick * 1000} mm thick`);
    const front = els.filter((e) => /^front/.test(e.id)).map((e) => e.thick);
    for (let i = 1; i < front.length; i++) assert.ok(front[i] <= front[i - 1], `front cascade thins toward the top at level ${lvl}: ${front}`);
  }
});

test("one flap is a closed foil, not a 48-triangle plank", () => {
  const flap = Car3D.buildFlapGeom({
    le: [2.50, 0.092], te: [2.24, 0.146], half: 0.92, thick: 0.028,
    taper: 0.98, sweep: 0.04, rise: 0.04, attachHalf: 0.95, y: 0, z: 0,
  }, C1);
  // 5 span × 5 chord intervals × 2 faces × 2 tris.
  assert.equal(tris(flap), 100);
});

test("twist and teCurve reshape a flap without adding triangles", () => {
  const spec = {
    le: [2.50, 0.092], te: [2.24, 0.146], half: 0.72, thick: 0.020,
    taper: 0.96, sweep: 0.04, rise: 0.04, attachHalf: 0.75, y: 0, z: 0,
  };
  const flat = Car3D.buildFlapGeom(spec, C1);
  const bent = Car3D.buildFlapGeom({ ...spec, twist: 0.22, teCurve: 0.10, chordTaper: 0.32 }, C1);
  assert.equal(tris(bent), tris(flat));
  const moved = bent.pos.some((v, i) => Math.abs(v - flat.pos[i]) > 1e-4);
  assert.ok(moved, "twist/teCurve should move vertices");
  // Most-aft vertex at the tip sits forward of mid-span (planform arc) and
  // above it (outboard twist) so a garage 3/4 does not read as stacked planks.
  const teAt = (mesh, xMin, xMax) => {
    let best = null;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      const x = Math.abs(mesh.pos[i]), y = mesh.pos[i + 1], z = mesh.pos[i + 2];
      if (x < xMin || x > xMax) continue;
      if (!best || z < best.z) best = { y, z };
    }
    return best;
  };
  const mid = teAt(bent, 0.20, 0.52), tip = teAt(bent, 0.73, 0.77);
  assert.ok(mid && tip, "need mid-span and tip TE samples");
  assert.ok(tip.z > mid.z + 0.012, `tip TE should bow forward: mid ${mid.z.toFixed(3)} tip ${tip.z.toFixed(3)}`);
  assert.ok(tip.y > mid.y + 0.006, `tip TE should twist up: mid ${mid.y.toFixed(3)} tip ${tip.y.toFixed(3)}`);
});

test("TEAM_STYLE carries a per-team wingStyle", () => {
  assert.ok(Car3D.TEAM_STYLE.ferrari.wingStyle, "ferrari missing wingStyle");
  const ids = Object.keys(Car3D.TEAM_STYLE);
  const arches = new Set(ids.map((id) => Car3D.TEAM_STYLE[id].wingStyle.arch));
  const twists = new Set(ids.map((id) => Car3D.TEAM_STYLE[id].wingStyle.twist));
  assert.ok(arches.size >= 4, "endplate arch should differ across the grid");
  assert.ok(twists.size >= 4, "flap twist should differ across the grid");
});

test("default body, cockpit, busiest helmet and wheels match the measured budget", () => {
  const m = measureFixed();
  // Exact: a count that moved either way is a geometry change someone must
  // see in the baseline diff; the cockpit pass skips the helmet, the busiest of
  // the 22 helmet designs (not the default livery) sets the field's ceiling.
  for (const k of ["body", "cockpit", "frontWheel", "rearWheel", "optionBase"]) assert.equal(m[k], BASE[k], `${k}: ${m[k]} vs baseline ${BASE[k]} — ${REMEASURE}`);
  assert.deepEqual(m.worstDriver, BASE.worstDriver, `busiest helmet moved — ${REMEASURE}`);
  assert.ok(m.worstDriver.tris >= m.body, "the busiest helmet is never lighter than the default build");
});

test("every recipe option has a measured count, none beyond 1.6x the default (sampled live)", () => {
  const entries = optionKeys();
  assert.deepEqual(Object.keys(BASE.options).sort(), [...new Set(entries.map(([k]) => k))].sort(), `catalog options and baseline differ — ${REMEASURE}`);
  const over = Object.entries(BASE.options).filter(([, n]) => n > BASE.optionBase * OPTION_LIMIT);
  assert.deepEqual(over, [], `baseline holds options over ${OPTION_LIMIT}x ${BASE.optionBase}`);
  // The sweep costs ~70 ms per option (21 s for all): re-build the eight heaviest
  // plus every 12th, exactly; --update re-measures all of them.
  const heavy = new Set(Object.entries(BASE.options).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k));
  const drift = [];
  entries.forEach(([k, cat, opt], i) => {
    if (!heavy.has(k) && i % 12) return;
    const n = optionTris(cat, opt);
    if (n !== BASE.options[k]) drift.push(`${k}: ${n} vs ${BASE.options[k]}`);
  });
  assert.deepEqual(drift, [], `option triangle counts moved — ${REMEASURE}`);
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
  // Shadow casters share one ":sh" mesh per team and it is not the painted car.
  const d = carDrawVm({ casters: true });
  d.field((c, i) => 100 + i * 10);
  const team = d.teams[0];
  const shadow = d.carDraw.teamMesh(team, null, true);
  assert.equal(d.carDraw.teamMesh(team, null, true), shadow, "the caster silhouette is cached per team");
  assert.equal(shadow.kind, "sh", "casters ask Car3D for the silhouette build");
  assert.notEqual(d.carDraw.teamMesh(team, d.G.cars[0], false), shadow, "the painted car is a different mesh");
  assert.equal(d.rec.builds.filter((b) => b.kind === "sh" && b.team === team.id).length, 1, "one caster build per team, not per seat");
});

test("2026 duct/board/slot knobs are inert at 0 and each deforms the mesh", () => {
  const bare = Car3D.build(C1, C2, { noWheels: true });
  const probe = (visual) => Car3D.build(C1, C2, {
    noWheels: true,
    parts: { aero: 1, _visual: { aero: Object.assign({ id: "probe", tier: 1 }, visual) } },
  });
  const same = (a, b) => a.idx.length === b.idx.length
    && a.pos.every((v, i) => Math.abs(v - b.pos[i]) < 1e-6);
  // 2026 defaults: active flaps + in-wash bargeboard (board:1, drs:1). duct/slot
  // still default off — those two alone must match the bare body when left at 0.
  const neutral = {
    lvl: 2, beam: 0, drs: 1, vane: 1, plate: 1, casc: null, swan: 0, tvane: null,
    duct: 0, board: 1, slot: 0,
    frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
    rearSweep: 0.03, rearTaper: 0.98, floorEdge: 1, floorCut: 0.04, diffuserRise: 1,
  };
  assert.ok(same(probe(neutral), bare), "neutral 2026 knobs must match the default body");
  assert.ok(!same(probe({ ...neutral, duct: 2 }), bare), "duct 2 should add the upper ram");
  assert.ok(!same(probe({ ...neutral, board: 2 }), bare), "board 2 should add the wakeboard");
  assert.ok(!same(probe({ ...neutral, slot: 1 }), bare), "slot 1 should cut the floor corner");
  assert.ok(!same(probe({ ...neutral, board: 0, drs: 0 }), bare),
    "pre-2026 board:0/drs:0 must no longer match the default body");
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
  assert.match(CAR_SRC, /z: 0\.50, inner: 0\.298/);
  assert.match(CAR_SRC, /z: -0\.38, inner: 0\.28/);
  assert.match(CAR_SRC, /z: -1\.05, inner: 0\.25/);
  assert.match(CAR_SRC, /\[-0\.48, -0\.24, 0, 0\.24, 0\.48\]/);
  assert.match(CAR_SRC, /fwHalf \* 0\.52/);
  // The halo is a smooth swept TUBE whose top bar reads LEVEL with a shallow
  // arch — round in plan, never peaking or dipping toward the centre: pin the
  // primitive, the path builder (crownY + HALO_RISE arch), and the
  // collar/apex datums at the call site.
  assert.match(GEOMETRY_SRC, /function addTube\(/);
  assert.match(CAR_SRC, /function haloHoopPath\(/);
  assert.match(CAR_SRC, /crownY \+ HALO_RISE \* Math\.sin\(a\)/);
  assert.match(CAR_SRC, /haloHoopPath\(0\.235, 0\.505, -0\.46, 0\.30, 0\.02, crownY, 0\.49\)/);
  // The tube is drawn along `hoopT`: the same 15-point hoop, or with CarShade
  // rounding on (js/car/car-shade.js) a Catmull-Rom spline through those points
  // at 12 sides, because 6 sides on 15 points kinked every ~30 degrees. This
  // file loads car3d WITHOUT CarShade, so everything it builds is the 6-sided
  // tube on the hoop itself; tests/unit/car-shade.test.mjs covers the spline.
  // shadeFlags.round is the shared mutable (was _round) after the car3d split.
  assert.match(CAR_SRC, /hoopT = hoop && shadeFlags\.round \? CarShade\.fine\(hoop, 3\) : hoop/);
  assert.match(CAR_SRC, /addTube\(out, hoopT, hr, shadeFlags\.round \? 12 : 6/);
  assert.match(CAR_SRC, /inlet\.width \* 0\.48/);
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


test("beam cross-section scales linearly on both axes in every orientation", () => {
  const ctx = vm.createContext({});
  vm.runInContext(GEOMETRY_SRC + "\nthis.geometry = CarGeometry;", ctx);
  const geom = ctx.geometry.create({ SURFACES: { paint: 20 } });
  for (const end of [[0, 0, 1], [0, 1, 0], [1, 2, 3]]) {
    const len = Math.hypot(...end), d = end.map(v => v / len);
    let u = [-d[2], 0, d[0]], ul = Math.hypot(...u);
    if (ul < 1e-5) { u = [1, 0, 0]; ul = 1; }
    u = u.map(v => v / ul);
    const v = [d[1]*u[2]-d[2]*u[1], d[2]*u[0]-d[0]*u[2], d[0]*u[1]-d[1]*u[0]];
    for (const th of [0.016, 0.032]) {
      const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
      geom.addBeamBetween(out, [0, 0, 0], end, th, C1);
      assert.ok(out.pos.every(Number.isFinite));
      for (const axis of [u, v]) {
        const projected = [];
        for (let i = 0; i < out.pos.length; i += 3)
          projected.push(axis.reduce((sum, a, j) => sum + a*out.pos[i+j], 0));
        assert.ok(Math.abs(Math.max(...projected)-Math.min(...projected)-th) < 1e-10,
          `beam ${end}: both section dimensions must equal thickness ${th}`);
      }
    }
  }
});

test("fixed front deflectors occur once in both full and split race cars", () => {
  const team = Teams.LIST.find(t => t.id === "mclaren");
  const stock = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
  const variants = [0, 1, 2].map(deflector => ({ ...stock,
    _visual: { ...stock._visual, wheels: { ...stock._visual.wheels, deflector } } }));
  const build = (parts, noWheels) => Car3D.build(team.color, team.color2,
    { teamId: team.id, num: 1, parts, noWheels, noDriver: true, smooth: false });
  const bodies = variants.map(p => build(p, true));
  const full = variants.map(p => build(p, false));
  const layers = variants.map(p => Car3D.buildWheelLayers(.32, null, null, null,
    false, p._visual.tyres, p._visual.brakes, p._visual.wheels));
  for (const level of [1, 2]) {
    const extra = bodies[level].pos.length - bodies[0].pos.length;
    assert.ok(extra > 0, `deflector ${level} must stay on the stationary body`);
    assert.equal(full[level].pos.length - full[0].pos.length, extra,
      "full car and body must contain the same single deflector pair");
    assert.deepEqual(layers[level], layers[0], "deflectors must not rotate with wheels");
    // The appended fixed geometry is identical in both composition paths.
    assert.deepEqual(bodies[level].pos.slice(-extra), full[level].pos.slice(-extra));
  }
  assert.ok(bodies[2].pos.length > bodies[1].pos.length, "biplane adds its upper plane and endplate");
});
