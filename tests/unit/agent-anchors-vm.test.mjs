/* agent-anchors-vm.test.mjs — the render-interpolation anchors every hook that
 * pumps update() by hand has to take, and the lit-lights counter its countdown
 * promotion has to clear.
 *
 * NOT a twin (obs-act-edge-vm / agent-view-vm are, and their counts are pinned
 * to their browser specs by twinned-specs.test.mjs): these assertions read the
 * anchors off G through the VM handle, which no `__apex` hook exposes, so there
 * is no browser copy for them to mirror.
 *
 * THE CONTRACT. The render loop snapshots six fields per car before each step
 * and lerps from them. act(), rollout(), reset(), jump() and aiPlace() all step
 * physics outside that loop, so each must take the same snapshot; five of them
 * took a subset. It matters because the PLAYER is drawn from WORLD space
 * (rPrevPx/rPrevPz/rPrevHead), not from the (s, x) pair the AI cars
 * interpolate, so an anchor left behind draws the car — and the camera rig
 * anchored to it — at a pose it was never in, with no error to show for it.
 *
 * Run: node --test tests/unit/agent-anchors-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

const FIELDS = ["s", "x", "px", "pz", "yawVis", "head"];
const anchorOf = (f) => "rPrev" + f[0].toUpperCase() + f.slice(1);
const poses = () => g.G.cars.map((c) => FIELDS.map((f) => c[f]));
/** Anchors that do NOT hold the pose their car was in before the last step. */
const stale = (before_) => {
  const bad = [];
  g.G.cars.forEach((c, i) => FIELDS.forEach((f, j) => {
    if (c[anchorOf(f)] !== before_[i][j]) bad.push(`car${i}.${anchorOf(f)}`);
  }));
  return bad;
};
// A step FIRST, every time: on a fresh grid every rPrev* already equals its
// live field, so a snapshot that wrote nothing at all would look right. Only a
// SECOND step can tell a full snapshot from the (s, x) pair these hooks took.
const settled = async () => {
  await g.race("monza");
  g.apex.jump(0.42, 55, 1.5);
  g.apex.act({ steer: 0, throttle: true }, 1 / 60, 1);
};

test("act() anchors every car at its pre-step pose", async () => {
  await settled();
  const before_ = poses();
  g.apex.act({ steer: 0, throttle: true }, 1 / 60, 1);
  assert.deepEqual(stale(before_), [], "an anchor left behind draws a pose the car was never in");
});

test("rollout() anchors every car at its pre-tick pose", async () => {
  await settled();
  const before_ = poses();
  // dt 1/10 against the 0.05 s floor is exactly ONE tick.
  const r = g.apex.rollout({ dt: 1 / 10, seconds: 0.05, input: { steer: 0, throttle: true } });
  assert.equal(r.ran.ticks, 1, "the single-tick setup drifted — the assertion below needs it");
  assert.deepEqual(stale(before_), [], "rollout() snapshotted only (s, x)");
});

test("aiPlace() anchors the car it moves", async () => {
  await settled();
  const i = g.G.cars.findIndex((c) => !c.isPlayer);
  assert.ok(i >= 0, "the stub grid must field an AI car");
  g.apex.aiPlace(i, 0.7, 60, 2);
  const c = g.G.cars[i];
  const bad = FIELDS.filter((f) => c[anchorOf(f)] !== c[f]);
  assert.deepEqual(bad, [], "a placed car must be drawn AT its new pose, not swung into it");
});

test("act() from the countdown puts the lit-lights counter out too", async () => {
  await g.race("monza");
  g.G.state = "count"; g.G.lightsLit = 5;   // mid-sequence, as the countdown leaves it
  g.apex.act({ throttle: true }, 1 / 60, 1);
  assert.equal(g.G.state, "race");
  assert.equal(g.G.lightsLit, 0,
    "the DOM lights went out but the counter stayed at 5, so the next start "
    + "sequence began with a full gantry already lit");
});

test("rollout() from the countdown puts the lit-lights counter out too", async () => {
  await g.race("monza");
  g.apex.jump(0.2, 40, 0);
  g.G.state = "count"; g.G.lightsLit = 5;
  g.apex.rollout({ dt: 1 / 10, seconds: 0.05, input: { throttle: true } });
  assert.equal(g.G.state, "race");
  assert.equal(g.G.lightsLit, 0, "the DOM lights went out but the counter stayed at 5");
});
