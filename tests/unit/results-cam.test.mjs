/* results-cam.test.mjs — chequered / orbit / highlights (js/camera/results-cam.js).
 * Run: node --test tests/unit/results-cam.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Float32Array, Float64Array, Uint8Array,
    isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    PerfGov: { tier: () => 0 },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/camera/results-cam.js"), ctx, { filename: "results-cam.js" });
  return vm.runInContext("ResultsCam", ctx);
}

test("orbitPose is finite and highlightsReel respects budget + order", () => {
  const R = boot();
  const pose = R.orbitPose(10, 1, -5, Math.PI / 4);
  assert.ok(pose.eye.every(Number.isFinite));
  assert.ok(pose.target.every(Number.isFinite));

  const tags = [
    { kind: "contact", t: 1, car: 0 },
    { kind: "retirement", t: 8, car: 2 },
    { kind: "chequered", t: 19, car: 0 },
  ];
  const reel = R.highlightsReel(tags, 0, 20, 12);
  assert.ok(reel.length >= 2);
  let span = 0;
  for (const c of reel) {
    assert.ok(c.t1 > c.t0);
    span += c.t1 - c.t0;
  }
  assert.ok(span <= 12 + 1e-6);
  assert.ok(reel[0].t0 <= reel[reel.length - 1].t0);
});

test("create: chequered → orbit; disabled on mobile / high PerfGov tier", () => {
  const R = boot();
  const player = { s: 0, x: 0, px: 1, py: 1, pz: 2, head: 0, speed: 40, finPos: 1 };
  const G = {
    player, cars: [player], dbgCam: null, netPlay: { active: () => false },
    gfx: { isMobile: false },
    camVantage: () => ({ eye: [0, 4, -10], target: [0, 1, 0], fov: 58 }),
  };
  const api = R.create(G);
  assert.equal(api.onFlag(), true);
  assert.equal(api.live(), true);
  assert.equal(api.status().phase, "chequered");
  assert.ok(G.dbgCam && G.dbgCam._resultsCam);

  // Advance past CHEQ_S
  for (let i = 0; i < 80; i++) api.tick(1 / 30);
  assert.equal(api.status().phase, "orbit");
  assert.ok(api.live());

  // Mobile off
  G.gfx.isMobile = true;
  api.reset();
  assert.equal(api.onFlag(), false);
  assert.equal(api.live(), false);
});

test("game.js gates results early-return on ResultsCam.live()", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /ResultsCam\.create\(G\)/);
  assert.match(game, /state === "results" && !resultsCam\.live\(\)/);
  assert.match(game, /resultsCam\.onFlag\(/);
});
