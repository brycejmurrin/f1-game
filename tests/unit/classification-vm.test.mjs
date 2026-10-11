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
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");
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

test("flagged finishers need 90 percent distance, rounded down, before scoring", async () => {
  const game = await createGame({ track: "monza", carMeshes: false });
  try {
    const { G } = game;
    game.apex.headless(true);
    const S = vm.runInContext("SeasonCal", game.ctx);
    for (const distance of [10, 3, 2, 1]) {
      await game.race("monza", "day", "dry", { laps: distance });
      game.apex.tyres({ level: "real" });
      const L = G.track.total, minimum = Math.floor(0.9 * distance);
      const [winner, boundary, short, retired, runner, dsq] = [G.player, ...G.cars.filter((c) => c !== G.player)];
      for (const c of G.cars) {
        Object.assign(c, { retired: true, finished: false, lap: 1, prog: 0, penalty: 0, tyreLog: [] });
        G.tyres.fit(c, G.tyres.classRecord("soft"));
        G.tyres.fit(c, G.tyres.classRecord("medium"));
      }
      const finish = (c, done, time) => Object.assign(c, { retired: false, finished: true,
        lap: done + 1, prog: done * L, finishT: time });
      finish(winner, distance, 1000);
      finish(boundary, Math.max(1, minimum), 1001);
      // A car only takes the flag after a complete lap: use below-floor
      // finishers on the 3/10-lap races, not an impossible zero-lap finisher.
      if (minimum > 1) finish(short, minimum - 1, 1002);
      Object.assign(retired, { lap: minimum + 1, prog: minimum * L + 100 });
      Object.assign(runner, { retired: false, lap: 1, prog: L / 2 });
      if (distance === 10) { finish(dsq, distance, 1003); dsq.tyreLog = dsq.tyreLog.slice(0, 1); }
      G.endRace();
      assert.equal(G.state, "results");
      assert.equal(winner.classified, true);
      assert.equal(boundary.classified, true, `${distance} laps: the rounded-down boundary qualifies`);
      assert.equal(retired.classified, true, "a retirement at the distance floor still qualifies");
      // G4: the 90 % line applies to runners too (FIA B2.5.5(b) "retired or not").
      // On 1/2-lap races the lap-1 runner still meets the floor; on 3/10 it does not.
      assert.equal(runner.classified, minimum <= 1,
        minimum > 1 ? "a runner below the floor is not classified" : "a runner at/above the floor stays classified");
      if (minimum > 1) {
        assert.equal(short.finished, true, "the under-distance car really took the flag");
        assert.equal(short.classified, false, `${distance} laps: below the floor is not classified`);
        assert.ok(retired.finPos < boundary.finPos, "same-distance retiree crossed the control line before the flagged car");
      }
      if (distance === 10) {
        assert.ok(dsq.dsq, "the real compound rule disqualifies the one-compound finisher");
        assert.equal(dsq.classified, false, "full distance cannot override a disqualification");
      }
      S.setConfig({ flPoint: true }); S.engage("season");
      const season = S.blank();
      const order = G.cars.slice().sort((a, b) => a.finPos - b.finPos);
      S.award(season, order, short.driverId);
      assert.ok(season.pts[boundary.driverId] > 0, "eligible finisher receives points");
      assert.ok(season.pts[retired.driverId] > 0, "eligible retirement receives points");
      if (minimum > 1) {
        assert.equal(season.pts[runner.driverId] || 0, 0, "a runner below the floor earns no points");
        assert.equal(season.pts[short.driverId], 0, "taking the flag below the floor earns no points");
        assert.equal(season.finishes[short.driverId], undefined, "no countback finish for an unclassified car");
        assert.equal(season.lastFl, undefined, "an unclassified fastest lap earns no bonus");
      } else {
        assert.ok(season.pts[runner.driverId] > 0, "a runner at/above the floor still receives points");
      }
      if (distance === 10) assert.equal(season.pts[dsq.driverId], 0);
      S.engage("gp");
    }
  } finally { game.close(); }
});

test("with no finisher, the 90 % rule measures the leader still running", async () => {
  // The only human retiring ends the race 2.2 s later (RaceControl.finishDelay)
  // with nobody past the flag. winDone was taken from finishers only, so it
  // read 0 and EVERY retirement went unclassified — a car out with one lap to
  // go scored nothing. The leader on the road is the reference instead.
  const g3 = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g3.apex, G = g3.G;
    a.headless(true);
    await a.race("monza", "default", "dry", { laps: 10 });
    a.go(); g3.step(60);
    const L = G.track.total, P = G.player;
    const ai = G.cars.filter((c) => !c.human);
    const [late, early, run] = ai;
    for (const c of ai.slice(3)) a.retire(G.cars.indexOf(c));
    const place = (c, s, lap, v) => { c.lap = lap; c.s = s; c.prog = lap * L - (L - s); c.speed = v; c.x = 0; };
    place(run, L * 0.5, 10, 70); run.dnfAt = null;                   // the leader: 9 of 10 done, never reaches the flag
    place(late, L - 1000, 9, 0); a.retire(G.cars.indexOf(late));     // out on lap 9: 8 >= floor(0.9 * 9)
    place(early, L - 1000, 5, 0); a.retire(G.cars.indexOf(early));   // out on lap 5: 4 of 9
    a.jump(0.3, 0, 0); P.lap = 10; P.prog = 9 * L + 0.3 * L; a.retire(null);   // the human stops on lap 10
    for (let i = 0; i < 60 * 12 && G.state === "race"; i++) g3.step(1);
    assert.equal(G.state, "results", "a retired solo human ends the race");
    assert.equal(G.cars.some((c) => c.finished && !c.retired), false, "nobody took the flag");
    assert.equal(late.classified, true, "8 of the leader's 9 laps is classified");
    assert.equal(early.classified, false, "4 of 9 is not");
    assert.equal(P.classified, true, "the human, out on the leader's lap, is classified too");
    assert.ok(late.finPos < early.finPos, "the classified retirement ranks above the unclassified one");
  } finally { g3.close(); }
});

test("a car still RUNNING below 90 % of the winner's laps is not classified, and follows by distance", async () => {
  // B2.5.5(b) says "retired or not": endRace tested retirements only, so a stuck
  // AI five laps down was paid P2 (bug hunt 2026-10-05 G4).
  const g4 = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g4.apex, G = g4.G;
    a.headless(true);
    await a.race("monza", "default", "dry", { laps: 10 });
    a.go(); g4.step(60);
    const L = G.track.total, P = G.player;
    const ai = G.cars.filter((c) => !c.human);
    const [slow, early, near] = ai;
    for (const c of ai.slice(3)) a.retire(G.cars.indexOf(c));
    const place = (c, s, lap, v) => { c.lap = lap; c.s = s; c.prog = lap * L - (L - s); c.speed = v; c.x = 0; };
    a.jump((L - 40) / L, 80, 0); P.lap = 10; P.prog = 10 * L - 40;   // the player takes the flag: 10 laps
    place(slow, L - 1500, 5, 60);                                       // running on lap 5: 5 at its flag
    place(early, L - 1000, 9, 0); a.retire(G.cars.indexOf(early));     // retired with 8 done
    place(near, L - 3000, 9, 70);                                       // running on lap 9: 9 at its flag = floor(0.9 * 10)
    a.setInput({ throttle: true, steer: 0 });
    for (let i = 0; i < 60 * 12 && G.state === "race"; i++) g4.step(1);
    assert.equal(G.state, "results");
    assert.equal(slow.classified, false, "5 of 10 laps, running or not, is not classified");
    assert.equal(near.classified, true, "a runner at exactly 90 % is");
    assert.ok(near.finPos < early.finPos && early.finPos < slow.finPos,
      `classified first, then the unclassified by distance: near P${near.finPos}, early P${early.finPos}, slow P${slow.finPos}`);
  } finally { g4.close(); }
});

test("a finisher two laps down is still in `order` with a finPos, after every classified car", async () => {
  // classify() dropped `fin` from the unclassified tail: a flagged car below 90 %
  // of the winner's laps had finPos 0 (career pos 0 -> objectives "met"; a guest
  // saw a verdict one short of the field). Bug hunt round 2 #1.
  const g5 = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g5.apex, G = g5.G;
    a.headless(true);
    await a.race("monza", "default", "dry", { laps: 10 });
    a.go(); g5.step(60);
    const L = G.track.total, P = G.player;
    const ai = G.cars.filter((c) => !c.human);
    const [B, C, D] = ai;
    for (const c of ai.slice(3)) a.retire(G.cars.indexOf(c));
    const place = (c, s, lap, v) => { c.lap = lap; c.s = s; c.prog = lap * L - (L - s); c.speed = v; c.x = 0; };
    a.jump((L - 40) / L, 80, 0); P.lap = 10; P.prog = 10 * L - 40;   // the player wins: 10 laps
    place(B, L - 100, 9, 75);                                          // a lap down, flags at its next crossing
    place(C, L - 120, 7, 75);                                          // 8 at its flag: below the 9-lap floor
    place(D, L - 3000, 9, 70);
    a.setInput({ throttle: true, steer: 0 });
    for (let i = 0; i < 60 * 40 && G.state === "race"; i++) g5.step(1);
    assert.equal(G.state, "results");
    assert.equal(C.finished, true, "the lapped car really took the flag");
    assert.equal(C.classified, false);
    assert.ok(C.finPos > 0, `finPos ${C.finPos}`);
    // finPos is the index in endRace's `order` + 1: all places distinct and 1..N means order.length === cars.length.
    assert.equal(new Set(G.cars.map((c) => c.finPos)).size, G.cars.length, "every car has its own place");
    assert.ok(G.cars.every((c) => c.finPos > 0 && c.finPos <= G.cars.length), "no finPos 0");
    for (const c of G.cars) if (c.classified) assert.ok(c.finPos < C.finPos, `classified ${c.driverId} P${c.finPos} ahead of NC P${C.finPos}`);
  } finally { g5.close(); }
});

test("a championship round ended by the human's retirement pays the shortened-race scale, not the full table", async () => {
  // FIA SR Art. 6.5: the only human retiring ends the race (finishDelay), and
  // SeasonCal.award paid 25-18-15 from a lap-1 snapshot (bug hunt 2026-10-05 G1).
  const g5 = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g5.apex, G = g5.G;
    a.headless(true);
    const SeasonCal = vm.runInContext("SeasonCal", g5.ctx);
    G.flow = "season"; G.session = "race";
    const r = SeasonCal.applyConfig(Object.assign(SeasonCal.fresh(), { quali: false, trackIds: ["monza", "spa"] }));
    G.season = r.season; G.trackIdx = SeasonCal.trackIndex(0); G.raceLaps = 10;
    const before = G.cars; G.startRace();
    await settle(() => G.cars !== before && (G.state === "count" || G.state === "race"), 4000);
    a.go(); g5.step(60);
    const L = G.track.total, P = G.player;
    const ai = G.cars.filter((c) => !c.human);
    for (const c of ai) c.dnfAt = null;
    const place = (c, s, lap) => { c.lap = lap; c.s = s; c.prog = lap * L - (L - s); c.x = 0; };
    ai.forEach((c, i) => place(c, L * 0.5 - i * 30, 5));               // the leader on lap 5: 4 of 10 done (25-50 %)
    a.jump(0.3, 0, 0); P.lap = 5; P.prog = 4 * L + 0.3 * L; a.retire(null);
    for (let i = 0; i < 60 * 12 && G.state === "race"; i++) g5.step(1);
    assert.equal(G.state, "results");
    assert.equal(G.cars.some((c) => c.finished && !c.retired), false, "nobody took the flag");
    const win = G.cars.find((c) => c.finPos === 1);
    assert.equal(G.season.pts[win.driverId], 13, "40 % distance pays column 2 (13 to the winner), not 25");
    assert.equal(G.cars.filter((c) => (G.season.pts[c.driverId] || 0) > 0).length, 9, "column 2 pays nine places");
  } finally { g5.close(); }
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
