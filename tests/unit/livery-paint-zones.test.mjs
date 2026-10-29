/* livery-paint-zones.test.mjs — the PAINT ZONES livery fields (floor / suspension / brake ducts /
 * deflectors / cockpit surround / number board tints and finishes, floor / suspension / nose / rim finishes, grip
 * and exhaust-heat tints) on a real Car3D build. Unset = byte-identical mesh; each field changes
 * only its own section's vertices; every field is wired through FIELDS, the resolve copy and the
 * garage sheet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const M = loadParts();
// CarWheels and Liveries are not on loadParts' return, so a second small context grabs them.
const W = (() => {
  const ctx = { console, Math, Object, Array, Float32Array, JSON, Number, String, Boolean, isFinite, Map, Set, WeakMap };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ["js/core/log.js", "js/car/car-material-shade.js", "js/car/car-materials.js", "js/car/car-wheels.js", "js/car/liveries.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
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
  const again = build({ floorFinish: "inherit", suspFinish: "inherit", noseFinish: "inherit", rimFinish: "inherit",
    ductFinish: "inherit", deflectorFinish: "inherit", cockpitFinish: "inherit", boardFinish: "inherit" });
  assert.deepEqual(Array.from(again.pos), Array.from(base.pos));
  assert.deepEqual(Array.from(again.idx), Array.from(base.idx));
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

const DETAIL_FINISHES = [
  ["ductFinish", "ductTint", ["brakeDucts"], undefined],
  ["deflectorFinish", "deflectorTint", ["wheels"], { parts: deflParts }],
  ["cockpitFinish", "cockpitTint", ["cockpit", "bolsters"], undefined],
  ["boardFinish", "boardTint", ["sponsorBoard"], undefined],
];

test("detail finishes work alone, with tint, and through inherited whole-car finish", () => {
  for (const [field, tintField, allowed, opts] of DETAIL_FINISHES) {
    const original = opts ? build({}, opts) : base;
    const alone = build({ [field]: "chrome" }, opts);
    const finished = changed(original, alone);
    assert.ok(finished.length > 0, `${field}: explicit finish alone must reach actual mesh surfaces`);
    sameShape(original, alone);
    assert.deepEqual(Array.from(alone.idx), Array.from(original.idx), `${field}: topology`);
    for (const i of finished) {
      assert.ok(allowed.includes(sectionOf(alone, i).name), `${field}: changed another part`);
      assert.equal(alone.mat[i], FS.chrome, `${field}: actual chrome surface id`);
      assert.deepEqual(Array.from(alone.col.slice(i * 3, i * 3 + 3)),
        Array.from(original.col.slice(i * 3, i * 3 + 3)), `${field}: finish alone keeps all colour channels`);
      assert.ok(original.mat[i] === S.paint || original.mat[i] === S.carbon, `${field}: protected material changed`);
      if (original.mat[i] === S.carbon) assert.ok(maxC(original, i) >= .045, `${field}: void converted to paint`);
    }
    const both = build({ [field]: "matte", [tintField]: PINK }, opts);
    const tinted = changed(original, both);
    assert.ok(tinted.length >= finished.length, `${field}: adding tint lost finished target vertices`);
    for (const i of tinted) {
      assert.ok(allowed.includes(sectionOf(both, i).name), `${field}: tint+finish changed another part`);
      assert.equal(both.mat[i], FS.matte);
      assert.deepEqual(Array.from(both.col.slice(i * 3, i * 3 + 3)), PINK, `${field}: tint is retained`);
    }
    const whole = build({ finish: "satin" }, opts);
    const inherited = build({ finish: "satin", [field]: "inherit", [tintField]: PINK }, opts);
    const inheritedChanges = changed(whole, inherited);
    assert.ok(inheritedChanges.length > 0, `${field}: inherited tinted target is present`);
    for (const i of inheritedChanges) {
      assert.ok(allowed.includes(sectionOf(inherited, i).name), `${field}: inherit changed another part`);
      assert.equal(inherited.mat[i], FS.satin, `${field}: explicit inherit uses whole-car finish on tinted surfaces`);
      assert.deepEqual(Array.from(inherited.col.slice(i * 3, i * 3 + 3)), PINK);
    }
    for (const mesh of [both, inherited]) {
      sameShape(original, mesh);
      assert.deepEqual(Array.from(mesh.idx), Array.from(original.idx), `${field}: material edits preserve topology`);
    }
    // Explicit detail finishes must never recolour/reclassify a protected void,
    // glass, rubber, emitter or metal vertex, even inside a target section.
    for (let i = 0; i < original.mat.length; i++) {
      const material = original.mat[i];
      if (material === S.paint || (material === S.carbon && maxC(original, i) >= .045)) continue;
      assert.equal(alone.mat[i], material, `${field}: protected surface id`);
      assert.deepEqual(Array.from(alone.col.slice(i * 3, i * 3 + 3)),
        Array.from(original.col.slice(i * 3, i * 3 + 3)), `${field}: protected surface colour`);
    }
  }
});

test("detail deflector finish is inert without the part and effective on WORKS RIM", () => {
  const missing = build({ deflectorFinish: "chrome" });
  assert.deepEqual(Array.from(missing.mat), Array.from(base.mat));
  assert.deepEqual(Array.from(missing.col), Array.from(base.col));
  sameShape(base, missing);
  assert.deepEqual(Array.from(missing.idx), Array.from(base.idx));
  const original = build({}, { parts: deflParts });
  const mesh = build({ deflectorFinish: "chrome" }, { parts: deflParts });
  const touched = changed(original, mesh);
  assert.ok(touched.length > 0, "fitted deflectors have a real finish");
  for (const i of touched) {
    assert.equal(sectionOf(mesh, i).name, "wheels");
    assert.equal(mesh.mat[i], FS.chrome);
    assert.ok(Math.abs(mesh.pos[i * 3]) > .6 && mesh.pos[i * 3 + 1] > .4, "finished vertex belongs to the stationary over-wheel assembly");
  }
});

test("cockpit finish protects harnesses, carbon trim, voids and controls in driver-eye geometry", () => {
  const opts = { cockpit: true }, original = build({}, opts);
  const finished = build({ cockpitFinish: "chrome" }, opts);
  const both = build({ cockpitFinish: "matte", cockpitTint: PINK }, opts);
  const touched = changed(original, finished);
  assert.ok(touched.length > 0, "driver-eye bolster paint receives its finish");
  for (const i of touched) {
    assert.equal(sectionOf(finished, i).name, "bolsters");
    assert.equal(original.mat[i], S.paint, "driver-eye finish never converts padded/carbon components");
    assert.equal(finished.mat[i], FS.chrome);
  }
  const bolster = sec(original, "bolsters");
  assert.ok(bolster && bolster.vertices > 0);
  let carbon = 0, voids = 0, controls = 0, harness = 0;
  for (let i = bolster.from; i < bolster.to; i++) {
    if (original.mat[i] === S.carbon) {
      carbon++;
      if (maxC(original, i) < .045) voids++;
      const rgb = Array.from(original.col.slice(i * 3, i * 3 + 3));
      if (rgb.every((c, k) => Math.abs(c - [.10, .11, .14][k]) < 1e-6)) harness++;
    }
    if (original.mat[i] === S.metal) controls++;
    if (original.mat[i] === S.paint) continue;
    for (const mesh of [finished, both]) {
      assert.equal(mesh.mat[i], original.mat[i], "protected cockpit material");
      assert.deepEqual(Array.from(mesh.col.slice(i * 3, i * 3 + 3)),
        Array.from(original.col.slice(i * 3, i * 3 + 3)), "protected cockpit colour");
    }
  }
  assert.ok(carbon > 0 && voids > 0 && controls > 0 && harness > 0, "real cockpit includes carbon, instrument voids, controls and harness webbing");
  for (const mesh of [finished, both]) {
    sameShape(original, mesh);
    assert.deepEqual(Array.from(mesh.idx), Array.from(original.idx));
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

const NEW = ["floorTint", "floorFinish", "suspTint", "suspFinish", "ductTint", "ductFinish", "rimFinish", "deflectorTint", "deflectorFinish",
  "cockpitTint", "cockpitFinish", "gripTint", "noseFinish", "boardTint", "boardFinish", "exhaustTint"];

test("GRIPS: getCockpitWheel keys on gripTint only when it is set", () => {
  const src = read("js/car/cockpit-rig.js");
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

// A MY TEAM identity captured before any livery was saved holds null under "livery.custom.<id>", not the []
// fallback; getCustomLiveries must still hand back an array or resolveLivery's list.find throws on the null row.
function loadCustomLiveries(identity) {
  const sb = {
    console,
    Career: { inCareer: () => true, data: () => ({ flavour: "myteam" }), identityValue: (k, f) => (k in identity ? identity[k] : f), identityRevision: () => 0 },
    Liveries: {
      forTeam: (t) => [{ id: "default", name: "Team Livery", c1: t.color, c2: t.color2 }],
      migratePaint: (l) => l, FIELDS: ["c1", "c2"], UNIVERSAL: [], BY_TEAM: {},
    },
  };
  vm.createContext(sb);
  vm.runInContext(read("js/car/custom-liveries.js") + "\n;globalThis.CustomLiveries = CustomLiveries;", sb, { filename: absSrc("js/car/custom-liveries.js") });
  const store = { rev: 0, get: (k, f) => f, set: () => true };
  return sb.CustomLiveries.create({ store });
}

test("a null identity value reads as an empty custom list and resolveLivery does not throw", () => {
  const cl = loadCustomLiveries({ "livery.custom.custom": null });
  assert.deepEqual(Array.from(cl.getCustomLiveries("custom")), []);
  const team = { id: "custom", color: [1, 0, 0], color2: [0, 0, 1] };
  assert.doesNotThrow(() => cl.resolveLivery(team));
});

test("a stored array of custom liveries still comes back untouched", () => {
  const row = { id: "mine", name: "Mine", c1: [0, 1, 0], c2: [0, 0, 1] };
  const cl = loadCustomLiveries({ "livery.custom.custom": [row] });
  assert.deepEqual(Array.from(cl.getCustomLiveries("custom")), [row]);
});
