// Every catalog option must be VISIBLY different from the one it replaces.
//
// tests/specs/parts-physics.spec.js:874 already hashes each option's mesh and
// fails on a collision. That proves options are not byte-identical; it does not
// prove anyone can see the difference, and a one-vertex 0.001 m change passes
// it. 128 of the 297 options are SIGNATURE clones whose entire reason to exist
// is a different `visual` recipe — same cost, same four stat multipliers as the
// option they name as `equivalent` — so for 43% of the catalog "looks
// different" IS the feature, and nothing measured it.
//
// The measurement lives in tools/parts-sweep.mjs (thresholds, optical anchor
// and calibration deciles documented in its header). This file is the gate.
//
// COST: the full catalog is ~4 min of node, so this belongs in
// `npm run test:sweeps`, never in the edit-loop `test:tooling-fast`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sweep, classify, attribute, loadParts, catalogRows, assertFlapSig, THRESHOLDS,
} from "../../tools/parts-sweep.mjs";

const M = loadParts();

// One sweep for the whole file. node:test runs the tests in this file in
// order within one process, so a lazy singleton costs 4 min once, not per test.
let _rows = null;
const rows = () => (_rows || (_rows = sweep({ M })));
const of = (cls) => rows().filter((r) => r.cls === cls)
  .map((r) => `${r.cat}/${r.optionId}`);

test("flapSig hashes every recipe field the flap solver reads", () => {
  // The one way the whole sweep can lie in the direction that looks like a
  // catalog bug: Car3D memoises the flap solve on `aLvl + flapSig(style)`, and
  // a field the solver reads but flapSig omits lets two recipes share one
  // cached record. Those options would then measure identical and be reported
  // as dead knobs that are not dead.
  const { hashed, read } = assertFlapSig();
  assert.ok(read.length >= 6, "the solver reads at least the six known fields");
  for (const k of read) assert.ok(hashed.includes(k), `flapSig must hash ${k}`);
});

test("the catalog census is what the rest of this file assumes", () => {
  assert.equal(M.Parts.CATALOG.length, 12);
  const all = M.Parts.CATALOG.flatMap((c) => c.options);
  assert.equal(all.length, 297);
  assert.equal(all.filter((o) => o.tag === "SIGNATURE").length, 128);
});

test("a SIGNATURE is a pure reskin: same cost, same four stat multipliers", () => {
  // Nothing asserted this. Compare RESOLVED stats, not the literal objects — an
  // absent multiplier means 1.0, so copying `speed: 1.05` onto an equivalent
  // that omits `speed` is a silent physics change dressed as a cosmetic option,
  // and the pecking order moves without anyone touching a balance number.
  const bad = [];
  for (const cat of M.Parts.CATALOG) {
    const byId = Object.fromEntries(cat.options.map((o) => [o.id, o]));
    for (const o of cat.options) {
      if (o.tag !== "SIGNATURE") continue;
      const eq = byId[o.equivalent];
      if (!eq) { bad.push(`${cat.id}/${o.id}: equivalent "${o.equivalent}" is not in this category`); continue; }
      if (o.cost !== eq.cost) bad.push(`${cat.id}/${o.id}: cost ${o.cost} != ${eq.cost}`);
      for (const { key } of M.Parts.STAT_KEYS) {
        const a = o[key] === undefined ? 1 : o[key], b = eq[key] === undefined ? 1 : eq[key];
        if (a !== b) bad.push(`${cat.id}/${o.id}: ${key} ${a} != ${b} (${o.equivalent})`);
      }
    }
  }
  assert.deepEqual(bad, [], "a SIGNATURE option changes physics, not just looks");
});

test("every option resolves to itself under an eligible team", () => {
  // An unknown or gated-out id resolves to the category DEFAULT with no warning
  // (js/car/parts.js:594), which would photograph the default car and report a
  // false "identical". sweep() asserts this per row; BROKEN is how it surfaces.
  assert.deepEqual(of("BROKEN"), [], "an option does not resolve to itself");
});

test("no option is INVISIBLE", () => {
  // Hard gate. Under 5 mm of surface movement, under 0.002 m2 of moved area,
  // and no colour or material change either — at the audit camera's 6 mm per
  // pixel that cannot shift a silhouette edge by one pixel.
  assert.deepEqual(of("INVISIBLE"), [],
    `an option is indistinguishable from the one it replaces ` +
    `(< ${THRESHOLDS.INVISIBLE_MM} mm, < ${THRESHOLDS.INVISIBLE_AREA_M2} m2, no recolour)`);
});

test("no option only SLIDES its vertices along a surface that does not move", () => {
  assert.deepEqual(of("SLIDE"), [],
    "the recipe reaches the builder but moves nothing outward");
});

test("no option's only change is INTERNAL", () => {
  assert.deepEqual(of("INTERNAL"), [],
    "the change is real but sits where no camera can see it");
});

test("COLOUR-ONLY is confined to its declared allow-list", () => {
  // Exact in BOTH directions. A fuel grade legitimately reads as a filler-cap
  // and fuel-line recolour — that is what a different fuel looks like on a car
  // whose bodywork is unchanged. Anything else that lands here is an option
  // whose geometry recipe is not reaching the builder.
  const ALLOWED = [
    // A different fuel grade on unchanged bodywork IS a filler-cap, fuel-line
    // and tailpipe recolour. These three are the whole list; everything else
    // that once sat here (ers/regen_plus, ers/harvest, brakes/sig_haas_carbonmag,
    // tyres/sig_alpine_tyre) was a geometry recipe that reached the builder and
    // moved nothing, and has been given real shape instead of an exemption.
    "fuel/high_octane",
    "fuel/biofuel",
    "fuel/race_blend",
  ];
  assert.deepEqual(of("COLOUR-ONLY").sort(), [...ALLOWED].sort(),
    "a COLOUR-ONLY option appeared or disappeared — if it is new, its geometry " +
    "recipe is inert; if it is gone, drop it from this list");
});

test("WEAK is a downward-only ratchet", () => {
  // Measured 2026-08-29 on the calibration tree. WEAK means under 20 mm (three
  // pixels) OR under 0.010 m2 of moved area: real but marginal. This number may
  // only ever go DOWN. Raising it to accommodate a new thin option is the
  // tolerance-widening AGENTS.md prohibits — deepen the recipe instead.
  // ZERO, and it may never go up. The first full sweep measured 40, of which 25
  // were `tyres` pinned at 15.0-15.2 mm; that was the classifier refusing to
  // count a recolour, not 25 thin recipes, and it is fixed in classify(). The
  // other 15 were real and were given real shape.
  const CEILING = 0;
  const weak = of("WEAK");
  assert.ok(weak.length <= CEILING,
    `${weak.length} WEAK options, ceiling ${CEILING}: ${weak.join(", ")}`);
});

test("classify is a pure function of the measured row", () => {
  // Cheap guard on the classifier itself: the gate above is only as good as
  // this mapping, and it has no dependency on the sweep.
  const base = { dHaus: 0, dHausVis: 0, movedArea: 0, colArea: 0, matArea: 0, dCorr: 0 };
  assert.equal(classify({ ...base, isDefault: true }), "BASELINE");
  assert.equal(classify({ ...base, broken: "x" }), "BROKEN");
  assert.equal(classify(base), "INVISIBLE");
  assert.equal(classify({ ...base, colArea: 0.5 }), "COLOUR-ONLY");
  assert.equal(classify({ ...base, dCorr: 0.05 }), "SLIDE");
  assert.equal(classify({ ...base, dHaus: 0.2, dHausVis: 0.2, movedArea: 0.5 }), "OK");
  assert.equal(classify({ ...base, dHaus: 0.2, dHausVis: 0.001, movedArea: 0.5 }), "INTERNAL");
  assert.equal(classify({ ...base, dHaus: 0.01, dHausVis: 0.01, movedArea: 0.5 }), "WEAK");
});

test("attribute names the inert key on a flagged row", () => {
  // The triage path has to work on the day it is needed, not the day it is
  // written — and it is the only thing that turns "this option is thin" into
  // "this ONE key is clamped dead". Exercised on a known-flagged row.
  const row = rows().find((r) => !["OK", "BASELINE"].includes(r.cls) && !r.broken);
  if (!row) return;                       // catalog fully healthy — nothing to triage
  const keys = attribute(M, row);
  for (const k of keys) assert.equal(typeof k.dHaus, "number");
});

test("catalogRows picks a team that can actually see each option", () => {
  // Cheap, no builds: a gate this tool got wrong once already (passing
  // team.engine instead of the team object made all 11 fuel SIGNATUREs read as
  // BROKEN), so pin the shape.
  for (const r of catalogRows(M.Parts, M.Teams)) {
    assert.ok(r.teamId, `${r.cat}/${r.optionId} has no eligible team`);
    assert.ok(M.Teams.LIST.some((t) => t.id === r.teamId));
    if (r.signature) assert.ok(r.equivalent, `${r.optionId} is SIGNATURE with no equivalent`);
  }
});
