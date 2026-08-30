// Is every catalog option one a rational player could ever want to buy?
//
// tests/unit/parts-visual-distinctness.test.mjs proves each option LOOKS
// different from the one it replaces. That is half the promise. The other half
// is that the row is worth clicking, and nothing measured it: when this file was
// written, 67 of the 169 distinct rows — 39.6% of every player's browse list —
// maximised value under NO positive weighting of the four stats at ANY price,
// and one of them (`aero/wake_board`, 110 cr) was strictly worse than
// `aero/diffuser` at 100 cr on all four. A player could only lose by buying it.
//
// The model, the derivation and the "convex price curve" failure mode are
// documented in tools/parts-ladder.mjs. This file is the gate.
//
// COST: node-only, no browser, ~0.3 s for the whole catalog — cheap enough for
// the edit-loop suite, unlike its distinctness sibling.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/parts-sweep.mjs";
import { liveSet, dominated, visibleRows, sweepLadder, LADDER } from "../../tools/parts-ladder.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const M = loadParts();
const rows = sweepLadder({ M });
const STATS = ["speed", "accel", "cornering", "braking"];
const st = (o, k) => (o[k] === undefined ? 1 : o[k]);

test("no PAID option is strictly dominated by a cheaper one", () => {
  // The one finding that needs no model at all: cheaper AND at least as good on
  // every stat, better on one. Whatever a player values, that row is a trap.
  // `aero/wake_board` was one, and it shipped.
  const traps = rows.flatMap((r) => r.traps.map(
    ({ dead, by }) => `${r.cat}/${dead.id} (${dead.cost}cr) < ${by.id} (${by.cost}cr)`));
  assert.deepEqual(traps, [], "a paid option is beaten on every stat by a cheaper one");
});

test("never-optimal rows are a downward-only ratchet, and the exemptions are named", () => {
  // Measured 2026-08-29. 67 of 169 before the re-space; 2 after, and both are
  // the wet-weather compounds — the ladder scores the four DRY stats, which
  // cannot express "the only tyre that works when it rains", so they are never
  // on the hull by construction rather than by mispricing. Exact in BOTH
  // directions: a new name here is a regression, a missing one is a fix that
  // should shrink the list.
  //
  // These two are now exempt on a MECHANISM rather than a promise: their
  // advantage is `wetTread` and the WET_GRIP table in js/game/physics-consts.js
  // (docs/PHYSICS.md "Weather and tyres"), which the four dry stats do not and
  // should not model. When this list was written that advantage did not exist —
  // gripMult() read the weather and never the tyre, so they really were dead
  // rows, and the exemption was covering for it.
  const WEATHER_ONLY = ["tyres/intermediate", "tyres/wet_full"];
  const dead = rows.flatMap((r) => r.dead.map((d) => `${r.cat}/${d.id}`)).sort();
  assert.deepEqual(dead, [...WEATHER_ONLY].sort(),
    "a row is never optimal under any taste at any price — reprice it (cost is " +
    "economy-only) or give it a real trade; see tools/parts-ladder.mjs");
});

test("no category is flat on a stat the player is asked to choose over", () => {
  // Five of the 48 category x stat cells never moved: aero and floor never
  // touched accel, brakes never touched speed, and tyres, gearbox and exhaust
  // never touched braking. A flat column is a preference the player cannot
  // express, and it is what collapses a category to a single ladder.
  const flat = rows.flatMap((r) => r.flat.map((k) => `${r.cat}.${k}`));
  assert.deepEqual(flat, [], "a category never moves this stat");
});

test("a SIGNATURE row never changes the pecking order it clones", () => {
  // parts-visual-distinctness asserts this too, from the other side. Repeated
  // here because the re-space edits stats and costs in bulk and a SIGNATURE
  // left behind is a silent balance change dressed as a reskin — which is
  // exactly what a bulk edit does when the propagation misses a row.
  const bad = [];
  for (const cat of M.Parts.CATALOG) {
    const byId = Object.fromEntries(cat.options.map((o) => [o.id, o]));
    for (const o of cat.options) {
      if (o.tag !== "SIGNATURE") continue;
      const eq = byId[o.equivalent];
      if (o.cost !== eq.cost) bad.push(`${cat.id}/${o.id}: cost ${o.cost} != ${eq.cost}`);
      for (const k of STATS)
        if (st(o, k) !== st(eq, k)) bad.push(`${cat.id}/${o.id}: ${k} ${st(o, k)} != ${st(eq, k)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("the career budget cap clears the dearest works car and stays under the top shelf", () => {
  // Career.budget() = worksCost * BUDGET_MULT[lvl], capped. Nothing asserted
  // either end of that. Measured before the cap existed: McLaren's works car
  // was 2035 and one rung of BUDGET_MULT put its budget at 2340 — the dearest
  // build the catalog can express, to the credit. The economy stopped
  // constraining anything, and RAISE THE CAP bought nothing.
  const src = fs.readFileSync(path.join(ROOT, "js/game/career.js"), "utf8");
  assert.match(src, /_budgetCap = all - top;/, "budgetCap must be derived from the catalog");
  let all = 0, top = 0;
  for (const cat of M.Parts.CATALOG) {
    let hi = 0;
    for (const o of cat.options) hi = Math.max(hi, o.cost || 0);
    all += hi;
    top = Math.max(top, hi);
  }
  const cap = all - top;
  const works = M.Teams.LIST.filter((t) => !t.custom)
    .map((t) => ({ id: t.id, cost: M.Parts.getCost(M.Parts.getFactorySetup(t), t) }));
  const dearest = works.reduce((a, b) => (b.cost > a.cost ? b : a));
  assert.ok(cap >= dearest.cost,
    `budget cap ${cap} is below ${dearest.id}'s own works car (${dearest.cost}) — a team ` +
    `must always be able to rebuild the car it fields`);
  assert.ok(cap < all, `budget cap ${cap} reaches the whole top shelf (${all})`);
  // And the cap has to actually BIND: if every team's top rung already fits
  // under it, the cap is decoration.
  const topRung = Math.max(...works.map((w) => Math.round(w.cost * 1.6)));
  assert.ok(topRung > cap, `no team's budget ladder (max ${topRung}) ever reaches the cap ${cap}`);
});

test("liveSet is deterministic and exact in price", () => {
  // Two guards on the instrument. The weight sweep is a Kronecker sequence, not
  // Math.random, so a guard test cannot flake; and lambda is solved by convex
  // hull rather than sampled, so halving the weight budget must not change a
  // verdict driven by price alone.
  const cat = M.Parts.CATALOG.find((c) => c.id === "tyres");
  const opts = visibleRows(M.Parts, cat, null);
  const a = [...liveSet(opts)].sort(), b = [...liveSet(opts)].sort();
  assert.deepEqual(a, b, "liveSet is not deterministic");
  assert.ok(a.length > 0, "nothing was scored — the sweep did not run");
  // A row nobody can reach: dearer than the dearest and worse than the worst.
  const trap = { id: "__trap", cost: 999, speed: 0.5, accel: 0.5, cornering: 0.5, braking: 0.5 };
  assert.ok(!liveSet([...opts, trap]).has("__trap"), "a strictly worse, dearer row scored LIVE");
  // ...and one nobody can refuse: free and better than everything.
  const gift = { id: "__gift", cost: 0, speed: 9, accel: 9, cornering: 9, braking: 9 };
  assert.ok(liveSet([...opts, gift]).has("__gift"), "a free, strictly better row scored dead");
  assert.equal(dominated([...opts, trap]).filter((d) => d.dead.id === "__trap").length, 1);
  assert.ok(LADDER.SAMPLES >= 1000, "the weight sweep must be dense enough to trust");
});
