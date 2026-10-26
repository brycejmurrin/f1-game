// #3364 — Red Bull scenery-orbit eye must not sit inside climb/stadium props.
//
// Scenery survey preset: orbit az 45 / el 22 / dist 45 at 12 lap stations.
// Tip 17a7d1be0 put the eye inside a +1 climb grandstand at f17 and blocked
// the f92 sightline through a bowl shell. This suite rebuilds redbull and
// asserts the four named stations stay clear (insideProp null, transmit T
// above half).
//
// Run: node --test tests/unit/redbull-orbit-clear.test.mjs

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

/** Scenery survey stations named in #3364 (linspace count=12). */
const HOT = [2 / 12, 3 / 12, 9 / 12, 11 / 12]; // ~0.167, 0.25, 0.75, 0.917
const AZ = 45, EL = 22, DIST = 45, H = 1.5;
const T_MIN = 0.5;

let game;

before(async () => {
  game = await createGame({ track: "redbull" });
});
after(() => { if (game) game.close(); });

test("redbull scenery-orbit: eye clear of solids at #3364 hot fracs", () => {
  const a = game.apex, T = game.G.track, sb = game.sandbox;
  const bad = [];
  for (const f of HOT) {
    const r = a.orbit(f, AZ, EL, DIST, H);
    assert.ok(r && r.eye, `orbit(${f}) returned an eye`);
    const hit = sb.FlybySeq.insideProp(T, r.eye, 0);
    if (hit) bad.push(`f${f.toFixed(3)} inside ${hit.kind} ${hit.w}×${hit.h}×${hit.d}`);
  }
  assert.deepEqual(bad, [], bad.join("; "));
});

test("redbull scenery-orbit: sightline open at #3364 hot fracs", () => {
  const a = game.apex, T = game.G.track, sb = game.sandbox;
  const bad = [];
  for (const f of HOT) {
    const r = a.orbit(f, AZ, EL, DIST, H);
    const tx = sb.FlybySight.transmit(T, r.eye, r.target);
    if (!(tx.T >= T_MIN)) bad.push(`f${f.toFixed(3)} T=${tx.T}`);
  }
  assert.deepEqual(bad, [], bad.join("; "));
});
