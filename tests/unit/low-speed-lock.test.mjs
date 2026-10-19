/* low-speed-lock.test.mjs — pin the 1.06× hairpin plateau and unchanged ≥30 taper.
 *
 * Companion to steer-lock-taper.test.mjs: the production steerAngle in the VM
 * shows the 1.06× plateau, the 15–30 m/s blend and the raw taper above 30.
 *
 * Run: node --test tests/unit/low-speed-lock.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

const LOW_PLATEAU = 1.06;

function rawTaper(vs, ref) {
  return 1 / (1 + vs / ref);
}
// Blend between the plateau (<=15 m/s) and the raw taper (>=30 m/s), evaluated at the VM's measured speed.
function blendTaper(vs, ref) {
  const raw = rawTaper(vs, ref);
  return vs <= 15 ? LOW_PLATEAU : (vs >= 30 ? raw : LOW_PLATEAU + (raw - LOW_PLATEAU) * (vs - 15) / 15);
}

test("source: game.js plateau is 1.06 and steer-tuning documents the hairpin boost", () => {
  const game = gameSource();
  const tuning = fs.readFileSync(path.join(ROOT, "js/input/steer-tuning.js"), "utf8");
  assert.match(game, /lockTaper = vs <= 15 \? 1\.06 :/);
  assert.match(tuning, /1\.06× plateau/);
  assert.match(tuning, /function lockFromSlider\(v\)\s*\{\s*return 0\.18 \+ \(0\.435 - 0\.18\) \* \(v - 1\) \/ 9; \}/);
});

test("VM: full-lock wheel angle rises ~6% at 10 m/s, blends at 22 m/s, unchanged at 60 m/s", async () => {
  const { createGame } = require("../../tools/lib/game-vm.cjs");
  const DT = 1 / 60;
  const g = await createGame({ track: "monaco", storage: { difficulty: "normal", autoThrottle: false } });
  await g.race("monaco", "day", "dry");
  const P = g.G.player, S = g.sandbox, track = g.G.track;
  for (const c of g.G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  S.Tracks.sample(track, 0, smp);
  const head0 = Math.atan2(smp.t[0], smp.t[2]);
  const pin = () => { P.px = smp.p[0]; P.pz = smp.p[2]; P.s = 0; P.x = 0; };
  const measure = (v) => {
    g.apex.jump(0, v, 0);
    P.vLat = 0; P.yawRateCur = 0; P.head = head0; pin();
    let last = 0;
    for (let i = 0; i < 45; i++) {
      g.apex.setInput({ steer: 1, throttle: P.speed < v - 0.2, brake: P.speed > v + 1.5 });
      g.step(1, DT); pin();
      last = P.steerAngle || 0;
    }
    return last;
  };
  const lock = g.G.STEER_MAX_SLIP;
  const ref = g.G.STEER_SPEED_REF;
  const vStd = (v) => g.G.vStd ? g.G.vStd(v) : v / Math.max(g.G.PACE || 1, 0.05);

  const d10 = measure(10);
  assert.ok(Math.abs(d10 - lock * LOW_PLATEAU) < 0.01,
    `10 m/s: got ${d10}, want ${lock * LOW_PLATEAU}`);
  assert.ok(d10 > lock * 1.05, `10 m/s must clear the old plateau of ${lock}`);

  // Mid-blend point: neither the plateau nor the raw taper.
  const d22 = measure(22);
  const expect22 = lock * blendTaper(vStd(Math.abs(P.speed)), ref);
  assert.ok(Math.abs(d22 - expect22) < 0.008, `22 m/s blend: got ${d22}, want ${expect22}`);
  assert.ok(d22 < lock * LOW_PLATEAU - 0.01 && d22 > lock * rawTaper(vStd(22), ref) + 0.01,
    `22 m/s must sit strictly between plateau and raw (${d22})`);

  const d60 = measure(60);
  const expect60 = lock * rawTaper(vStd(Math.abs(P.speed)), ref);
  assert.ok(Math.abs(d60 - expect60) < 0.008,
    `60 m/s must match pre-boost raw: got ${d60}, want ${expect60}`);
  g.close();
});
