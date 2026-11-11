/* parc-ferme.test.mjs — parc fermé beat (js/race/parc-ferme.js, #4069 slice 3).
 * Park subject / anchor, orbit vs frozen path, timer + SKIP, host caption.
 * Run: node --test tests/unit/parc-ferme.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot(perfTier = 0) {
  const sb = {
    Math, console, Object, Array, Number, String, JSON,
    isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    PerfGov: { tier: () => perfTier },
    document: undefined,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/camera/results-cam.js"), ctx, { filename: absSrc("js/camera/results-cam.js") });
  vm.runInContext(src("js/race/parc-ferme.js"), ctx, { filename: absSrc("js/race/parc-ferme.js") });
  return vm.runInContext("ParcFerme", ctx);
}

function car(extra = {}) {
  return {
    s: 100, x: 0, px: 10, py: 1, pz: -4, head: 0, speed: 0,
    finPos: 1, retired: false, human: true, isPlayer: true,
    ...extra,
  };
}

test("parkPose is finite; pitSubject prefers player then P1", () => {
  const PF = boot();
  const pose = PF.parkPose(2, 1, -3, Math.PI / 3);
  assert.ok(pose.eye.every(Number.isFinite));
  assert.ok(pose.target.every(Number.isFinite));
  assert.ok(pose.fov > 0);

  const player = car({ finPos: 5 });
  const p1 = car({ finPos: 1, px: 0, human: false, isPlayer: false });
  const G = { player, cars: [player, p1] };
  assert.equal(PF.pitSubject(G), player);
  assert.equal(PF.pitSubject({ cars: [p1], player: null }), p1);
  assert.equal(PF.pitSubject(G, p1), p1, "explicit hint wins");
});

test("frozenPath: mobile and PerfGov tier >= 2", () => {
  const PF0 = boot(0);
  assert.equal(PF0.frozenPath({ gfx: { isMobile: false } }), false);
  assert.equal(PF0.frozenPath({ gfx: { isMobile: true } }), true);
  const PF2 = boot(2);
  assert.equal(PF2.frozenPath({ gfx: { isMobile: false } }), true);
});

test("create: start → live orbit → timer ends; SKIP ends early", () => {
  const PF = boot();
  const player = car();
  const G = { player, cars: [player], dbgCam: null, gfx: { isMobile: false }, track: null };
  const api = PF.create(G);
  assert.equal(api.start(), true);
  assert.equal(api.live(), true);
  assert.equal(api.status().phase, "parcFerme");
  assert.equal(api.status().frozen, false);
  assert.ok(G.dbgCam && G.dbgCam._parcFerme);
  assert.ok(G.dbgCam.eye.every(Number.isFinite));

  const eye0 = G.dbgCam.eye.slice();
  for (let i = 0; i < 40; i++) api.tick(1 / 30);
  assert.equal(api.live(), true);
  assert.ok(api.status().age > 1);
  // Orbit moved the eye (not a frozen still).
  assert.ok(
    Math.hypot(G.dbgCam.eye[0] - eye0[0], G.dbgCam.eye[2] - eye0[2]) > 0.01,
    "live path orbits the park anchor",
  );

  // Fresh beat: SKIP
  api.reset();
  G.dbgCam = null;
  api.start();
  assert.equal(api.skip(), true);
  assert.equal(api.live(), false);
  assert.equal(api.status().phase, "done");
  assert.equal(G.dbgCam, null, "live path clears parc cam on skip");
});

test("create: timer reaches PARC_S; frozen path keeps a static pose", () => {
  const PF = boot(2);
  const player = car();
  const G = { player, cars: [player], dbgCam: null, gfx: { isMobile: false }, track: null };
  const api = PF.create(G);
  api.start();
  assert.equal(api.status().frozen, true);
  const eye0 = G.dbgCam.eye.slice();
  for (let i = 0; i < 20; i++) api.tick(1 / 30);
  assert.deepEqual(G.dbgCam.eye, eye0, "frozen path does not orbit");

  // Drive past PARC_S
  for (let i = 0; i < 300; i++) api.tick(1 / 30);
  assert.equal(api.live(), false);
  assert.equal(api.status().phase, "done");
  // Frozen end keeps the still for the next beat.
  assert.ok(G.dbgCam && G.dbgCam._parcFerme);
});

test("parkAnchor falls back to car world pose without a track", () => {
  const PF = boot();
  const c = car({ px: 7, py: 2, pz: 9 });
  const a = PF.parkAnchor({ track: null }, c);
  // Field asserts: the returned object is minted inside the VM (cross-realm).
  assert.equal(a.x, 7);
  assert.equal(a.y, 2);
  assert.equal(a.z, 9);
  assert.equal(a.car, c);
});
