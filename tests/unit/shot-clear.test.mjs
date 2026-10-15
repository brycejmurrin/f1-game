/* SHOT CLEAR (js/agent/shot-clear.js): the agent's free cameras (__apex.orbit /
 * cinematic / view, and tools/shot/shot.mjs on top of them) step round a hill,
 * building or tree between the eye and the car.
 *  - blocker() finds terrain above the sight line and prop boxes across it,
 *    ignores the last metres before the subject, a box that holds the subject
 *    itself, sparse assembly hulls and mountain envelopes;
 *  - frameBlocker() also fails a frame whose middle a FOREGROUND prop fills
 *    (the car may still show), never for ground at the frame's lower edge;
 *  - orbit()/side() keep the asked-for placement when it is clear, otherwise
 *    the nearest clear one (and name what blocked the asked-for view);
 *  - shot.mjs clears by default; --through opts out.
 *
 * Run: node --test tests/unit/shot-clear.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parseShotArgv, normalizeJob } from "../../tools/shot/shot-jobs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
function load(terrainY = () => 0) {
  const ctx = vm.createContext({ Math, Infinity, Tracks: { terrainY: (_t, x, z) => terrainY(x, z) } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/agent/shot-clear.js"), "utf8") + "\nthis.ShotClear = ShotClear;", ctx);
  return ctx.ShotClear;
}
const box = (kind, x, y, z, w, h, d, extra) => Object.assign({ kind, x, y, z, w, h, d }, extra);
const track = (props) => ({ props: { list: props } });
const CAR = [0, 1.5, 0];

test("a building across the sight line blocks it; one beside it does not", () => {
  const S = load();
  const eye = [0, 5, 40];
  const hit = S.blocker(track([box("building", 0, 6, 20, 10, 12, 6)]), eye, CAR);
  assert.equal(hit && hit.kind, "building");
  assert.ok(hit.atM > 15 && hit.atM < 20, `entered ~17 m from the eye, got ${hit && hit.atM}`);
  assert.equal(S.blocker(track([box("building", 30, 6, 20, 10, 12, 6)]), eye, CAR), null);
});

test("terrain above the line blocks; the subject's own surroundings never do", () => {
  const hill = load((x, z) => (z > 15 && z < 25 ? 8 : 0));
  assert.equal(hill.blocker(track([]), [0, 3, 40], CAR).kind, "terrain");
  assert.equal(hill.blocker(track([]), [0, 30, 40], CAR), null, "an eye high enough sees over it");
  const S = load();
  assert.equal(S.blocker(track([box("barrier", 0, 1, 2, 4, 2, 1)]), [0, 5, 40], CAR), null, "inside the last 4 m");
  assert.equal(S.blocker(track([box("gantry", 0, 4, 0, 20, 8, 2)]), [0, 5, 40], CAR), null, "a box holding the car");
  assert.equal(S.blocker(track([box("structure", 0, 6, 20, 30, 12, 30, { fill: 0.02 })]), [0, 5, 40], CAR), null, "sparse hull");
  assert.equal(S.blocker(track([box("mountain", 0, 50, 20, 400, 100, 400)]), [0, 5, 40], CAR), null, "mountain envelope");
});

test("the scenery graph counts too: a scaled instanced model and a baked mesh", () => {
  const S = load();
  const eye = [0, 5, 40];
  // A crowd riser: a 1 m model-space box stretched 30 m along t (+x here), across the sight line at z 20.
  const graph = {
    models: new Map([["crowd-riser|0.2", { aabb: { mn: [-1, 0, -0.5], mx: [1, 6, 0.5] } }]]),
    nodes: [{ model: "crowd-riser|0.2", o: [0, 0, 20], r: [0, 0, 1], u: [0, 1, 0], t: [1, 0, 0], s: [1, 1, 30], meta: { kind: "crowdRiser" } }],
    meshes: new Map(),
  };
  assert.equal(S.blocker({ graph }, eye, CAR).kind, "crowdRiser");
  graph.nodes[0].o = [40, 0, 20];   // 40 m to the side: its 15 m half-length no longer reaches the line
  assert.equal(S.blocker({ graph }, eye, CAR), null);
  const baked = { meshes: new Map([["kenney_tower", { key: "kenney_tower", geo: { pos: [-2, 0, -2, 2, 30, 2] },
    places: [{ x: 0, y: 0, z: 25, yaw: 1, s: 1 }] }]]) };
  assert.equal(S.blocker({ graph: baked }, eye, CAR).kind, "kenney_tower");
});

test("orbit keeps a clear placement, else lifts or swings to the nearest clear one", () => {
  const S = load();
  // eye on +z at az 0: place() puts azimuth 0 at +z, 90 at +x.
  const place = (az, el, d) => {
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    return [Math.sin(a) * Math.cos(e) * d, CAR[1] + Math.sin(e) * d, Math.cos(a) * Math.cos(e) * d];
  };
  const open = S.orbit(track([]), place, CAR, 0, 10, 40);
  assert.equal(open.moved, false); assert.equal(open.blocked, null);
  const wall = track([box("building", 0, 10, 20, 12, 20, 4)]);
  const r = S.orbit(wall, place, CAR, 0, 10, 40);
  assert.ok(r && r.moved, "moved off the blocked view");
  assert.equal(r.blocked.kind, "building", "and says what stood there");
  assert.equal(S.blocker(wall, r.eye, CAR), null, "the chosen eye is clear");
  // Nearest first: a 25° swing still leaves the wall across the middle of the
  // frame, so 50° — never a 180° turn when a smaller move works.
  assert.ok(Math.abs(r.az) <= 50 && r.el <= 22, JSON.stringify(r));
  assert.equal(S.orbit(track([box("dome", 0, 0, 0, 400, 400, 400)]), place, CAR, 0, 10, 40).moved, false,
    "a box holding the car is the subject, so the asked-for view stands");
});

test("a building filling the middle of the frame moves the eye even when the car shows", () => {
  const S = load();
  const eye = [0, 5, 40];
  // 6 m left of the sight line, 10 m from the eye: the car is visible, the shot is a wall.
  const near = track([box("building", -6, 6, 30, 6, 12, 4)]);
  assert.equal(S.blocker(near, eye, CAR), null, "the centre line reaches the car");
  const hit = S.frameBlocker(near, eye, CAR, 55);
  assert.ok(hit && hit.frame && hit.kind === "building", JSON.stringify(hit));
  // The same building out past the car's distance is background, not a blocker.
  const far = track([box("building", -6, 6, -30, 6, 12, 4)]);
  assert.equal(S.frameBlocker(far, eye, CAR, 55), null);
  // Ground at the lower edge of the frame never counts: only the centre line tests terrain.
  assert.equal(load(() => 1.4).frameBlocker(track([]), eye, CAR, 55), null);
});

test("side keeps the roadside eye, else goes higher, closer, then across the road", () => {
  const S = load();
  const place = (sd, d, h) => [sd * d, h, 0];
  const tree = track([box("pine", 10, 4, 0, 4, 8, 4)]);
  const r = S.side(tree, place, CAR, 1, 14, 3);
  assert.ok(r && r.moved && r.side === 1 && r.height > 3, JSON.stringify(r));
  assert.equal(S.blocker(tree, r.eye, CAR), null);
  assert.equal(S.side(track([]), place, CAR, 1, 14, 3).moved, false);
});

test("shot.mjs clears by default; --through keeps the asked-for placement", () => {
  const one = parseShotArgv(["spa", "0.2", "orbit"], ROOT).jobs[0];
  assert.equal(one.through, false);
  const thru = parseShotArgv(["spa", "0.2", "orbit", "--through", "out.png"], ROOT).jobs[0];
  assert.equal(thru.through, true);
  assert.match(thru.out, /out\.png$/, "--through takes no value, so the out path survives");
  assert.equal(normalizeJob({ trackId: "spa", through: true }, { ROOT }).through, true);
  const shot = fs.readFileSync(path.join(ROOT, "tools/shot/shot.mjs"), "utf8");
  assert.match(shot, /a\.orbit\(frac, az, el, dist, 1\.5, \{ clear \}\)/);
  assert.match(shot, /a\.cinematic\(frac, \{ dist, el, clear \}\)/);
  assert.match(shot, /look: "in", clear \}/);
});
