/* frame-lights-tail-budget — car tail-lights under phone (24) and TLX-lite (16).
 *
 * appendCarTailLights evicts farthest track lamps so up to five tail records
 * fit inside LightBudget.slots() (emit mode). Default paint mode (tailLightEmit 0)
 * keeps every lamp slot for floods and puts tails on frame.glowLights plus the
 * slot-free road decal / rear emissive path in game.js.
 *
 * Run: node --test tests/unit/frame-lights-tail-budget.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function load({ slots, mobileTier, tailLightEmit = 0 }) {
  const clock = { now: 1000 };
  const ctx = {
    performance: { now: () => clock.now },
    Math, Float32Array, Uint32Array, Array, Object, Number,
    Tracks: { sample(_t, s, out) { out.p[0] = 0; out.p[1] = 0; out.p[2] = s; out.t[0] = 0; out.t[1] = 0; out.t[2] = 1; out.r[0] = 1; out.r[1] = 0; out.r[2] = 0; } },
    LightKnobs: {
      LT: {
        lampWarmup: 0, lampFlicker: 0, lampCull: 40, lampBehindBias: 5.25, lampCullFade: 0.35, lampReach: 1,
        tailRange: 160, tailLightMul: 1, brakeGlowMul: 1, tailLightEmit, tailFade: 0,
      },
    },
    PerfGov: { tier: () => 0 },
  };
  vm.createContext(ctx);
  vm.runInContext(read("js/render/shared/light-budget.js") + "\n;globalThis.LightBudget = LightBudget;", ctx);
  vm.runInContext("LightBudget.setSlots(" + slots + ");", ctx);
  vm.runInContext(read("js/lighting/frame-lights.js") + "\n;globalThis.FrameLights = FrameLights;", ctx);
  return { FL: ctx.FrameLights, clock, mobileTier };
}

function denseStreet(nLamps) {
  const L = [];
  for (let i = 0; i < nLamps; i++) {
    const z = i * 8;
    L.push(0, 6, z, 1.2, 0.95, 0.75, 35, 0, -1, 0, -1, 0, 0, 0, 1);
  }
  return L;
}

function rivals(n) {
  return Array.from({ length: n }, (_, i) => ({ s: (i + 1) * 4, x: 0, brakeHeat: 0 }));
}

function nightFrame(FL, track, cars, player, mobileTier, eye = [0, 1.2, 0], fwd = [0, 0, 1]) {
  const frame = { time: 0, perChunkLights: 0 };
  FL.setFrameLights(frame, track, cars, eye, [0.85, 0.88, 1], fwd, mobileTier);
  FL.appendCarTailLights(frame, track, cars, player, mobileTier);
  return frame;
}

function tailRgb(frame) {
  const n = frame.tailCount | 0;
  if (!n) return [];
  const start = (frame.tailStart | 0) * 15;
  const out = [];
  for (let j = 0; j < n; j++) {
    const o = start + j * 15;
    out.push([frame.lights[o + 3], frame.lights[o + 4], frame.lights[o + 5]]);
  }
  return out;
}

function glowTailRgb(frame, lampCount) {
  const g = frame.glowLights;
  const out = [];
  for (let i = lampCount * 15; i < g.length; i += 15)
    out.push([g[i + 3], g[i + 4], g[i + 5]]);
  return out;
}

for (const [label, slots, mobileTier] of [
  ["phone 24-slot budget", 24, true],
  ["TLX-lite 16-slot budget", 16, false],
]) {
  test(`${label}: emit mode keeps five tail lights inside the shader cap with traffic`, () => {
    const { FL, mobileTier: mob } = load({ slots, mobileTier, tailLightEmit: 1 });
    const track = { total: 8000, _lights: denseStreet(80) };
    const cars = rivals(12);
    const player = { s: 0, x: 0 };
    const frame = nightFrame(FL, track, cars, player, mob);
    const total = (frame.lights.length / 15) | 0;
    assert.ok(total <= slots, `shader list ${total} must fit in ${slots} slots`);
    assert.equal(frame.tailCount, 5, "five nearest rivals reserve tail records");
    assert.equal(total, slots, "budget is full: lamps evicted to make room for tails");
    for (const rgb of tailRgb(frame)) {
      assert.ok(rgb[0] > rgb[1] && rgb[0] > rgb[2], `tail is red-dominant: ${rgb}`);
    }
    assert.equal(frame.glowLights, frame.lights, "emit mode: halo list is the lit set");
  });

  test(`${label}: paint mode leaves lamp slots untouched and glows five tails (slot-free)`, () => {
    const { FL, mobileTier: mob } = load({ slots, mobileTier, tailLightEmit: 0 });
    const track = { total: 8000, _lights: denseStreet(80) };
    const cars = rivals(12);
    const player = { s: 0, x: 0 };
    const frame = nightFrame(FL, track, cars, player, mob);
    const lampOnly = (frame.lights.length / 15) | 0;
    assert.ok(lampOnly <= slots, `culled lamps ${lampOnly} stay within ${slots}`);
    assert.equal(frame.tailCount, 0, "shader tail range stays empty in paint mode");
    assert.notEqual(frame.glowLights, frame.lights, "game.js tail-glow path is armed");
    const glowTails = glowTailRgb(frame, lampOnly);
    assert.equal(glowTails.length, 5, "five tail records on the glow-only list");
    for (const rgb of glowTails) {
      assert.ok(rgb[0] > 0.5 && rgb[0] > rgb[1], `glow tail is visibly red: ${rgb}`);
    }
    assert.equal(frame.lights.length, lampOnly * 15, "no lamp evicted for paint-mode tails");
  });
}

test("lampCap with traffic never budgets above LightBudget.slots() (pit-canopy contract)", () => {
  const src = read("js/lighting/frame-lights.js");
  const anchor = "return { setFrameLights, appendCarTailLights, glowFade, viewLights, rankStats, resetRankStats, release };";
  assert.ok(src.includes(anchor));
  const ctx = vm.createContext({
    LightKnobs: { LT: { lampCull: 40 } },
    PerfGov: { tier: () => 0 },
    performance: { now: () => 0 },
    LightBudget: { MAX: 48, MOBILE: 24, TAIL_RESERVE: 5, slots: () => 16 },
  });
  vm.runInContext(src.replace(anchor, "return { setFrameLights, appendCarTailLights, glowFade, viewLights, rankStats, resetRankStats, release, lampCap };"), ctx);
  const api = vm.runInContext("FrameLights", ctx);
  assert.equal(api.lampCap(10, false), 16);
  assert.equal(api.lampCap(10, true), 16, "phone tier still clamped by live slots, not MOBILE alone");
});
