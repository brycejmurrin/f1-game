// marshal-panels — the posts' light panels show what race control is showing.
//
// js/race/marshal-panels.js issues one additive one-frame flare per lit panel
// each race frame: a waved yellow at the posts of the sector under a local yellow, a
// steady yellow everywhere under VSC / safety car, a waved red under a red
// flag, a green everywhere for GREEN_S after a caution clears, dark otherwise;
// capped to the nearest NEAREST_N posts to the eye. Until 2026-10-01 the post
// flags were coloured at build by a hash (the second graphics-detail survey,
// item 4). VM with Particles and race control stubbed; no browser.
//
// Run: node --test tests/unit/marshal-panels.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/marshal-panels.js"), "utf8");
const load = () => { const sb = { Math }; vm.createContext(sb); return vm.runInContext(SRC + ";MarshalPanels", sb); };
const MP_load = load;

// 90 nodes, a post every 10 nodes (9 posts: three per third), authored splits at 0.3 / 0.6.
function track(splits) {
  const n = 90, list = [];
  for (let k = 0; k < n; k += 10) list.push({ kind: "marshalPost", k, side: 1, x: k, y: 1.2, z: 0, w: 1.2, h: 2.4, d: 1.2 });
  list.push({ kind: "gantry", k: 0, side: 0, x: 0, y: 4, z: 0, w: 16, h: 9, d: 1 });
  return { n, props: { list }, def: splits ? { sectors: splits } : {} };
}
const stub = () => { const calls = []; return { calls, flare: (...a) => calls.push(a) }; };
const G = (level, sector, over = {}) => ({
  state: "race", frame: { eye: [0, 2, 0] }, track: track(over.splits),
  cautionLevel: () => level, cautionInfo: () => ({ level, sector }), ...over,
});

test("a local yellow lights only its sector's posts, waved; the sector follows the authored splits", () => {
  const MP = load();
  let P = stub();
  let mp = MP.create(G(1, 1, { splits: [0.3, 0.6] }), { Particles: P });
  mp.update(0.1);   // t = 0.1 → sin(0.4π) > 0 → bright phase
  assert.equal(P.calls.length, 3, "sector 1 holds the posts at k = 30, 40, 50 under splits 0.3/0.6");
  assert.deepEqual(P.calls.map((c) => c[0]).sort((a, b) => a - b), [30, 40, 50]);
  for (const c of P.calls) {
    assert.ok(c[4] > 0.9 && c[5] > 0.6 && c[6] < 0.2, "yellow");
    assert.ok(Math.abs(c[1] - (1.2 + 1.2 + 0.45)) < 1e-6, "the panel sits above the hut's roof");
  }
  const bright = P.calls[0][7];
  mp.update(0.25);  // t = 0.35 → sin(1.4π) < 0 → dim phase
  const dim = P.calls[P.calls.length - 1][7];
  assert.ok(dim < bright * 0.5, `a local yellow is waved: ${dim} vs ${bright}`);
  // Thirds when the circuit authors no splits: sector 1 is k = 30..50 too, but 0 is k < 30.
  P = stub();
  MP.create(G(1, 0), { Particles: P }).update(0.1);
  assert.deepEqual(P.calls.map((c) => c[0]).sort((a, b) => a - b), [0, 10, 20]);
});

test("VSC and the safety car light every post steady yellow; a red flag waves red; green is dark", () => {
  const MP = load();
  for (const lvl of [2, 3]) {
    const P = stub();
    const mp = MP.create(G(lvl, -1), { Particles: P });
    mp.update(0.1); mp.update(0.25);
    assert.equal(P.calls.length, 18, `level ${lvl}: all nine posts on both frames`);
    assert.ok(P.calls.every((c) => c[7] === P.calls[0][7]), "steady, not waved");
  }
  const P = stub();
  MP.create(G(4, -1), { Particles: P }).update(0.1);
  assert.equal(P.calls.length, 9);
  assert.ok(P.calls.every((c) => c[4] > 0.9 && c[5] < 0.2), "red");
  const Q = stub();
  MP.create(G(0, -1), { Particles: Q }).update(0.1);
  assert.equal(Q.calls.length, 0, "green with no history: dark panels");
});

test("when a caution clears every post shows green for a few seconds, then goes dark", () => {
  const MP = load();
  let level = 2;
  const P = stub();
  const g = G(2, -1); g.cautionLevel = () => level;
  const mp = MP.create(g, { Particles: P });
  mp.update(0.1);
  level = 0;
  mp.update(0.1);
  const green = P.calls.slice(9);
  assert.equal(green.length, 9, "the frame after the clear lights every post");
  assert.ok(green.every((c) => c[5] > 0.9 && c[4] < 0.3), "green");
  for (let i = 0; i < 50; i++) mp.update(0.1);   // 5 s > GREEN_S
  const n = P.calls.length;
  mp.update(0.1);
  assert.equal(P.calls.length, n, "dark again once the green has run");
});

test("only the nearest posts to the eye light under a full-course caution, and nothing outside the race", () => {
  const MP = load();
  const g = G(3, -1); g.track.props.list = [];
  for (let k = 0; k < 90; k += 2) g.track.props.list.push({ kind: "marshalPost", k, side: 1, x: k, y: 1.2, z: 0, w: 1.2, h: 2.4, d: 1.2 });
  g.frame.eye = [60, 2, 0];
  let P = stub();
  MP.create(g, { Particles: P }).update(0.1);
  assert.equal(P.calls.length, 16, "45 posts, 16 lit");
  assert.ok(P.calls.every((c) => Math.abs(c[0] - 60) <= 16), "the lit ones are the nearest to the eye");
  P = stub();
  const menu = G(3, -1); menu.state = "menu";
  MP.create(menu, { Particles: P }).update(0.1);
  assert.equal(P.calls.length, 0, "no panels outside the race");
  assert.doesNotThrow(() => MP.create({ state: "race", track: null, cautionLevel: () => 3 }, { Particles: stub() }).update(0.1));
});

// The post itself, built by the real js/track/scenery/structures.js marshalPost
// over a straight stub road (the post at +x of a road running along +z), so
// the board it carries and the point this module lights can be checked
// against each other. Until 2026-10-04 the post also waved a cloth flag
// coloured by hash(k) — yellow on ~72 % of posts, blue on the rest — beside
// panels that read dark under green: a standing yellow all race long.
function buildPosts(ks) {
  const sb = { Math, Map, Set, Object, Array, JSON, Number, Float32Array, Float64Array };
  vm.createContext(sb);
  seedLog(sb);
  for (const f of ["js/core/mat4.js", "js/track/core/geom.js", "js/track/scenery/data.js", "js/track/scenery/structures.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), sb, { filename: f });
  const TG = sb.TrackGeom, n = 100;
  const out = { pos: [], nrm: [], col: [], idx: [], mat: [] }, notes = [];
  const hw = new Float32Array(n).fill(6), px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) pz[k] = k * 4;
  const S = sb.SceneryStructures.create({
    out, track: {}, def: { id: "stub" }, n, ds: 4, hw, px, py, pz, NIGHT: false, MAT: TG.MAT,
    addBox: TG.addBox, addCyl: TG.addCyl, addFrustum: TG.addFrustum, addPrism: TG.addPrism, RAW: TG,
    blockAt() {}, post() {}, recordBarrier() {}, indexBarrier() {},
    groundYAt: () => 0, terrainYAt: () => 0, onTrack: () => false, overheadSpan: () => true, rejBox: () => false,
    // Every value either side of the old 0.72 yellow/blue cut.
    hash: (k) => ((k * 0.137) % 1),
    cross: TG.cross, norm: TG.norm, vadd: TG.vadd,
    anchor: (k, side, gap) => ({ c: [side * (6 + gap), 0, k * 4], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1] }),
    kitOf: (key, def) => def, noteSuppressed() {}, instance() {},
    note: (kind, c, size, extra) => notes.push(Object.assign({ kind, x: c[0], y: c[1], z: c[2], w: size[0], h: size[1], d: size[2] }, extra)),
  });
  for (const k of ks) S.marshalPost(k, 1, 4);
  return { out, notes, MAT: TG.MAT };
}

test("a marshal post carries a dark, still panel — no waving flag in a hash colour — and its glow lights that panel", () => {
  const ks = [0, 3, 5, 6, 7, 9, 11, 13];
  const { out, notes, MAT } = buildPosts(ks);
  assert.equal(notes.length, ks.length, "every post is registered");
  assert.ok(out.mat.length > 0, "the posts emit their panel into the props buffer");
  const waving = out.mat.filter((m) => m >= MAT.FLAG - 0.5 && m < MAT.FLAG + 0.5).length;
  assert.equal(waving, 0, "no cloth flag waves on a post (MAT.FLAG vertices)");
  for (let i = 0; i < out.col.length; i += 3) {
    const c = [out.col[i], out.col[i + 1], out.col[i + 2]];
    assert.ok(Math.max(...c) < 0.15, `post geometry colour ${c} is not an unlit panel — under green nothing on a post is lit`);
  }
  // The registry names the panel, and the panel module lights exactly there.
  const P = stub();
  const g = G(3, -1); g.track.props.list = notes; g.frame.eye = [10, 3, 0];
  MP_load().create(g, { Particles: P }).update(0.1);
  assert.equal(P.calls.length, ks.length, "every post's panel lights under the safety car");
  for (const [i, nrec] of notes.entries()) {
    const p = nrec.panel;
    assert.ok(Array.isArray(p) && p.length === 3, "the post's record carries its panel point");
    // The board: off the pole 1.12 m behind the hut (against the back face;
    // x = 10 + 1.12), 3.3-3.92 m up, 1.05 m along +z. Panel point is 0.12 m
    // trackward of the board.
    assert.ok(Math.abs(p[1] - 3.61) < 1e-6 && Math.abs(p[2] - (ks[i] * 4 + 0.525)) < 1e-6, `panel ${p} is the board's centre`);
    assert.ok(p[0] < 11.05 && p[0] > 10.95, `panel x ${p[0]} sits just proud of the board on the track side`);
    const c = P.calls.find((call) => Math.abs(call[2] - p[2]) < 1e-9);
    assert.ok(c && c[0] === p[0] && c[1] === p[1], "the glow is on the board, not above the hut");
  }
});

test("game.js wires MarshalPanels after the gantry lamps", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /let marshalPanels = MarshalPanels\.create\(G\)/);
  assert.match(game, /startLights\.update\(\);[^\n]*\n\s*marshalPanels\.update\(dt\);[^\n]*\n\s*Particles\.update\(dt\);/);
});

// The REAL pool and the real panels in one VM, driven the way game.js's render
// loop does (panels, Particles.update, Particles.draw). Brightness = Σ alpha ×
// green over the additive quads of a drawn frame. The pooled glow (life 0.05 s)
// summed 0.38 / 1.14 / 3.5 copies a panel at 30 / 60 / 144 Hz, and at 120 Hz
// sixteen panels held 96 slots: the whole mobile pool.
function runAt(hz, seconds, { mobile = false, brakeFlares = 0 } = {}) {
  const ctx = vm.createContext({ Math, Float32Array, Uint8Array, Array, Object });
  seedLog(ctx);
  const P = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/fx/particles.js"), "utf8") + ";Particles", ctx);
  let frameB = 0, frameQ = 0;
  P.init({ mobileTier: mobile, drawParticles: (data, floats, additive) => {
    if (!additive) return;
    for (let o = 0; o < floats; o += 60) { frameB += data[o + 9] * data[o + 6]; frameQ++; }   // alpha × green (blue is ~0 on a far flare)
  } });
  const g = G(3, -1); g.track.props.list = [];
  for (let k = 0; k < 90; k += 2) g.track.props.list.push({ kind: "marshalPost", k, side: 1, x: k, y: 1.2, z: 0, w: 1.2, h: 2.4, d: 1.2 });
  const mp = MP_load().create(g, { Particles: P });
  const dt = 1 / hz, frames = Math.round(seconds * hz);
  let sum = 0, maxPool = 0, minQ = Infinity;
  for (let f = 0; f < frames; f++) {
    // The cars' far brake flares are drawn BEFORE the race lamps each frame (car-draw.js).
    for (let i = 0; i < brakeFlares; i++) P.flare(500, 1, i, 0.2, 2.4, 0.85, 0.22, 0.9);
    mp.update(dt);
    P.update(dt);
    maxPool = Math.max(maxPool, P.count());
    frameB = 0; frameQ = 0;
    P.draw();
    sum += frameB; minQ = Math.min(minQ, frameQ);
  }
  return { mean: sum / frames, maxPool, minQ };
}

test("a steady caution is equally bright at 30, 60 and 144 Hz, uses no pool slot, and the cars' flares cannot starve it", () => {
  const r = { 30: runAt(30, 1), 60: runAt(60, 1), 144: runAt(144, 1) };
  for (const hz of [30, 144]) {
    const k = r[hz].mean / r[60].mean;
    assert.ok(Math.abs(k - 1) <= 0.05, `${hz} Hz frame brightness is ${k.toFixed(3)}× the 60 Hz one (the pooled glow gave ${hz === 30 ? "0.33" : "3.1"}×)`);
  }
  for (const hz of [30, 60, 144]) assert.equal(r[hz].maxPool, 0, `${hz} Hz: the panels never occupy a pool slot`);
  // 16 yellow panels × alpha 0.9 × green 0.78 × GAIN 1.14 — the pooled glow's 60 Hz look.
  assert.ok(Math.abs(r[60].mean - 16 * 0.9 * 0.78 * 1.14) < 0.05, `60 Hz brightness ${r[60].mean}`);
  // A full field of hot brakes spends the cars' share (24 mobile, 48 desktop) first;
  // the lamp reserve still lights all 16 panels.
  for (const mobile of [true, false]) {
    const busy = runAt(120, 0.2, { mobile, brakeFlares: 60 });
    assert.equal(busy.minQ, (mobile ? 24 : 48) + 16, `${mobile ? "mobile" : "desktop"}: every panel drawn beside a full set of brake flares`);
    assert.equal(busy.maxPool, 0);
  }
});
