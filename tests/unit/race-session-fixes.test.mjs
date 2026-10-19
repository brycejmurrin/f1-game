// race-session-fixes — session-timing holes from the 2026-10-03 audit, driven through the
// REAL game (tools/lib/game-vm.cjs) instead of regexes over game.js (RC2-03, RC2-18).
//
// 1. Sprint and GP qualifying of one weekend drew the IDENTICAL simulated field: quali-model.js
//    hashed season.round, which both sessions share. SeasonCal.drawRound() is what it draws on now.
// 3. A quali lap deleted for any reason but a cut (an incident takeover, a practice rewind) fell
//    through to the model's time, possibly pole. Any deleted quali lap is NO TIME.
// 5. S3 closed with the full step's lapTime, BEFORE RaceControl.lineTransition took off the time
//    past the line, so S1+S2+S3 ran up to one physics step longer than the lap.
// 6. startRace's committed outcome calls CustomTracks.afterStart (a designer test drive's
//    restarts go back to the test point).
import test from "node:test";
import assert from "node:assert/strict";
import { runInContext } from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const flush = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// A standalone season (sprint on every round, qualifying on) so SeasonCal.stage() is the real one.
async function seasonQuali() {
  const g = await createGame({ track: "monza" });
  g.G.daily.stop();
  g.G.flow = "season";
  const s = JSON.parse(JSON.stringify(runInContext("SeasonCal.blank()", g.ctx)));   // blank() is frozen
  s.config.quali = true; s.config.sprint = true; s.round = 4;
  g.G.season = s;
  g.G.session = "quali";
  await g.G.startRace();
  g.apex.go(); g.apex.headless(true);
  return g;
}

// Drive one lap through the line: valid or deleted, then end the session and read the sheet.
function qualiSheetRow(g) {
  const doc = g.sandbox.document;
  const txt = (e) => (e.textContent || "") + " " + [...(e.children || [])].map(txt).join(" ");
  const code = g.G.player.code;
  return [...doc.getElementById("q-table").children].map((r) => txt(r).replace(/\s+/g, " ").trim())
    .find((r) => r.includes(" " + code + " "));
}
function flyingLap(g, { deleted }) {
  const { G } = g, p = G.player, T = G.track.total;
  g.apex.jump((T - 8) / T, 60, 0);
  p.lap = 1; p.lapTime = 70; p.incidentInvalidLap = deleted;
  for (let i = 0; i < 50 && p.lap === 1; i++) g.apex.step(0.1, 1);
  assert.equal(p.lap, 2, "the player never crossed the line — the fixture moved");
  return p;
}

test("1: sprint and GP qualifying of one round draw different fields through the real model", async () => {
  const g = await seasonQuali();
  try {
    const field = (stage) => { g.G.season.stage = stage; return g.G.qualiSim(0).map((r) => r.code + ":" + r.t).join(" "); };
    assert.equal(runInContext("SeasonCal.stage(null)", g.ctx), "sprint", "fixture: the weekend is a sprint weekend");
    const sprint = field("sprint"), gp = field("race");
    assert.notEqual(sprint, gp, "the two sessions of one weekend must not simulate the identical field");
    assert.equal(field("race"), gp, "…and a session's field is stable (same stage, same field)");
    assert.equal(runInContext("SeasonCal.drawRound({ round: 3, stage: 'race' })", g.ctx), 3, "the GP keeps the round it always drew");
  } finally { g.close(); }
});

test("3: ANY deleted quali lap is NO TIME, never the model's (a valid lap keeps its own time)", async () => {
  const g = await seasonQuali();
  try {
    const p = flyingLap(g, { deleted: true });
    assert.equal(p.qualiCut, true, "the deleted lap is flagged");
    assert.ok(!(p.lastLap > 0), "a deleted lap sets no lap time");
    g.G.endRace();
    assert.match(qualiSheetRow(g), /NO TIME/, "the sheet shows NO TIME, not the model's time");
    // Negative control: the same lap, valid, is a timed row.
    await g.G.startRace(); g.apex.go(); g.apex.headless(true);
    const q = flyingLap(g, { deleted: false });
    assert.ok(q.lastLap > 0, "a valid lap is timed");
    g.G.endRace();
    assert.doesNotMatch(qualiSheetRow(g), /NO TIME/);
  } finally { g.close(); }
});

test("5: S1+S2+S3 equals the lap time — S3 closes at the line, not a whole step past it", async () => {
  const g = await createGame({ track: "monza" });
  try {
    const { G } = g;
    G.daily.stop(); G.timeTrial = true; G.raceWeather = "dry";
    await G.startRace();
    const p = G.player;   // after startRace: it builds a new field
    g.apex.go(); g.apex.headless(true);
    g.apex.setInput({ throttle: true, steer: 0 });
    const T = G.track.total, secs = g.apex.info().sectors;
    const cross = (frac, lapTime) => {      // jump 5 m short of a line, then step across it with a 0.1 s step (~6 m)
      g.apex.jump(frac - 5 / T, 60, 0); p.lapTime = lapTime;
      const lap = p.lap, idx = G.sectorIdx;
      for (let i = 0; i < 50 && p.lap === lap && G.sectorIdx === idx; i++) g.apex.step(0.1, 1);
    };
    g.apex.jump((T - 8) / T, 60, 0); p.lap = 1; p.lapTime = 0;      // out-lap → the flying lap starts at the line
    for (let i = 0; i < 50 && p.lap === 1; i++) g.apex.step(0.1, 1);
    cross(secs[0], 25); cross(secs[1], 55); cross(1, 88);
    assert.equal(p.lap, 3, "the flying lap closed");
    const last = G.sectorLast;
    assert.ok(last.every((v) => v > 0), "all three splits recorded: " + JSON.stringify(last));
    const sum = last[0] + last[1] + last[2];
    assert.ok(Math.abs(sum - p.lastLap) < 1e-9, `S1+S2+S3 ${sum} vs lap ${p.lastLap}`);
    assert.ok(p.lastLap < 88.1 - 0.001, "the lap itself lost the time past the line (the fixture really overshoots)");
  } finally { g.close(); }
});

test("6: a committed startRace calls CustomTracks.afterStart (the armed test-drive return is placed)", async () => {
  const g = await createGame({ track: "monza" });
  try {
    g.G.daily.stop();
    const ret = { id: "x", sel: 0, span: 1, s: 5 }, placed = [];
    g.ctx.TrackDesigner = { placeTest: (r) => placed.push(r) };
    runInContext("CustomTracks.armReturn", g.ctx)(ret);
    await g.G.startRace();
    await flush();
    assert.equal(placed.length, 1, "afterStart ran once and placed the test return");
    assert.equal(placed[0], ret);
  } finally { g.close(); }
});
