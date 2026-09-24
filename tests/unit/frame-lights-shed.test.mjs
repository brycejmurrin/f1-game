/* frame-lights-shed.test.mjs — a governor step must not pop the lamp set.
 *
 * tierShed used to follow PerfGov.tier() the frame it changed (48 -> 32 -> 24
 * slots at once), so a device on the edge of its frame budget flickered a dozen
 * lamps off and on. Lighting now follows a HELD tier (1.5 s) and slides the slot
 * limit toward it; halos fade at tier >= 3 instead of vanishing.
 *
 * Run: node --test tests/unit/frame-lights-shed.test.mjs  (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const clock = { t: 0 }, gov = { tier: 0 };
  const ctx = vm.createContext({
    LightKnobs: { LT: { lampCull: 40 } },
    LightBudget: { MAX: 48, MOBILE: 24, slots: () => 48 },
    PerfGov: { tier: () => gov.tier },
    performance: { now: () => clock.t },
  });
  const src = readFileSync(path.join(ROOT, "js/lighting/frame-lights.js"), "utf8")
    .replace("return { setFrameLights, appendCarTailLights, glowFade };",
             "return { setFrameLights, appendCarTailLights, glowFade, tierShed };");
  vm.runInContext(src, ctx);
  return { api: vm.runInContext("FrameLights", ctx), clock, gov };
}
const frame = (L, ms) => { L.clock.t += ms; };

test("a governor step waits for the tier to hold, then slides the cap", () => {
  const L = load();
  assert.equal(L.api.tierShed(48), 48, "tier 0: full budget");
  L.gov.tier = 2;
  for (let i = 0; i < 80; i++) { frame(L, 16); assert.equal(L.api.tierShed(48), 48, "no reaction inside the hold"); }
  let prev = 48, steps = 0;
  for (let i = 0; i < 200; i++) {
    frame(L, 16);
    const c = L.api.tierShed(48);
    assert.ok(prev - c <= 1, `at most one slot per 16 ms frame (${prev} -> ${c})`);
    if (c < prev) steps++;
    prev = c;
  }
  assert.equal(prev, 24, "settles on the tier-2 budget");
  assert.ok(steps >= 20, "the cut is spread over many frames");
});

test("a step that reverts inside the hold never touches the lamps", () => {
  const L = load();
  L.api.tierShed(48);
  L.gov.tier = 2;
  for (let i = 0; i < 60; i++) { frame(L, 16); L.api.tierShed(48); }
  L.gov.tier = 0;
  for (let i = 0; i < 200; i++) { frame(L, 16); assert.equal(L.api.tierShed(48), 48); }
});

test("halos fade out at a held tier 3 and back in after", () => {
  const L = load();
  assert.equal(L.api.glowFade(), 1);
  L.gov.tier = 3;
  let prev = 1;
  for (let i = 0; i < 200; i++) {
    frame(L, 16);
    const g = L.api.glowFade();
    assert.ok(prev - g <= 0.041 + 1e-9, "fades, never cuts");
    prev = g;
  }
  assert.equal(prev, 0, "off after the fade");
  L.gov.tier = 0;
  for (let i = 0; i < 200; i++) { frame(L, 16); prev = L.api.glowFade(); }
  assert.equal(prev, 1, "back after the tier drops and holds");
});

test("a device that boots at tier 2 starts shed, with no hold", () => {
  const L = load();
  L.gov.tier = 2;
  assert.equal(L.api.tierShed(48), 24);
});
