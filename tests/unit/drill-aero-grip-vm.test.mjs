/* drill-aero-grip-vm.test.mjs — the Aero Lab's "grip −N %" readout is the measured wake loss (#7040, #6559 step 5 A5).
 * Each tick of a flat-out Aero drill run in the real game VM, AeroDrill.gripLossPct(player) (the readout and the card's
 * peak) is within 1 % of 100·(1 − DirtyAir.mul(wake, speed, level, DOWNFORCE, vTop)), the multiplier game.js hands
 * player-forces; in Classic air and again after the card's RE-RUN IN CFD AIR (host.rerun("cfd"), A6).
 * The driver: tests/helpers/drill-drive-vm.mjs (the game's own host; no steering, as the Aero refs drive).
 *
 * Run: node --test tests/unit/drill-aero-grip-vm.test.mjs
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { drillDrive } from "../helpers/drill-drive-vm.mjs";

let run;
after(() => run?.close());

/** One flat-out run: the per-tick worst readout error, how many ticks the wake cost grip, and the result. */
function measure() {
  const { G, ev } = run;
  const DirtyAir = ev("PhysicsConsts.DirtyAir"), DOWNFORCE = ev("PhysicsConsts.DOWNFORCE"), AeroDrill = ev("AeroDrill");
  let worst = 0, lossy = 0, peak = 0, ticks = 0;
  const r = run.drive(() => ({ throttle: true, brake: false, steer: 0 }), {
    maxS: 50,
    onTick: () => {
      const p = G.player;
      if (G.state !== "race" || !Number.isFinite(p._dirtyAirMul)) return;
      const shown = AeroDrill.gripLossPct(p);
      const measured = 100 * (1 - DirtyAir.mul(p.wake || 0, p.speed, G.raceDirtyAir, DOWNFORCE, G.vTop()));
      worst = Math.max(worst, Math.abs(shown - measured));
      if (measured >= 1) lossy++;
      peak = Math.max(peak, shown);
      ticks++;
    },
  });
  return { r, worst, lossy, peak, ticks };
}

test("Classic air: the grip readout is the applied wake loss to ±1 % on every tick", async () => {
  run = await drillDrive("aero");
  assert.equal(run.G.raceDirtyAir, "classic");
  const m = measure();
  assert.ok(m.r, "the slipstream run finished");
  assert.ok(m.ticks > 60 && m.lossy > 30, `the run spent time in the wake: ${m.lossy} of ${m.ticks} ticks cost grip`);
  assert.ok(m.worst <= 1, `worst readout error ${m.worst.toFixed(3)} %`);
  const card = m.r.metrics.find(([k]) => k === "Grip lost (peak)");
  assert.ok(card, "the card shows the peak grip loss");
  assert.equal(+card[1], m.peak, "the card's peak is the readout's peak");
});

test("RE-RUN IN CFD AIR: the variant's level, and the readout still matches to ±1 %", () => {
  assert.ok(run, "the first test booted");
  assert.equal(run.rerun("cfd"), true);
  assert.equal(run.G.raceDirtyAir, "cfd");
  assert.equal(run.host.state().variant, "cfd");
  const m = measure();
  assert.ok(m.r, "the CFD run finished");
  assert.equal(m.r.variant, "cfd");
  assert.ok(m.ticks > 60 && m.lossy > 30, `the run spent time in the wake: ${m.lossy} of ${m.ticks} ticks cost grip`);
  assert.ok(m.worst <= 1, `worst readout error ${m.worst.toFixed(3)} %`);
});
