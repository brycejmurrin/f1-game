/* livery-contrast-w13b.test.mjs — spine designs lightning / twoTone / keylineSplit
 * clear the 2.0:1 large-area floor (issues #3425, #3426).
 *
 * Before: lightning painted the same RGB on itself (1.00:1) on every team;
 * Alpine/Audi twoTone and keylineSplit scored ~1.56–1.76:1 on large crest fields.
 * Full matrix (every SIDE) is tools/car/livery-contrast.mjs; this pins the
 * regressions that shipped, in a few seconds for tooling-fast.
 *
 * Run: node --test tests/unit/livery-contrast-w13b.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAtlas, sweepAtlas, AREA_FLOOR } from "../../tools/car/livery-contrast.mjs";

const A = loadAtlas();
const FOCUS = ["lightning", "twoTone", "keylineSplit"];
// Authored zone paints are free picks — score DERIVED defaults only.
const STRIP = ["saddleTint", "sideTint", "spineTint", "sunTint", "plateTint",
               "bandTint2", "accent", "fin", "patternTint", "patternSecond"];

function bare(liv, spineLogo, spineSide) {
  const out = Object.assign({}, liv, { spineLogo, spineSide });
  for (const k of STRIP) delete out[k];
  return out;
}

test("lightning, twoTone and keylineSplit clear 2.0:1 on every team's crest (bare SIDE)", () => {
  const bad = [];
  for (const t of A.Teams.LIST) {
    const base = A.Liveries.forTeam(t)[0];
    for (const spineLogo of FOCUS) {
      for (const hit of sweepAtlas(A, t.id, bare(base, spineLogo, "none"), ["crest", "tail"], 24))
        bad.push(`${t.id} ${spineLogo} ${hit.region}: ${hit.paint} over ${hit.over} at ${hit.contrast}:1 (${(hit.share * 100).toFixed(0)}%)`);
    }
  }
  assert.deepEqual(bad, [], `below ${AREA_FLOOR}:1 —\n  ${bad.join("\n  ")}`);
});

test("Mercedes lightning no longer paints identical RGB on itself", () => {
  const t = A.Teams.LIST.find((x) => x.id === "mercedes");
  const hits = sweepAtlas(A, "mercedes", bare(A.Liveries.forTeam(t)[0], "lightning", "none"), ["crest", "tail"], 24);
  const same = hits.filter((h) => h.paint === h.over && h.contrast < 1.05);
  assert.deepEqual(same, [], `lightning still self-collides: ${JSON.stringify(same)}`);
});

test("Alpine and Audi twoTone / keylineSplit crest fields clear 2.0:1", () => {
  for (const id of ["alpine", "audi"]) {
    const t = A.Teams.LIST.find((x) => x.id === id);
    const base = A.Liveries.forTeam(t)[0];
    for (const spineLogo of ["twoTone", "keylineSplit"]) {
      const hits = sweepAtlas(A, id, bare(base, spineLogo, "none"), ["crest"], 24);
      assert.deepEqual(hits, [], `${id} ${spineLogo}: ${JSON.stringify(hits)}`);
    }
  }
});
