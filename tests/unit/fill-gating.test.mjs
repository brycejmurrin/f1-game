/* fill-gating.test.mjs — the garage greys a colour row when no design can spend
 * it, and the shot tool warns for the same reason. Both ask LiveryTex, which
 * owns the painters (FILL_SURFACES / liveFills / fillInert).
 *
 * A DECLARED table is only as true as its last edit, and this tree's recurring
 * defect is exactly that: the paint sheet's field list had five hand-written
 * copies that disagreed, render-car carried 23 of 33 livery fields, and a
 * crown design could be signed off without ever reaching the car. So this
 * proves every entry against the RASTERISED atlas: paint the design with a
 * probe colour in that row and ask whether the colour actually lands.
 *
 * Run: node --test tests/unit/fill-gating.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAtlas } from "../../tools/car/livery-contrast.mjs";

const A = loadAtlas();
const LT = A.LT;
const PROBE = [1, 0, 1];                        // magenta: in no shipped livery
const HIT = /^rgba?\(255,0,255[,)]/;
const FILL_KEYS = LT.FILL_SURFACES.map((f) => f.key);

/** Does the probe colour reach the atlas at all? EXACT — every op the painter
 *  emits is scanned, not a sampling grid: a thin ridge or a small cap can sit
 *  between the samples of even a 48x48 probe and read as "never painted". */
function probeLands(teamId, liv) {
  return A.paint(teamId, liv)
    .some((op) => HIT.test(op.style || "") || HIT.test(op.stroke || ""));
}
/** The design with every OTHER fill row cleared: a live row can still be
 *  outranked on a particular livery (FLANK FILL beats SADDLE on the shoulder,
 *  and a team default may author it), and "it paints when nothing outranks it"
 *  is the promise the greyed-out row actually makes. */
function isolate(base, design, key) {
  const liv = { ...base, ...design, [key]: PROBE };
  for (const k of FILL_KEYS) if (k !== key) delete liv[k];
  return liv;
}

test("LiveryTex publishes the fill map the sheet and the shot tool both read", () => {
  assert.ok(Array.isArray(LT.FILL_SURFACES) && LT.FILL_SURFACES.length,
    "FILL_SURFACES must be a non-empty published list");
  for (const f of LT.FILL_SURFACES) {
    assert.ok(f.key && f.label && f.why, `${f.key}: every entry needs a key, a label and a why`);
    assert.ok((f.tops || []).length || (f.sides || []).length || (f.binds || []).length,
      `${f.key}: an entry that no design activates is a row nobody can ever spend`);
    for (const t of f.tops || []) assert.ok(LT.SPINE_LOGO_IDS.includes(t), `${f.key}: no SPINE TOP "${t}"`);
    for (const v of f.sides || []) assert.ok(LT.SPINE_SIDE_IDS.includes(v), `${f.key}: no SPINE SIDE "${v}"`);
  }
  // Every fill row the paint sheet offers is in the map, and vice versa.
  // The atlas is loaded in a vm sandbox, so its arrays are cross-realm and
  // deepStrictEqual would fail on the prototype rather than the contents.
  const keys = LT.FILL_SURFACES.map((f) => f.key).sort().join(",");
  assert.equal(keys, ["bandTint2", "plateTint", "saddleTint", "sideTint", "spineTint", "sunTint"].sort().join(","));
  assert.equal(LT.fillInert("logo", {}), false, "a row that is not a fill is never inert");
});

test("every design the map calls LIVE can really spend that row", () => {
  // The positive half. The map is deliberately an OVER-approximation: a live
  // row can still be outranked on one car (FLANK FILL beats SADDLE on the
  // shoulder; a saddleWrap bind paints no saddle under a WRAP crown), and
  // showing a row that happens to be outranked is a far better error than
  // greying a row the player needs. So the promise is per (fill, design id):
  // SOME car spends it. An id no car can spend is a dead row and fails here.
  const bad = [];
  for (const f of LT.FILL_SURFACES) {
    for (const [field, ids] of [["spineLogo", f.tops || []], ["spineSide", f.sides || []],
      ["coverBind", f.binds || []]]) {
      for (const id of ids) {
        const spent = A.Teams.LIST.some((team) => {
          const base = A.Liveries.forTeam(team)[0];
          const design = { [field]: id };
          // A bind or a side needs a crown, exactly as the sheet's predicate reads it.
          if (field !== "spineLogo") design.spineLogo = "saddle";
          return probeLands(team.id, isolate(base, design, f.key));
        });
        if (!spent) bad.push(`${f.key} on ${field}=${id}: no car spends it`);
      }
    }
  }
  assert.deepEqual(bad, [], "declared LIVE but no car can spend the row");
});

test("a design the map calls INERT paints nothing in that row", () => {
  // The negative half, and the one that makes the gating honest: for a design
  // the map greys out, setting the row must change no cover pixel at all.
  const bad = [];
  for (const team of A.Teams.LIST.slice(0, 4)) {
    const base = A.Liveries.forTeam(team)[0];
    for (const f of LT.FILL_SURFACES) {
      for (const top of LT.SPINE_LOGO_IDS) {
        const design = { spineLogo: top, spineSide: "none", coverBind: "independent" };
        if (!LT.fillInert(f.key, design)) continue;
        if (probeLands(team.id, isolate(base, design, f.key)))
          bad.push(`${team.id} ${f.key} declared inert on SPINE TOP ${top}, but it painted`);
      }
    }
  }
  assert.deepEqual(bad, [], "declared inert but the colour reached the car");
});
