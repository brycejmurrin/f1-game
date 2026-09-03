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
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The module declares `const RaceControl`, which lands in the context's global
// LEXICAL scope rather than on the global object — so it is read back by
// evaluating its name. Same shape as tests/unit/agentview-api-contract.test.mjs.
function load(debris) {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, isNaN, isFinite, console,
    DebrisWorld: debris,
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/race/race-control.js"), "utf8"), ctx,
    { filename: "js/race/race-control.js" });
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

test("a winner never ends the race while a human is still driving", () => {
  const { finishDelay } = load({ active: () => false, hazards: () => hazards(0, 0) });
  const cars = [
    { human: false, finished: true, retired: false },
    { human: true, finished: false, retired: false },
  ];
  assert.equal(finishDelay(cars, 20, 3), 0,
    "an AI winner must not start the result countdown for an unfinished player");

  cars.push({ human: true, finished: true, retired: false });
  assert.equal(finishDelay(cars, 20, 3), 0,
    "the first multiplayer human finishing must not remove the other human");
});

test("the finish policy closes completed human races and bounded edge cases", () => {
  const { finishDelay } = load({ active: () => false, hazards: () => hazards(0, 0) });
  assert.equal(finishDelay([
    { human: true, finished: true, retired: false },
    { human: true, finished: false, retired: true },
  ], 20, 3), 2.2, "finished and retired humans are both done");

  assert.equal(finishDelay([
    { human: false, finished: true, retired: false },
  ], 20, 3), 3.5, "AI-only harnesses retain the winner delay");

  assert.equal(finishDelay([
    { human: true, finished: false, retired: false },
  ], 1081, 3), 0.1, "the hard cap still prevents a permanently hung race");
});

test("a finisher's outstanding time penalty holds the countdown until the field has had that long to cross", () => {
  // Bug-hunt 2026-09-02 (race, not landed in round 1): endRace sorts finishers
  // by finishT + penalty, but the countdown ran from the player's crossing —
  // a rival 3 s back against a +5 s penalty was filed as "still running".
  const { finishDelay } = load({ active: () => false, hazards: () => hazards(0, 0) });
  const you = { human: true, finished: true, retired: false, finishT: 100, penalty: 5 };
  const rival = { human: false, finished: false, retired: false };
  assert.equal(finishDelay([you, rival], 101, 3), 0, "the +5 s is served on the clock: no countdown at 101 s");
  assert.equal(finishDelay([you, rival], 105, 3), 2.2, "…and it starts once the corrected time has passed");
  assert.equal(finishDelay([you, { ...rival, retired: true }], 101, 3), 2.2, "nobody left who could cross: no hold");
  assert.equal(finishDelay([{ ...you, penalty: 0 }, rival], 101, 3), 2.2, "no penalty, no hold (the 2.2 s policy is unchanged)");
  const ai = { human: false, finished: true, retired: false, finishT: 100, penalty: 5 };
  assert.equal(finishDelay([ai, rival], 101, 3), 0, "the AI-only harness holds the same way");
  assert.equal(finishDelay([ai, rival], 106, 3), 3.5);
  const late = { human: false, finished: true, retired: false, finishT: 1080, penalty: 5 };
  assert.equal(finishDelay([{ human: true, finished: false, retired: false }, late], 1081, 3), 0.1,
    "the hard cap still wins over a hold");
});

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

test("debris going inactive mid-race freezes a flying flag", () => {
  // reset() on !DebrisWorld.active() flashed GREEN under a still-valid SC
  // the moment the side-world paused. Freeze; leaving "race" still clears.
  let active = true;
  const rc = load({ active: () => active, hazards: () => hazards(10, 2) }).create(makeCtx());
  run(rc, 1);
  assert.equal(rc.info().level, 3, "safety car flies");
  active = false;
  run(rc, 2);
  assert.equal(rc.info().level, 3, "flag stays up while debris is off");
});

test("a frozen flag still AGES — the hard cap fires even with debris trapped", () => {
  // DebrisWorld can go inactive permanently (a trapped world.step() sets
  // _active=false with no re-arm). The freeze must not stop sinceT, or the
  // SC_MAX cap can never fire and the race finishes under a safety car with
  // OVERTAKE disabled. Freeze the LEVEL, keep the clock.
  let active = true;
  const rc = load({ active: () => active, hazards: () => hazards(10, 2) }).create(makeCtx());
  run(rc, 1);
  assert.equal(rc.info().level, 3, "safety car flies");
  active = false;
  run(rc, 95);                     // > SC_MAX (90 s) of trapped-world time
  assert.equal(rc.info().level, 0,
    "hard cap dropped the flag to green while debris stayed inactive");
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


// ── the RED FLAG ──────────────────────────────────────────────────────────────

test("sixteen settled hazards raise RED, which outranks the safety car and holds OVERTAKE off", () => {
  const rc = load({ active: () => true, hazards: () => hazards(16, 2) }).create(makeCtx({ ranked: [{ lap: 3 }] }));
  run(rc, 1);
  assert.equal(rc.info().level, 4);
  assert.equal(rc.info().label, "RED FLAG");
  assert.equal(rc.info().cause, "RED FLAG");
  assert.equal(rc.info().phase, "stopping");
  assert.equal(rc.otEnabled(), false);
  assert.equal(rc.takeRestart(), false, "no restart while the flag is out");
});

test("the red procedure: stopping, held, then exactly ONE restart request and a re-arm hold", () => {
  const rc = load({ active: () => true, hazards: () => hazards(16, 2) }).create(makeCtx());
  run(rc, 1);
  run(rc, 8);
  assert.equal(rc.info().level, 4, "the SC cap does not end a red");
  assert.equal(rc.info().phase, "held");
  run(rc, 6);
  assert.equal(rc.info().level, 0, "the procedure ends the flag");
  assert.equal(rc.info().phase, "");
  assert.equal(rc.takeRestart(), true, "one restart request…");
  assert.equal(rc.takeRestart(), false, "…consumed once");
  run(rc, 5);
  assert.equal(rc.info().level, 0, "the same (uncleared) picture cannot raise a second flag during the hold");
  run(rc, 45);
  assert.equal(rc.info().level, 4, "…and a picture still there after the hold flies again");
});

test("a networked race never goes red — it holds a SAFETY CAR instead — and reset() drops a pending restart", () => {
  const net = { active: () => true, ownsRaceControl: () => true, reportCaution() {} };
  const rc = load({ active: () => true, hazards: () => hazards(20, 3) }).create(makeCtx({ netPlay: net }));
  run(rc, 1);
  assert.equal(rc.info().level, 3);
  assert.equal(rc.info().cause, "SAFETY CAR");
  const solo = load({ active: () => true, hazards: () => hazards(20, 3) }).create(makeCtx());
  run(solo, 15);
  solo.reset();
  assert.equal(solo.takeRestart(), false, "a race that ended mid-procedure carries no restart into the next");
});

test("a guest mirrors the red phase from the host's payload", () => {
  const rc = load({ active: () => true, hazards: () => hazards(0, 0) }).create(makeCtx());
  rc.apply({ level: 4, cause: "RED FLAG", phase: "held", total: 16, sectors: [16, 0, 0] });
  assert.equal(rc.info().label, "RED FLAG");
  assert.equal(rc.info().phase, "held");
  rc.apply({ level: 0 });
  assert.equal(rc.info().phase, "");
});
