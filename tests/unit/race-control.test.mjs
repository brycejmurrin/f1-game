/* race-control.test.mjs — the caution flag state machine, in a VM.
 *
 * WHY THIS IS A UNIT SUITE AND NOT A SPEC. The first attempt at this was
 * Playwright: stage a race, inject a host flag with __apex.netPeerEvent, assert
 * it stuck. It cannot work, and the reason is the design rather than a bug —
 * NetPlay.ownsRaceControl() is `!active || role === "host"`, so a single-player
 * page OWNS race control and recomputes the flag every frame, clearing anything
 * injected. Only a real loopback session can exercise the guest path, and
 * tests/specs/multiplayer-session.spec.js already does exactly that.
 *
 * Everything else about the machine — the hysteresis, the per-level time caps,
 * the drop-on-disable rule, the leader's-lap rule behind OVERTAKE — needs
 * settled DebrisWorld hazards to drive it, which in a browser means staging
 * debris badly and pinning the staging instead of the rule.
 *
 * In a VM the hazard picture is a value you hand it, so the thresholds and the
 * clock are directly testable and the whole suite runs in milliseconds. That is
 * the payoff of the extraction: the machine was untestable while it was 118
 * lines in the middle of game.js, not because anyone chose that, but because
 * there was no seam to hold it by.
 *
 * Run: node --test tests/unit/race-control.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("retiring a car releases IncidentSim authority first", () => {
  const source = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const body = source.match(/function retireCar\(c, reason\) \{([\s\S]*?)\n\}/);
  assert.ok(body, "retireCar must exist");
  assert.match(body[1], /incidentSim\.release\(c\)/,
    "a retired car must not remain owned and stepped by the side-world simulation");
});

// The module declares `const RaceControl`, which lands in the context's global
// LEXICAL scope rather than on the global object — so it is read back by
// evaluating its name. Same shape as tests/unit/agentview-api-contract.test.mjs.
function load(debris) {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, isNaN, isFinite, console,
    DebrisWorld: debris,
  });
  vm.runInContext(readFileSync(join(ROOT, "js/game/racecontrol.js"), "utf8"), ctx,
    { filename: "js/game/racecontrol.js" });
  return vm.runInContext("RaceControl", ctx);
}

/** A hazard picture: `total` on the surface, and the worst single sector. */
function hazards(total, worstCount, sector = 1) {
  return { total, sectors: [0, worstCount, 0], worst: { count: worstCount, sector, frac: 0.4 } };
}

/** Minimal world: single-player (owns race control), racing, empty grid. */
function makeCtx(over = {}) {
  const saved = new Map();
  return Object.assign({
    state: "race",
    ranked: [],
    netPlay: { active: () => false, ownsRaceControl: () => true, reportCaution() {} },
    store: {
      get: (k, d) => (saved.has(k) ? saved.get(k) : d),
      set: (k, v) => saved.set(k, v),
      _saved: saved,
    },
  }, over);
}

/** Run `secs` of updates at 60 Hz so the ~4 Hz hazard query actually fires. */
function run(rc, secs) {
  for (let t = 0; t < secs * 60; t++) rc.update(1 / 60);
}

test("green with an empty track, and the level->label table", () => {
  const rc = load({ active: () => true, hazards: () => hazards(0, 0) }).create(makeCtx());
  run(rc, 1);
  const s = rc.info();
  assert.equal(s.level, 0);
  assert.equal(s.label, "GREEN");
  assert.equal(s.sector, -1);
  assert.deepEqual(s.sectors, [0, 0, 0]);
});

test("the three thresholds raise the right flag", () => {
  // YELLOW is decided by the WORST SINGLE SECTOR; VSC and SC by the TOTAL. A
  // machine that read only the total would fly green through a sector full of
  // debris as long as the rest of the lap was clean.
  for (const [total, worst, level, label] of [
    [2, 2, 0, "GREEN"],
    [3, 3, 1, "YELLOW"],
    [6, 2, 2, "VSC"],
    [10, 2, 3, "SAFETY CAR"],
  ]) {
    const rc = load({ active: () => true, hazards: () => hazards(total, worst) }).create(makeCtx());
    run(rc, 1);
    assert.equal(rc.info().level, level, `total=${total} worst=${worst}`);
    assert.equal(rc.info().label, label);
  }
});

test("a caution RAISES immediately but does not LOWER before the hold", () => {
  // This asymmetry is the whole design. Debris despawns, so a flag tracking the
  // raw count would flicker between GREEN and YELLOW several times a lap.
  let hz = hazards(0, 0);
  const rc = load({ active: () => true, hazards: () => hz }).create(makeCtx());

  hz = hazards(10, 2);
  run(rc, 0.5);
  assert.equal(rc.info().level, 3, "raises inside half a second");

  hz = hazards(0, 0);
  run(rc, 3);
  assert.equal(rc.info().level, 3, "still flying 3 s later — MIN_HOLD is 6 s");

  run(rc, 4);
  assert.equal(rc.info().level, 0, "cleared once the hold expires");
});

test("a stuck hazard cannot neutralise the race forever", () => {
  // The hard cap, now real. This test previously pinned the OPPOSITE ("the
  // flag stays — the cap only applies once the picture clears"): the cap
  // clause was dead code because MIN_HOLD always fired first and lowering
  // only ran when the picture had cleared, so a never-despawning hazard held
  // a safety car for the rest of the race — exactly what the constants'
  // comments promised could not happen.
  const rc = load({ active: () => true, hazards: () => hazards(10, 2) }).create(makeCtx());
  run(rc, 1);
  assert.equal(rc.info().level, 3);
  // SC cap is 90 s: the flag must DROP even though the hazard picture persists.
  run(rc, 95);
  assert.equal(rc.info().level, 0,
    "flown for its full cap, the flag drops to green — marshals had their window");
  // The same stale picture must not instantly re-raise (re-arm hold)…
  run(rc, 10);
  assert.equal(rc.info().level, 0, "re-arm hold suppresses the stale picture");
  // …but after the hold expires the (still-present) hazards legitimately re-arm.
  run(rc, 50);
  assert.equal(rc.info().level, 3, "after the hold, a persistent hazard re-raises");
});

test("the cap's re-arm hold never masks an ESCALATION", () => {
  // The hold exists to stop the SAME stale picture instantly re-flagging. It
  // must not also swallow a genuinely worse incident: a local yellow that
  // grows into a safety-car pile has to fly immediately, or the race runs
  // green through a real SC-worthy event for the length of the hold.
  let hz = hazards(0, 3);          // enough for a local YELLOW only
  const rc = load({ active: () => true, hazards: () => hz }).create(makeCtx());
  run(rc, 1);
  assert.equal(rc.info().level, 1, "yellow flies");
  run(rc, 32);                     // YELLOW_MAX is 30 s
  assert.equal(rc.info().level, 0, "capped to green");

  hz = hazards(3, 3);              // still yellow-grade: the SAME picture
  run(rc, 1);
  assert.equal(rc.info().level, 0, "a same-level re-raise stays suppressed");

  hz = hazards(10, 2);             // now a safety-car pile — an ESCALATION
  run(rc, 1);
  assert.equal(rc.info().level, 3,
    "a worse incident during the hold must still fly");
});

test("a cap-forced drop does not leak its hold into the next race", () => {
  // reset() is reached only when the race leaves "race" state, and it used to
  // be gated on a flag still flying — so a cap that fired near the flag left
  // level 0 with the hold armed, and the NEXT race swallowed its first real
  // caution. Nothing decrements the hold outside race state, so it never aged.
  const ctx = makeCtx();
  const rc = load({ active: () => true, hazards: () => hazards(10, 2) }).create(ctx);
  run(rc, 1);
  assert.equal(rc.info().level, 3);
  run(rc, 95);
  assert.equal(rc.info().level, 0, "capped to green, hold armed");

  ctx.state = "results";           // chequered flag
  run(rc, 2);
  ctx.state = "race";              // next race starts
  run(rc, 1);
  assert.equal(rc.info().level, 3,
    "the new race's first caution flies immediately — no inherited hold");
});

test("switching the layer off DROPS a flag already flying", () => {
  // Not "stop computing" but "stop computing AND clear". Without the clear the
  // HUD keeps showing a safety car nothing maintains, which reads as a stuck
  // flag rather than a disabled feature.
  const rc = load({ active: () => true, hazards: () => hazards(10, 2) }).create(makeCtx());
  run(rc, 1);
  assert.equal(rc.info().level, 3);
  rc.setEnabled(false);
  assert.equal(rc.info().level, 0);
  assert.equal(rc.info().enabled, false);
  run(rc, 2);
  assert.equal(rc.info().level, 0, "and stays clear while disabled, hazards or not");
});

test("the enabled flag reads BOTH storage formats", () => {
  // game.js wrote this key with a raw localStorage.setItem("apex26.caution",
  // "1" | "0"), which JSON-parses to the NUMBERS 1 and 0. A naive `!== false`
  // reads a stored 0 as truthy and silently switches cautions back ON for every
  // player who turned them off.
  const debris = { active: () => true, hazards: () => hazards(0, 0) };
  for (const [stored, expected] of [[0, false], ["0", false], [false, false],
                                    [1, true], ["1", true], [true, true], [undefined, true]]) {
    const ctx = makeCtx();
    if (stored !== undefined) ctx.store.set("caution", stored);
    assert.equal(load(debris).create(ctx).info().enabled, expected,
      `stored ${JSON.stringify(stored)}`);
  }
});

test("a guest adopts the host's flag verbatim and computes nothing itself", () => {
  // Debris is generated locally from each car's own behaviour and is NOT
  // replicated, so two peers genuinely see different hazards. Left to decide
  // independently they would fly different flags for one race.
  const ctx = makeCtx({
    netPlay: { active: () => true, ownsRaceControl: () => false, reportCaution() {} },
  });
  const rc = load({ active: () => true, hazards: () => hazards(10, 2) }).create(ctx);
  run(rc, 2);
  assert.equal(rc.info().level, 0, "a guest runs no state machine of its own");

  rc.apply({ level: 2, sector: 1, frac: 0.4, cause: "VSC", total: 7, sectors: [1, 5, 1], sinceT: 12 });
  const s = rc.info();
  assert.equal(s.level, 2);
  assert.equal(s.label, "VSC");
  assert.equal(s.cause, "VSC");
  assert.deepEqual(s.sectors, [1, 5, 1]);
  run(rc, 2);
  assert.equal(rc.info().level, 2, "and holds it — the guest runs no hold timers over someone else's flag");
});

test("the host broadcasts on CHANGE only", () => {
  // Checked at 4 Hz, changes a handful of times a race. The reliable channel is
  // not the place for a steady drip of unchanged state.
  const sent = [];
  let hz = hazards(0, 0);
  const ctx = makeCtx({
    netPlay: { active: () => true, ownsRaceControl: () => true, reportCaution: (d) => sent.push(d) },
  });
  const rc = load({ active: () => true, hazards: () => hz }).create(ctx);
  hz = hazards(10, 2);
  run(rc, 3);                      // ~12 hazard queries, one transition
  assert.equal(sent.length, 1, `expected one broadcast, got ${sent.length}`);
  assert.equal(sent[0].level, 3);
});

test("OVERTAKE is off on lap 1 and under any caution", () => {
  // The LEADER's lap, not each car's own — a field-wide switch is what race
  // control actually throws, and gating per-car would hand a lapped driver the
  // push while the leader still had none.
  let hz = hazards(0, 0);
  const ctx = makeCtx({ ranked: [{ lap: 1 }] });
  const rc = load({ active: () => true, hazards: () => hz }).create(ctx);
  run(rc, 1);
  assert.equal(rc.otEnabled(), false, "opening lap");

  ctx.ranked = [{ lap: 2 }];
  assert.equal(rc.otEnabled(), true, "leader past the opening lap, track green");

  hz = hazards(3, 3);
  run(rc, 1);
  assert.equal(rc.info().level, 1);
  assert.equal(rc.otEnabled(), false, "a local yellow is enough to take it away");

  ctx.ranked = [];
  assert.equal(rc.otEnabled(), false, "and an empty grid is not a leader on lap 2");
});

test("it is inert when the side-world is down or the race is not running", () => {
  for (const over of [{ state: "menu" }, { state: "results" }]) {
    const rc = load({ active: () => true, hazards: () => hazards(10, 2) }).create(makeCtx(over));
    run(rc, 2);
    assert.equal(rc.info().level, 0, `state ${over.state}`);
  }
  const rc = load({ active: () => false, hazards: () => hazards(10, 2) }).create(makeCtx());
  run(rc, 2);
  assert.equal(rc.info().level, 0, "debris side-world inactive");
});
