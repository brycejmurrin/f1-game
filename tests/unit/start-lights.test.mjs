// start-lights — the start gantry's five lamps follow the countdown.
//
// js/race/start-lights.js finds the gantry nearest the start line in the
// scenery registry (with none there, the engine's start gate) and, every
// frame of the "count" state, issues one additive ONE-FRAME flare per lit
// lamp (G.lightsLit, one a second in game.js) — so the gantry is equally
// bright at every refresh rate and takes nothing from the particle pool.
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
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/start-lights.js"), "utf8");

function load() {
  const sandbox = { Math };
  vm.createContext(sandbox);
  return vm.runInContext(SRC + ";StartLights", sandbox);   // a top-level const is not a sandbox global
}

// A straight 100-node track running along +z (tangent +z, so "right" is −x
// under the module's rotation; the lamps' lateral order is not asserted).
function track(gantries, startGate) {
  const n = 100, px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) { px[k] = 0; py[k] = 0; pz[k] = k * 4; }
  return { n, px, py, pz, startGate,
    props: { list: gantries.map((g) => Object.assign({ kind: "gantry", side: 0, w: 16, h: 9, d: 1, x: 0, y: 4.5, z: g.k * 4, k: g.k }, g)) } };
}
// The engine's start gate as js/track/tracks.js buildGate records it: the beam's
// centre 15 m before the line (z = -15 on this straight), the direction of
// travel, and how far toward the grid its face stands.
const GATE = { c: [0, 6.2, -15], t: [0, 0, 1], face: 0.65 };
const stub = () => { const calls = []; return { calls, flare: (...a) => calls.push(a) }; };

test("each lit lamp is one additive flare on the start gantry, under the beam, proud of the grid-facing face", () => {
  const P = stub();
  // k = 1, not 0: the fake track is a straight line, so the wrap-around
  // neighbour of node 0 (a real circuit closes the loop) would flip the tangent.
  const G = { state: "count", lightsLit: 3, track: track([{ k: 1 }, { k: 50 }]) };
  load().create(G, { Particles: P }).update();
  assert.equal(P.calls.length, 3, "three lit lamps → three flares");
  const ys = new Set(P.calls.map((c) => c[1].toFixed(3)));
  assert.equal(ys.size, 1, "all lamps hang at one height");
  assert.ok(Math.abs(P.calls[0][1] - (4.5 + 4.5 - 0.62)) < 1e-6, `lamp height ${P.calls[0][1]} is not beam top − 0.62`);
  for (const c of P.calls) {
    assert.ok(c[2] < 4 && c[2] > 3.5, `lamp z ${c[2]} must sit just behind the gantry plane (z = 4), toward the grid (−tangent)`);
    assert.ok(c[4] > 0.9 && c[5] < 0.2 * c[4] && c[6] < 0.2 * c[4], "lamps are red");
    assert.equal(c[8], true, "a race lamp: drawn from the flare budget's lamp reserve");
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
  assert.equal(P.calls.length, 0, "a gantry mid-lap is not the start gantry (and this track has no engine gate either)");
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

test("no gantry at the line: the lamps hang on the engine start gate's beam, which every circuit has", () => {
  // 22 of 52 circuits had no gantry within 3 % of the line until 2026-10-04 and
  // started in the dark: eight dress none, five span the line with an
  // overheadSpan, nine authored theirs where RS() lands it hundreds of metres off.
  const P = stub();
  load().create({ state: "count", lightsLit: 5, track: track([{ k: 50 }], GATE) }, { Particles: P }).update();
  assert.equal(P.calls.length, 5, "all five lamps light on the gate");
  for (const c of P.calls) {
    assert.ok(Math.abs(c[1] - 6.2) < 1e-6, `lamp height ${c[1]} is the gate beam's centre`);
    assert.ok(Math.abs(c[2] - (-15 - 0.65)) < 1e-6, `lamp z ${c[2]} sits proud of the beam's grid-facing face`);
  }
  const xs = P.calls.map((c) => c[0]).sort((a, b) => a - b);
  assert.ok(Math.abs(xs[4] - xs[0] - 3.6) < 1e-6 && Math.abs(xs[2]) < 1e-6, "a 0.9 m pitch, centred on the beam");
  // A gantry at the line still wins over the gate.
  const sl = load().create({ state: "count", lightsLit: 1, track: null }, { Particles: stub() });
  assert.ok(Math.abs(sl.lampsFor(track([{ k: 1 }], GATE))[0][2] - 3.7) < 1e-6, "the scenery gantry at the line is preferred");
});

test("a record that names its lamp row (a startLights span) places the lamps there, and wins a tie", () => {
  // js/track/scenery/models.js overheadSpan({ startLights: true }) registers its
  // deck as a gantry with `lamp` (the deck's centre) and `face` (half its depth
  // and a little): the housing formula would bury the row inside a thick deck.
  const P = stub();
  const span = { k: 1, y: 3, h: 12, lamp: [0, 8.1, 4], face: 0.85, startLights: true };
  const plain = { k: 1, lamp: [0, 6.9, 4], face: 0.3 };   // a gantry() at the same node (Singapore's)
  load().create({ state: "count", lightsLit: 5, track: track([plain, span], GATE) }, { Particles: P }).update();
  assert.equal(P.calls.length, 5);
  for (const c of P.calls) {
    assert.ok(Math.abs(c[1] - 8.1) < 1e-6, `lamp height ${c[1]} is the span's named row`);
    assert.ok(Math.abs(c[2] - (4 - 0.85)) < 1e-6, `lamp z ${c[2]} stands \`face\` toward the grid`);
  }
});

test("game.js wires StartLights and the particle pool exposes the lamp flare", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /let startLights = StartLights\.create\(G\)/);
  assert.match(game, /startLights\.update\(\);[^\n]*\n(?:\s*marshalPanels\.update\(dt\);[^\n]*\n)?\s*Particles\.update\(dt\);\s*\n\s*Particles\.draw\(\);/, "lamps are issued before this frame's draw (the posts' panels may sit between)");
  const particles = fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8");
  assert.match(particles, /function flare\(x, y, z, size, r, g, b, alpha, lamp\)/);
  assert.match(particles, /return \{[^}]*\bflare\b/);
  assert.doesNotMatch(particles, /function glow\(/, "the pooled per-frame lamp is gone: it stacked with the refresh rate");
});

// The REAL pool and the real lamps in one VM, driven the way game.js's render
// loop does (lamps, Particles.update, Particles.draw), at three refresh rates.
// Brightness = Σ alpha × red over the additive quads of a drawn frame — what
// the viewer sees on that frame. The pooled glow it replaces summed 1.14 / 2.84
// / 7.14 lamp-copies at 30 / 60 / 144 Hz.
function runAt(hz, seconds, mobile = false) {
  const ctx = vm.createContext({ Math, Float32Array, Uint8Array, Array, Object });
  seedLog(ctx);
  const P = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8") + ";Particles", ctx);
  let frameB = 0;
  P.init({ mobileTier: mobile, drawParticles: (data, floats, additive) => {
    if (!additive) return;
    for (let o = 0; o < floats; o += 60) frameB += data[o + 9] * data[o + 5];   // alpha × red, one quad
  } });
  const SL = vm.runInContext(SRC + ";StartLights", ctx);
  const G = { state: "count", lightsLit: 5, track: track([{ k: 1 }]) };
  const sl = SL.create(G, { Particles: P });
  const dt = 1 / hz, frames = Math.round(seconds * hz);
  let sum = 0, maxPool = 0, maxFl = 0;
  for (let f = 0; f < frames; f++) {
    sl.update();
    maxFl = Math.max(maxFl, P.flareCount());
    P.update(dt);
    maxPool = Math.max(maxPool, P.count());
    frameB = 0;
    P.draw();
    sum += frameB;
  }
  return { mean: sum / frames, maxPool, maxFl };
}

test("the lit gantry is equally bright at 30, 60 and 144 Hz and takes nothing from the pool", () => {
  const r = { 30: runAt(30, 1), 60: runAt(60, 1), 144: runAt(144, 1) };
  for (const hz of [30, 144]) {
    const k = r[hz].mean / r[60].mean;
    assert.ok(Math.abs(k - 1) <= 0.05, `${hz} Hz frame brightness is ${k.toFixed(3)}× the 60 Hz one (the pooled glow gave ${hz === 30 ? "0.40" : "2.51"}×)`);
  }
  for (const hz of [30, 60, 144]) {
    assert.equal(r[hz].maxPool, 0, `${hz} Hz: the lamps never occupy a pool slot`);
    assert.equal(r[hz].maxFl, 5, `${hz} Hz: exactly one flare per lit lamp per frame`);
  }
  // The 60 Hz look is the one the pooled glow had there (GAIN): five lamps ×
  // 2.84 copies × alpha 0.95 × red 1.0 ≈ 13.5.
  assert.ok(Math.abs(r[60].mean - 5 * 2.84 * 0.95) < 0.05, `60 Hz brightness ${r[60].mean}`);
  // The mobile tier's flare budget still holds every lamp.
  assert.equal(runAt(60, 0.2, true).maxFl, 5);
});

test("a lookup before the props list exists is not memoised: the lamps appear once the build fills it", () => {
  const sl = load().create({ state: "count", lightsLit: 5, track: null }, { Particles: stub() });
  const t = track([{ k: 1 }]);
  const list = t.props.list;
  t.props = null;   // the circuit's scenery has not populated yet
  assert.equal(sl.lampsFor(t), null, "nothing to hang the lamps on yet");
  t.props = { list };
  const lamps = sl.lampsFor(t);
  assert.ok(lamps && lamps.length === 5, "the same track object lights up after the build");
  // A genuine miss (list present, no gantry, no gate) IS remembered.
  const bare = track([]);
  assert.equal(sl.lampsFor(bare), null);
  bare.props.list.push({ kind: "gantry", side: 0, w: 16, h: 9, d: 1, x: 0, y: 4.5, z: 4, k: 1 });
  assert.equal(sl.lampsFor(bare), null, "a searched, empty list stays a memoised miss");
});
