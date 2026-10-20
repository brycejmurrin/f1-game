/* ai-trail-yield-vm.test.mjs — #2356: a faster AI car clears a slower AI car
 * within a minute on a permanent circuit. The field's longest
 * faster-behind-slower spells ran 4 minutes (monza, silverstone): the pair sat
 * 20-45 m apart with a 0.3-0.9 % edge the pace phase swamps. AiDrive.trailStep
 * (the trailing car pushes from 6 s) and trailYieldStep (the car ahead lets it
 * by from 8 s) bound it. Scenario: two AI cars alone on monza, 0.6 % apart,
 * the quicker one placed 30 m behind. Measured 2026-10-20 on seed 1: base
 * dc3222f0 passed at 93.7 s, with the push and yield at 21.8 s.
 * Run: node --test tests/unit/ai-trail-yield-vm.test.mjs   (one boot) */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const EDGE = 0.006, GAP = 30, LIMIT = 60;
let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("a quicker AI held behind a slower one completes the pass within a minute (#2356)", async () => {
  g.apex.seed(1);
  await g.race("monza", null, null, { laps: 20 });
  g.aiOnly();
  const cars = g.G.cars, ai = cars.filter((c) => !c.retired && !c.human);
  const pace = (c) => c.tierV * c.skill;
  let pair = null;
  for (const f of ai) for (const l of ai) {
    const e = pace(f) / pace(l) - 1;
    if (f !== l && e > 0 && (!pair || Math.abs(e - EDGE) < Math.abs(pair.e - EDGE))) pair = { f, l, e };
  }
  const { f, l } = pair;
  assert.ok(pair.e > 0.004 && pair.e < 0.008, `a pace edge near 0.6 % (${(pair.e * 100).toFixed(2)} %)`);
  cars.forEach((c, i) => { if (c !== f && c !== l && !c.retired) g.apex.retire(i, "bench"); });
  g.apex.go(); g.G.raceT = 30;   // past the start-calm window
  const L = g.G.track.total, s0 = 0.05 * L, TL = g.sandbox.TrackLine;
  for (const [c, s] of [[l, s0 + GAP], [f, s0]]) {
    c.prog = L + s; c.s = s; c.x = TL.at(g.G.track, s).x; c.xVis = c.x;
    c.speed = 60; c.launchOn = false; c.lap = 1; c.finished = false;
  }
  let passT = null, yielded = false, contact = 0;
  for (let i = 0; i < 60 * LIMIT && passT == null; i++) {
    g.step(1);
    if (l._trYT > 0) yielded = true;
    if (Math.abs(l.prog - f.prog) < 4.8 && Math.abs(l.x - f.x) < 2.0) contact++;
    if (f.prog > l.prog + 5) passT = i / 60;
  }
  assert.ok(passT != null, `${f.code} (+${(pair.e * 100).toFixed(2)} %) passed ${l.code} within ${LIMIT} s`);
  assert.equal(yielded, true, `${l.code} let ${f.code} by (trailYieldStep fired)`);
  assert.equal(contact, 0, "the pass was clean: no frame overlapped");
});
