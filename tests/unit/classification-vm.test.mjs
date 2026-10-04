/* classification-vm.test.mjs — the race result counts LAPS first (FIA Sporting
 * Regulations B2.5), in the Node VM (tools/lib/game-vm.cjs).
 *
 * The race ends 2.2 s after the last human finishes. A lapped car that crossed
 * the line in those 2.2 s was "finished", a lead-lap car still on its last lap
 * was "running", and endRace put every running car behind every finisher — the
 * backmarker a lap down was classified P2 (bug hunt 2026-09-26).
 * Run: node --test tests/unit/classification-vm.test.mjs
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
let g = null;
after(() => { if (g) g.close(); });

test("a lapped car that takes the flag is classified behind a lead-lap car still running", async () => {
  g = await createGame({ track: "monza", carMeshes: false });
  const a = g.apex, G = g.G;
  a.headless(true);
  await a.race("monza", "default", "dry", { laps: 3 });
  a.go(); g.step(60);
  const L = G.track.total, P = G.player;
  const ai = G.cars.filter((c) => !c.human);
  const [B, C] = ai;                        // B = lapped backmarker, C = lead-lap P2
  for (const c of ai.slice(2)) a.retire(G.cars.indexOf(c));
  const place = (c, s, lap, v) => { c.lap = lap; c.s = s; c.prog = lap * L - (L - s); c.speed = v; c.x = 0; };
  a.jump((L - 40) / L, 80, 0); P.lap = 3; P.prog = 3 * L - 40;   // the player takes the flag first
  place(B, L - 100, 2, 75);                                        // a lap down, just behind on the road
  place(C, L - 440, 3, 80);                                        // lead lap, ~5 s back
  a.setInput({ throttle: true, steer: 0 });
  for (let i = 0; i < 60 * 12 && G.state === "race"; i++) g.step(1);
  assert.equal(G.state, "results");
  assert.equal(P.finPos, 1);
  assert.ok(C.finPos < B.finPos, `the lead-lap car (P${C.finPos}) must be ahead of the lapped one (P${B.finPos})`);
});

test("a car that retires past 90 % of the winner's laps is classified and scores; one below is not", async () => {
  // FIA Sporting Regulations B2.5 b: classified = covered >= 90 % of the
  // winner's laps (rounded down). It was `!retired`, so a last-lap failure
  // scored nothing and ranked behind every running car.
  const g2 = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g2.apex, G = g2.G;
    a.headless(true);
    await a.race("monza", "default", "dry", { laps: 10 });
    a.go(); g2.step(60);
    const L = G.track.total, P = G.player;
    const ai = G.cars.filter((c) => !c.human);
    const [late, early, run] = ai;
    for (const c of ai.slice(3)) a.retire(G.cars.indexOf(c));
    const place = (c, s, lap, v) => { c.lap = lap; c.s = s; c.prog = lap * L - (L - s); c.speed = v; c.x = 0; };
    a.jump((L - 40) / L, 80, 0); P.lap = 10; P.prog = 10 * L - 40;   // player takes the flag
    place(late, L - 1000, 10, 0); a.retire(G.cars.indexOf(late));    // out on lap 10: 9 of 10 completed
    place(early, L - 1000, 5, 0); a.retire(G.cars.indexOf(early));   // out on lap 5: 4 of 10
    place(run, L - 3000, 9, 70);                                     // still running a lap down
    a.setInput({ throttle: true, steer: 0 });
    for (let i = 0; i < 60 * 12 && G.state === "race"; i++) g2.step(1);
    assert.equal(G.state, "results");
    assert.equal(late.classified, true, "9 of 10 laps is classified");
    assert.equal(early.classified, false, "4 of 10 is not");
    assert.ok(late.finPos < early.finPos, "the classified retirement ranks above the unclassified one");
  } finally { g2.close(); }
});

test("the live loop flags a lapped human on the same step as the winner in either roster order", async () => {
  const game = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = game.apex, G = game.G;
    a.headless(true);
    for (const humanFirst of [true, false]) {
      await game.race("monza", "day", "dry", { laps: 3 });
      const p = G.player, lead = G.cars.find((c) => !c.human), L = G.track.total;
      for (const c of G.cars) if (c !== p && c !== lead) a.retire(G.cars.indexOf(c));
      a.jump((L - 0.4) / L, 50, -4); a.aim(0);
      p.lap = 2; p._prevS = p.s; p.prog = 2 * L - 0.4; p.lapTime = 70;
      Object.assign(lead, { lap: 3, s: L - 0.1, _prevS: L - 0.1, prog: 3 * L - 0.1, speed: 50, x: 4, lapTime: 60 });
      const rest = G.cars.filter((c) => c !== p && c !== lead);
      G.cars.splice(0, G.cars.length, ...(humanFirst ? [p, lead] : [lead, p]), ...rest);
      a.setInput({ throttle: true, steer: 0 });
      game.step(1);
      assert.equal(lead.finished, true);
      assert.equal(p.finished, true, `human-first=${humanFirst}: the later crossing receives the flag`);
      assert.ok(p.finishT > lead.finishT, "crossing times retain their real order");
      assert.ok(p.lastLap > 0, "ordinary lap timing still runs");
    }
  } finally { game.close(); }
});

test("the live loop charges a caution pass first gained on the finish step", async () => {
  const game = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = game.apex, G = game.G;
    a.headless(true);
    await game.race("monza", "day", "dry", { laps: 3 });
    const p = G.player, rival = G.cars.find((c) => !c.human), L = G.track.total;
    for (const c of G.cars) if (c !== p && c !== rival) a.retire(G.cars.indexOf(c));
    G.holdCaution(3, "test safety car"); G.applyCaution({ level: 3 });
    a.jump((L - 0.5) / L, 60, -4); a.aim(0);
    p.lap = 3; p._prevS = p.s; p.prog = 3 * L - 0.5;
    Object.assign(rival, { lap: 3, s: L - 0.4, _prevS: L - 0.4, prog: 3 * L - 0.4, speed: 20, x: 4 });
    a.setInput({ throttle: true, steer: 0 });
    game.step(1);
    assert.equal(p.finished, true);
    assert.equal(p.penalty, 0, "the observation precedes the movement on this step");
    game.step(1);
    assert.equal(p.penalty, 10, "the first finished observation still judges the final pass");
    game.step(5);
    assert.equal(p.penalty, 10, "the offence is charged once");
  } finally { game.close(); }
});
