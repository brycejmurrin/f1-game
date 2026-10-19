/* livery-paint-zones.test.mjs — the PAINT ZONES livery fields (floor / suspension / brake ducts /
 * deflectors / cockpit surround / number board tints, floor / suspension / nose / rim finishes, grip
 * and exhaust-heat tints) on a real Car3D build. Unset = byte-identical mesh; each field changes
 * only its own section's vertices; every field is wired through FIELDS, the resolve copy and the
 * garage sheet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const M = loadParts();
// CarWheels and Liveries are not on loadParts' return, so a second small context grabs them.
const W = (() => {
  const ctx = { console, Math, Object, Array, Float32Array, JSON, Number, String, Boolean, isFinite, Map, Set, WeakMap };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ["js/core/log.js", "js/car/car-material-shade.js", "js/car/car-materials.js", "js/car/car-wheels.js", "js/car/liveries.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  return { CarWheels: vm.runInContext("CarWheels", ctx), Liveries: vm.runInContext("Liveries", ctx) };
})();
const team = M.Teams.LIST.find((t) => t.id === "ferrari");
const S = M.Car3D.SURFACES, FS = M.Car3D.FINISH_SURFACE;
const sel = Object.assign({}, M.Parts.defaults ? M.Parts.defaults() : {});
const parts = M.Parts.getVisualTiers(sel, team);
const deflParts = M.Parts.getVisualTiers(Object.assign({}, sel, { wheels: "works_rim" }), team);   // deflector: 2
// measure's parts carry vertex counts in build order; give each its [from, to) range.
const build = (extra, opts) => {
  const m = M.Car3D.build(team.color, team.color2, Object.assign({
    livery: Object.assign({}, team.livery, extra), teamId: team.id, num: 16, parts, noWheels: true, measure: true,
  }, opts || {}));
  let at = 0;
  for (const p of m.parts) { p.from = at; at += p.vertices; p.to = at; }
  assert.equal(at, m.mat.length, "section vertex counts cover the mesh");
  return m;
};
const base = build({});
const sec = (m, name) => m.parts.find((p) => p.name === name);
const changed = (a, b) => {
  const r = [];
  for (let i = 0; i < a.mat.length; i++)
    if (a.mat[i] !== b.mat[i] || a.col[i * 3] !== b.col[i * 3] || a.col[i * 3 + 1] !== b.col[i * 3 + 1] || a.col[i * 3 + 2] !== b.col[i * 3 + 2]) r.push(i);
  return r;
};
const sameShape = (a, b) => assert.deepEqual(Array.from(a.pos), Array.from(b.pos), "a paint zone moved a vertex");
const sectionOf = (m, i) => m.parts.find((p) => i >= p.from && i < p.to);
const maxC = (m, i) => Math.max(m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]);
const PINK = [1, 0, 1];

test("every new field unset, or set to inherit: mesh byte-identical", () => {
  const again = build({ floorFinish: "inherit", suspFinish: "inherit", noseFinish: "inherit", rimFinish: "inherit" });
  assert.deepEqual(Array.from(again.pos), Array.from(base.pos));
  assert.deepEqual(Array.from(again.col), Array.from(base.col));
  assert.deepEqual(Array.from(again.mat), Array.from(base.mat));
});

// [field, value, sections the change may land in]
const TINTS = [
  ["floorTint", PINK, ["sidepods", "bodyDetail", "frontWing"]],
  ["suspTint", PINK, ["suspension"]],
  ["ductTint", PINK, ["brakeDucts"]],
  ["cockpitTint", PINK, ["cockpit", "bolsters"]],
  ["boardTint", PINK, ["sponsorBoard"]],
  ["exhaustTint", [0.2, 0.4, 1.0], ["exhaust"]],
];

test("each zone tint recolours only its own sections, and only to its colour (or the heat glaze)", () => {
  const seen = new Map();
  for (const [field, v, allowed] of TINTS) {
    const m = build({ [field]: v });
    sameShape(base, m);
    const idx = changed(base, m);
    assert.ok(idx.length > 0, `${field} changed nothing`);
    for (const i of idx) {
      const s = sectionOf(m, i);
      assert.ok(s && allowed.includes(s.name), `${field} touched vertex ${i} in ${s && s.name}`);
      if (field !== "exhaustTint") {
        assert.deepEqual([m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]], v.map(Math.fround), `${field} colour`);
        assert.equal(m.mat[i], S.paint, `${field} vertex is paint`);
      } else assert.equal(m.mat[i], base.mat[i], "exhaust heat keeps its metal surface");
    }
    seen.set(field, new Set(idx));
  }
  const names = [...seen.keys()];
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++)
    for (const i of seen.get(names[a])) assert.ok(!seen.get(names[b]).has(i), `${names[a]} and ${names[b]} overlap`);
});

test("FLOOR EDGE: carbon floor parts become paint, voids stay, and every vertex is low on the car", () => {
  const m = build({ floorTint: PINK });
  const idx = changed(base, m);
  assert.ok(idx.some((i) => base.mat[i] === S.carbon), "carbon floor edge became paint");
  for (const i of idx) assert.ok(maxC(base, i) >= 0.045, "an intake void was painted");
  for (const i of idx) assert.ok(m.pos[i * 3 + 1] < 0.5, `floor vertex ${i} at y ${m.pos[i * 3 + 1]}`);
});

test("BRAKE DUCTS: inlet mouths (voids) stay dark", () => {
  const m = build({ ductTint: PINK }), d = sec(base, "brakeDucts");
  let voids = 0;
  for (let i = d.from; i < d.to; i++) if (maxC(base, i) < 0.045) { voids++; assert.equal(m.col[i * 3], base.col[i * 3]); }
  assert.ok(voids > 0, "the duct section still carries its inlet voids");
});

test("zone finishes: floor / suspension land their own surface id, only on that zone", () => {
  for (const [field, tintField, allowed] of [["floorFinish", "floorTint", ["sidepods", "bodyDetail", "frontWing"]], ["suspFinish", "suspTint", ["suspension"]]]) {
    const alone = build({ [field]: "chrome" });
    const idx = changed(base, alone);
    assert.ok(idx.length > 0, `${field} alone finished nothing`);
    for (const i of idx) {
      assert.equal(alone.mat[i], FS.chrome);
      assert.ok(allowed.includes(sectionOf(alone, i).name));
      assert.equal(alone.col[i * 3], base.col[i * 3], `${field} alone keeps the colour`);
    }
    const both = build({ [field]: "matte", [tintField]: PINK });
    const bi = changed(base, both);
    assert.ok(bi.length >= idx.length);
    for (const i of bi) assert.equal(both.mat[i], FS.matte, `${field} + tint`);
    // A whole-car finish reaches a tinted zone through INHERIT.
    const inh = build({ [tintField]: PINK, finish: "satin" }), ref = build({ finish: "satin" });
    for (const i of changed(ref, inh)) assert.equal(inh.mat[i], FS.satin, `${field} inherit`);
  }
});

test("NOSE FINISH: only painted vertices ahead of the bulkhead, on chassis / hood / livery", () => {
  const m = build({ noseFinish: "pearl" });
  sameShape(base, m);
  const idx = changed(base, m);
  assert.ok(idx.length > 30, "the nose cone was finished");
  for (const i of idx) {
    assert.equal(base.mat[i], S.paint);
    assert.equal(m.mat[i], FS.pearl);
    assert.ok(m.pos[i * 3 + 2] >= 1.55, "behind the bulkhead");
    assert.ok(["chassis", "hood", "livery"].includes(sectionOf(m, i).name), "a front-wing or duct vertex took the nose finish");
  }
  // gloss nose on a satin car: the nose stays paint, the rest goes satin.
  const g = build({ noseFinish: "gloss", finish: "satin" });
  assert.ok(idx.every((i) => g.mat[i] === S.paint));
  assert.ok(Array.from(g.mat).some((x) => x === FS.satin));
});

test("DEFLECTORS: tints the over-wheel deflectors (WORKS RIM fits them), nothing without them", () => {
  assert.deepEqual(Array.from(build({ deflectorTint: PINK }).col), Array.from(base.col), "no deflectors = nothing to tint");
  const b0 = build({}, { parts: deflParts }), m = build({ deflectorTint: PINK }, { parts: deflParts });
  const idx = changed(b0, m);
  assert.ok(idx.length > 0, "deflectors tinted");
  for (const i of idx) {
    assert.equal(sectionOf(m, i).name, "wheels");
    assert.ok(Math.abs(m.pos[i * 3]) > 0.6 && m.pos[i * 3 + 1] > 0.4, "deflector vertex is over a front wheel");
  }
});

test("cockpit build: COCKPIT SURROUND dims a pale tint like every other cockpit livery paint", () => {
  const b = build({}, { cockpit: true }), m = build({ cockpitTint: [1, 1, 1] }, { cockpit: true });
  const idx = changed(b, m);
  assert.ok(idx.length > 0, "cockpit bolsters tinted");
  for (const i of idx) assert.ok(m.col[i * 3] < 0.5, "pale cockpit tint was not dimmed");
});

test("RIM FINISH: rim faces take the finish surface; unset wheels are byte-identical", () => {
  const WH = W.CarWheels;
  assert.equal(WH.tints({}).surf, null);
  assert.equal(WH.tints({ rimFinish: "inherit" }).key, "");
  const t = WH.tints({ rimFinish: "chrome" });
  assert.equal(t.surf, FS.chrome);
  assert.ok(t.key.length > 0, "rim finish joins the wheel mesh key");
  const a = M.Car3D.buildWheelLayers(0.32, null, null, null, false);
  const b = M.Car3D.buildWheelLayers(0.32, null, null, null, false, undefined, undefined, undefined, undefined, null);
  assert.deepEqual(Array.from(b.rotating.mat), Array.from(a.rotating.mat));
  const c = M.Car3D.buildWheelLayers(0.32, null, null, null, false, undefined, undefined, undefined, undefined, t.surf);
  let n = 0;
  for (let i = 0; i < a.rotating.mat.length; i++) if (c.rotating.mat[i] !== a.rotating.mat[i]) {
    n++; assert.equal(a.rotating.mat[i], S.metal); assert.equal(c.rotating.mat[i], FS.chrome);
  }
  assert.ok(n > 0, "rim finish changed nothing");
  assert.ok(Array.from(c.rotating.mat).includes(S.rubber), "the tyre stays rubber");
  assert.deepEqual(Array.from(c.fixed.mat), Array.from(a.fixed.mat), "caliper / upright untouched");
});

const NEW = ["floorTint", "floorFinish", "suspTint", "suspFinish", "ductTint", "rimFinish", "deflectorTint",
  "cockpitTint", "gripTint", "noseFinish", "boardTint", "exhaustTint"];

test("GRIPS: getCockpitWheel keys on gripTint only when it is set", () => {
  const src = read("js/car/car-mesh.js");
  assert.match(src, /\(gt \? "\|g" \+ kc\(gt\) : ""\)/, "grip tint joins the key, unset adds nothing");
  assert.match(src, /RUB = gt \|\| \[0\.11, 0\.115, 0\.12\]/);
});

test("every new field is published, copied, offered in the garage, hinted and filed in an editor section", () => {
  const fields = new Set(W.Liveries.FIELDS);
  const cust = read("js/car/custom-liveries.js"), sheet = read("js/garage/setup-sheet.js"), ed = read("js/garage/livery-design-editor.js");
  for (const k of NEW) {
    assert.ok(fields.has(k), `${k} in Liveries.FIELDS`);
    assert.match(cust.match(/const LIVERY_FIELDS = \[([\s\S]*?)\];/)[1], new RegExp(`"${k}"`), `${k} in LIVERY_FIELDS`);
    assert.ok(sheet.includes(`"${k}"`), `${k} has a garage row`);
    assert.match(sheet, new RegExp(`^  ${k}: "`, "m"), `${k} has a LIV_ROW_HINT`);
    assert.ok(ed.includes(`"${k}"`), `${k} filed in an editor section`);
  }
  for (const k of NEW.filter((f) => f.endsWith("Finish")))
    assert.match(sheet.match(/const LIV_DRAFT_PILLS = \{([\s\S]*?)\};/)[1], new RegExp(`${k}: "inherit"`));
  // An unknown finish id from an imported garage file is inert: the build ignores it.
  const junk = build({ floorFinish: "lava", suspFinish: "constructor", noseFinish: "lava" });
  assert.deepEqual(Array.from(junk.mat), Array.from(base.mat));
  assert.equal(W.CarWheels.tints({ rimFinish: "constructor" }).surf, null);
});
