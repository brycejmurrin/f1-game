/* determinism-replay-vm.test.mjs — replaying one seed must be byte-identical,
 * checked in the Node VM so the DEPLOY GATE catches it.
 *
 * tests/specs/agent-determinism.spec.js already asserts this in a browser, but
 * it lives in a spec group that a change to the AI may not select, and a
 * browser group costs 10-40 minutes here. On 2026-09-08 a new lateral
 * controller shipped with a determinism break and reached the deploy branch:
 * the player's own trace stayed byte-identical, so every check that watched the
 * player passed, while the AI cars finished in a different ORDER on the second
 * replay of the same seed. It was found only because another session's CI run
 * happened to select the browser spec. This suite is ~20 s and runs in
 * test:game-vm, which the deploy gate always runs.
 *
 * WHAT BREAKS IT, and why the field list in apex.js reset() matters: a car
 * reads some state OFF ANOTHER car during its own update (`_vmaxNow` is the
 * blocker's pace the overtake decision turns on, `accSm` its acceleration,
 * `towing` its slipstream). Those are written every frame but READ on the first
 * frame before their owner has been updated, so a fresh session sees undefined
 * and a replayed one sees the previous episode's value. Same for a controller's
 * own smoothing state (`steerSm`, and since 2026-09-08 `aiHead` / `aiBias` /
 * `aiFam`). Anything of that shape belongs in reset()'s clearing block.
 *
 * A LONG EPISODE matters too (#6560): state that only one car READS can stay
 * invisible for tens of seconds. The AI pace profile paceRef() (pace-math.js)
 * that a human's paceF is judged against outlived reset(), so the second
 * replay of a seed judged the player against the first's learned profile; the
 * first AI motion differed only at 26.5 s on monza. The 60 s pins below digest
 * EVERY primitive field of all 22 cars on two circuits, not only motion.
 *
 * Run: node --test tests/unit/determinism-replay-vm.test.mjs   (~30 s, two boots)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); await g.race("monza"); });
after(() => { if (g) g.close(); });

/** Actual simulation values, keyed by the stable car index used by carAt().
 * No rounding: a tiny AI controller divergence must change the digest too. */
function checkpoint(seconds) {
  const positions = new Map(g.apex.fieldState().map((c) => [c.id, c.pos]));
  const cars = g.G.cars.map((c, id) => ({
    id, code: c.code, isPlayer: !!c.isPlayer, pos: positions.get(id),
    prog: c.prog, x: c.x, speed: c.speed,
    retired: !!c.retired, finished: !!c.finished,
  }));
  assert.ok(cars.length > 1, "checkpoint must include AI cars");
  for (const c of cars) for (const key of ["prog", "x", "speed", "pos"]) {
    assert.ok(Number.isFinite(c[key]), `${c.code} ${key} must be live telemetry`);
  }
  return {seconds, cars};
}

/** Four seconds is a running-order check, not a finishing-order claim. */
function episode(seed) {
  const A = g.apex;
  A.headless(true);
  A.reset(0.02, 55, 0, seed);
  const checkpoints = [checkpoint(0)];
  let distanceM = 0;
  try {
    for (let seconds = 1; seconds <= 4; seconds++) {
      const r = A.rollout({ seconds: 1, input: { steer: 0.05, throttle: true } });
      distanceM += r.distanceM;
      checkpoints.push(checkpoint(seconds));
    }
    return JSON.stringify({distanceM, checkpoints});
  } finally { A.headless(false); }
}

test("one seed replays byte-identically, every car's motion and running order included", () => {
  const a = episode(42), b = episode(42), c = episode(42);
  assert.equal(b, a, "the second replay of seed 42 differs from the first");
  assert.equal(c, a, "the third replay of seed 42 differs from the first");
  const trace = JSON.parse(a);
  assert.ok(trace.distanceM > 50, `the episode barely drove (${trace.distanceM} m)`);
  const start = trace.checkpoints[0].cars;
  const end = trace.checkpoints.at(-1).cars;
  assert.deepEqual(end.map((c) => [c.id, c.code]), start.map((c) => [c.id, c.code]), "car identities must remain stable");
  assert.ok(end.some((c, i) => !c.isPlayer && c.prog !== start[i].prog), "at least one AI must actually move");
});

test("digest detects AI-only motion, retirement and running-order perturbations", () => {
  const baseline = episode(42);
  for (const key of ["prog", "x", "speed", "retired", "pos"]) {
    const altered = JSON.parse(baseline);
    const ai = altered.checkpoints[2].cars.find((c) => !c.isPlayer);
    assert.ok(ai);
    assert.ok(Object.hasOwn(ai, key), `digest must contain ${key}`);
    ai[key] = typeof ai[key] === "boolean" ? !ai[key] : ai[key] + 0.000001;
    assert.notEqual(JSON.stringify(altered), baseline, `digest missed AI ${key}`);
    assert.deepEqual(altered.checkpoints[2].cars.find((c) => c.isPlayer),
      JSON.parse(baseline).checkpoints[2].cars.find((c) => c.isPlayer), "player remains unchanged");
  }
});

test("checkpoint reads an AI-only simulation perturbation while the player stays identical", () => {
  const ai = g.G.cars.find((c) => !c.isPlayer);
  assert.ok(ai);
  const before = checkpoint(4);
  const original = ai.x;
  try {
    ai.x += 0.125;
    const after = checkpoint(4);
    assert.notEqual(JSON.stringify(after), JSON.stringify(before), "AI lateral telemetry must affect the digest");
    assert.deepEqual(after.cars.find((c) => c.isPlayer), before.cars.find((c) => c.isPlayer));
  } finally { ai.x = original; }
  assert.deepEqual(checkpoint(4), before, "control must restore the simulation state");
});

test("a different seed really does deal a different field", () => {
  // The guard above passes trivially if the seed is ignored altogether.
  assert.notEqual(episode(7), episode(42), "seeds 7 and 42 produced identical episodes");
});

/** A race, not a 4 s drive: the weather arc, the reliability plan (a seeded
 * retirement) and a launched incident all draw from the seeded stream or the
 * state reset() must clear, and a 20 s field has time to change running order.
 * Review M1-16: the 4 s steer episode above exercises none of them. */
function raceEpisode(seed) {
  const A = g.apex;
  A.headless(true);
  A.reset(0.02, 55, 0, seed);
  A.reliability("real");
  A.weatherArc("dry", "rain", 12);
  A.incident({ launch: true });
  const checkpoints = [checkpoint(0)];
  try {
    for (let seconds = 5; seconds <= 20; seconds += 5) {
      A.rollout({ seconds: 5, input: { steer: 0.05, throttle: true } });
      checkpoints.push({ ...checkpoint(seconds), weather: A.weather(), arc: !!A.weatherArc() });
    }
    return JSON.stringify(checkpoints);
  } finally {
    A.weatherArc(null); A.weather("dry"); A.incident({ reset: true }); A.headless(false);
  }
}

test("a 20 s race with a weather arc, reliability and an incident replays byte-identically", () => {
  const a = raceEpisode(42), b = raceEpisode(42);
  assert.equal(b, a, "the second replay of the long race differs from the first");
  const cps = JSON.parse(a);
  assert.ok(cps.some((c) => c.weather && c.weather !== "dry"), "the weather arc must actually reach the sim");
  const orderOf = (c) => c.cars.slice().sort((x, y) => x.pos - y.pos).map((x) => x.id).join(",");
  assert.ok(new Set(cps.map(orderOf)).size > 1,
    "the running order never changed in 20 s: this episode would not see an overtake-order divergence");
  assert.notEqual(raceEpisode(7), a, "another seed must not replay the same long race");
});

/** Every primitive field of every car: a leak no motion field shows yet
 * (paceF, a haptic timer) still breaks the digest (#6560). */
function fullSnap(game) {
  return game.G.cars.map((c, id) => {
    const o = { id };
    for (const k of Object.keys(c)) {
      const v = c[k];
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") o[k] = v;
    }
    return o;
  });
}

function longEpisode(game, seed, secs) {
  const A = game.apex;
  A.headless(true);
  A.reset(0.02, 55, 0, seed);
  const cps = [fullSnap(game)];
  try {
    for (let seconds = 10; seconds <= secs; seconds += 10) {
      A.rollout({ seconds: 10, input: { steer: 0.05, throttle: true } });
      cps.push(fullSnap(game));
    }
    return cps;
  } finally { A.headless(false); }
}

/** The first checkpoint and car field that differ, for a readable failure. */
function firstDiff(a, b) {
  for (let i = 0; i < a.length; i++) for (let c = 0; c < a[i].length; c++) {
    for (const k of new Set([...Object.keys(a[i][c]), ...Object.keys(b[i][c])])) {
      if (!Object.is(a[i][c][k], b[i][c][k])) return `t=${i * 10} s car ${a[i][c].code || c} .${k}: ${a[i][c][k]} vs ${b[i][c][k]}`;
    }
  }
  return null;
}

/** `paceF`: the player must have sampled the AI profile (true on monza; at
 * monaco the player's 0.05 steer finds a wall first). */
function assertLongReplay(game, track, secs, paceF) {
  const a = longEpisode(game, 42, secs), b = longEpisode(game, 42, secs), c = longEpisode(game, 42, secs);
  assert.equal(a[0].length, 22, `${track}: the pin needs the full 22-car field`);
  assert.equal(firstDiff(a, b), null, `${track}: the second ${secs} s replay of seed 42 differs`);
  assert.equal(firstDiff(a, c), null, `${track}: the third ${secs} s replay of seed 42 differs`);
  const ai = a.at(-1).filter((x) => !x.isPlayer);
  assert.ok(ai.every((x, i) => x.prog !== a[0].find((y) => y.id === x.id).prog), `${track}: every AI must drive`);
  if (paceF) assert.ok(a.at(-1).some((x) => x.isPlayer && x.paceF > 0),
    `${track}: the player's paceF never sampled the AI profile, so the #6560 leak would go unseen`);
}

test("a 60 s 22-car episode replays byte-identically in every car field (monza)", () => {
  assertLongReplay(g, "monza", 60, true);
});

test("a 90 s 22-car episode replays byte-identically in every car field (monaco)", async () => {
  const m = await createGame({ track: "monaco" });
  // 90 s: the haptic-timer leak (oslipHapT) first showed at 76 s here.
  try { await m.race("monaco"); assertLongReplay(m, "monaco", 90, false); } finally { m.close(); }
});
