// LOD census ratchet (#6547 step 1): tests/data/lod-census.json holds what every circuit BUILDS at detail 0/1/2
// (tools/perf/lod-census.mjs, a Node VM build on the browser's instancing path). This file re-measures the PHONE
// rows (detail 0, every phone and desktop LOW-HIGH; #6547 §7.4: the detail-0 census is the hard ratchet, desktop
// rows stay advisory until a real-GPU window measures them) and fails when a circuit's
//   drawn tris, instanced tris, instances or batches
// GROW more than 0.5 % over its row (props-tri-ratchet's band). A shrink passes: lower the row with
//   node tools/perf/lod-census.mjs --write
// in the PR that shrank it (or any later one). A grow is re-measured the same way, with the circuit and the why in
// the commit. Byte columns (texture MB, lazy bytes) are recorded, never compared: eagerCodeBytes owns code size.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { measure, roster, TIERS, CHANNELS, DATA } from "../../tools/perf/lod-census.mjs";

const GROW = 1.005;
const KEYS = ["drawn", "instanced", "instances", "batches"];
const doc = JSON.parse(readFileSync(DATA, "utf8"));
const pick = (r, k) => (k === "instanced" ? r.tris.instanced : r[k]);

let cached = null;
const now = () => (cached ||= new Map(roster().map((id) => [id, measure(id, 0)])));

test("the census covers the scoped roster at every detail level and tier", () => {
  const missing = [];
  for (const id of roster()) {
    const row = doc.circuits[id];
    if (!row) { missing.push(`${id}: no row — node tools/perf/lod-census.mjs --write`); continue; }
    for (const lv of ["detail0", "detail1", "detail2"]) {
      const r = row[lv];
      if (!r) { missing.push(`${id}.${lv}`); continue; }
      for (const k of CHANNELS) if (!Number.isFinite(r.tris[k])) missing.push(`${id}.${lv}.tris.${k}`);
    }
    for (const t of Object.keys(TIERS)) if (!(row.lazyBytes[t] > 0)) missing.push(`${id}.lazyBytes.${t}`);
  }
  for (const t of Object.values(TIERS)) if (!(doc.pack[t.pack] && doc.pack[t.pack].texMB > 0)) missing.push(`pack.${t.pack}.texMB`);
  assert.deepEqual(missing, [], `lod-census.json is incomplete:\n  ${missing.join("\n  ")}`);
});

test("a row's drawn total is the sum of its channels", () => {
  const bad = [];
  for (const [id, row] of Object.entries(doc.circuits))
    for (const lv of ["detail0", "detail1", "detail2"]) {
      const r = row[lv], s = Object.values(r.tris).reduce((a, v) => a + v, 0);
      if (s !== r.drawn) bad.push(`${id}.${lv}: channels ${s} vs drawn ${r.drawn}`);
    }
  assert.deepEqual(bad, []);
});

test("detail 0 (phone) builds stay within 0.5 % of the census — a shrink passes", () => {
  const grown = [];
  for (const [id, r] of now()) {
    const want = doc.circuits[id] && doc.circuits[id].detail0;
    if (!want) continue;   // reported by the coverage test
    for (const k of KEYS) {
      const got = pick(r, k), cap = pick(want, k);
      if (got > cap * GROW && got > cap) grown.push(`${id} ${k}: ${got} > ${cap} (+${(100 * (got / Math.max(1, cap) - 1)).toFixed(2)} %)`);
    }
  }
  assert.deepEqual(grown, [], `detail-0 build grew — re-measure with node tools/perf/lod-census.mjs --write and say why:\n  ${grown.join("\n  ")}`);
});
