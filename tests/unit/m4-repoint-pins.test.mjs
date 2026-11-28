/* M4 RE-POINT PINS (#7443: Gardener plan #6885 rows 12 and 6). The crew
 * smoothstep (crew-draw.js / scene-crew.js `ease`), the designer's seeded
 * stream (TrackShape.rng) and the radio's mulberry32 now call M4.smoothstep /
 * M4.rng32. Every value below was read on the base (ec36a926), before the
 * re-point: saved designs store their seeds, so a stream must never move. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { withM4 } from "../helpers/mat4-vm.mjs";
import { bootEditor } from "../helpers/editor-vm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

test("crew ease is M4.smoothstep: Object.is-identical to the old local copy, -0 and NaN included", () => {
  const ctx = withM4(vm.createContext({}));
  vm.runInContext(read("js/garage/crew-draw.js"), ctx, { filename: absSrc("js/garage/crew-draw.js") });
  const ease = vm.runInContext("GarageCrewDraw.ease", ctx), M4 = vm.runInContext("M4", ctx);
  const old = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };   // the copy both files carried
  for (const x of [-1, -0, 0, 0.3, 0.5, 1, 2, NaN, Infinity, -Infinity]) {
    assert.ok(Object.is(ease(x), old(x)), `GarageCrewDraw.ease(${Object.is(x, -0) ? "-0" : x})`);
    assert.ok(Object.is(M4.smoothstep(x), old(x)), `M4.smoothstep(${Object.is(x, -0) ? "-0" : x})`);
  }
});

test("TrackShape.rng streams and generate() designs are the base's, seed 0 still mapping to 1", () => {
  const { S, TR } = bootEditor();
  const take = (seed) => { const r = S.rng(seed); return Array.from({ length: 6 }, () => r()); };
  const ONE = [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849, 0.281103502959013];
  assert.deepEqual(take(0), ONE, "seed 0 is seed 1 (saved designs rely on it)");
  assert.deepEqual(take(1), ONE);
  assert.deepEqual(take(42), [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423, 0.5265925421845168]);
  assert.deepEqual(take(4294967295), [0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677, 0.8452364315744489, 0.5391399988438934]);
  const GEN = { 7: "62cca2a", 1234: "f67f5b2", 99991: "b814cde7" };
  for (const [seed, want] of Object.entries(GEN)) assert.equal(fnv(JSON.stringify(TR.generate(+seed))), want, `TrackRandom.generate(${seed})`);
});

test("radio band and squelch timings are the base's for numeric and text seeds", () => {
  const ctx = withM4(vm.createContext({ Math, JSON, Object, Array, Number, String, Set, console }));
  vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: absSrc("js/audio/radio-voice.js") });
  const RV = vm.runInContext("RadioVoice", ctx);
  const seeds = [0, 1, 42, 4294967295, "BOX BOX", "push now", ""];
  assert.deepEqual(JSON.parse(JSON.stringify(RV.radioBand(42))), { lo: 304, hi: 3396, freq: 1016, q: 0.388 });
  assert.equal(fnv(JSON.stringify(seeds.map((s) => RV.radioBand(s)))), "156ac0b8");
  const plans = seeds.map((s) => RV.squelchPlan({ enabled: true, soundOn: true, state: "race", kind: "engineer", seed: s, secs: 2 }));
  assert.ok(plans.every((p) => p.play), "every plan keys up, so the hash covers real timings");
  assert.equal(fnv(JSON.stringify(plans)), "f4dcadce");
});
