import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expandMatrix, batchSlice, frameForPart, cameraFor, labelDiff, pendingGroups, parseVariant, parseBatch,
  checkLimits, parseArgs, sheetHtml, PART_BOXES, SAME_PCT,
} from "../../tools/shot/lib/design-matrix.mjs";

const spec = { parts: ["sidepod", "frontWing"], angles: ["headOn", "grazing"], colours: ["dark", "light"], lights: ["lamp", "off"],
  variants: ["podFinish=matte"], baseline: "podFinish=gloss" };

test("expansion: product of axes, baseline first in every group", () => {
  const g = expandMatrix(spec);
  assert.equal(g.length, 2 * 2 * 2 * 2);
  for (const x of g) {
    assert.equal(x.cells[0].isBaseline, true);
    assert.equal(x.cells.length, 2);
    assert.equal(x.cells[1].baselineKey, x.cells[0].key);
  }
  assert.equal(new Set(g.flatMap((x) => x.cells.map((c) => c.key))).size, g.length * 2);
});

test("design: base livery, , variant, light knob", () => {
  const c = expandMatrix({ ...spec, lights: ["keyHi"], parts: ["sidepod"], angles: ["headOn"], colours: ["mid"] })[0].cells[1];
  assert.deepEqual(c.design, { podFinish: "matte", "light.keyMul": 1.5 });
  assert.equal(c.base, "splitshot");
});

test("unknown ids throw with the list", () => {
  assert.throws(() => expandMatrix({ ...spec, parts: ["nope"] }), /no part/);
  assert.throws(() => expandMatrix({ ...spec, angles: ["x"] }), /no angle/);
  assert.throws(() => expandMatrix({ ...spec, lights: ["x"] }), /no light/);
    assert.throws(() => parseVariant("bad"), /field=value/);
});

test("framing: farther for bigger parts, closer for higher fill, scales with fov", () => {
  const w = PART_BOXES.frontWing, m = PART_BOXES.mirror;
  assert.ok(frameForPart(w, { az: 0 }) > frameForPart(m, { az: 0 }));
  assert.ok(frameForPart(w, { az: 0, fill: 0.9 }) < frameForPart(w, { az: 0, fill: 0.5 }));
  assert.ok(frameForPart(w, { az: 0, fov: 30 }) > frameForPart(w, { az: 0, fov: 60 }));
  const d = frameForPart({ size: [1, 1, 1] }, { az: 0, fov: 90, aspect: 1, fill: 1 });
  assert.ok(Math.abs(d - 0.5) < 0.02);
});

test("camera: angles differ; haloBehind uses the catalog station", () => {
  const a = cameraFor("sidepod", "headOn"), b = cameraFor("sidepod", "grazing"), h = cameraFor("halo", "haloBehind");
  assert.notEqual(a.az, b.az);
  assert.equal(h.view, "rear");
  assert.deepEqual(a.target, PART_BOXES.sidepod.c);
});

test("diff labelling at the 0.5 % line", () => {
  assert.equal(SAME_PCT, 0.5);
  assert.equal(labelDiff(0.004).same, true);
  assert.equal(labelDiff(0.005).same, false);
  assert.equal(labelDiff(0.123).text, "12.3%");
  assert.equal(labelDiff(null, true).text, "baseline");
  assert.equal(labelDiff(null).same, false);
});

test("batches partition whole groups", () => {
  const g = expandMatrix(spec);
  const parts = [1, 2, 3].map((k) => batchSlice(g, k, 3));
  assert.equal(parts.flat().length, g.length);
  assert.equal(new Set(parts.flat().map((x) => x.id)).size, g.length);
  assert.throws(() => batchSlice(g, 4, 3));
  assert.deepEqual(parseBatch("2/5"), [2, 5]);
  assert.throws(() => parseBatch("x"));
});

test("manifest resume skips finished groups, redoes missing files", () => {
  const g = expandMatrix(spec).slice(0, 2);
  const cells = {};
  for (const c of g[0].cells) cells[c.key] = { status: "done", png: c.key + ".png" };
  assert.equal(pendingGroups(g, { cells }).length, 1);
  assert.equal(pendingGroups(g, { cells }, () => false).length, 2);
  cells[g[1].cells[0].key] = { status: "failed" };
  assert.equal(pendingGroups(g, { cells }).length, 1);
});

test("limits: dpr, viewport, loadavg", () => {
  checkLimits({ viewport: [844, 390], load: 1 });
  assert.throws(() => checkLimits({ viewport: [844, 390], dpr: 2 }), /dpr/);
  assert.throws(() => checkLimits({ viewport: [1920, 1080] }), /1600x900/);
  assert.throws(() => checkLimits({ viewport: [844, 390], load: 3 }), /loadavg/);
});

test("args and sheet", () => {
  const a = parseArgs(["--part=halo,fin", "--phone", "--batch=1/2"]);
  assert.deepEqual(a.parts, ["halo", "fin"]);
  assert.deepEqual(a.viewport, [844, 390]);
  const g = expandMatrix({ ...spec, parts: ["sidepod"], lights: ["lamp"] });
  const cells = {};
  for (const x of g) for (const c of x.cells) cells[c.key] = { status: "done", png: c.key + ".png", diff: c.isBaseline ? null : 0.001 };
  const html = sheetHtml(g, { cells }, { phone: true });
  assert.match(html, /looks the same/);
  assert.match(html, /844\/390/);
  assert.match(html, /light: lamp/);
});
