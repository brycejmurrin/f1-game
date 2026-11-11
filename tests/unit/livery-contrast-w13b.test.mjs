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

// POSITIVE CONTROL: "no bad regions" proves nothing unless the sweep scores
// paint that owns PART of a panel. On top of a real atlas, lay one opaque slab
// over the whole region and a second slab of the SAME colour over its left 40%:
// a large area painted on itself at 1.00:1, which the sweep must report.
function sameOnSame(A, region) {
  const R = A.LT.REGIONS[region], style = "rgba(10,20,30,1)";
  const rect = (x, y, w, h) => ({ kind: "fill", rule: "nonzero", style, clip: null, shadow: null,
    pts: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]] });
  return Object.assign({}, A, { paint: (id, colors) => A.paint(id, colors).concat(
    [rect(R.x, R.y, R.w, R.h), rect(R.x, R.y, R.w * 0.4, R.h)]) });
}

test("the sweep scores a large part-panel paint (positive control for the sweeps below)", () => {
  const t = A.Teams.LIST[0];
  for (const region of ["crest", "tail"]) {
    const hits = sweepAtlas(sameOnSame(A, region), t.id, bare(A.Liveries.forTeam(t)[0], FOCUS[0], "none"), [region], 24)
      .filter((h) => h.paint === "rgba(10,20,30,1)" && h.over === h.paint);
    assert.equal(hits.length, 1, `${region}: a 40% slab of the colour beneath it must be scored and reported, got ${JSON.stringify(hits)}`);
    assert.ok(hits[0].contrast < AREA_FLOOR && hits[0].share > 0.3 && hits[0].share < 0.5, JSON.stringify(hits[0]));
  }
});

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
