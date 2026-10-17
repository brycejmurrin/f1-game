/* livery-helmet-style.test.mjs — the player's HELMET picker on a real Car3D build.
 * helmetStyle "team" / unset / unknown = byte-identical mesh; every other style
 * repaints only the helmet's own vertices; base and accent land on the right zones.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const ctx = vm.createContext({ Math, Object, Array, JSON, Number, String, isFinite, Float32Array });
vm.runInContext(fs.readFileSync(new URL("../../js/car/helmets.js", import.meta.url), "utf8"), ctx);
const H = vm.runInContext("Helmets", ctx);

const team = M.Teams.LIST.find((t) => t.id === "ferrari");
const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);
const build = (extra) => M.Car3D.build(team.color, team.color2, {
  livery: Object.assign({}, team.livery, extra), teamId: team.id, num: 16, parts, noWheels: true, measure: true,
});
const base = build({});
const BASE = [1, 0.83, 0], ACC = [0, 0, 1];
// The helmet sits at (0, 0.715, -0.075), shell radius ~0.15; the lid's box:
const inLid = (m, i) => Math.abs(m.pos[i * 3]) < 0.2 && m.pos[i * 3 + 1] > 0.55 && m.pos[i * 3 + 1] < 0.95 && m.pos[i * 3 + 2] > -0.26 && m.pos[i * 3 + 2] < 0.12;
const rest = (m) => {
  const o = [];
  for (let i = 0; i < m.mat.length; i++) if (!inLid(m, i)) o.push([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2], m.mat[i]].join());
  return o;
};
const same = (a, b) => a.pos.length === b.pos.length && a.mat.length === b.mat.length &&
  Array.from(a.pos).every((v, i) => v === b.pos[i]) && Array.from(a.col).every((v, i) => v === b.col[i]) && Array.from(a.mat).every((v, i) => v === b.mat[i]);

test("team / unset / unknown style: mesh byte-identical, colours ignored", () => {
  for (const extra of [{ helmetStyle: "team" }, { helmetStyle: "team", helmetBase: BASE, helmetAccent: ACC },
    { helmetBase: BASE, helmetAccent: ACC }, { helmetStyle: "bogus", helmetBase: BASE }, { helmetStyle: "" }, { helmetStyle: null }])
    assert.ok(same(base, build(extra)), JSON.stringify(extra));
});

test("each style repaints only the helmet vertices", () => {
  const outside = rest(base);
  for (const style of ["solid", "cap", "band", "stripe", "chevron"]) {
    const m = build({ helmetStyle: style, helmetBase: BASE, helmetAccent: ACC });
    assert.deepEqual(rest(m), outside, `${style} touched a non-helmet vertex`);
    assert.ok(!same(base, m), `${style} changed nothing`);
  }
});

test("base and accent colours land on the shell, base alone under solid", () => {
  const f = (c) => c.map(Math.fround).join();
  const has = (m, c) => { for (let i = 0; i < m.mat.length; i++) if (inLid(m, i) && f([m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]]) === f(c)) return true; return false; };
  const solid = build({ helmetStyle: "solid", helmetBase: BASE, helmetAccent: ACC });
  assert.ok(has(solid, BASE)); assert.ok(!has(solid, ACC), "solid ignores the accent");
  for (const style of ["cap", "band", "stripe", "chevron"]) {
    const m = build({ helmetStyle: style, helmetBase: BASE, helmetAccent: ACC });
    assert.ok(has(m, BASE) && has(m, ACC), `${style}: base and accent both present`);
  }
});

test("design zones: cap on the crown, band round the shell, stripe front-to-back, chevron down the face", () => {
  const des = H.designFor(16, team.color, null);
  const at = (style, t, az) => H.painter(H.styled(des, style, BASE, ACC))(t, az).join();
  const B = BASE.join(), A = ACC.join();
  assert.equal(at("solid", 0.1, 0), B);
  assert.equal(at("cap", 0.1, 90), A); assert.equal(at("cap", 0.8, 90), B);
  assert.equal(at("band", 0.2, 45), A); assert.equal(at("band", 0.2, 200), A); assert.equal(at("band", 0.8, 45), B);
  assert.equal(at("stripe", 0.8, 0), A); assert.equal(at("stripe", 0.8, 180), A); assert.equal(at("stripe", 0.8, 90), B);
  assert.equal(at("chevron", 0.38, 0), A); assert.equal(at("chevron", 0.38, 180), B);
});

test("styled(): team/unknown returns the design itself; missing colours fall back to the design", () => {
  const des = H.designFor(16, team.color, null);
  assert.equal(H.styled(des, "team", BASE, ACC), des);
  assert.equal(H.styled(des, "nope", BASE, ACC), des);
  assert.equal(H.styled(des, undefined, BASE, ACC), des);
  const s = H.styled(des, "cap", null, [NaN, 0, 0]);
  assert.deepEqual(s.base, des.base);
  assert.ok(s.alt && s.alt.length === 3);
});

test("the garage lists the HELMET pill row, both colour rows and an editor section", () => {
  const sheet = fs.readFileSync(new URL("../../js/garage/setup-sheet.js", import.meta.url), "utf8");
  const ed = fs.readFileSync(new URL("../../js/garage/livery-design-editor.js", import.meta.url), "utf8");
  assert.ok(sheet.includes('pillRow("HELMET", "helmetStyle"'));
  assert.ok(sheet.includes('colorRow("HELMET BASE", "helmetBase", true)') && sheet.includes('colorRow("HELMET ACCENT", "helmetAccent", true)'));
  assert.ok(ed.includes('section("HELMET"') && ed.includes('"helmetStyle", "helmetBase", "helmetAccent"'));
  assert.deepEqual(Array.from(H.STYLES), ["team", "solid", "cap", "band", "stripe", "chevron"]);
});
