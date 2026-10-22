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


// A colour-only livery change keeps the geometry, so the garage hands the last build's smoothing prep to the next
// (Car3D.build shadeKeep; B·H32 2026-10-21: CarShade.smooth was ~83 of a ~130 ms build, ~7.5 ms warm). Only correct
// while the output equals a fresh build byte for byte and the shared prep is never written to.
test("a build handed a same-geometry build's shadeKeep reuses it and equals a fresh build", () => {
  const liv0 = Object.assign({ c1: team.color, c2: team.color2 }, team.livery || {});
  const A = build(liv0, { refinish: true }), keep = A._refinish.keep;
  assert.ok(keep && keep.vt, "a shaded build keeps its smoothing prep");
  const before = { runs: keep.runs.slice(), nrm: keep.nrm.slice(), mat: keep.mat.slice() };
  for (const liv of [Object.assign({}, liv0, { c1: [0.1, 0.8, 0.3] }), Object.assign({}, liv0, { c2: [0.9, 0.9, 0.1], finish: "matte" }),
    Object.assign({}, liv0, { finish: "chrome", haloFinish: "matte" })]) {
    const fresh = build(liv, { refinish: true }), warm = build(liv, { refinish: true, shadeKeep: keep });
    assert.equal(warm._refinish.keep, keep, "the handed prep is the one used");
    for (const k of ["pos", "nrm", "col", "mat", "idx"]) assert.ok(same(fresh[k], warm[k]), `${JSON.stringify(liv.c1)}: ${k} differs from a fresh build`);
    const r = C.refinish(warm, Object.assign({}, liv, { finish: "satin" })), rf = C.refinish(fresh, Object.assign({}, liv, { finish: "satin" }));
    assert.ok(same(r.nrm, rf.nrm), "a refinish over the shared prep matches one over its own");
  }
  assert.ok(same(keep.runs, before.runs) && same(keep.nrm, before.nrm) && same(keep.mat, before.mat), "the shared prep is never written to");
});

test("a shadeKeep from different geometry is ignored, not trusted", () => {
  const liv0 = Object.assign({ c1: team.color, c2: team.color2 }, team.livery || {});
  const striped = Object.assign({}, liv0, { stripe: [1, 1, 1], noseStripe: [0, 0, 0] }), plain = Object.assign({}, liv0);
  delete plain.stripe; delete plain.noseStripe;
  const A = build(striped, { refinish: true }), fresh = build(plain, { refinish: true }), warm = build(plain, { refinish: true, shadeKeep: A._refinish.keep });
  assert.notEqual(A.pos.length, fresh.pos.length, "the stripe really adds geometry (else this test proves nothing)");
  assert.notEqual(warm._refinish.keep, A._refinish.keep, "a count mismatch starts a fresh prep");
  for (const k of ["pos", "nrm", "col", "mat", "idx"]) assert.ok(same(fresh[k], warm[k]), `${k} differs from a fresh build`);
});
