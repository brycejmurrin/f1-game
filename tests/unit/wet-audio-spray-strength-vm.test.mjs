/* wet-audio-spray-strength-vm.test.mjs — #7198: spray STRENGTH (Particles.sprayStr's wetness arg) and the
 * engine-audio wet flag (_engArg.wet → GameAudio.setEngine) read the surface under the car
 * (carWet / isWetAt → wxArc.wetnessAt(c.s, c.x)), not the view's frame.wetness or the lap mean.
 * Same harness as wet-sector-spray-skid-vm.test.mjs (#7068): real js/game.js, two-sector wetness map.
 * Run: node --test tests/unit/wet-audio-spray-strength-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null, wa = null;
const strArgs = [];
const road = { mean: 0, wetAt: () => 0 };

function trap(sb, name, wrap) {
  let v;
  Object.defineProperty(sb, name, { configurable: true, enumerable: true, get: () => v, set: (x) => { v = x && typeof x === "object" ? wrap(x) : x; } });
}

before(async () => {
  g = await createGame({
    carMeshes: false, storage: { trackId: "monza" },
    onSandbox: (sb) => {
      trap(sb, "WeatherArc", (W) => Object.assign({}, W, {
        create(...a) { const w = W.create(...a); w.wetnessAt = (s) => road.wetAt(s); w.wetness = () => road.mean; wa = w; return w; },
      }));
      trap(sb, "Particles", (P) => Object.assign({}, P, { sprayStr(vs, k, wet) { strArgs.push(wet); return P.sprayStr(vs, k, wet); } }));
    },
  });
  assert.ok(wa, "WeatherArc.create was captured");
});
after(() => { if (g) g.close(); });

let clock = 0;
function frames(n) { for (let i = 0; i < n; i++) { g.apex.setInput({ steer: 0, throttle: true }); clock += 1000 / 60; g.pumpFrame(clock); } }
function sectorAt(s0, half) {
  const L = g.G.track.total;
  return (s) => { const d = Math.abs((((s - s0) % L) + L * 1.5) % L - L / 2); return d <= half ? 0.95 : 0; };
}

const eng = [];
async function setup() {
  g.G.driverIdx = 0; g.G.teamIdx = 0;
  await g.race("monza", "day", "dry", { laps: 3 });
  g.apex.go();
  g.G.headlessMode = false; g.G.soundOn = true;
  g.sandbox.GameAudio.setSkid = () => {};
  g.sandbox.GameAudio.setEngine = (...a) => { eng.push(!!a[5].wet); };
}
function probe(n = 40) {
  g.apex.jump(0.02, 70, 0); frames(5);
  eng.length = 0; strArgs.length = 0;
  frames(n);
  return { eng: eng.length, engWet: eng.filter(Boolean).length, strs: strArgs.slice() };
}

test("spray strength and engine-audio wet follow the sector under the car", async () => {
  await setup();
  const p = g.G.player;

  // (a) damp lap mean, soaked sector under the car: strength = the surface (0.95), engine wet.
  road.mean = 0.1; road.wetAt = sectorAt(p.s, 600);
  const a = probe();
  assert.ok(a.eng > 0 && a.engWet === a.eng, "engine wet on the soaked sector: " + JSON.stringify({ e: a.eng, w: a.engWet }));
  assert.ok(a.strs.length > 0 && a.strs.every((w) => Math.abs(w - 0.95) < 1e-9), "sprayStr read the car-local 0.95: " + a.strs.slice(0, 5));

  // (b) soaked lap mean, dry surface under the car: engine dry, no spray strength read at all.
  road.mean = 0.9; road.wetAt = () => 0;
  const b = probe();
  assert.equal(b.engWet, 0, "engine dry on a dry surface under a wet mean");
  assert.equal(b.strs.length, 0, "no spray off a dry surface");

  // (c) soaked sector half a lap away under a damp mean: dry here.
  road.mean = 0.1; road.wetAt = sectorAt(p.s + g.G.track.total / 2, 150);
  const c = probe();
  assert.equal(c.engWet, 0, "engine dry off the shower");
  assert.equal(c.strs.length, 0);
});

test("dry laps: engine flag stays false, no spray, and two dry runs are bit-identical", async () => {
  road.mean = 0; road.wetAt = () => 0;
  const run = async () => {
    await setup(); clock = 0;
    const r = probe(60);
    const p = g.G.player;
    return { r, s: p.s, x: p.x, speed: p.speed };
  };
  const A = await run(), B = await run();
  assert.equal(A.r.engWet, 0); assert.equal(A.r.strs.length, 0);
  assert.deepEqual(A, B, "dry probes are deterministic and untouched by the wet reads");
});
