/* pass-census-park.test.mjs — the parked cell of pass-census and its exact baseline compare (#4783 row 1).
 *
 * Run: node --test tests/unit/pass-census-park.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parkKey, parkPasses, baselineCell, uboFlat, compareParkBaseline, collectBaseline, PARK_MEMORY_KEYS } from "../../tools/gfx/pass-census-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Rows as the page records them: [pass key, draw calls, triangles] per top-level render().
const ROWS = [["output 640x360", 60, 143067], ["rt 256x256", 1, 15496], ["output 640x360", 60, 143067], ["output 230x66", 23, 29595], ["output 640x360", 61, 143100]];
const MEM = { geometries: 193, textures: 45, renderTargets: 14, uniformBuffers: 352, uniformBuffersSize: 95264 };

test("the cell key names circuit, camera, tier, backend and the parked lap fraction", () => {
  assert.deepEqual([
    parkKey({ track: "monaco", camera: "chase", mobile: false, backend: "webgpu", at: 0.1 }),
    parkKey({ track: "monza", camera: null, mobile: true, backend: "webgl2-stubbed", at: 0.5 }),
    parkKey({ track: "spa", camera: "helmet", mobile: false, backend: "webgpu" }),
  ], ["monaco|chase|desktop|webgpu|at0.1", "monza|default|mobile|webgl2-stubbed|at0.5", "spa|helmet|desktop|webgpu|at0.1"]);
});

test("a cell keeps each pass's [min, max] per render and drops the cadence; memory keeps only the boot-stable counters", () => {
  const passes = parkPasses(ROWS);
  assert.deepEqual(passes, {
    "output 640x360": { renders: 3, calls: [60, 61], tris: [143067, 143100] },
    "rt 256x256": { renders: 1, calls: [1, 1], tris: [15496, 15496] },
    "output 230x66": { renders: 1, calls: [23, 23], tris: [29595, 29595] },
  });
  assert.deepEqual(baselineCell(passes, MEM), {
    passes: { "output 230x66": { calls: [23, 23], tris: [29595, 29595] }, "output 640x360": { calls: [60, 61], tris: [143067, 143100] }, "rt 256x256": { calls: [1, 1], tris: [15496, 15496] } },
    memory: { textures: 45, renderTargets: 14 },
  });
  assert.deepEqual([...PARK_MEMORY_KEYS], ["textures", "renderTargets"]);
});

test("uniform buffers must be flat over the parked window, and an absent count is a failure, not a pass", () => {
  assert.deepEqual(uboFlat(MEM, MEM), []);
  assert.deepEqual(uboFlat({ uniformBuffers: 350, uniformBuffersSize: 94864 }, { uniformBuffers: 351, uniformBuffersSize: 95072 }),
    ["uniformBuffers 350 -> 351 over the parked window", "uniformBuffersSize 94864 -> 95072 over the parked window"]);
  assert.deepEqual(uboFlat(null, MEM), ["uniformBuffers not reported (null -> 352)", "uniformBuffersSize not reported (null -> 95264)"]);
});

test("the baseline compare is exact: one triangle, a pass that vanished, a new pass and a texture are each a diff", () => {
  const cell = baselineCell(parkPasses(ROWS), MEM), key = "monza|default|desktop|webgl2-stubbed|at0.1";
  const base = { cells: { [key]: JSON.parse(JSON.stringify(cell)) } };
  assert.deepEqual(compareParkBaseline(null, key, cell), { status: "no-baseline", diffs: [] });
  assert.deepEqual(compareParkBaseline(base, key, cell), { status: "ok", diffs: [] });
  assert.deepEqual(compareParkBaseline(base, "spa|x", cell), { status: "no-cell", diffs: ['no baseline cell "spa|x" (the file has 1)'] });
  const moved = JSON.parse(JSON.stringify(cell));
  moved.passes["output 640x360"].tris = [143067, 143101];
  delete moved.passes["rt 256x256"];
  moved.passes["rt 512x512"] = { calls: [1, 1], tris: [9, 9] };
  moved.memory.textures = 46;
  assert.deepEqual(compareParkBaseline(base, key, moved), { status: "diff", diffs: [
    'pass "output 640x360" tris [143067,143101] != baseline [143067,143100]',
    'pass "rt 256x256" did not run (baseline calls 1,1 tris 15496,15496)',
    'pass "rt 512x512" is not in the baseline (calls 1,1 tris 9,9)',
    "memory.textures 46 != baseline 45",
  ] });
});

test("collectBaseline builds sorted cells from run JSONs, skips unparked files and reports two files that disagree", () => {
  const cell = baselineCell(parkPasses(ROWS), MEM), other = baselineCell(parkPasses(ROWS.slice(0, 2)), MEM);
  const file = (name, key, c) => ({ name, json: { summary: { park: { key, cell: c } } } });
  const { baseline, conflicts } = collectBaseline([file("b.json", "spa|k", cell), file("a.json", "monaco|k", cell), { name: "driven.json", json: { summary: {} } }, { name: "bad.json", json: null }, file("c.json", "spa|k", other)], { run: "1", sha: "abc" });
  assert.deepEqual(Object.keys(baseline.cells), ["monaco|k", "spa|k"]);
  assert.deepEqual(baseline.source, { run: "1", sha: "abc" });
  assert.deepEqual(conflicts, ["spa|k (c.json)"]);
});

test("pass-census documents the parked flags in its usage line and refuses a lap fraction outside 0..1", () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, "tools/gfx/pass-census.mjs"), ...args], { encoding: "utf8" });
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.equal(help.stdout.split("\n")[0], "usage: node tools/gfx/pass-census.mjs [track=monaco] [--frames 120] [--warm 60] [--real-link] [--mobile] [--by-object] [--camera MODE] [--park] [--park-at 0.1] [--baseline FILE] [--ls key=value]... [--tune knob=value]... [--json PATH]");
  const bad = run("monza", "--park", "--park-at", "1.5");
  assert.equal(bad.status !== 0 && bad.stderr.includes("--park-at must be a lap fraction from 0 to 1"), true);
});

test("the committed baseline, when present, was built by --collect from a cited run", () => {
  const file = path.join(ROOT, "tests/data", "pass-census-park.json");
  if (!fs.existsSync(file)) return;   // the first push has no run to cite yet (#4783 row 1)
  const b = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(typeof b.source.run === "string" && b.source.run.length > 0 && typeof b.source.sha === "string" && b.source.sha.length >= 7, true);
  for (const [key, cell] of Object.entries(b.cells)) assert.deepEqual(compareParkBaseline(b, key, cell), { status: "ok", diffs: [] });
});
