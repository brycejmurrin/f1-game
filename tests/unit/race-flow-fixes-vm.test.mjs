/* race-flow-fixes-vm.test.mjs — race-flow defects from the 2026-09-22 bug
 * hunt, each reproduced in the Node VM (tools/lib/game-vm.cjs) before the fix.
 *
 *   - RED FLAG: the red cap holds the field below the stuck-rescue gates, so
 *     every AI was "rescued" (kicked 1.2 → 11.8 m/s) every aiRescueDelay and a
 *     player holding throttle was teleported — 41 kicks and 3 player rescues in
 *     one 14 s procedure, measured on monza.
 *   - FINISHERS: coast() held its floor for one step and then scrubbed to 0, so
 *     every finisher parked ~160 m past the line on one shared line and the
 *     next car home rear-ended it at 14-29 m/s.
 *   - HUMAN DNF: the only human retiring ends the race 2.2 s later
 *     (RaceControl.finishDelay, by design); an AI whose reliability failure was
 *     already drawn used to be classified — and scored — from that snapshot.
 *
 * Run: node --test tests/unit/race-flow-fixes-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("a red flag holds the field: no stuck-rescue kicks for the AI, no rescue for a player on the throttle", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const a = g.apex, G = g.G;
    a.caution(true);
    a.setInput({ throttle: true, steer: 0 });
    g.step(60 * 20);
    assert.equal(G.state, "race");
    // Isolate the hold: B6 seeds AI packing from raceIndex/seasonSeed, so a
    // live pack can shove the player off-line under the red cap and trip the
    // legitimate beached rescue. Spread the field on the line so this asserts
    // the red-only gate, not contact RNG.
    let aiN = 0;
    for (let i = 0; i < G.cars.length; i++) {
      const c = G.cars[i];
      if (c.human || c.retired) continue;
      a.aiPlace(i, (0.15 + aiN * 0.04) % 1, 2, (aiN % 2 ? 1 : -1) * 1.5);
      aiN++;
    }
    a.jump(0.12, 2, 0);
    G.player.rescueT = 0; G.player.wallT = 0; G.player.wasOnWall = false;
    G.player.wrongT = 0; G.player.wrongWay = false; G.player.offT = 0;
    G.applyCaution({ level: 4, cause: "RED FLAG", phase: "stopping", total: 16, sectors: [16, 0, 0], sinceT: 0 });
    const P = G.player;
    let kicks = 0, rescues = 0, lastRL = P.rescueLastT;
    const prev = new Map();
    for (let i = 0; i < 60 * 12; i++) {
      for (const c of G.cars) prev.set(c, c.speed);
      g.step(1);
      for (const c of G.cars) if (!c.human && !c.retired && c.speed - prev.get(c) > 5) kicks++;
      if (P.rescueLastT !== lastRL) { rescues++; lastRL = P.rescueLastT; }
    }
    assert.equal(kicks, 0, "an AI held by the red is not stuck");
    assert.equal(rescues, 0, "a player held by the red is not stuck");
  } finally { g.close(); }
});

test("finishers coast home at the floor and never collide with each other", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const a = g.apex, G = g.G;
    g.step(60 * 3);
    const ai = G.cars.filter((c) => !c.human);
    const [A, B] = ai;
    for (const c of ai.slice(2)) a.retire(G.cars.indexOf(c));
    const L = G.track.total;
    a.jump(0.9, 0, 0);
    const s0 = L * 0.3;
    A.s = s0; A.x = 0; A.speed = 80; A.pitState = null; A.prog = G.player.prog + 3000; A.finished = true; A.finishT = G.raceT;
    const P0 = A.prog;
    let t = 0, contact = 0, placed = false;
    for (let i = 0; i < 60 * 9; i++) {
      if (!placed && t >= 3) {
        B.s = s0; B.x = A.x; B.speed = 80; B.prog = P0; B.pitState = null; B.finished = true; B.finishT = G.raceT; B.contactT = 0;
        placed = true;
      }
      g.step(1); t += 1 / 60;
      if (placed && (A.contactT > 0 || B.contactT > 0)) contact++;
    }
    assert.equal(contact, 0, "two finished cars are never in contact");
    assert.ok(A.speed > 1, `the first finisher still rolls at the floor (speed ${A.speed.toFixed(2)})`);
  } finally { g.close(); }
});

test("the only human retiring retires every AI whose failure was already drawn", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const G = g.G;
    g.apex.setInput({ throttle: true, steer: 0 });   // the player must cross the line for a distance-keyed DNF to fire
    g.step(60 * 5);
    const ai = G.cars.filter((c) => !c.human && !c.retired);
    const doomed = ai[3];
    doomed.dnfAt = 0.99; doomed.dnfWhy = "gearbox";   // drawn, but beyond where the race now stops
    G.player.dnfAt = 0.0001; G.player.dnfWhy = "engine";
    for (let i = 0; i < 60 * 10 && G.state === "race"; i++) g.step(1);
    assert.equal(G.state, "results", "the race ends once its only human is out");
    assert.equal(doomed.retired, true, "a drawn failure is met, not scored past");
    assert.equal(doomed.dnf, "gearbox");
  } finally { g.close(); }
});
