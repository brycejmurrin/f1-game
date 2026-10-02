// marshal-panels — the posts' light panels show what race control is showing.
//
// js/race/marshal-panels.js re-spawns one additive glow per lit panel each race
// frame: a waved yellow at the posts of the sector under a local yellow, a
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/marshal-panels.js"), "utf8");
const load = () => { const sb = { Math }; vm.createContext(sb); return vm.runInContext(SRC + ";MarshalPanels", sb); };

// 90 nodes, a post every 10 nodes (9 posts: three per third), authored splits at 0.3 / 0.6.
function track(splits) {
  const n = 90, list = [];
  for (let k = 0; k < n; k += 10) list.push({ kind: "marshalPost", k, side: 1, x: k, y: 1.2, z: 0, w: 1.2, h: 2.4, d: 1.2 });
  list.push({ kind: "gantry", k: 0, side: 0, x: 0, y: 4, z: 0, w: 16, h: 9, d: 1 });
  return { n, props: { list }, def: splits ? { sectors: splits } : {} };
}
const stub = () => { const calls = []; return { calls, glow: (...a) => calls.push(a) }; };
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

test("game.js wires MarshalPanels after the gantry lamps", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /const marshalPanels = MarshalPanels\.create\(G\)/);
  assert.match(game, /startLights\.update\(\);[^\n]*\n\s*marshalPanels\.update\(dt\);[^\n]*\n\s*Particles\.update\(dt\);/);
});
