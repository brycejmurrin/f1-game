// lockup-bench-vm — speed / pedal / brake-bias shape for render-only wheelLock.
//
// Run: node --test tests/unit/lockup-bench-vm.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { measureLockup } from "../../tools/check/lockup-bench.mjs";

function row(rows, wx, v, pedal, bias) {
  return rows.find((r) => r.weather === wx && r.v0_m_s === v && r.pedal === pedal && r.bias === bias);
}

test("dry lock-up depends on speed, forward bias and pedal — not a flat constant", async () => {
  const { rows } = await measureLockup();
  const dry55f = row(rows, "dry", 55, "digital", "bb60f");
  const dry55r = row(rows, "dry", 55, "digital", "bbRef");
  const dry20f = row(rows, "dry", 20, "digital", "bb60f");
  const dry55half = row(rows, "dry", 55, "pedal50", "bb60f");

  assert.ok(dry55f.peakWheelLock > 0.35, `high-speed forward bias should lock (${dry55f.peakWheelLock})`);
  assert.ok(dry55f.lockFramesGt025 > 20, "lock should persist briefly under a hard stop");
  assert.equal(dry55r.peakWheelLock, 0, `reference bias dry peak afF stays below onset (${dry55r.peakAfF})`);
  assert.ok(dry20f.peakWheelLock < 0.25, `low-speed forward bias stays mild (${dry20f.peakWheelLock})`);
  assert.equal(dry55half.peakWheelLock, 0, "half pedal must not lock at speed");
  assert.ok(dry55f.flatSpotDelta < 0.35, `flat spot grows but heals when lock ends (${dry55f.flatSpotDelta})`);
});

test("rain still locks more readily than dry (wet longitudinal budget)", async () => {
  const { rows } = await measureLockup();
  const rainRef = row(rows, "rain", 40, "digital", "bbRef");
  const dryRef = row(rows, "dry", 40, "digital", "bbRef");
  assert.ok(rainRef.peakWheelLock > dryRef.peakWheelLock + 0.4,
    `rain full brake locks harder than dry ref (${rainRef.peakWheelLock} vs ${dryRef.peakWheelLock})`);
});
