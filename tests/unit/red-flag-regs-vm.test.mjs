/* red-flag-regs-vm.test.mjs — FIA 2026 SR B5.14.4 / B5.14.2 under a red flag (#4834).
 * A suspension allows a tyre change and repair of accident damage (B5.14.4 vii, viii), free of the pit lane; a red
 * that is never resumed classifies at the end of the penultimate lap before the signal lap (B5.14.2).
 * Run: node --test tests/unit/red-flag-regs-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g;
before(async () => { g = await createGame({ track: "monza", storage: { tyreWear: "real" } }); await g.race("monza", "day", "dry", { laps: 12 }); });
after(() => { if (g) g.close(); });

test("a red flag repairs damage and gives a one-compound car its second dry compound, without a counted stop", () => {
  const a = g.apex, G = g.G;
  g.step(60);
  const cars = G.cars.filter((c) => !c.retired);
  for (const c of cars) {
    c.tyreLog = c.tyreLog.slice(0, 1); c.pitStops = 0; c.pitNext = null;
    a.damage(G.cars.indexOf(c), { long: 3, lat: 0, sev: 0.8 });
    assert.ok(a.damage(G.cars.indexOf(c)).worst > 0, "damaged before the red");
  }
  const before = cars.map((c) => c.tyreStints);
  assert.ok(a.redFlag() && G.state === "count");
  cars.forEach((c, i) => {
    assert.equal(a.damage(G.cars.indexOf(c)).worst, 0, "accident damage repaired");
    assert.equal(c.pitStops, 0, "a red fit is not a counted stop");
    assert.equal(c.tyreStints, before[i] + 1, "exactly one free tyre change");
    assert.equal(c.tyreWear, 0, "a fresh set");
  });
  const p = G.player;
  assert.ok(G.cars.some((c) => c.tyreLog && c.tyreLog.length >= 2), "the fit is on the strip");
  assert.equal(p.pitNext, null, "the player's pitNext is spent by the red fit");
});

test("a red never resumed classifies on the order the penultimate lap was entered in (B5.14.2)", () => {
  const G = g.G, L = G.track.total;
  g.apex.go(); g.step(30);
  const [x, y, z] = G.cars.filter((c) => !c.retired);
  const led = g.ctx.RaceControl.lapLedger; led.length = 0; led[3] = [y, x, z];   // the crossing ledger (recording itself: game.js line crossing)
  // ... then x passes y on the road and the red flies on lap 4 and is never resumed.
  for (const c of [x, y, z]) { c.lap = 4; c.finished = false; }
  x.prog = 4 * L - 300; y.prog = 4 * L - 600; z.prog = 4 * L - 900;
  G.applyCaution({ level: 4, cause: "test" });
  G.endRace();
  assert.ok(y.finPos < x.finPos && x.finPos < z.finPos, `y ${y.finPos} x ${x.finPos} z ${z.finPos}: penultimate-lap order, not current progress`);
});

test("a runner already into the signal lap does not jump the penultimate-lap order (#4942 A)", async () => {
  await g.race("monza", "day", "dry", { laps: 12 });
  const G = g.G, L = G.track.total;
  g.apex.go(); g.step(30);
  const [x, y, z] = G.cars.filter((c) => !c.retired);
  const led = g.ctx.RaceControl.lapLedger; led.length = 0; led[3] = [y, x, z];
  // y, x, z crossed into lap 3; x passed y and crossed into lap 4; the red flies on lap 4, never resumed.
  x.lap = 4; y.lap = 3; z.lap = 3;
  for (const c of [x, y, z]) c.finished = false;
  x.prog = 3 * L + 100; y.prog = 3 * L - 100; z.prog = 3 * L - 400;
  G.applyCaution({ level: 4, cause: "test" });
  G.endRace();
  assert.ok(y.finPos < x.finPos && x.finPos < z.finPos, `y ${y.finPos} x ${x.finPos} z ${z.finPos}: the lap-4 runner keeps its lap-3 place`);
});

test("a red after the chequered flag is a finished race: a one-compound finisher is disqualified, not +30 s (#4942 B)", async () => {
  await g.race("monza", "day", "dry", { laps: 12 });
  const G = g.G;
  g.apex.go(); g.step(30);
  const [w] = G.cars.filter((c) => !c.retired);
  w.lap = 13; w.finished = true; w.finishT = 1; w.penalty = 0;
  w.tyreLog = w.tyreLog.slice(0, 1); w.compoundShortAtFinish = true;   // one set all race
  G.applyCaution({ level: 4, cause: "test" });
  G.endRace();
  assert.equal(w.dsq, "one dry compound", "B6.3.6: a completed race DSQs a one-compound finisher");
  assert.equal(w.penalty || 0, 0, "not the suspended race's 30 s");
});
