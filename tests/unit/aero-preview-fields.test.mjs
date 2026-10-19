/* aero-preview-fields.test.mjs — the B·D3 design-preview aero/floor fields.
 *
 * Six opt-in visual fields (aero: rwSpoon, beam2, monkey, fwBridge, xwing;
 * floor: ddiff), each carried by one PREVIEW catalog row that clones a shipped
 * row's cost and stats. Two contracts: the field reaches the mesh (the preview
 * row builds a different car from the row it clones), and the field is OFF by
 * default (an explicit 0 builds the shipped car bit-for-bit), so no factory
 * car moves.
 *
 * Run: node --test tests/unit/aero-preview-fields.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const team = M.Teams.LIST.find((t) => t.id === "mclaren");
const PREVIEW = [
  ["aero", "spoon_wing", "low", "rwSpoon"],
  ["aero", "beam_twin", "high", "beam2"],
  ["aero", "monkey_seat", "extreme", "monkey"],
  ["aero", "bridge_wing", "medium", "fwBridge"],
  ["aero", "x_wings", "rake_setup", "xwing"],
  ["floor", "double_diffuser", "gurney_edge", "ddiff"],
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

test("each preview field is registered and clones its base row's cost and stats", () => {
  for (const [cat, id, base, field] of PREVIEW) {
    assert.ok(M.Parts.VISUAL_FIELD_REGISTRY.geometry[cat].includes(field), `${field} registered`);
    const o = opt(cat, id), b = opt(cat, base);
    assert.ok(o && b, `${cat}/${id} and ${cat}/${base} exist`);
    for (const k of ["cost", "speed", "accel", "cornering", "braking"]) assert.equal(o[k], b[k], `${id}.${k}`);
    assert.equal(o.visual[field], 1);
  }
});

test("each preview row builds a car distinct from the row it clones", () => {
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
