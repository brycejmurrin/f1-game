// W13c: wheel/tyre catalog copy must match the built mesh and 2026 marking.
//
// car-wheels.js builds the sealed three-ring COVER only when tyreStyle.cover or
// wheelStyle.cover is truthy (`useCover`). Catalog desc that says "cover" while
// the recipe omits cover:1 is a picker lie (#3410 Standard, #3415 Dished/Aero).
// Pure Node via loadParts — no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const COVER_WORD = /\bcover\b/i;

function cat(id) {
  const c = M.Parts.CATALOG.find((x) => x.id === id);
  assert.ok(c, `missing Parts category ${id}`);
  return c;
}

function opt(catId, id) {
  const o = cat(catId).options.find((x) => x.id === id);
  assert.ok(o, `missing ${catId}/${id}`);
  return o;
}

test("any wheels/tyres desc that mentions cover has cover:1 on the recipe", () => {
  const liars = [];
  for (const catId of ["wheels", "tyres"]) {
    for (const o of cat(catId).options) {
      if (!COVER_WORD.test(o.desc || "")) continue;
      if (!(o.visual && o.visual.cover)) {
        liars.push(`${catId}/${o.id}: ${JSON.stringify(o.desc)}`);
      }
    }
  }
  assert.deepEqual(liars, [],
    "desc says cover but visual.cover is unset — car-wheels useCover will build open spokes");
});

test("#3410 wheels/standard no longer claims an aero cover", () => {
  const o = opt("wheels", "standard");
  assert.equal(!!(o.visual && o.visual.cover), false);
  assert.equal(COVER_WORD.test(o.desc), false);
  assert.match(o.desc, /open rim/i);
});

test("#3415 dished and aero_disc describe open dish, not a sealed cover", () => {
  const dished = opt("wheels", "dished");
  const aero = opt("wheels", "aero_disc");
  assert.equal(!!(dished.visual && dished.visual.cover), false);
  assert.equal(!!(aero.visual && aero.visual.cover), false);
  assert.equal(COVER_WORD.test(dished.desc), false);
  assert.equal(COVER_WORD.test(dished.label), false);
  assert.equal(COVER_WORD.test(aero.desc), false);
  assert.match(dished.desc, /open/i);
  assert.match(aero.desc, /open/i);
});

test("#3409 role-colour compounds keep official white/yellow/red/green/blue wording", () => {
  // Official 2026 Pirelli GP role colours (press.pirelli.com 2025-12 reveal):
  // Hard white, Medium yellow, Soft red, Intermediate green, Full Wet blue.
  // C1–C5 have no fixed weekend colour. Blue must not appear as a dry Soft role.
  const hard = opt("tyres", "hard");
  const medium = opt("tyres", "medium");
  const soft = opt("tyres", "soft");
  const inter = opt("tyres", "intermediate");
  const wet = opt("tyres", "wet_full");
  const c4 = opt("tyres", "compound_c4");
  const c5 = opt("tyres", "compound_c5");
  const sprint = opt("tyres", "sprint_soft");
  assert.match(hard.desc, /white/i);
  assert.match(medium.desc, /yellow/i);
  assert.match(soft.desc, /red/i);
  assert.match(inter.desc, /green/i);
  assert.match(inter.desc, /multi-groove/i);
  assert.match(wet.desc, /blue/i);
  assert.match(wet.desc, /multi-groove/i);
  assert.doesNotMatch(c4.desc, /orange/i);
  assert.doesNotMatch(c5.desc, /magenta/i);
  assert.doesNotMatch(sprint.desc, /blue band/i);
  assert.match(sprint.desc, /Full Wet/i);
});
