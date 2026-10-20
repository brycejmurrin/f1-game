/* aero-preview-fields.test.mjs — the B·D3 period aero/floor fields.
 *
 * Four opt-in visual fields (aero: rwSpoon, beam2, fwBridge; floor: ddiff),
 * each carried by one STYLE row (js/car/parts.js STYLES) that
 * copies a shipped row's cost and stats. Two contracts: the field reaches the mesh (the preview
 * row builds a different car from the row it clones), and the field is OFF by
 * default (an explicit 0 builds the shipped car bit-for-bit), so no factory
 * car moves.
 *
 * Run: node --test tests/unit/aero-preview-fields.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const team = M.Teams.LIST.find((t) => t.id === "mclaren");
const PREVIEW = [
  ["aero", "style_aero_rwspoon", "low", "rwSpoon"],
  ["aero", "style_aero_beamtwin", "high", "beam2"],
  ["aero", "style_aero_bridge", "medium", "fwBridge"],
  ["floor", "style_floor_ddiff", "gurney_edge", "ddiff"],
];
const hash = (mesh) => {
  let x = 0x811c9dc5;
  for (const arr of [mesh.pos, mesh.col, mesh.mat]) for (let i = 0; i < arr.length; i++) {
    x ^= Math.round(arr[i] * 4096) & 0xffff; x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(16) + ":" + mesh.pos.length;
};
const tiersFor = (cat, id) => M.Parts.getVisualTiers({ ...M.Parts.DEFAULTS, [cat]: id }, team);
const build = (parts) => hash(M.Car3D.build(team.color, team.color2, { teamId: team.id, num: 4, parts }));
const opt = (cat, id) => M.Parts.CATALOG.find((c) => c.id === cat).options.find((o) => o.id === id);

test("each period field is registered and its STYLE row clones its base row's cost and stats", () => {
  for (const [cat, id, base, field] of PREVIEW) {
    assert.ok(M.Parts.VISUAL_FIELD_REGISTRY.geometry[cat].includes(field), `${field} registered`);
    const o = opt(cat, id), b = opt(cat, base);
    assert.ok(o && b, `${cat}/${id} and ${cat}/${base} exist`);
    for (const k of ["cost", "speed", "accel", "cornering", "braking"]) assert.equal(o[k], b[k], `${id}.${k}`);
    assert.equal(o.visual[field], 1);
  }
});

test("each STYLE row builds a car distinct from the row it clones", () => {
  for (const [cat, id, base] of PREVIEW) {
    assert.notEqual(build(tiersFor(cat, id)), build(tiersFor(cat, base)), `${cat}/${id} reaches the mesh`);
  }
});

test("an explicit 0 builds the shipped car bit-for-bit (default off)", () => {
  for (const [cat, , base, field] of PREVIEW) {
    const shipped = tiersFor(cat, base);
    const off = { ...shipped, _visual: { ...shipped._visual, [cat]: { ...shipped._visual[cat], [field]: 0 } } };
    assert.equal(build(off), build(shipped), `${field}: 0 changes nothing`);
  }
});


test("all livery part styles reproduce catalog meshes without mutating fitted parts or performance", () => {
  const setup = { ...M.Parts.DEFAULTS };
  const fitted = M.Parts.getVisualTiers(setup, team);
  const snapshot = JSON.stringify(fitted);
  const stats = JSON.stringify(M.Parts.getMods(setup, team));
  const cost = M.Parts.getCost(setup, team), load = M.Parts.aeroLoad(setup, team);
  const preview = (livery) => hash(M.Car3D.build(team.color, team.color2, { teamId: team.id, num: 4, parts: fitted, livery }));
  const original = preview({});
  for (const [key, category] of Object.entries(M.Car3D.PART_STYLE_FIELDS)) {
    const styles = M.Parts.CATALOG.find((c) => c.id === category).options.filter((o) => o.tag === "STYLE");
    assert.ok(styles.length >= 2);
    for (const o of styles) {
      const actual = preview({ [key]: o.id });
      assert.equal(actual, build(tiersFor(category, o.id)), o.id + " uses the full catalog recipe");
      assert.notEqual(actual, original, o.id + " visibly changes geometry");
    }
    for (const id of ["fitted", "missing", "constructor", M.Parts.DEFAULTS[category],
      M.Parts.CATALOG.find(c => c.id !== category).options.find(o => o.tag === "STYLE").id])
      assert.equal(preview({ [key]: id }), original, key + " ignores invalid or non-STYLE choices");
  }
  assert.equal(preview({ aeroShape: "style_aero_rift", floorShape: "style_floor_ddiff" }),
    build(M.Parts.getVisualTiers({ ...setup, aero: "style_aero_rift", floor: "style_floor_ddiff" }, team)));
  assert.equal(JSON.stringify(fitted), snapshot, "shared fitted recipes stay untouched");
  assert.equal(JSON.stringify(M.Parts.getMods(setup, team)), stats);
  assert.equal(M.Parts.getCost(setup, team), cost);
  assert.equal(M.Parts.aeroLoad(setup, team), load);
});


test("runtime flap/decal recipes follow shape edits, undo and cancel without a store revision", () => {
  const liv = {};
  const v = carDrawVm({ livery: liv });
  v.ctx.Parts = M.Parts; v.ctx.Car3D = M.Car3D;
  const t = v.teams.find((t) => t.id === team.id), setup = { ...M.Parts.DEFAULTS };
  for (const custom of [false, true]) {
    const state = () => v.carDraw.teamDecalState(t, true, custom ? setup : null, "same-stamp");
    const original = state();
    liv.aeroShape = "style_aero_rift"; liv.floorShape = "style_floor_ddiff";
    const changed = state(), expected = M.Parts.getVisualTiers({ ...setup, aero: liv.aeroShape }, t);
    assert.notEqual(changed, original);
    assert.equal(state(), changed, "unchanged shape hits cache");
    assert.deepEqual(changed.aero, M.Car3D.aeroStyleOf(expected));
    assert.deepEqual(M.Car3D.aeroFlaps(changed.val, changed.aero),
      M.Car3D.aeroFlaps(M.Car3D.aeroLevelOf(expected), M.Car3D.aeroStyleOf(expected)));
    delete liv.aeroShape; delete liv.floorShape;
    assert.deepEqual(state().aero, original.aero, "undo/cancel restores fitted flap and decal recipe");
  }
});

test("runtime part recipes follow every style without invalidating for paint edits", () => {
  const liv = {}, v = carDrawVm({ livery: liv });
  v.ctx.Parts = M.Parts; v.ctx.Car3D = M.Car3D;
  const t = v.teams.find(t => t.id === team.id), setup = { ...M.Parts.DEFAULTS };
  for (const custom of [false, true]) {
    const state = () => v.carDraw.teamDecalState(t, true, custom ? setup : null, "same-stamp");
    for (const [field, category] of Object.entries(M.Car3D.PART_STYLE_FIELDS)) {
      const original = state();
      liv[field] = M.Parts.CATALOG.find(c => c.id === category).options.find(o => o.tag === "STYLE").id;
      const changed = state();
      assert.notEqual(changed, original, field + " invalidates cached recipes");
      assert.equal(changed.parts._ids[category], liv[field]);
      assert.equal(state(), changed, "unchanged styles hit cache");
      liv.finish = "chrome";
      assert.equal(state(), changed, "paint alone keeps the same geometry recipe");
      delete liv[field];
      assert.equal(state().parts._ids[category], original.parts._ids[category], field + " restores fitted");
    }
  }
});

test("moving player wheels use livery tyre, brake and rim recipes and restore FITTED", () => {
  const liv = { tyresShape: "style_tyres_retroletter", brakesShape: "style_brakes_drum", wheelsShape: "style_wheels_blownaxle" };
  const v = carDrawVm({ livery: liv }), calls = [];
  v.ctx.Parts = M.Parts;
  v.ctx.Car3D = { ...M.Car3D, buildWheelLayers: (...args) => {
    calls.push(args); return { rotating: {}, fixed: {} };
  } };
  v.G.teamIdx = v.teams.findIndex(t => t.id === team.id);
  const fitted = tiersFor("wheels", M.Parts.DEFAULTS.wheels), snapshot = JSON.stringify(fitted);
  const c = { team: v.teams[v.G.teamIdx], isPlayer: true, human: true, speed: 0 };
  const draw = () => v.carDraw.drawPlayerWheels(c, v.ctx.M4.ident(), 1 / 60, {}, false, 0, 1, true);
  v.carDraw.setPlayerParts(fitted, "same-key"); draw();
  const expected = M.Parts.getVisualTiers({ ...M.Parts.DEFAULTS, tyres: liv.tyresShape, brakes: liv.brakesShape, wheels: liv.wheelsShape }, team);
  for (const [i, category] of [[5, "tyres"], [6, "brakes"], [7, "wheels"]])
    assert.deepEqual(calls[0][i], expected._visual[category], category + " reaches moving wheel mesh");
  assert.equal(calls.length, 2, "front and rear variants are built");
  liv.wheelsShape = "fitted";
  v.carDraw.setPlayerParts(fitted, "same-key"); draw();
  assert.deepEqual(calls[2][7], fitted._visual.wheels, "FITTED rebuilds the installed wheel");
  assert.equal(JSON.stringify(fitted), snapshot, "shared fitted recipes are unchanged");
});

test("concept wing decals cannot reuse fitted wing geometry at the same aero level", () => {
  const created = [];
  M.CarMesh.init({ createTexMesh: (m) => { created.push(m); return m; }, freeMesh() {} });
  const fitted = tiersFor("aero", "high"), changed = M.Car3D.appearanceParts(fitted, { aeroShape: "style_aero_rift" });
  const get = (p) => M.CarMesh.getCarDecalMesh(M.Car3D.aeroLevelOf(p), p, false, team.id, "standard", "standard", "team");
  const original = get(fitted), altered = get(changed);
  assert.notEqual(altered, original);
  assert.notDeepEqual(altered.pos, original.pos, "the projection actually follows different wing surfaces");
  assert.equal(get(changed), altered, "repeat shape reuses its own decal mesh");
});
