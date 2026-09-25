// Regression ratchet: per-circuit props TRIANGLES after the hidden-face strip.
//
// Every triangle in the props buffer is submitted by the chunked mesh on every
// pass that reaches its cell, and until now nothing bounded how many a circuit
// may carry: verify-track caps VERTICES fleet-wide at one number, so a circuit
// could double its triangles under that cap and no test would say so.
// tools/track/props-tris-baseline.json holds the EXACT post-strip triangle
// count per circuit (the index buffer after TrackHiddenFaces.strip — what a
// browser build uploads). Semantics:
//   * a circuit NOT in the baseline fails (a new circuit writes its number),
//   * a circuit whose count GROWS more than 0.5 % over its baseline fails —
//     raise it in a commit that says which circuit and why,
//   * a circuit measuring under 99 % of its baseline fails as STALE — lower it,
//     so the ratchet keeps following the tree down.
//
// The same sweep proves the vertex compaction (TrackHiddenFaces.compact, run by
// js/track/tracks.js after the strip) is render-identical: every triangle
// corner reads the same position, normal, colour and material before and after
// (tools/track/props-tris.cjs identity()).
//
// Pure Node — tools/track/props-tris.cjs runs the real track build in a VM.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const BASELINE = JSON.parse(readFileSync(path.join(ROOT, "tools", "track", "props-tris-baseline.json"), "utf8"));
const GROW = 1.005, STALE = 0.99;

let cached = null;
const sweep = () => (cached ||= JSON.parse(execFileSync(
  process.execPath,
  [path.join(ROOT, "tools", "track", "props-tris.cjs"), "--all", "--json"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)));

test("every circuit is measured", () => {
  const roster = require("../../tools/manifest.cjs").CIRCUITS.length;
  assert.equal(sweep().length, roster, `expected ${roster} circuits, got ${sweep().length}`);
});

test("props triangles stay within 0.5 % of the per-circuit baseline", () => {
  const grown = [];
  for (const r of sweep()) {
    if (!Object.prototype.hasOwnProperty.call(BASELINE, r.id)) {
      grown.push(`${r.id}: ${r.tris} tris, NOT in props-tris-baseline.json — add it`);
      continue;
    }
    const cap = BASELINE[r.id];
    if (r.tris > cap * GROW)
      grown.push(`${r.id}: ${r.tris} tris > baseline ${cap} (+${(100 * (r.tris / cap - 1)).toFixed(2)} %)`);
  }
  assert.deepEqual(grown, [], `props triangles grew:\n  ${grown.join("\n  ")}`);
});

test("baseline has no stale entries — a cap far above the measured count is a lie", () => {
  const measured = new Map(sweep().map((r) => [r.id, r.tris]));
  const slack = [];
  for (const [id, cap] of Object.entries(BASELINE)) {
    const now = measured.get(id);
    assert.notEqual(now, undefined, `baseline names unknown circuit "${id}"`);
    if (now < cap * STALE) slack.push(`${id}: baseline ${cap} but measured ${now} — lower it`);
  }
  assert.deepEqual(slack, [], `stale baseline entries:\n  ${slack.join("\n  ")}`);
});

test("vertex compaction keeps every triangle identical and drops only unreferenced vertices", () => {
  const bad = sweep().filter((r) => !r.identical).map((r) => `${r.id}: ${r.mismatch}`);
  assert.deepEqual(bad, [], `compaction changed what is drawn:\n  ${bad.join("\n  ")}`);
  for (const r of sweep()) assert.ok(r.vertsAfter <= r.vertsBefore, `${r.id}: compaction grew the buffer`);
});

test("compact() on a hand-built buffer: order-preserving remap, blocks shifted", () => {
  const src = readFileSync(path.join(ROOT, "js", "track", "core", "hidden-faces.js"), "utf8");
  const THF = new Function(`${src}\nreturn TrackHiddenFaces;`)();
  // 5 vertices; vertex 1 and 3 unreferenced
  const geo = {
    pos: new Float64Array([0, 0, 0, 9, 9, 9, 1, 0, 0, 8, 8, 8, 0, 1, 0]),
    nrm: new Float64Array(15).map((_, i) => i),
    col: new Float64Array(15).map((_, i) => i / 15),
    mat: new Float64Array([0, 5, 2, 5, 4]),
    idx: new Uint32Array([0, 2, 4, 4, 2, 0]),
    __blocks: [{ base: 0, count: 2, id: "a" }, { base: 2, count: 3, id: "b" }],
  };
  const st = THF.compact(geo);
  assert.deepEqual([st.vertsBefore, st.vertsAfter], [5, 3]);
  assert.deepEqual(Array.from(geo.pos), [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual(Array.from(geo.mat), [0, 2, 4]);
  assert.deepEqual(Array.from(geo.nrm), [0, 1, 2, 6, 7, 8, 12, 13, 14]);
  assert.deepEqual(Array.from(geo.idx), [0, 1, 2, 2, 1, 0]);
  assert.ok(geo.pos instanceof Float64Array && geo.idx instanceof Uint32Array, "column types kept");
  assert.deepEqual(geo.__blocks.map((b) => [b.base, b.count, b.id]), [[0, 1, "a"], [1, 2, "b"]]);
  // nothing to drop: untouched, same arrays
  const pos = geo.pos;
  assert.equal(THF.compact(geo).vertsAfter, 3);
  assert.equal(geo.pos, pos);
});
