/* #6752 (#6506 rows 3-5): per-frame allocation in spotter, race-facts and HUD tyres; output unchanged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";
import vm from "node:vm";

const load = (file, expr, pre = "") => {
  const ctx = vm.createContext({ console });
  vm.runInContext(pre + fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8") + `;this.M=${expr};`, ctx, { filename: absSrc(file) });
  return ctx;
};

test("spotter: update() builds no closures on the quiet path, state resets as before", () => {
  const ctx = load("js/race/spotter.js", "Spotter");
  let stops = 0;
  const player = { s: 0, x: 0, speed: 50 };
  const G = { state: "race", soundOn: true, player, cars: [player, { s: 1, x: 2 }], track: { total: 1000 }, store: { get: () => false },
    vTop: () => 100, radio: { pack: { stop() { stops++; } }, volume: () => 1 } };
  const sp = ctx.M.create(G);
  // The source holds exactly one arrow per hoisted helper, outside update().
  const src = fs.readFileSync(new URL("../../js/race/spotter.js", import.meta.url), "utf8");
  const upd = src.slice(src.indexOf("function update("), src.indexOf("const key = step("));
  assert.doesNotMatch(upd, /const (dirty|reset) = /);
  for (let i = 0; i < 10000; i++) sp.update(0.016, i % 2 === 0);
  assert.equal(stops, 0);               // nothing ever spoke: nothing to stop
  assert.equal(sp.side(), 0 | sp.side());
});

test("race-facts: ranking is the stable order sort() gave, with no sort call", () => {
  const ctx = load("js/race/race-facts.js", "RaceFacts");
  let sorts = 0;
  const A = vm.runInContext("Array", ctx), orig = A.prototype.sort;
  A.prototype.sort = function (...a) { sorts++; return orig.apply(this, a); };
  const rf = ctx.M.create();
  let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const cars = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, prog: 0, lap: 1, s: 0, x: 0, speed: 50 }));
  const G = { player: cars[5], cars, track: { total: 4000 }, raceT: 0 };
  for (let f = 0; f < 200; f++) {
    cars.forEach((c, i) => { c.prog = 4000 * (20 - i) / 20 + (f % 3 ? 0 : rnd() * 3) + (i % 7 === 0 ? 0.4 : 0); });
    G.raceT += 0.1;
    const out = rf.observe(G, 0.1);
    if (!out.f) continue;
    const want = [...cars].sort((a, b) => { const d = b.prog - a.prog; return Math.abs(d) > 1 ? d : d; });
    const pos = want.indexOf(G.player) + 1;
    assert.equal(out.f.rawPos, pos, "frame " + f);
  }
  assert.equal(sorts, 0);
});
