/* tyre-recipes-open-rim.test.mjs — factory/sig tyre recipes stay distinct and honest.
 *
 * After #1190, coverVanes alone no longer builds a wheel cover. Factory and
 * signature tyre recipes must either opt in with visual.cover or put their
 * identity on open-rim features (spokes / dish / gunNut / band / shoulder /
 * sidewall). Descriptions that mention a cover must match cover:1.
 *
 * Run: node --test tests/unit/tyre-recipes-open-rim.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const tyresCat = M.Parts.CATALOG.find((c) => c.id === "tyres");
assert.ok(tyresCat, "tyres category missing");

const factoryTyreIds = [...new Set(Object.values(M.Parts.FACTORY_PRESETS).map((p) => p.tyres))];
const byId = Object.fromEntries(tyresCat.options.map((o) => [o.id, o]));

/** Keys that change what car-wheels draws for a tyre (not pure material). */
const GEOM_KEYS = [
  "grooves", "grooveDepth", "bandWidth", "coverVanes", "cover",
  "shoulder", "sidewall", "spokes", "dish", "gunNut",
];

function geomSig(visual) {
  const v = visual || {};
  const out = {};
  for (const k of GEOM_KEYS) {
    if (v[k] != null) out[k] = v[k];
  }
  // Band colour is part of tyre identity (material) — include for distinctness.
  if (v.band) out.band = v.band;
  if (v.nut) out.nut = v.nut;
  return JSON.stringify(out);
}

test("every FACTORY_PRESETS tyre id resolves to a catalogue option", () => {
  const missing = factoryTyreIds.filter((id) => !byId[id]);
  assert.equal(missing.length, 0, `factory tyre id not in catalogue: ${missing.join(", ")}`);
});

test("each factory tyre recipe is visually distinct from every other factory tyre", () => {
  const seen = new Map();
  for (const id of factoryTyreIds) {
    const sig = geomSig(byId[id].visual);
    if (!seen.has(sig)) seen.set(sig, []);
    seen.get(sig).push(id);
  }
  const collisions = [...seen.values()].filter((ids) => ids.length > 1)
    .map((ids) => ids.join(" == "));
  assert.equal(collisions.length, 0,
    `two factory tyres share the same visual recipe: ${collisions.join("; ")}`);
});

test("each SIGNATURE tyre is distinct from its equivalent's recipe", () => {
  const bad = [];
  for (const o of tyresCat.options) {
    if (o.tag !== "SIGNATURE") continue;
    const eq = byId[o.equivalent];
    if (!eq) { bad.push(`${o.id}: missing equivalent ${o.equivalent}`); continue; }
    if (geomSig(o.visual) === geomSig(eq.visual)) {
      bad.push(`${o.id} == ${o.equivalent}`);
    }
  }
  assert.equal(bad.length, 0, `SIGNATURE tyre is a no-op reskin: ${bad.join("; ")}`);
});

test("any tyre description that mentions a cover opts in with visual.cover", () => {
  const bad = [];
  for (const o of tyresCat.options) {
    if (!/cover/i.test(o.desc || "")) continue;
    if (!(o.visual && o.visual.cover)) {
      bad.push(`${o.id}: desc mentions cover but visual.cover is unset — "${o.desc}"`);
    }
  }
  assert.equal(bad.length, 0, bad.join("\n"));
});

test("coverVanes without cover is never left on a tyre recipe", () => {
  // Map/filter over VM-loaded Parts arrays returns other-realm arrays; compare lengths.
  const bad = [];
  for (const o of tyresCat.options) {
    if (o.visual && o.visual.coverVanes != null && !o.visual.cover) bad.push(o.id);
  }
  assert.equal(bad.length, 0,
    `coverVanes alone is inert after #1190 — set cover:1 or drop coverVanes: ${bad.join(", ")}`);
});

test("open-rim factory tyres keep cover unset (open rim stays the default)", () => {
  const coveredFactory = factoryTyreIds.filter((id) => byId[id].visual && byId[id].visual.cover);
  assert.equal(coveredFactory.length, 0,
    `a FACTORY_PRESETS tyre opted into cover: ${coveredFactory.join(", ")}`);
});
