/* red-flag-vm.test.mjs — the standing restart re-runs the lap the field was on.
 *
 * game.js redFlagRestart re-grids every car BEHIND the line. `lap` counts line
 * crossings, so a car re-gridded with its lap kept crossed into lap n+1 at the
 * restart without driving lap n — a leader on its last lap was classified
 * finished 14 m after the lights. The restart now steps lap back by one
 * (prog consistent with gridUp: lap 0 <-> prog just under 0), derives the
 * player's heading from the road tangent as gridUp does, and drops the
 * racecraft scratch a re-grid must not carry.
 *
 * Run: node --test tests/unit/red-flag-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

const SCR = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };

test("red flag: laps step back one, prog sits behind the line, the player faces down the road", () => {
  const a = g.apex, G = g.G;
  g.step(120);                        // the grid clears the line
  a.jump(0.985, 50, 0);
  const lap0 = a.physState().lap;
  a.setInput({ throttle: true, steer: 0 });
  for (let i = 0; i < 300 && a.physState().lap === lap0; i++) g.step(1);
  a.clearInput();
  const player = G.player;
  assert.equal(player.lap, lap0 + 1, "the player should be on the lap after the crossing");
  const L = G.track.total;
  const before = G.cars.map((c) => ({ c, lap: c.lap, prog: c.prog }));
  // The rewind is the LEADER's (2026-09-29): it re-runs its lap, and every
  // other car keeps the laps it was down at the flag, by distance.
  const lead = before.filter((b) => !b.c.retired).sort((x, y) => y.prog - x.prog)[0];
  const leadLap = Math.max(0, lead.lap - 1);
  const lapWant = (b) => b === lead ? leadLap : Math.min(b.lap, Math.max(0, leadLap - Math.max(0, Math.floor((lead.prog - b.prog) / L))));
  // Leave something a re-grid must clear on an AI car.
  const ai = G.cars.find((c) => !c.human && !c.retired);
  ai.passOf = player; ai.defendSide = 1; ai.zoneKey = 3; ai.errT = 1.5;
  // ...and something it must NOT clear: errCount counts the car's mistakes for
  // the RACE, and a red flag does not start a new one (as energy/tyreClass show).
  ai.errCount = 4; player.errCount = 2;

  const r = a.redFlag();
  assert.ok(r && r.state === "count", "redFlag() should re-arm the lights");
  for (const b of before) {
    const { c } = b;
    if (c.retired) continue;
    assert.equal(c.lap, lapWant(b), `${c.code}: the leader re-runs its lap; the rest keep their laps down`);
    assert.ok(c.prog < c.lap * L && c.prog > c.lap * L - 200,
      `${c.code}: prog ${c.prog.toFixed(1)} must sit just behind the line of lap ${c.lap}`);
    assert.equal(c.speed, 0, `${c.code}: stationary on the box`);
  }
  assert.equal(ai.passOf, null); assert.equal(ai.defendSide, 0); assert.equal(ai.zoneKey, -1); assert.equal(ai.errT, 0);
  assert.equal(ai.errCount, 4, "a red flag is the same race: the AI mistake count survives it");
  assert.equal(player.errCount, 2, "same for the player's row of the instrument");
  // The player's heading follows the grid tangent (gridUp's rule), not world +Z.
  g.sandbox.Tracks.sample(G.track, player.s, SCR);
  const want = Math.atan2(SCR.t[0], SCR.t[2]);
  assert.ok(Math.abs(player.head - want) < 1e-6, `head ${player.head} vs tangent ${want}`);
  assert.equal(player.rPrevHead, player.head);
});

test("after the restart the first crossing puts the field back on the lap it was on, not one further", () => {
  const a = g.apex, G = g.G;
  const player = G.player;
  const lapAtFlag = player.lap + 1;   // what it was before the re-grid (see above)
  a.go();                             // lights out
  a.setInput({ throttle: true, steer: 0 });
  let crossed = false;
  for (let i = 0; i < 600 && !crossed; i++) { g.step(1); crossed = player.lap !== lapAtFlag - 1; }
  a.clearInput();
  assert.ok(crossed, "never re-crossed the line after the restart");
  assert.equal(player.lap, lapAtFlag, "the restart crossing re-enters the same lap");
  assert.equal(player.finished, false);
});

test("a fresh grid-up still zeroes errCount — only a NEW race resets the instrument", () => {
  const G = g.G;
  for (const c of G.cars) c.errCount = 7;
  G.gridUp();
  for (const c of G.cars) assert.equal(c.errCount, 0, `${c.code}: a new race starts at zero mistakes`);
});

test("a car just behind a leader that has crossed is NOT a lap down after the restart", () => {
  // Bug hunt 2026-09-29: each car stepped back its OWN lap. The leader 100 m
  // past the line (lap 6) and a car 150 m behind it, still on lap 5, came
  // out of the restart a full lap apart — "+1 LAP" and no way to win.
  const G = g.G, L = G.track.total;
  const live = G.cars.filter((c) => !c.retired);
  const [a, b] = live;
  for (const c of live) { c.lap = 1; c.s = 10; c.prog = 10; }            // the rest of the field, far back
  a.lap = 6; a.s = 100; a.prog = 5 * L + 100;                            // leader, just crossed
  b.lap = 5; b.s = L - 50; b.prog = 4 * L + (L - 50);                    // 150 m behind, not lapped
  G.state = "race";
  assert.equal(G.redFlagRestart(), true);
  assert.equal(a.lap, 5, "the leader re-runs its lap");
  assert.equal(b.lap, 5, "the car behind is on the leader's lap, not one down");
  const lapped = live[2];
  assert.equal(a.lap - lapped.lap, 5, "a car genuinely laps down keeps them (5 laps and 90 m behind at the flag)");
});

test("a queue held under the red flag is parked, not wedged: no AI accrues stuckT", async () => {
  // Level 4 caps the field near 0.02 x vTop, so a queued car is under 7 m/s with a blocker inside 6 m
  // by design. That was "boxed and going nowhere": stuckT climbed, unstuckActive cancelled the car's
  // braking and it dug out sideways under a red. Measured before the gate: stuckT 2.98 s inside 10 s.
  const m = await createGame({ track: "monza" });
  try {
    const G = m.G, A = m.apex, L = G.track.total;
    A.go(); m.step(60);
    G.applyCaution({ level: 4, cause: "test" });
    for (let i = 1; i < G.cars.length; i++) A.aiPlace(i, 0.40 + (i - 1) * 5 / L, 2, 0);   // bumper to bumper
    const ai = G.cars.filter((c) => !c.human && !c.retired);
    let maxStuck = 0, slow = 0;
    for (let i = 0; i < 600; i++) {   // 10 s: the red procedure runs 14 s before it asks for a restart
      m.step(1, 1 / 60);
      for (const c of ai) { maxStuck = Math.max(maxStuck, c.stuckT || 0); if (c.speed < 7) slow++; }
    }
    assert.equal(G.cautionLevel(), 4, "the red flag should still be flying");
    assert.ok(slow > ai.length * 300, "the queue must actually be crawling, or the test proves nothing");
    assert.equal(maxStuck, 0, "no AI may count a red-flag queue as stuck");
  } finally { m.close(); }
});
