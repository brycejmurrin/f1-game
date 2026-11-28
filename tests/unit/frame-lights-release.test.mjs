/* frame-lights-release.test.mjs — release() must drop tail-light car refs.
 *
 * appendCarTailLights pools {c,d} entries for the nearest cars. loadTrack calls
 * FrameLights.release() on a track switch; a day session never re-enters
 * appendCarTailLights, so any car left on _tlPool / _tlSel kept the previous
 * night grid reachable (#3290).
 *
 * Run: node --test tests/unit/frame-lights-release.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const source = readFileSync(path.join(ROOT, "js/lighting/frame-lights.js"), "utf8");
  const anchor = "return { setFrameLights, appendCarTailLights, glowFade, viewLights, rankStats, resetRankStats, release };";
  assert.ok(source.includes(anchor), "frame-lights.js export list moved — update this loader");
  const ctx = vm.createContext({
    LightKnobs: { LT: { tailRange: 160, tailLightMul: 1, brakeGlowMul: 1, tailLightEmit: 1, tailFade: 0 } },
    LightBudget: { MAX: 48, MOBILE: 24, slots: () => 48 },
    Tracks: { sample(_t, s, out) { out.p[0] = 0; out.p[1] = 0; out.p[2] = s; out.t[0] = 0; out.t[2] = 1; out.r[0] = 1; out.r[2] = 0; } },
  });
  vm.runInContext(source.replace(anchor,
    "return { setFrameLights, appendCarTailLights, glowFade, viewLights, rankStats, resetRankStats, release, pool: () => _tlPool.slice(), sel: () => _tlSel.slice(), hshLen: () => _hshC.length, hshTable: () => _hshC, growHsh: (o) => _hshOf(o) };"), ctx,
    { filename: absSrc("js/lighting/frame-lights.js") });
  return vm.runInContext("FrameLights", ctx);
}

test("release() clears every _tlPool car ref and empties _tlSel after a night append", () => {
  const api = load();
  const track = { total: 5000 }, player = { s: 0, x: 0 };
  const cars = Array.from({ length: 8 }, (_, i) => ({ s: i * 10, x: 0, brakeHeat: 0 }));
  const frame = { lights: [] };
  api.appendCarTailLights(frame, track, cars, player, false);
  assert.ok(frame.tailCount > 0, "night append filled the pool");
  const held = api.pool().filter((e) => e && e.c != null);
  assert.ok(held.length > 0, "pool holds car refs before release");
  assert.ok(api.sel().length > 0, "selection is non-empty before release");
  for (const e of held) assert.ok(cars.includes(e.c), "pool points at the night grid");

  api.release();

  for (const e of api.pool()) {
    assert.equal(e.c, null, "release nulls every pooled car ref");
  }
  assert.equal(api.sel().length, 0, "release empties _tlSel");
});

test("release() drops the flicker hash table grown for a dense night grid", () => {
  const api = load();
  for (let lamp = 0; lamp < 3000; lamp++) {
    const offset = lamp * 15;
    const x = Math.sin((offset + 13) * 91.17) * 43758.5453;
    const hash = x - Math.floor(x);
    assert.equal(api.growHsh(offset), hash, "first use retains the source-offset hash");
    assert.equal(api.growHsh(offset), Math.fround(hash), "reused hashes retain float precision");
  }
  assert.equal(api.hshLen(), 4096, "capacity grows by lamp count");
  api.release();
  assert.equal(api.hshLen(), 0, "track switch must not keep the peak hash allocation");
});

// #7350 L1: a lit session with an empty lamp set returns early every frame; release() there must not re-allocate.
test("an empty lamp set releases once, then allocates nothing on later frames", () => {
  const api = load();
  const frame = {}, track = { _lights: [] };
  api.setFrameLights(frame, track, [], [0, 0, 0], 1, [0, 0, 1], 0);
  const h1 = api.hshTable();
  api.setFrameLights(frame, track, [], [0, 0, 0], 1, [0, 0, 1], 0);
  assert.equal(frame.lights, null);
  assert.equal(api.hshTable(), h1, "the second empty frame kept the same (empty) table: release() was a no-op");
  api.growHsh(15 * 10);
  assert.ok(api.hshLen() > 0);
  api.release();
  assert.equal(api.hshLen(), 0, "an explicit release still frees a held table");
});
