/* lamp-shadow-pick — the night lamp-shadow map holds ONE flood while the car
 * sits between two.
 *
 * ShadowPass.lampPass gives one lamp a real depth map, picked by distance² over
 * brightness. It read the brightness from frame.lights, which carries the
 * per-lamp FLICKER (frame-lights.js: a sine per lamp, +-2-10% at the shipped
 * LAMP FLICKER 0.10), and it had no hysteresis. Parked near the midline of two
 * floods the two scores trade first place with the flicker, and every trade is
 * a lamp change — never deferred, a full prop rebuild, the car's flood shadow
 * and the carved beam jumping sides (measured: up to 9 handovers in 120 frames).
 *
 * Now the pick scores frame.lampLum (the same level without the flicker; the
 * warm-up stays) and keeps the current lamp unless a rival beats it by 20%.
 * Runs the REAL js/lighting/frame-lights.js (with the real knob defaults) feeding
 * the REAL js/render/shared/shadow-pass.js on a recording renderer. No browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

// Two 40 m floods on 18 m masts, 40 m apart, aimed down. `slots` places them in
// the baked set: the flicker phase and depth hash on the source offset, so the
// layouts give an aging pair (both hash > 0.9, +-10%) and an aging + healthy pair.
const FLOOD = (x) => [x, 18, 0, 1, 0.9, 0.7, 40, 0, -1, 0, 0, 0.5, 0, 0, 1];
const WASHER = [900, 4, 0, 0.2, 0.2, 0.2, 8, 0, -1, 0, 0, 0.5, 0, 0, 1];   // rad < 12: never a shadow candidate
const LAYOUTS = {
  "aging pair": [FLOOD(-20), FLOOD(20)],
  "aging + healthy": [FLOOD(-20), WASHER, FLOOD(20)],
};

function rig(lamps) {
  const clock = { now: 0 };
  const ctx = vm.createContext({ performance: { now: () => clock.now }, Math, Float32Array, Uint32Array, Array, Object, Number, Infinity,
    PerfGov: { tier: () => 0 } });
  seedLog(ctx);
  for (const f of ["js/core/mat4.js", "js/lighting/knobs.js", "js/render/shared/light-budget.js", "js/lighting/frame-lights.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  vm.runInContext("var LightTune = { LT: LightKnobs.LT };", ctx);
  vm.runInContext(read("js/render/shared/shadow-pass.js").replace(/^const\b/gm, "var"), ctx, { filename: "shadow-pass.js" });
  const track = { _lights: lamps.flat(), meshes: { props: {} } };
  const frame = { sunColor: [0.12, 0.14, 0.22], sunDir: [0, 0.97, 0.24] };   // night: the moon key
  const built = [];   // the lamp (by x) every full rebuild drew
  const noop = () => {};
  const gfx = {
    lampShadowBegin: (vp, idx) => { built.push(frame.lights[idx * 15]); },
    lampShadowEnd: noop, lampShadowKeep: noop, castShadow: noop, castShadowChunked: noop,
  };
  const player = { team: {}, speed: 0 };
  const G = { gfx, track, player, state: "race", _studioRig: null, camEye: [0, 1.2, 0], camTgt: [0, 1, 30] };
  const sp = ctx.ShadowPass.create(G, { vStd: (v) => v, teamMesh: () => ({}) });
  let f = 0;
  const step = (t) => {
    clock.now = t * 1000;
    ctx.FrameLights.setFrameLights(frame, track, [player], G.camEye, 1, [0, 0, 1], false);
    frame.tailStart = (frame.lights.length / 15) | 0; frame.tailCount = 0;
    sp.lampPass(frame, f++, false);
  };
  // Past the warm-up (up to 8 s at LAMP WARM-UP 1; frames under 1 s apart, or
  // the floods re-strike), so what moves the levels is the flicker alone.
  // built[] keeps only the lamp in use at the end of it.
  const settle = () => { for (let t = 0; t <= 10; t += 0.25) step(t); built.splice(0, built.length - 1); return 10; };
  const handovers = () => built.reduce((n, x, i) => n + (i > 0 && x !== built[i - 1] ? 1 : 0), 0);
  return { ctx, G, frame, track, built, step, settle, handovers };
}

test("the shipped LAMP FLICKER is on, so the parked case below exercises it", () => {
  const { ctx } = rig(LAYOUTS["aging pair"]);
  const def = ctx.LightKnobs.TUNE_DEFS.find((d) => d.id === "lampFlicker").def;
  assert.ok(def > 0 && ctx.LightKnobs.LT.lampFlicker === def, `lampFlicker default ${def}`);
});

test("parked within 1.2 m of the midline of two floods: at most one handover in 120 frames", () => {
  for (const [name, lamps] of Object.entries(LAYOUTS)) {
    for (let off = -1.2; off <= 1.2001; off += 0.1) {
      const r = rig(lamps);
      r.G.camEye[0] = off;
      const t0 = r.settle();
      for (let i = 1; i <= 120; i++) r.step(t0 + i / 60);
      assert.ok(r.built.length >= 1, `${name} @ ${off.toFixed(1)} m: the lamp map was built`);
      assert.ok(r.handovers() <= 1, `${name} @ ${off.toFixed(1)} m: ${r.handovers()} lamp handovers in 120 frames (flicker-driven)`);
    }
  }
});

test("driving from one flood to the other hands over once, past the midline", () => {
  const r = rig(LAYOUTS["aging + healthy"]);
  r.G.camEye[0] = -20;
  const t0 = r.settle();
  let at = null, prev = r.built[r.built.length - 1];
  assert.equal(prev, -20, "the car starts under the -20 flood");
  for (let i = 1; i <= 240; i++) {
    r.G.camEye[0] = -20 + 40 * i / 240;   // 10 m/s across, 60 fps
    const n = r.built.length;
    r.step(t0 + i / 60);
    const lamp = r.built.length > n ? r.built[r.built.length - 1] : prev;
    if (lamp !== prev && at === null) at = r.G.camEye[0];
    prev = lamp;
  }
  assert.equal(r.handovers(), 1, `one handover (built: ${r.built.join(",")})`);
  assert.equal(prev, 20, "the map ends on the flood the car drove to");
  assert.ok(at > 0.5, `the handover waits for the new lamp to be clearly nearer (at x = ${at && at.toFixed(2)} m)`);
});

test("a lamp that leaves the candidate set is replaced at once", () => {
  const r = rig(LAYOUTS["aging pair"]);
  r.G.camEye[0] = -0.3;   // nearer the -20 flood
  const t0 = r.settle();
  r.step(t0 + 1 / 60);
  assert.deepEqual(r.built, [-20], "the nearer flood holds the map");
  r.track._lights = FLOOD(20);   // a rebuild:true knob mints a new set; the old lamp is gone
  r.step(t0 + 2 / 60);
  assert.deepEqual(r.built, [-20, 20], "the only remaining flood takes the map on the same frame");
});

test("frame.lampLum is each lamp's level without the flicker; the warm-up stays in it", () => {
  const r = rig(LAYOUTS["aging pair"]);
  const lumAt = [], emitted = [];
  for (let i = 0; i <= 720; i++) {   // 12 s at 60 fps: the warm-up, then steady
    r.step(i / 60);
    lumAt.push(Array.from(r.frame.lampLum));
    emitted.push(Math.max(r.frame.lights[3], r.frame.lights[4], r.frame.lights[5]));
  }
  assert.equal(r.frame.lampLum.length, r.frame.lights.length / 15, "one level per record");
  const steady = lumAt.slice(600);
  for (const l of steady) assert.deepEqual(l, steady[0], "after the warm-up the level is constant: no flicker in it");
  assert.ok(Math.abs(steady[0][0] - 1) < 1e-9, `the unflickered level is the baked one (${steady[0][0]})`);
  const em = emitted.slice(600);
  assert.ok(Math.max(...em) - Math.min(...em) > 0.05, "while the emitted level still flickers");
  assert.ok(lumAt[0][0] < 0.9 * steady[0][0], `during the warm-up the level is dimmed (${lumAt[0][0].toFixed(3)})`);
});
