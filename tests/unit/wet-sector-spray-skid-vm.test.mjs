/* wet-sector-spray-skid-vm.test.mjs — #7068 (#6881 R3): rain spray admission and the skid squeal's
 * wet flavour read the SECTOR under the car (isWetAt → wxArc.wetnessAt(c.s, c.x)), not the lap-mean
 * isWetRoad(). Under a local shower one stretch is soaked while the lap mean is damp at most; the
 * old reads threw spray (or none) and flavoured the squeal by the mean, wherever the car was.
 *
 * The real js/game.js, booted headless (tools/lib/game-vm.cjs) and rendered through the fake GLX.
 * WeatherArc and Particles are frozen IIFEs, so onSandbox traps their `var` assignment: WeatherArc.create
 * hands back the live arc (its wetnessAt / wetness are then a two-sector map), Particles.spray counts.
 * Run: node --test tests/unit/wet-sector-spray-skid-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null, wa = null, sprays = 0;
// The two-sector map: `wetAt(s)` is the surface wetness, `mean` the lap mean trackWetness() reads.
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
        create(...a) {
          const w = W.create(...a);
          w.wetnessAt = (s) => road.wetAt(s);
          w.wetness = () => road.mean;
          wa = w;
          return w;
        },
      }));
      trap(sb, "Particles", (P) => Object.assign({}, P, { spray(...a) { sprays++; return P.spray(...a); } }));
    },
  });
  assert.ok(wa, "WeatherArc.create was captured");
});
after(() => { if (g) g.close(); });

let clock = 0;
function frames(n) { for (let i = 0; i < n; i++) { g.apex.setInput({ steer: 0, throttle: true }); clock += 1000 / 60; g.pumpFrame(clock); } }

// A sector of `half` m either side of `s0` (wrapped on the lap) is soaked; the rest is dry.
function sectorAt(s0, half) {
  const L = g.G.track.total;
  return (s) => { const d = Math.abs((((s - s0) % L) + L * 1.5) % L - L / 2); return d <= half ? 0.95 : 0; };
}

async function setup() {
  g.G.driverIdx = 0; g.G.teamIdx = 0;
  await g.race("monza", "day", "dry", { laps: 3 });
  g.apex.go();
  g.G.headlessMode = false; g.G.soundOn = true;
  const skid = [];
  g.sandbox.GameAudio.setSkid = (x, wet) => { skid.push(!!wet); };
  return skid;
}

// Each probe restarts the player on the main straight at 70 m/s (vStd > 15: spray speed), then runs `n` frames.
function launch() { g.apex.jump(0.02, 70, 0); frames(5); return g.G.player; }
function probe(skid, n = 40) {
  launch(); skid.length = 0; sprays = 0;
  frames(n);
  return { sprays, skidCalls: skid.length, skidWet: skid.filter(Boolean).length };
}

test("spray and the skid squeal follow the soaked sector under the car, not the lap mean", async () => {
  const skid = await setup();
  const p = launch();
  assert.ok(Math.abs(p.speed) > 20, "the player is at speed: " + p.speed);

  // (a) A damp lap mean (0.1: not a wet road), the sector under the player soaked: spray, wet squeal.
  road.mean = 0.1; road.wetAt = sectorAt(p.s, 600);
  const a = probe(skid);
  assert.ok(a.skidCalls > 0, "setSkid was fed: " + JSON.stringify(a));
  assert.equal(a.skidWet, a.skidCalls, "wet squeal on the soaked sector under the car: " + JSON.stringify(a));
  assert.ok(a.sprays > 0, "spray off the soaked sector: " + JSON.stringify(a));

  // (b) The same damp mean, the soaked sector half a lap away: no spray from the cars here, dry squeal.
  road.wetAt = sectorAt(p.s + g.G.track.total / 2, 150);
  const b = probe(skid);
  assert.ok(b.skidCalls > 0);
  assert.equal(b.skidWet, 0, "dry squeal off the shower: " + JSON.stringify(b));

  // (c) The mirror: a soaked lap mean (0.9) over a dry surface everywhere: no spray, dry squeal.
  road.mean = 0.9; road.wetAt = () => 0;
  const c = probe(skid);
  assert.equal(c.sprays, 0, "no spray off a dry surface under a wet mean: " + JSON.stringify(c));
  assert.equal(c.skidWet, 0, "dry squeal on a dry surface: " + JSON.stringify(c));

  // (d) Uniform wet (mean === surface, the pre-shower case): unchanged — spray and a wet squeal.
  road.mean = 0.95; road.wetAt = () => 0.95;
  const d = probe(skid);
  assert.ok(d.sprays > 0 && d.skidWet === d.skidCalls, "uniform wet: " + JSON.stringify(d));
});
