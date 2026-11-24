/* tt-pit-lane-vm.test.mjs — the pit lane in a TIME TRIAL (#5789), in the Node VM
 * (tools/lib/game-vm.cjs), on Bahrain.
 *
 * A Time Trial forces tyre wear off, and PitLane.enabled() needs wear on, so the
 * lane never opened: no limiter, no cue, no box. Now the LANE (laneOpen) opens in
 * a TT while strategy, service and the compound rule stay on enabled(). The box
 * holds the car TT_DECIDE_S longer and offers both pit actions. Work resumes the same run; ending opens the garage
 * with the completed lap sheet one tap away.
 *
 * Run: node --test tests/unit/tt-pit-lane-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const ID = "bahrain";
let g = null;
before(async () => { g = await createGame({ track: ID }); });
after(() => { if (g) g.close(); });

async function freshTT() {
  const before = g.G.cars;
  assert.ok(g.apex.tt(ID, "day"), "tt() starts");
  assert.ok(await g.settle(() => g.G.cars !== before && g.G.timeTrial && g.G.track && g.G.player), "the time trial is built");
  const a = g.apex;
  a.go();
  a.setPhysics({ pace: 1, drift: 0 });
  assert.equal(g.G.tyres.on(), false, "a Time Trial runs with tyre wear off");
  return a;
}

// Creep down the working lane into the box; returns the per-tick pit states seen.
function creepToBox(a, ticks) {
  const L = g.G.track.total, p0 = a.pit();
  const f = (((a.physState().s + p0.boxM - p0.atM - 18) / L) % 1 + 1) % 1;
  a.jump(f, 2.5, 0);
  const lx = a.pit().laneX;
  a.jump(f, 2.5, lx); a.aim(0);
  a.pit({ arm: true });
  const seen = [];
  for (let i = 0; i < ticks; i++) {
    const ps = a.physState(), p = a.pit();
    const near = p.atM >= p.boxM - 3;
    a.aim(0);
    a.setInput({ steer: Math.max(-1, Math.min(1, (lx - ps.x) * 0.5)), throttle: !near && ps.speed < 5,
      brake: near && p.state !== "out" && p.state !== "box" && ps.speed > 0.2 });
    a.step(1 / 60, 1);
    seen.push(a.pit().state);
    if (seen[seen.length - 1] === "box") break;
  }
  a.clearInput();
  return seen;
}

test("TT: the lane opens — armed, the limiter caps the car and the HUD lane cue shows; no strategy", async () => {
  const a = await freshTT();
  const G = g.G, p = G.player, pits = G.pits;
  assert.equal(pits.twoCompoundApplies(), false, "no compound rule in a Time Trial");
  assert.equal(pits.planInfo(p), null, "no stop strategy in a Time Trial");
  a.jump(0.985, 30, 0);
  const p0 = a.pit(), L = G.track.total;
  const f = (((0.985 * L + (p0.boxM - p0.atM) * 0.2) / L) % 1 + 1) % 1;   // inside the window, short of the box
  a.jump(f, 30, a.pit().laneX); a.aim(0);
  assert.equal(a.pit({ arm: true }).armed, true, "a TT car can be armed");
  a.setInput({ steer: 0, throttle: true });
  a.step(1 / 60, 1);
  assert.equal(p.pitState, "lane", "in the lane");
  assert.equal(pits.inLane(p), true);
  assert.equal(p.incidentInvalidLap, true, "a lap through the pit lane is not a flying lap");
  const cue = pits.cue(p);
  assert.ok(cue && cue.phase === "lane" && cue.text.startsWith("STAY IN LANE"), "the HUD lane cue is up: " + (cue && cue.text));
  for (let i = 0; i < 60; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
  a.clearInput();
  assert.ok(p.speed <= pits.limit() + 1e-6, `the limiter holds (${p.speed.toFixed(2)} <= ${pits.limit().toFixed(2)} m/s)`);
});

test("TT: the box holds for the decision, serves nothing, and offers END SESSION; driving out keeps the run", async () => {
  const a = await freshTT();
  const G = g.G, p = G.player, pits = G.pits, tyre = p.tyre && p.tyre.id;
  const seen = creepToBox(a, 60 * 12);
  assert.equal(seen[seen.length - 1], "box", "reached the box: " + seen.slice(-3).join(","));
  const zz = pits.zoneOf();
  const held = p.pitT;
  assert.equal(held, zz.boxS + 4, "the stop plus TT_DECIDE_S (4 s) to decide");
  assert.equal(pits.canWork(p), true, "pit actions are available");
  for (let i = 0; i < Math.ceil((zz.boxS + 4) * 60) + 2; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
  a.clearInput();
  assert.equal(p.pitState, "out", "released after the hold");
  const banner = g.sandbox.document.getElementById("announce-text").textContent;
  assert.ok(banner.startsWith("STOP " + held.toFixed(1) + "s"), banner);
  G.refreshHud(true);
  assert.equal(G.els.workBtn.hidden, true);
  assert.equal(G.els.endSessionBtn.hidden, true, "both pit actions disappear after release");
  assert.equal(pits.canWork(p), false, "no END SESSION once released");
  assert.equal(p.tyre && p.tyre.id, tyre, "no tyre service in a Time Trial");
  assert.equal(G.state, "race", "not stopping to end it keeps the run going");
  assert.equal(G.timeTrial, true);
});

test("TT: END SESSION is visible in the box and returns to the garage before results", async () => {
  const a = await freshTT();
  const G = g.G, p = G.player;
  const seen = creepToBox(a, 60 * 12);
  assert.equal(seen[seen.length - 1], "box", "reached the box");
  const btn = g.sandbox.document.getElementById("hud-end-session");
  assert.ok(btn && typeof btn.onclick === "function", "the HUD slot is wired");
  G.refreshHud(true);
  assert.equal(btn.hidden, false);
  assert.equal(G.els.workBtn.hidden, false, "both choices are available at this stop");
  G.els.workBtn.onclick();
  const box = g.sandbox.document;
  assert.equal(G.paused, true);
  assert.equal(box.getElementById("cs-done").textContent, "RETURN TO TIME TRIAL");
  box.getElementById("cs-arrival-skip").onclick();
  const held = p.pitT, team = p.team.id;
  G.saveTeamParts(team, { ...G.getTeamParts(team), engine: "sprint" });
  box.getElementById("cs-done").onclick();
  assert.equal(box.getElementById("cs-arrival-skip").textContent, "SKIP TO TIME TRIAL", "a TT drive-out names the TT, not a race (#6390 F3)");
  box.getElementById("cs-done").onclick();
  assert.equal(G.paused, false);
  assert.equal(G.state, "race");
  assert.equal(G.getTeamParts(team).engine, "sprint");
  assert.equal(p.pitT, held + G.pits.workS, "the same stop charges for changed parts");
  G.refreshHud(true);
  assert.equal(btn.hidden, false, "ending is still available on return to the box");
  btn.onclick();
  const doc = g.sandbox.document;
  assert.equal(doc.getElementById("carsetup").hidden, false, "the pit drive-in plays in the garage");
  assert.equal(G.paused, true, "the run is frozen under it");
  assert.equal(G.state, "race", "the session ends when the drive-in hands back, not before");
  doc.getElementById("cs-done").onclick();   // SKIP / DONE during the drive-in: the same hand-back as its end
  for (let i = 0; i < 4 && G.state !== "results"; i++) { g.flushTimers(); g.step(1); }
  assert.equal(doc.getElementById("carsetup").hidden, false, "the finished session stays in the garage");
  assert.equal(doc.getElementById("results").hidden, true);
  assert.equal(doc.getElementById("cs-done").textContent, "VIEW RESULTS");
  doc.getElementById("cs-done").onclick();
  assert.equal(doc.getElementById("carsetup").hidden, true, "the garage closed");
  assert.equal(G.state, "results", "the session ended");
  assert.equal(g.sandbox.document.getElementById("results").hidden, false, "the TT results sheet is up");
  assert.equal(G.timeTrial, true, "still a Time Trial's sheet");
});

// #6390: the finished-session garage sat over a BLACK canvas on Bryce's iPhone. render()'s RESULTS early return
// (keep the frozen race's last frame) ran before the garage branch, so once G.endRace() set state "results" the
// open garage never drew again. Count GarageScene.draw per pumped frame, and drive Bryce's "b": SKIP TO RESULTS.
function garageDraws() {
  const GS = g.sandbox.GarageScene, d0 = GS.draw, out = { n: 0 };
  GS.draw = function () { out.n++; return d0.apply(this, arguments); };
  out.restore = () => { GS.draw = d0; };
  return out;
}
const pump = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) g.pumpFrame(t0 + (i + 1) * 100); };
async function endInBox() {
  const a = await freshTT();
  const seen = creepToBox(a, 60 * 12);
  assert.equal(seen[seen.length - 1], "box", "reached the box");
  g.G.refreshHud(true);
  g.sandbox.document.getElementById("hud-end-session").onclick();
  return g.sandbox.document;
}

test("#6390: the garage over the finished TT session keeps drawing (state results), and its sheet has a way back", async () => {
  const doc = await endInBox(), G = g.G, spy = garageDraws();
  try {
    assert.equal(doc.getElementById("cs-arrival-skip").textContent, "SKIP TO GARAGE");
    assert.equal(doc.getElementById("cs-arrival-alt").hidden, false, "the drive-in offers SKIP TO RESULTS too");
    assert.equal(doc.getElementById("cs-done").textContent, "SKIP TO GARAGE", "DONE skips the drive-in: it must not read RETURN TO TIME TRIAL (F2)");
    doc.getElementById("cs-arrival-skip").onclick();
    for (let i = 0; i < 4 && G.state !== "results"; i++) { pump(1); g.flushTimers(); }
    assert.equal(G.state, "results");
    assert.equal(doc.getElementById("carsetup").hidden, false, "SKIP TO GARAGE lands in the garage");
    assert.equal(doc.getElementById("res-garage").hidden, true, "a new TT sheet starts without the door (the last run's MENU left it up)");
    spy.n = 0; pump(4);
    assert.ok(spy.n >= 3, "the garage draws in the results state (was 0: a black canvas): " + spy.n);
    doc.getElementById("cs-done").onclick();   // VIEW RESULTS
    assert.equal(doc.getElementById("results").hidden, false);
    assert.equal(doc.getElementById("res-garage").hidden, false, "the sheet's GARAGE door");
    assert.equal(doc.getElementById("results").getAttribute("data-esc-close"), "res-garage", "Escape takes the same door");
    doc.getElementById("res-garage").onclick();
    for (let i = 0; i < 4; i++) { g.flushTimers(); pump(1); }
    assert.equal(doc.getElementById("results").hidden, true);
    assert.equal(doc.getElementById("carsetup").hidden, false, "back in the garage");
    assert.equal(doc.getElementById("cs-done").textContent, "VIEW RESULTS");
    spy.n = 0; pump(3);
    assert.ok(spy.n >= 2, "the reopened garage draws: " + spy.n);
  } finally { spy.restore(); }
});

test("#6390 F4: PHOTO from the finished-session garage draws too (same results return)", async () => {
  const doc = await endInBox(), G = g.G, spy = garageDraws();
  try {
    doc.getElementById("cs-arrival-skip").onclick();
    for (let i = 0; i < 4 && G.state !== "results"; i++) { pump(1); g.flushTimers(); }
    assert.equal(G.state, "results");
    const photo = doc.getElementById("cs-photo");
    await photo.onclick({ currentTarget: photo });
    g.flushTimers();
    assert.equal(doc.getElementById("carsetup").hidden, true, "the studio took over the garage");
    assert.equal(G.setupPreviewOn, true, "on the garage camera");
    spy.n = 0; pump(4);
    assert.ok(spy.n >= 3, "Photo Studio over the results state draws the bay: " + spy.n);
  } finally { spy.restore(); }
});

test("#6390 b: SKIP TO RESULTS ends the run straight onto the TT sheet; GARAGE then lands in the garage", async () => {
  const doc = await endInBox(), G = g.G;
  assert.equal(G.state, "race", "the drive-in plays before the session ends");
  doc.getElementById("cs-arrival-alt").onclick();
  assert.equal(G.state, "results", "the session ended at once");
  assert.equal(doc.getElementById("carsetup").hidden, true, "no garage stop on the way");
  assert.equal(doc.getElementById("results").hidden, false, "the TT results sheet is up");
  assert.equal(G.timeTrial, true);
  doc.getElementById("res-garage").onclick();
  for (let i = 0; i < 4; i++) { g.flushTimers(); pump(1); }
  assert.equal(doc.getElementById("carsetup").hidden, false, "closing the sheet lands in the garage");
  doc.getElementById("cs-done").onclick();
  assert.equal(doc.getElementById("results").hidden, false, "VIEW RESULTS reopens the sheet");
});

// ── Part 1 (#5789, on #5720): the TT drive-out's exterior is keyed on the TT SESSION ──
// The exterior outside the garage door is keyed on circuit + weather + hour. Every TT entry used to key it on the
// previous session's chips ("it sometimes works"). #5720 keys the drive-out on G at its moment and re-keys on every
// RACE SETTINGS move; these pin the three TT entries on its own boot, the previous session left at rain / night.
// GaragePrebuild.prewarmExterior() is the drive-out's own pick (garage-prebuild.test.mjs "a race-settings prewarm
// keys the exterior exactly as the RACE! drive-out will").
test("TT entries key the drive-out exterior on the TT session: picker → SESSION SETUP, garage → RACE SETUP, title DAILY", async () => {
  const h = await createGame({ track: ID });
  try {
    const G = h.G, pre = h.sandbox.GaragePrebuild.instance();
    const tick = async (n = 50) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
    const key = () => { const e = pre.state().exterior; return [e.trackId, e.weather, e.tod].join("/"); };
    const stale = () => { G.raceWeather = "rain"; G.raceTimeOfDay = "night"; pre.prewarmExterior(); };
    const ttPick = () => { G.flow = "gp"; G.timeTrial = true; G.session = "tt"; };   // title-flow.js openTimeTrial

    // Picker → SESSION SETUP: the picker pre-keys on the leftover chips; RACE SETTINGS resets the TT draft and re-keys.
    ttPick(); stale(); await tick();
    assert.equal(key(), ID + "/rain/night", "the picker's pre-key is the previous session's (the old bug's start)");
    G.openRaceSettings("select"); await tick();
    assert.deepEqual([G.raceWeather, G.raceTimeOfDay], ["dry", "default"], "the TT draft");
    assert.equal(key(), ID + "/dry/default", "SESSION SETUP re-keys the exterior on the TT draft");

    // Picker → YOUR CAR → garage → RACE SETUP: the bay keys on the leftover chips; RACE SETUP re-keys.
    stale(); G.openGarage("select"); await tick();
    G.openRaceSettings("select"); await tick();
    assert.equal(key(), ID + "/" + G.raceWeather + "/" + G.raceTimeOfDay, "RACE SETUP after the garage keys on the TT session");

    // Title DAILY: open() skips race settings; at startRace (the drive-out's moment) the pick is the day's.
    stale(); await tick();
    const day = G.daily.plan();
    let atStart = null;
    const start = G.startRace;
    G.startRace = (...args) => { pre.prewarmExterior(); atStart = key(); G.startRace = start; return start(...args); };
    G.daily.open();
    assert.equal(atStart, day.trackId + "/" + day.weather + "/" + day.tod, "the DAILY drive-out picks the day's circuit, weather and hour");
  } finally { h.close(); }
});
