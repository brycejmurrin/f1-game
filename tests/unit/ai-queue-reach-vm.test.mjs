/* ai-queue-reach-vm.test.mjs — #2565: an AI did not brake for a stationary car in its lane
 * until ~10 m. The queue/brake block was gated by qWin = max(16, followR + 6 + bonus), with no
 * closing-speed term. AiDrive.queueReach widens it to the braking distance of the closing rate;
 * the unit tests pin that it equals the old window when nothing is being caught (traffic is
 * unchanged), the VM test parks the player on monza and releases one AI far behind.
 * Run: node --test tests/unit/ai-queue-reach-vm.test.mjs */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const BRAKE = 22, LCAR = 4.8;
const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
vm.runInContext("var Log={dbg(){},info(){},warn(){},err(){},error(){},ok(){}};", ctx);
vm.runInContext(readFileSync(new URL("../../js/core/mat4.js", import.meta.url), "utf8"), ctx);
vm.runInContext(readFileSync(new URL("../../js/physics/ai-drive.js", import.meta.url), "utf8"), ctx);
const A = vm.runInContext("AiDrive", ctx);

test("queueReach equals the base window when nothing is being caught (traffic unchanged)", () => {
  for (const base of [16, 22, 34]) {
    for (const [v, bv] of [[40, 40], [40, 50], [30, 0 + 30], [43, 40.5], [0, 0], [20, 17.1]])
      assert.equal(A.queueReach(base, v, bv, BRAKE, 1), base, `base ${base} v ${v} bv ${bv}`);
  }
  assert.equal(A.queueReach(16, 40, 0, 0, 1), 16, "no brake reference: base");
  // pack-racing closing rates stay inside the base window: 12 m/s closing needs only ~11 m
  assert.equal(A.queueReach(16, 62, 50, BRAKE, 1), 16);
});

test("queueReach grows with closing speed and never drops below the base", () => {
  const r42 = A.queueReach(16, 42, 0, BRAKE, 1), r54 = A.queueReach(16, 54, 0, BRAKE, 1);
  assert.ok(r42 >= 42 * 42 / (2 * BRAKE), `reach ${r42} covers the full-brake stopping distance`);
  assert.ok(r54 > r42 && r42 > 34);
  assert.ok(A.queueReach(80, 42, 0, BRAKE, 1) >= 80, "a wider base is kept");
});

test("the closing-rate floor rides the pace scale", () => {
  // a 3 m/s excess at pace-5 scale is 1.5 m/s at half scale: still 'not catching'
  assert.equal(A.queueReach(16, 1.4, 0, BRAKE, 0.5), 16);
  assert.ok(A.queueReach(16, 21, 0, BRAKE, 0.5) > 16);
});

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("an AI closing on a parked player brakes from its stopping distance, with no contact", async () => {
  const P = g.apex;
  await g.race("monza");
  P.jump(0.1, 40, 0);
  P.headless(true);
  P.reset(0.3, 0, 0);
  const idx = P.rival(-300, 0).rival;
  let v0 = 0, onset = null, minGap = Infinity, contactV = 0;
  for (let i = 0; i < 60 * 14; i++) {
    P.act({ steer: 0, throttle: false, brake: true }, 1 / 60, 1);
    const cars = P.cars(), p = cars.find((c) => c.p), c = cars[idx];
    const gap = p.prog - c.prog - LCAR;
    if (gap > 0 && c.speed > v0) v0 = c.speed;
    if (onset == null && v0 > 30 && gap > 0 && c.speed < v0 - 1.5) onset = { gap, v: v0 };
    if (gap < minGap) { minGap = gap; contactV = c.speed; }
  }
  P.headless(false);
  assert.ok(v0 > 30, `the AI reached race speed (${v0.toFixed(1)} m/s)`);
  assert.ok(onset, "the AI braked at all");
  assert.ok(onset.gap >= onset.v * onset.v / (2 * BRAKE), `braking began at ${onset.gap.toFixed(1)} m, ` +
    `stopping from ${onset.v.toFixed(1)} m/s needs ${(onset.v * onset.v / (2 * BRAKE)).toFixed(1)} m`);
  assert.ok(minGap > 0 || contactV < 5, `no hard contact: min gap ${minGap.toFixed(2)} m at ${contactV.toFixed(1)} m/s`);
});
