/* livery-zone-finish.test.mjs — SIDEPOD / FIN / MIRROR finishes and the MIRROR HOUSING tint
 * on a real Car3D build. Unset = byte-identical mesh; each zone remaps only its own
 * section's paint vertices; mirrorTint recolours only mirror vertices.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const team = M.Teams.LIST.find((t) => t.id === "ferrari");
const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);
const S = M.Car3D.SURFACES, FS = M.Car3D.FINISH_SURFACE;
const build = (extra) => M.Car3D.build(team.color, team.color2, {
  livery: Object.assign({}, team.livery, extra), teamId: team.id, num: 16, parts, noWheels: true, measure: true,
});
const base = build({});
const diffIdx = (a, b) => { const r = []; for (let i = 0; i < a.mat.length; i++) if (a.mat[i] !== b.mat[i]) r.push(i); return r; };
const same = (a, b) => a.pos.length === b.pos.length && a.mat.length === b.mat.length;

test("unset (inherit) zone fields: mesh byte-identical", () => {
  const again = build({ podFinish: "inherit", finFinish: "inherit", mirrorFinish: "inherit" });
  assert.ok(same(base, again));
  assert.deepEqual(Array.from(again.mat), Array.from(base.mat));
  assert.deepEqual(Array.from(again.col), Array.from(base.col));
  assert.deepEqual(Array.from(again.pos), Array.from(base.pos));
});

test("each zone finish remaps only paint vertices, to its own surface id, in one contiguous section", () => {
  const cases = [["podFinish", "matte"], ["finFinish", "chrome"], ["mirrorFinish", "satin"]];
  const seen = [];
  for (const [field, f] of cases) {
    const m = build({ [field]: f });
    assert.ok(same(base, m));
    assert.deepEqual(Array.from(m.col).length, base.col.length);
    const idx = diffIdx(base, m);
    assert.ok(idx.length > 0, `${field} changed nothing`);
    for (const i of idx) { assert.equal(m.mat[i], FS[f]); }
    seen.push(new Set(idx));
  }
  for (let a = 0; a < seen.length; a++) for (let b = a + 1; b < seen.length; b++)
    for (const i of seen[a]) assert.ok(!seen[b].has(i), "zones overlap");
});

test("mirrorTint recolours only mirror vertices and makes them paint", () => {
  const m = build({ mirrorTint: [1, 0, 1] });
  assert.ok(same(base, m));
  const changed = [];
  for (let i = 0; i < base.mat.length; i++) {
    if (m.col[i * 3] !== base.col[i * 3] || m.col[i * 3 + 1] !== base.col[i * 3 + 1] || m.col[i * 3 + 2] !== base.col[i * 3 + 2] || m.mat[i] !== base.mat[i]) changed.push(i);
  }
  assert.ok(changed.length > 0);
  const lo = Math.min(...changed), hi = Math.max(...changed);
  for (const i of changed) {
    if (m.mat[i] === S.paint) assert.deepEqual([m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]], [1, 0, 1].map(Math.fround));
  }
  assert.ok(changed.some((i) => m.mat[i] === S.paint && base.mat[i] === S.carbon), "housing carbon became paint");
  // mirrors sit in x +-0.2..0.5, y 0.6..0.8: every changed vertex is out at the mirror
  for (const i of changed) assert.ok(Math.abs(m.pos[i * 3]) > 0.2 && m.pos[i * 3 + 1] > 0.55 && m.pos[i * 3 + 1] < 0.85, `vertex ${i} (${lo}..${hi}) is not a mirror`);
});

test("mirrorFinish alone finishes the housing (carbon -> paint -> finish) and leaves other zones alone", () => {
  const m = build({ mirrorFinish: "chrome" });
  const idx = diffIdx(base, m);
  assert.ok(idx.some((i) => base.mat[i] === S.carbon && m.mat[i] === FS.chrome), "housing finished");
  for (const i of idx) assert.ok(Math.abs(m.pos[i * 3]) > 0.2, "only mirror-area vertices change");
});

test("the garage offers the three pill rows and the housing colour row, and the editor lists them", async () => {
  const { readFileSync } = await import("node:fs");
  const sheet = readFileSync(new URL("../../js/garage/setup-sheet.js", import.meta.url), "utf8");
  const ed = readFileSync(new URL("../../js/garage/livery-design-editor.js", import.meta.url), "utf8");
  for (const [label, key] of [["SIDEPOD FINISH", "podFinish"], ["FIN FINISH", "finFinish"], ["MIRROR FINISH", "mirrorFinish"]]) {
    assert.ok(sheet.includes(`["${label}", "${key}"]`), `${key} pill row`);
    assert.ok(ed.includes(`"${key}"`), `${key} in an editor section`);
  }
  assert.ok(sheet.includes('colorRow("MIRROR HOUSING", "mirrorTint", true)'));
  assert.ok(ed.includes('"mirrorTint"'));
});

// #2796 items 1-3: a zone finish reaches the body-colour paint other sections emit for it.
// Vertex colours carry CarShade's shading, so a colour is matched within a tolerance.
const near = (m, i, c) => [0, 1, 2].every((k) => Math.abs(m.col[i * 3 + k] - c[k]) < 0.08);
const ofColour = (m, c) => { const r = []; for (let i = 0; i < m.mat.length; i++) if (near(m, i, c)) r.push(i); return r; };
test("HALO FINISH paints an untinted titanium halo, so the finish lands on it (#2796 1)", () => {
  const m = build({ haloFinish: "matte", halo: null }), b = build({ halo: null });
  const hoop = ofColour(b, M.CarMaterials ? M.CarMaterials.HALO : [0.55, 0.56, 0.58]).filter((i) => b.mat[i] === S.metal && b.pos[i * 3 + 1] > 0.78 && Math.abs(b.pos[i * 3]) < 0.32 && b.pos[i * 3 + 2] > -0.5 && b.pos[i * 3 + 2] < 0.6);
  assert.ok(hoop.length > 0, "the untinted hoop is metal today");
  for (const i of hoop) assert.equal(m.mat[i], FS.matte, `halo vertex ${i}`);
  assert.deepEqual(Array.from(build({ haloFinish: "inherit", halo: null }).mat), Array.from(b.mat), "inherit is unset");
});

test("SIDEPOD FINISH reaches the pod colour panel painted in the livery section (#2796 2)", () => {
  const POD = [0.1, 0.8, 0.2], m = build({ pod: POD, podFinish: "chrome" }), panel = ofColour(m, POD);
  assert.ok(panel.length > 0, "the pod panel exists");
  for (const i of panel) assert.equal(m.mat[i], FS.chrome, `pod panel vertex ${i}`);
});

test("COVER FINISH reaches the stripe runs over the engine cover, not the nose run (#2796 3)", () => {
  const STRIPE = [0.9, 0.1, 0.6], m = build({ stripe: STRIPE, coverFinish: "satin" }), run = ofColour(m, STRIPE);
  const cover = run.filter((i) => m.pos[i * 3 + 2] < -0.25), nose = run.filter((i) => m.pos[i * 3 + 2] > 1.2);
  assert.ok(cover.length > 0 && nose.length > 0, "stripe runs exist on the cover and the nose");
  for (const i of cover) assert.equal(m.mat[i], FS.satin, `cover stripe vertex ${i}`);
  for (const i of nose) assert.equal(m.mat[i], S.paint, `nose stripe vertex ${i} keeps the body finish`);
});
