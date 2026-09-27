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
