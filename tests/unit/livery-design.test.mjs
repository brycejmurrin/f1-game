import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { loadCrests, paintAt } from "../../tools/car/crest-sweep.mjs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const source = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");
function load(extra = {}) {
  const ctx = vm.createContext(extra);
  vm.runInContext(source("js/car/livery-design.js"), ctx);
  return { ctx, D: vm.runInContext("LiveryDesign", ctx) };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("history coalesces a drag, isolates the original, and drops abandoned redo", () => {
  const { D } = load(), draft = { c1: "#000000", patternWidth: "70" }, h = D.history(draft, 3);
  draft.patternWidth = "60"; h.record(draft, true);
  draft.patternWidth = "50"; h.record(draft, true); h.record(draft);
  assert.equal(h.undo().patternWidth, "70");
  assert.equal(h.redo().patternWidth, "50");
  assert.equal(h.original().patternWidth, "70", "the original must not track the mutable draft");
  h.undo(); h.record({ ...draft, c1: "#ffffff" });
  assert.equal(h.canRedo(), false);
  for (let i = 0; i < 12; i++) h.record({ patternWidth: String(i) });
  let count = 0; while (h.undo()) count++;
  assert.equal(count, 3, "bounded history");
  assert.equal(h.original().c1, "#000000", "trimming history keeps comparison intact");
});

test("imported pattern controls are finite and bounded; zero offset survives", () => {
  const { D } = load();
  for (const [key, [min, max, fallback]] of Object.entries(D.RANGES)) {
    for (const value of [null, [], {}, "", "Infinity", "NaN", "constructor"]) assert.equal(D.value({ [key]: value }, key), fallback);
    assert.equal(D.value({ [key]: "-99999" }, key), min);
    assert.equal(D.value({ [key]: "99999" }, key), max);
  }
  assert.equal(D.value({ patternOffset: "0" }, "patternOffset"), 0);
});

function drawing() {
  const transforms = [], ops = [], stack = [];
  const ctx = { globalAlpha: 1, save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); },
    beginPath() {}, closePath() {}, clip() {}, rect() {},
    moveTo(...p) { ops.push(p); }, lineTo(...p) { ops.push(p); },
    fill() { ops.push([this.globalAlpha]); }, stroke() { ops.push([this.globalAlpha]); }, fillRect(...p) { ops.push(p); },
    transform(...p) { transforms.push(p); }, createLinearGradient() { return { addColorStop() {} }; },
  };
  const regions = { crest: { x: 0, y: 0, w: 200, h: 200 }, tail: { x: 200, y: 0, w: 200, h: 200 },
    spineSide: { x: 0, y: 200, w: 200, h: 200 }, spineSideL: { x: 200, y: 200, w: 200, h: 200 } };
  const flank = { zF: -0.66, zLen: 1.24, sTop: 0.21, sLen: 0.47 };
  const each = (fn) => {
    fn({ R: regions.spineSide, fx: (u) => 200 * (1 - u) });
    fn({ R: regions.spineSideL, fx: (u) => 200 + 200 * u });
  };
  return { ctx, regions, flank, each, transforms, ops, stack };
}
test("every design paints bounded finite artwork; legacy designs stay byte untouched", () => {
  const { D } = load();
  for (const id of D.PATTERNS) {
    const a = drawing();
    assert.equal(D.drawAtlas(a.ctx, { spineLogo: id, patternPlacement: "wrap", patternRepeat: "9999" }, a.regions, a.flank, a.each), true);
    assert.equal(a.transforms.length, 4, id + " covers all four regions");
    assert.ok(a.ops.length > 0 && a.ops.length < 20000, id + " has bounded work");
    assert.ok(a.ops.flat().every(Number.isFinite), id + " uses finite coordinates");
    assert.equal(a.stack.length, 0); assert.equal(a.ctx.globalAlpha, 1);
  }
  const a = drawing();
  assert.equal(D.drawAtlas(a.ctx, { spineLogo: "wrap" }, a.regions, a.flank, a.each), false);
  assert.equal(a.ops.length, 0); assert.equal(a.transforms.length, 0);
});

test("one wrap uses the same longitudinal station on crown and both flanks", () => {
  const { D } = load(), a = drawing();
  D.drawAtlas(a.ctx, { spineLogo: "contours", patternPlacement: "wrap" }, a.regions, a.flank, a.each);
  const project = (m, x, z) => [m[0] * x + m[2] * z + m[4], m[1] * x + m[3] * z + m[5]];
  const [crown, tail, right, left] = a.transforms;
  assert.ok(Math.abs(project(crown, 0, 1.28)[1]) < 1e-9);
  assert.ok(Math.abs(project(tail, 0, 1.28)[1] - 200) < 1e-9, "crown rear meets tail front");
  const z = 0.9, u = (z - 0.66) / 1.24;
  assert.ok(Math.abs(project(right, 0.21, z)[0] - 200 * (1 - u)) < 1e-9);
  assert.ok(Math.abs(project(left, -0.21, z)[0] - (200 + 200 * u)) < 1e-9);
  assert.ok(Math.abs(project(left, -0.21, z)[1] - 200) < 1e-9);
  for (const side of ["left", "right"]) {
    const b = drawing(); D.drawAtlas(b.ctx, { spineLogo: "ribbon", patternPlacement: "wrap", patternSide: side }, b.regions, b.flank, b.each);
    assert.equal(b.transforms.length, 3, "one flank excluded");
    assert.deepEqual(b.transforms[2], side === "left" ? left : right);
  }
});

test("regional finish overrides only painted vertices and allows gloss over global matte", () => {
  const ctx = vm.createContext({});
  vm.runInContext(source("js/car/car-material-shade.js") + source("js/car/car-materials.js"), ctx);
  const M = vm.runInContext("CarMaterials", ctx), paint = M.SURFACES.paint, carbon = M.SURFACES.carbon;
  const mesh = { mat: [paint, carbon, paint, paint, paint] };
  const sections = [{ name: "chassis", from: 0, to: 2 }, { name: "engineCover", from: 2, to: 3 },
    { name: "frontWing", from: 3, to: 4 }, { name: "halo", from: 4, to: 5 }];
  const liv = { finish: "matte", coverFinish: "gloss", wingFinish: "chrome", haloFinish: "satin" };
  M.applyFinish(mesh, liv.finish, sections, liv);
  assert.deepEqual(mesh.mat, [M.FINISH_SURFACE.matte, carbon, paint, M.FINISH_SURFACE.chrome, M.FINISH_SURFACE.satin]);
  assert.equal(M.finishOf(liv, "wingFinish"), "chrome");
  assert.equal(M.finishOf({ finish: "matte", wingFinish: "inherit" }, "wingFinish"), "matte");
  assert.equal(M.finishOf({ finish: "matte", wingFinish: "constructor" }, "wingFinish"), "matte");
  assert.match(source("js/game.js"), /finish = CarMaterials\.finishOf\(livery, "wingFinish"\)/, "moving aero uses the same regional finish");
});

test("wrap lettering gets a contrasting keyline on solid and gradient artwork", () => {
  const { RecCtx } = loadCrests(), strokes = [];
  class Canvas extends RecCtx {
    strokeText(text, x, y) { strokes.push({ text, x, y, color: this.strokeStyle }); }
  }
  const { ctx } = load({ document: { querySelector: () => null, createElement: () => ({ getContext: () => new Canvas() }) } });
  for (const file of ["js/core/log.js", "js/data/teams.js", "js/car/crest-paths.js", "js/car/livery-graphics.js", "js/car/liverytex.js"]) vm.runInContext(source(file), ctx);
  const LT = vm.runInContext("LiveryTex", ctx);
  for (const spineLogo of ["ribbon", "gradient"]) for (const spineSide of ["number", "code", "wordmark", "duo"]) {
    const liv = { c1: [0, 0, 0], c2: [1, 1, 1], cover: [0, 0, 0], spineLogo, spineSide,
      patternTint: [1, 1, 1], patternSecond: [0, 0, 0], patternWidth: "100", patternTaper: "0" };
    strokes.length = 0; LT.buildAtlas("mercedes", { ...liv, patternPlacement: "crown" }, 63, true, true);
    const before = strokes.filter((s) => s.color === "rgb(15,15,20)").length;
    strokes.length = 0; LT.buildAtlas("mercedes", { ...liv, patternPlacement: "wrap" }, 63, true, true);
    assert.ok(strokes.filter((s) => s.color === "rgb(15,15,20)").length > before, spineLogo + "/" + spineSide);
  }
});

test("actual car mesh retains geometry and carbon while regional finishes reach the moving wing", () => {
  const M = loadParts(), a = [0.2, 0.4, 0.7], b = [0.8, 0.2, 0.1];
  const opts = { measure: true, teamId: "mclaren", noWheels: true };
  const base = M.Car3D.buildComplete(a, b, { ...opts, livery: { halo: a } });
  const inherited = M.Car3D.buildComplete(a, b, { ...opts, livery: { halo: a, coverFinish: "inherit", wingFinish: "inherit", haloFinish: "inherit" } });
  assert.deepEqual(inherited.mat, base.mat, "old liveries keep their material IDs");
  const edited = M.Car3D.buildComplete(a, b, { ...opts, livery: { halo: a, coverFinish: "matte", wingFinish: "chrome", haloFinish: "satin" } });
  assert.deepEqual(edited.pos, base.pos, "paint tools never change the mechanical mesh");
  for (let i = 0; i < base.mat.length; i++) if (base.mat[i] !== 20) assert.equal(edited.mat[i], base.mat[i]);
  for (const [section, surface] of [["engineCover", 28], ["frontWing", 27], ["rearAssembly", 27], ["halo", 26]]) {
    const index = edited.parts.findIndex((p) => p.name === section), part = edited.parts[index];
    assert.ok(part, section);
    const from = edited.parts.slice(0, index).reduce((sum, p) => sum + p.vertices, 0);
    assert.ok(base.mat.slice(from, from + part.vertices).includes(20), section + " originally has paint");
    for (let i = from; i < from + part.vertices; i++) if (base.mat[i] === 20) assert.equal(edited.mat[i], surface, section);
  }
  assert.equal(edited.flapInfo.finish, "chrome");
});

test("design fields survive draft, stored livery and live resolver round-trips", () => {
  const hex = (c) => "#" + c.map((n) => Math.round(n * 255).toString(16).padStart(2, "0")).join("");
  const rgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  const { ctx } = load({ arrToHex: hex, hexToArr: rgb });
  vm.runInContext(source("js/car/liveries.js") + source("js/car/custom-liveries.js"), ctx);
  const sheet = source("js/garage/setup-sheet.js");
  vm.runInContext(sheet.slice(sheet.indexOf("const LIV_DRAFT_COLORS"), sheet.indexOf("function csTabId")), ctx);
  const liv = { id: "test", name: "Ribbon", c1: [0, 0, 0], c2: [1, 1, 1], spineLogo: "segments",
    patternTint: [1, 0, 0], patternSecond: [0, 1, 0], patternPlacement: "wrap", patternSide: "left",
    patternWidth: "80", patternRepeat: "9", patternOffset: "-12", patternTaper: "40", patternOpacity: "60",
    coverFinish: "matte", wingFinish: "chrome", haloFinish: "gloss" };
  ctx.input = liv;
  const result = vm.runInContext('Object.assign({ id: input.id, c1: input.c1, c2: input.c2 }, livDraftTo(livDraftFrom(input, input.name), false))', ctx);
  for (const key of Object.keys(liv).filter((key) => key !== "name")) assert.deepEqual(plain(result[key]), liv[key], key);
  ctx.saved = result;
  const resolved = vm.runInContext('CustomLiveries.create({ store: {} }).pickLivery(saved)', ctx);
  for (const key of Object.keys(result)) assert.deepEqual(plain(resolved[key]), plain(result[key]), key);
});

function editorFixture() {
  const dom = makeDom(), { ctx, D } = load({ document: dom.document });
  vm.runInContext(source("js/garage/livery-design-editor.js"), ctx);
  const E = vm.runInContext("GarageLiveryDesignEditor", ctx), root = dom.document.createElement("div");
  const draft = { name: "Mine", c1: "#000000", c2: "#ffffff", spineLogo: "stripe", patternWidth: "70", patternRepeat: "6", patternOffset: "0", patternTaper: "20", patternOpacity: "100", patternPlacement: "crown", patternSide: "both" };
  const previews = []; let editor;
  const changed = (drag) => { editor?.changed(drag); previews.push(plain(draft)); };
  Object.assign(ctx, { d: draft, wrap: root, LIV_ROW_HINT: {}, applyPreview: changed });
  const sheet = source("js/garage/setup-sheet.js");
  vm.runInContext(sheet.slice(sheet.indexOf("  const pillRow ="), sheet.indexOf('  pillRow("FINISH"')), ctx);
  const pillRow = vm.runInContext("pillRow", ctx);
  // mini-dom omits sibling accessors and insertBefore's move semantics.
  const appendChild = root.appendChild;
  root.appendChild = (node) => { if (node.parentNode === root) node.remove(); return appendChild(node); };
  const insertBefore = root.insertBefore;
  root.insertBefore = (node, before) => { if (node.parentNode === root) node.remove(); return insertBefore(node, before); };
  const bodyRow = dom.document.createElement("label"); root.appendChild(bodyRow);
  const spineRow = pillRow("SPINE TOP", "spineLogo", ["stripe", ...D.PATTERNS], "stripe");
  const nextRow = pillRow("COVER BIND", "coverBind", ["independent", "saddleWrap", "spineOnly"], "independent");
  Object.defineProperty(spineRow, "nextSibling", { get: () => root.children[root.children.indexOf(spineRow) + 1] });
  const nameRow = dom.document.createElement("label"); root.appendChild(nameRow);
  editor = E.attach(root, draft, { flush() {}, changed, preview(value) { previews.push(plain(value)); },
    pillRow, spineRow, bodyRow, nameRow });
  const click = (text) => { const b = root.querySelectorAll("button").find((b) => b.textContent === text); assert.ok(b, text); assert.ok(!b.disabled, text + " enabled"); b.onclick(); };
  return { root, draft, editor, previews, click, spineRow, nextRow, bodyRow, nameRow };
}

test("existing SPINE TOP controls drive undo, palettes and pattern adjustments without duplicate menus", () => {
  const { root, draft, editor, previews, click, spineRow, nextRow, bodyRow, nameRow } = editorFixture();
  assert.equal(root.querySelectorAll("select, details").length, 0, "no parallel design, surface or preset menus");
  assert.equal(root.querySelectorAll('[data-liv-design-tools]').length, 0);
  assert.equal(spineRow.querySelectorAll("button").length, 14, "thirteen additions share the existing SPINE TOP row");
  const rows = Array.from(root.children), width = root.querySelectorAll("input").find((input) => input.dataset.livField === "patternWidth");
  assert.ok(rows.indexOf(width.parentNode) > rows.indexOf(spineRow));
  assert.ok(rows.indexOf(width.parentNode) < rows.indexOf(nextRow), "adjustments stay after SPINE TOP and before cover-side controls");
  assert.equal(root.querySelectorAll("button").find((b) => b.textContent === "MIDNIGHT ELECTRIC").parentNode.parentNode.getAttribute("data-liv-section"), "COLOUR PALETTE");
  assert.equal(rows[rows.indexOf(nameRow) - 1].getAttribute("role"), "status");
  assert.equal(width.disabled, true, "legacy patterns retain their existing controls");
  click("CONTOUR LINES");
  assert.equal(draft.spineLogo, "contours"); assert.equal(width.disabled, false);
  click("UNDO"); assert.equal(draft.spineLogo, "stripe"); assert.equal(width.disabled, true);
  click("REDO"); assert.equal(draft.spineLogo, "contours");
  click("COMPARE ORIGINAL"); assert.equal(previews.at(-1).spineLogo, "stripe"); assert.equal(draft.spineLogo, "contours");
  click("SHOW EDITED"); assert.equal(previews.at(-1).spineLogo, "contours");
  click("COMPARE ORIGINAL"); draft.name = "Renamed"; editor.changed(true);
  assert.equal(previews.at(-1).spineLogo, "contours", "metadata edits also leave comparison with the edited preview");
  click("MIDNIGHT ELECTRIC"); const paletteColor = draft.c1;
  draft.c1 = "#010101"; editor.changed(); click("MIDNIGHT ELECTRIC");
  assert.equal(draft.c1, paletteColor, "same palette reapplies after manual edits");
  click("CHECKERED FLAG");
  const first = draft.patternTint, second = draft.patternSecond;
  click("SWAP COLOURS"); assert.equal(draft.patternTint, second); assert.equal(draft.patternSecond, first);
  click("UNDO"); assert.equal(draft.patternTint, first);
  width.value = "90"; width.oninput(); width.onchange(); click("WRAP"); click("LEFT");
  assert.equal(draft.patternSide, "left");
  click("RESET SETTINGS"); assert.equal(draft.patternWidth, "70"); assert.equal(draft.patternPlacement, "crown");
  click("UNDO"); assert.equal(draft.patternWidth, "90"); assert.equal(draft.patternPlacement, "wrap");
});


test("sparse pinstripes paint the visible crown and tail centreline", () => {
  const { D } = load(), { RecCtx } = loadCrests(), a = drawing(), ctx = new RecCtx();
  D.drawAtlas(ctx, { spineLogo: "pinstripes", patternRepeat: "2", patternWidth: "100", patternOffset: "0", patternTint: [1, 0, 0] }, a.regions, a.flank, a.each);
  for (const r of [a.regions.crest, a.regions.tail]) {
    assert.equal(paintAt(ctx.ops, r.x + r.w / 2, r.y + r.h / 2), "rgb(255,0,0)");
  }
});


test("integrated adjustments disable only controls unused by the current spine design", () => {
  const { root, click } = editorFixture();
  const repeat = root.querySelectorAll("input").find((input) => input.dataset.livField === "patternRepeat");
  const left = root.querySelectorAll("button").find((b) => b.textContent === "LEFT");
  click("GRADIENT"); assert.equal(repeat.disabled, true); assert.equal(left.disabled, true);
  click("WRAP"); assert.equal(left.disabled, false);
  click("HONEYCOMB"); assert.equal(repeat.disabled, false);
  click("STRIPE"); assert.equal(repeat.disabled, true); assert.equal(left.disabled, true);
  assert.ok(repeat.parentNode.title.includes("SPINE TOP"));
});


test("surface sections and spine families preserve one button per choice and label their scope", () => {
  const { root, spineRow } = editorFixture();
  const headings = root.querySelectorAll('[role="heading"]').map((el) => el.textContent);
  for (const title of ["BODY PAINT & BASE FINISH", "ENGINE COVER — SHAPE & PAINT", "SPINE TOP — ARTWORK & COLOURS", "WINGS", "TAIL FIN", "TEAM MARKS & NUMBERS", "COCKPIT & CAMERA", "REVIEW & SAVE"]) assert.ok(headings.includes(title), title);
  assert.equal(spineRow.getAttribute("data-liv-section"), "SPINE TOP — ARTWORK & COLOURS");
  assert.equal(spineRow.querySelector('[role="group"]').getAttribute("aria-label"), "SPINE TOP");
  assert.deepEqual(spineRow.querySelectorAll(".cs-liv-ed-sec").map((el) => el.textContent), ["MARKS & IDENTITY", "FIXED GRAPHICS", "ADJUSTABLE PATTERNS"]);
  const buttons = spineRow.querySelectorAll("button"), ids = buttons.map((b) => b.dataset.csPill);
  assert.equal(ids.length, 14); assert.equal(new Set(ids).size, ids.length, "grouping moves original buttons without duplication");
  const swatches = root.querySelectorAll('.cs-liv-swatch');
  assert.equal(swatches.length, 9); assert.ok(swatches.every((swatch) => swatch.getAttribute("aria-hidden") === "true"));
});
