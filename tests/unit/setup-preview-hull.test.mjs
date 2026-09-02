// The garage turntable's framing hull is cached across colour-only rebuilds
// (js/game.js getSetupPreviewMesh). That cache is only correct while its
// SP_HULL_GEOM_FIELDS list names EVERY livery field whose presence can move a
// vertex — so this test does not pin the list, it re-derives it from the real
// Car3D.build and compares.
//
// Why it matters: livePreviewDraft busts _spMeshKey on every distinct colour
// value, and an <input type=color> emits those continuously while dragged. The
// hull is a monotone-chain convex hull over ~19k positions (~16 ms), so before
// the cache the turntable paid it once per frame of a drag to arrive at the same
// silhouette. If a future edit gates geometry on, say, `wing`, the cache would
// hand back a stale silhouette and the car would re-centre wrong — this goes red
// first.
//
// Pure Node: tools/parts-sweep.mjs's loadParts runs car3d.js in a VM with no
// browser, so this belongs in `npm run test:tooling`, not the Playwright projects.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadParts } from "../../tools/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Every optional livery colour the editor exposes (js/game.js CZ_LIV_FIELDS).
const OPTIONAL = ["stripe", "noseStripe", "accent", "nose", "pod", "wing",
                  "fin", "finArt", "logo", "logo2", "logo3", "halo"];

function declaredGeomFields() {
  const src = readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const m = /const SP_HULL_GEOM_FIELDS = \[([^\]]*)\]/.exec(src);
  assert.ok(m, "SP_HULL_GEOM_FIELDS not found — getSetupPreviewMesh moved");
  return m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

const M = loadParts();
const team = M.Teams.LIST[0];
const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);
const BASE = { c1: [0.9, 0.1, 0.1], c2: [1, 1, 1], finish: null };
for (const k of OPTIONAL) BASE[k] = null;

const build = (liv) => M.Car3D.build(liv.c1, liv.c2, {
  livery: liv, teamId: team.id, num: 1, parts,
});
const samePos = (a, b) =>
  a.pos.length === b.pos.length && a.pos.every((v, i) => v === b.pos[i]);
const withField = (k, v) => Object.assign({}, BASE, { [k]: v });

test("a HUE change never moves a vertex — only presence can", () => {
  const base = build(BASE);
  const hue = build(Object.assign({}, BASE, { c1: [0.1, 0.2, 0.9], c2: [0.2, 0.9, 0.2] }));
  assert.ok(samePos(base, hue),
    "c1/c2 hue moved geometry — the hull cache's whole premise is gone, not just its field list");
  for (const k of OPTIONAL) {
    const on = build(withField(k, [0.3, 0.4, 0.5]));
    const on2 = build(withField(k, [0.9, 0.1, 0.2]));
    assert.ok(samePos(on, on2), `a hue change of \`${k}\` moved geometry`);
  }
});

test("SP_HULL_GEOM_FIELDS names exactly the fields whose PRESENCE moves a vertex", () => {
  const base = build(BASE);
  const measured = OPTIONAL.filter((k) => !samePos(base, build(withField(k, [0.3, 0.4, 0.5]))));
  const declared = declaredGeomFields();
  assert.deepEqual(measured.slice().sort(), declared.slice().sort(),
    `js/game.js SP_HULL_GEOM_FIELDS is [${declared}] but Car3D.build moves geometry for ` +
    `[${measured}]. A field that is MISSING makes the garage turntable re-centre against a ` +
    `stale silhouette; an extra one only costs a needless hull rebuild.`);
});
