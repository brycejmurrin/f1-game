// A garage FINISH tap re-finishes the turntable car instead of rebuilding it
// (js/garage/setup-camera.js getSetupPreviewMesh → Car3D.refinish). A finish
// only remaps painted surface ids, but CarShade.smooth welds normals by surface
// id, so refinish re-runs the remap AND the smoothing on a copy of the build's
// kept pre-finish arrays. That is only correct while its output equals a full
// Car3D.build for the new livery, byte for byte — this builds both and compares.
//
// Why it matters for perf (B·L24 garage census, PR #3176 docs/notes garage-perf-2026-10-20,
// finding 4): each of the 11 finish rows' pills paid a full Car3D.build (~100 ms
// in SwiftShader here, several times that on a phone).
//
// Pure Node (tools/car/parts-sweep.mjs loadParts runs car3d.js in a VM). The full
// matrix (every pill × 3 teams × 2 starting liveries) is the PR's evidence; this
// samples two pills per row from each of two starting liveries.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const M = loadParts({ shade: true }), C = M.Car3D;
const team = M.Teams.LIST[0];
const parts = M.Parts.getVisualTiers(M.Parts.getFactorySetup(team.id), team);
const build = (liv, extra) => C.build(liv.c1, liv.c2, Object.assign({ livery: liv, teamId: team.id, num: 7, parts }, extra));
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

test("every garage finish row is a FINISH_FIELDS entry (the rows refinish may skip a rebuild for)", () => {
  const src = readFileSync(path.join(ROOT, "js/garage/setup-sheet.js"), "utf8");
  const rows = [...src.matchAll(/"(\w*[fF]inish)"\]/g)].map((m) => m[1]).concat("finish");
  assert.ok(rows.length >= 11, "finish rows not found — the livery editor moved");
  assert.deepEqual([...new Set(rows)].sort(), [...C.FINISH_FIELDS].sort());
});

test("refinish(base, liv) equals a full Car3D.build(liv) for every finish row", () => {
  const ids = Object.keys(C.FINISH_SURFACE);
  // Two pills per row per start (~9 s): a plain car takes gloss + the last id, a finished one inherit + the first.
  for (const [start, picks] of [[{}, ["gloss", ids[ids.length - 1]]],
    [{ finish: "chrome", haloFinish: "matte", mirrorFinish: "satin", rimFinish: "gloss", suspTint: "#00ff00", halo: [1, 0.2, 0.6] }, ["inherit", ids[0]]]]) {
    const liv0 = Object.assign({ c1: team.color, c2: team.color2 }, team.livery || {}, start);
    const base = build(liv0, { refinish: true });
    for (const f of C.FINISH_FIELDS) for (const v of picks) {
      const liv = Object.assign({}, liv0, { [f]: v }), full = build(liv), r = C.refinish(base, liv);
      for (const k of ["pos", "nrm", "col", "mat", "idx"]) assert.ok(same(full[k], r[k]), `${f}=${v}: ${k} differs from a full build`);
      assert.deepEqual(r.flapInfo, full.flapInfo, `${f}=${v}: flapInfo`);
    }
  }
});

test("no stand-in surface id escapes a build", () => {
  const out = build(Object.assign({ c1: team.color, c2: team.color2, haloFinish: "chrome", mirrorFinish: "gloss", rimFinish: "matte" }, team.livery || {}));
  assert.ok(out.mat.every((m) => m < 200 || m > 203), "a PH_* stand-in reached the mesh");
});

