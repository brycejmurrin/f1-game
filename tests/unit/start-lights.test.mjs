// start-lights — the start gantry's five lamps follow the countdown.
//
// js/race/start-lights.js finds the gantry nearest the start line in the
// scenery registry and, every frame of the "count" state, re-spawns one
// additive glow particle per lit lamp (G.lightsLit, one a second in game.js).
// Until 2026-10-01 the gantry was three static grey boxes the countdown never
// touched (the second graphics-detail survey, item 5). Run in a VM with
// Particles stubbed; no browser.
//
// Run: node --test tests/unit/start-lights.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/start-lights.js"), "utf8");

function load() {
  const sandbox = { Math };
  vm.createContext(sandbox);
  return vm.runInContext(SRC + ";StartLights", sandbox);   // a top-level const is not a sandbox global
}

// A straight 100-node track running along +z (tangent +z, so "right" is −x
// under the module's rotation; the lamps' lateral order is not asserted).
function track(gantries) {
  const n = 100, px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) { px[k] = 0; py[k] = 0; pz[k] = k * 4; }
  return { n, px, py, pz, props: { list: gantries.map((g) => ({ kind: "gantry", side: 0, w: 16, h: 9, d: 1, x: 0, y: 4.5, z: g.k * 4, k: g.k })) } };
}
const stub = () => { const calls = []; return { calls, glow: (...a) => calls.push(a) }; };

test("each lit lamp is one additive glow on the start gantry, under the beam, proud of the grid-facing face", () => {
  const P = stub();
  // k = 1, not 0: the fake track is a straight line, so the wrap-around
  // neighbour of node 0 (a real circuit closes the loop) would flip the tangent.
  const G = { state: "count", lightsLit: 3, track: track([{ k: 1 }, { k: 50 }]) };
  load().create(G, { Particles: P }).update();
  assert.equal(P.calls.length, 3, "three lit lamps → three glows");
  const ys = new Set(P.calls.map((c) => c[1].toFixed(3)));
  assert.equal(ys.size, 1, "all lamps hang at one height");
  assert.ok(Math.abs(P.calls[0][1] - (4.5 + 4.5 - 0.62)) < 1e-6, `lamp height ${P.calls[0][1]} is not beam top − 0.62`);
  for (const c of P.calls) {
    assert.ok(c[2] < 4 && c[2] > 3.5, `lamp z ${c[2]} must sit just behind the gantry plane (z = 4), toward the grid (−tangent)`);
    assert.ok(c[4] > 0.9 && c[5] < 0.2 && c[6] < 0.2, "lamps are red");
    assert.ok(c[8] > 0.016 && c[8] < 0.25, `life ${c[8]} must outlive one frame and die before the next spawn stacks`);
  }
  const xs = P.calls.map((c) => c[0]).sort((a, b) => a - b);
  assert.ok(Math.abs((xs[1] - xs[0]) - 0.9) < 1e-6, "lamps sit on a 0.9 m pitch across the beam");
  assert.ok(P.calls.every((c) => Math.abs(c[2] - 3.7) < 1e-6), "the k=1 gantry was chosen, not the one mid-lap");
});

test("all five on, none outside the count, none without a start gantry", () => {
  const SL = load();
  let P = stub();
  SL.create({ state: "count", lightsLit: 5, track: track([{ k: 99 }]) }, { Particles: P }).update();
  assert.equal(P.calls.length, 5, "a gantry one node BEFORE the line (k = n−1) is the start gantry too");
  P = stub();
  SL.create({ state: "race", lightsLit: 5, track: track([{ k: 0 }]) }, { Particles: P }).update();
  assert.equal(P.calls.length, 0, "green: the lamps are out");
  P = stub();
  SL.create({ state: "count", lightsLit: 0, track: track([{ k: 0 }]) }, { Particles: P }).update();
  assert.equal(P.calls.length, 0, "before the first lamp nothing glows");
  P = stub();
  SL.create({ state: "count", lightsLit: 4, track: track([{ k: 50 }]) }, { Particles: P }).update();
  assert.equal(P.calls.length, 0, "a gantry mid-lap is not the start gantry");
  P = stub();
  assert.doesNotThrow(() => SL.create({ state: "count", lightsLit: 4, track: null }, { Particles: P }).update());
  assert.doesNotThrow(() => SL.create({ state: "count", lightsLit: 4, track: { n: 100 } }, { Particles: P }).update());
  assert.equal(P.calls.length, 0);
});

test("lamp positions are memoised per track and recomputed on a new one", () => {
  const SL = load();
  const t1 = track([{ k: 0 }]), t2 = track([{ k: 1 }]);
  const sl = SL.create({ state: "count", lightsLit: 1, track: t1 }, { Particles: stub() });
  assert.equal(sl.lampsFor(t1), sl.lampsFor(t1), "same track → same array");
  assert.notEqual(sl.lampsFor(t2), sl.lampsFor(t1));
  assert.ok(Math.abs(sl.lampsFor(t2)[0][2] - (4 - 0.3)) < 1e-6, "the new track's gantry node moved the lamps");
});

test("game.js wires StartLights and the particle pool exposes glow", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /const startLights = StartLights\.create\(G\)/);
  assert.match(game, /startLights\.update\(\);[^\n]*\n\s*Particles\.update\(dt\);/, "lamps spawn before the pool ages this frame");
  const particles = fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8");
  assert.match(particles, /function glow\(x, y, z, size, r, g, b, alpha, life\)/);
  assert.match(particles, /return \{[^}]*\bglow\b/);
});
