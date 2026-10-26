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
    "return { setFrameLights, appendCarTailLights, glowFade, viewLights, rankStats, resetRankStats, release, pool: () => _tlPool.slice(), sel: () => _tlSel.slice() };"), ctx,
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
