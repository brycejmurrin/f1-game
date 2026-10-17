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
