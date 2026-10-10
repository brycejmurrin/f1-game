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
    LightBudget: { MAX: 48, MOBILE: 24, TAIL_RESERVE: 5, slots: () => 48 },
    PerfGov: { tier: () => gov.tier },
    performance: { now: () => clock.t },
  });
  const src = readFileSync(path.join(ROOT, "js/lighting/frame-lights.js"), "utf8")
    .replace("return { setFrameLights, appendCarTailLights, glowFade, viewLights };",
             "return { setFrameLights, appendCarTailLights, glowFade, viewLights, tierShed };");
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

// R3-RENDER-5: a >1 s gap in setFrameLights calls read as "the floods just switched
// on", so every plain PAUSE at night (tickBody's paused branch renders nothing)
// replayed the 4-8 s warm-up on resume: blue at ~43 %, sodium-orange
// (scratch/hunt3-render/lamp-rewarm.mjs). A switch-on is a gap the RENDER clock
// (frame.time, dt clamped to 1/20 s a frame) ran through, or a new world.
test("a pause, a hitch or a hidden tab does not replay the lamp warm-up; lamps unlit while rendering, or a new track, still ramp", () => {
  const L = load();
  const track = { _lights: [] };
  for (let i = 0; i < 10; i++) track._lights.push(i * 20, 10, 0, 100, 100, 100, 40, 0, -1, 0, 1, 1, 1, 0, 1);
  const f = { perChunkLights: 0, time: 0 };
  const lit = (tr = track) => { L.api.setFrameLights(f, tr, [{}], [0, 2, 0], 1, [0, 0, 1], false, null);
    let r = 0, b = 0; for (let o = 0; o < f.lights.length; o += 15) { r += f.lights[o + 3]; b += f.lights[o + 5]; }
    return { r: +(r / 1000).toFixed(3), b: +(b / 1000).toFixed(3) }; };
  const run = (ms, tr) => { let v; for (let t = 0; t < ms; t += 16) { L.clock.t += 16; f.time += 0.016; v = lit(tr); } return v; };
  const steady = { r: 1, b: 1 };
  assert.deepEqual(run(20000), steady, "20 s in: the warm-up is long done");
  L.clock.t += 3000;                                    // PAUSE 3 s: no render, so frame.time holds
  assert.deepEqual(lit(), steady, "resume after a pause: full level, no sodium tint");
  L.clock.t += 1500; f.time += 0.05;                    // a 1.5 s hitch: one clamped render frame
  assert.deepEqual(lit(), steady, "a long frame is not a switch-on");
  run(1000);
  for (let t = 0; t < 2000; t += 16) { L.clock.t += 16; f.time += 0.016; }   // day->night: rendering, lamps unlit
  const on = lit();
  assert.ok(on.b < 0.8, "lamps off while frames rendered: they warm up again (" + JSON.stringify(on) + ")");
  run(10000);
  const other = { _lights: track._lights.slice() };
  L.clock.t += 3000;
  assert.ok(lit(other).b < 0.8, "a new world after a build gap warms up");
  delete f.time;                                        // a caller without the render clock keeps the wall-clock rule
  run(10000, other); L.clock.t += 3000;
  assert.ok(lit(other).b < 0.8, "no frame.time: any > 1 s gap is a switch-on, as before");
});
