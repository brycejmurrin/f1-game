/* aero-shapes-d3c.test.mjs — the B·D3c concept-sheet wings (RIFT / KEEL /
 * DELTA / SERPENT).
 *
 * Seven opt-in aero shape fields (fwCurve, fwStep, epShape, epTip, wsFlat,
 * rwRise, rwCurve), carried by four STYLE rows that clone a shipped row's cost
 * and stats. Contracts: each field is registered, each row builds a car
 * distinct from its base, an explicit 0 builds the shipped car bit-for-bit (so
 * no factory car moves), and the flown flaps take the same tip lift as the
 * baked elements (the slot between them survives at the tips).
 *
 * Run: node --test tests/unit/aero-shapes-d3c.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const team = M.Teams.LIST.find((t) => t.id === "mclaren");
const ROWS = [
  ["style_aero_rift", "high", ["fwStep", "epShape", "epTip", "rwCurve"]],
  ["style_aero_keel", "medium", ["wsFlat", "epShape"]],
  ["style_aero_delta", "diffuser", ["fwCurve", "epShape", "rwRise", "rwCurve"]],
  ["style_aero_serpent", "rake_setup", ["fwCurve", "epShape", "rwRise", "rwCurve"]],
];
const FIELDS = ["fwCurve", "fwStep", "epShape", "epTip", "wsFlat", "rwRise", "rwCurve"];
const hash = (mesh) => {
  let x = 0x811c9dc5;
  for (const arr of [mesh.pos, mesh.col, mesh.mat]) for (let i = 0; i < arr.length; i++) {
    x ^= Math.round(arr[i] * 4096) & 0xffff; x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(16) + ":" + mesh.pos.length;
};
const tiersFor = (id) => M.Parts.getVisualTiers({ ...M.Parts.DEFAULTS, aero: id }, team);
const build = (parts) => hash(M.Car3D.buildComplete(team.color, team.color2, { teamId: team.id, num: 4, parts }));
const opt = (id) => M.Parts.CATALOG.find((c) => c.id === "aero").options.find((o) => o.id === id);

test("every shape field is registered and each row clones its base row's cost and stats", () => {
  for (const f of FIELDS) assert.ok(M.Parts.VISUAL_FIELD_REGISTRY.geometry.aero.includes(f), `${f} registered`);
  for (const [id, base, fields] of ROWS) {
    const o = opt(id), b = opt(base);
    assert.ok(o && b, `${id} and ${base} exist`);
    assert.equal(o.tag, "STYLE");
    for (const k of ["cost", "speed", "accel", "cornering", "braking"]) assert.equal(o[k], b[k], `${id}.${k}`);
    for (const f of fields) assert.ok(o.visual[f], `${id}.${f} set`);
  }
});

test("each row builds a car distinct from the row it clones", () => {
  for (const [id, base] of ROWS) assert.notEqual(build(tiersFor(id)), build(tiersFor(base)), `${id} reaches the mesh`);
});

test("explicit 0 on every shape field builds the shipped car bit-for-bit", () => {
  for (const [, base] of ROWS) {
    const shipped = tiersFor(base);
    const zero = Object.fromEntries(FIELDS.map((f) => [f, 0]));
    const off = { ...shipped, _visual: { ...shipped._visual, aero: { ...shipped._visual.aero, ...zero } } };
    assert.equal(build(off), build(shipped), `${base}: zeros change nothing`);
  }
});

test("flown flaps carry the same tip lift as the baked wing", () => {
  const G = M.Car3D;
  for (const [id] of ROWS) {
    const st = tiersFor(id)._visual.aero;
    for (const el of G.aeroFlaps(3, st)) {
      const want = el.wing === "front" ? [st.fwCurve || 0, st.fwStep || 0] : [st.rwCurve || 0, st.rwRise || 0];
      const got = el.wing === "front" ? [el.rise2 || 0, el.riseStep || 0] : [el.rise2 || 0, el.rise || 0];
      assert.deepEqual(got, want, `${id} ${el.id}`);
    }
  }
});
