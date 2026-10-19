// livery-finish-contract — the shared contract of the garage finishes/parts slices
// (docs/notes/GARAGE-FINISHES-PARTS-2026-10-17.md): reserved finish ids, the new livery
// fields in every field list, and the zone-finish map in applyFinish.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const cx = { console, Math, Object, Array, Map, Set, JSON, Number, String, Boolean };
cx.globalThis = cx;
vm.createContext(cx);
vm.runInContext(read("js/car/car-material-shade.js"), cx);
vm.runInContext(read("js/car/car-materials.js"), cx);
const CM = vm.runInContext("CarMaterials", cx);

const COLOURS = ["mirrorTint", "rimTint", "caliperTint", "sidewallInk", "helmetBase", "helmetAccent"];
const PILLS = ["podFinish", "finFinish", "mirrorFinish", "helmetStyle"];

test("reserved finish ids are unique, past the shipped chain, and disjoint from FINISH_SURFACE", () => {
  const reserved = Object.values(CM.FINISH_RESERVED);
  assert.equal(new Set(reserved).size, reserved.length);
  assert.ok(reserved.every((id) => id > 33), "34+ only: 20-33 are shipped surface ids");
  // A reserved id may be taken by its OWN finish row once the branch exists in all three shaders (the row's id must equal
  // the reservation, checked below); it may never collide with a non-finish SURFACES id.
  const used = new Set(Object.values(CM.SURFACES));
  for (const id of reserved) assert.ok(!used.has(id), `reserved id ${id} is already a surface`);
  for (const [name, id] of Object.entries(CM.FINISH_SURFACE)) if (id > 33) assert.equal(CM.FINISH_RESERVED[name], id, `${name} -> ${id} is not its reserved id`);
  for (const name of Object.keys(CM.FINISH_RESERVED)) assert.ok(!(name in CM.FINISH_SURFACE) || CM.FINISH_SURFACE[name] === CM.FINISH_RESERVED[name]);
  for (const [name, id] of Object.entries(CM.FINISH_SURFACE)) assert.ok(id <= 33 || Object.values(CM.FINISH_RESERVED).includes(id), `${name} -> ${id} is neither shipped nor reserved`);
});

test("every new livery field is in every field list the game keeps", () => {
  const lists = {
    "Liveries.FIELDS": /const FIELDS = \[([\s\S]*?)\];/.exec(read("js/car/liveries.js"))[1],
    "CustomLiveries LIVERY_FIELDS": /const LIVERY_FIELDS = \[([\s\S]*?)\];/.exec(read("js/car/custom-liveries.js"))[1],
  };
  const sheet = read("js/garage/setup-sheet.js");
  lists["LIV_DRAFT_COLORS"] = /const LIV_DRAFT_COLORS = \[([\s\S]*?)\];/.exec(sheet)[1];
  lists["LIV_DRAFT_PILLS"] = /const LIV_DRAFT_PILLS = \{([\s\S]*?)\};/.exec(sheet)[1];
  for (const k of COLOURS.concat(PILLS)) {
    const where = COLOURS.includes(k) ? ["Liveries.FIELDS", "CustomLiveries LIVERY_FIELDS", "LIV_DRAFT_COLORS"] : ["Liveries.FIELDS", "CustomLiveries LIVERY_FIELDS", "LIV_DRAFT_PILLS"];
    for (const name of where) assert.match(lists[name], new RegExp(`["']?${k}["']?`), `${k} missing from ${name}`);
    assert.match(sheet, new RegExp(`\\n  ${k}: "`), `${k} has no LIV_ROW_HINT`);
  }
  for (const k of PILLS) assert.ok(!/LIV_DRAFT_COLORS = \[[\s\S]*?\];/.exec(sheet)[0].includes(`"${k}"`), `${k} is a pill, not a colour`);
});

test("zone finishes: a sidepod/fin/mirror finish remaps only that section's paint vertices", () => {
  const P = CM.SURFACES.paint;
  const out = { mat: [P, P, P, P, P, CM.SURFACES.carbon] };
  const sections = [{ name: "sidepods", from: 0, to: 2 }, { name: "sharkFin", from: 2, to: 3 }, { name: "mirrors", from: 3, to: 4 }, { name: "chassis", from: 4, to: 6 }];
  CM.applyFinish(out, "gloss", sections, { podFinish: "matte", finFinish: "chrome", mirrorFinish: "satin" });
  assert.deepEqual(out.mat, [28, 28, 27, 26, P, CM.SURFACES.carbon]);
});

test("no zone field set = the whole-car finish path, byte for byte", () => {
  const P = CM.SURFACES.paint;
  const out = { mat: [P, CM.SURFACES.glass, P] };
  CM.applyFinish(out, "satin", [], { podFinish: "inherit" });
  assert.deepEqual(out.mat, [26, CM.SURFACES.glass, 26]);
});

// Build-through (C2-22): the tests above read the contract off the data tables; these run the
// real Car3D.build and read the material column the mesh carries.
const { Car3D } = loadParts();
const buildMat = (livery) => Car3D.build([0.8, 0.05, 0.05], [0.9, 0.9, 0.9], { teamId: "ferrari", livery, noDriver: true }).mat;
const histogram = (mat) => { const h = {}; for (const v of mat) h[v] = (h[v] || 0) + 1; return h; };

test("every finish moves exactly the paint vertices of a built car to its surface id", () => {
  const gloss = histogram(buildMat({ finish: "gloss" }));
  const PAINT = CM.SURFACES.paint;
  assert.ok(gloss[PAINT] > 1000, "a built car has a large paint area to finish");
  for (const [name, id] of Object.entries(Car3D.FINISH_SURFACE)) {
    const h = histogram(buildMat({ finish: name }));
    assert.equal(h[PAINT] || 0, 0, `${name}: paint vertices left unfinished`);
    // `satin` shares its id with a non-paint surface already on the car, so compare the id's GAIN.
    assert.equal((h[id] || 0) - (gloss[id] || 0), gloss[PAINT], `${name}: the finish id ${id} did not take the paint vertices`);
    for (const k of Object.keys(gloss)) if (+k !== PAINT && +k !== id) assert.equal(h[k], gloss[k], `${name}: touched non-paint surface ${k}`);
  }
});

test("a zone finish reaches the built mesh for its section only", () => {
  const PAINT = CM.SURFACES.paint, CHROME = Car3D.FINISH_SURFACE.chrome;
  const plain = histogram(buildMat({ finish: "gloss" }));
  const pods = histogram(buildMat({ finish: "gloss", podFinish: "chrome" }));
  assert.ok((pods[CHROME] || 0) > 0, "no sidepod vertex took the zone finish");
  assert.ok(pods[PAINT] > 0 && pods[PAINT] < plain[PAINT], "the zone finish must replace some paint, not all of it");
  assert.equal((pods[CHROME] || 0) + pods[PAINT], plain[PAINT], "every changed vertex was paint");
});
