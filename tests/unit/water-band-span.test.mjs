/* water-band-span.test.mjs — waterBand lap-fraction → node span uses the same
 * sign-safe wrap as scanBarrier/indexSolid (build-props.js). A negative s0 must
 * not turn a ~0.1-lap band into a near-full-lap raster. Pure math pin, no browser.
 * Run: node --test tests/unit/water-band-span.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

function waterBandSpan(s0, s1, n) {
  const k0 = ((Math.round(s0 * n) % n) + n) % n, k1 = ((Math.round(s1 * n) % n) + n) % n;
  const span = Math.abs(s1 - s0) >= 1 - 1e-9 ? n - 1 : ((k1 - k0) + n) % n;
  return { k0, k1, span };
}

test("negative s0 maps to a short band, not most of the lap", () => {
  const n = 1000;
  const s0 = -0.02, s1 = 0.04;
  const { span, k0, k1 } = waterBandSpan(s0, s1, n);
  assert.ok(k0 >= 0 && k0 < n, "k0 is a valid node index");
  assert.ok(k1 >= 0 && k1 < n, "k1 is a valid node index");
  assert.ok(span <= Math.round((s1 - s0) * n) + 2, "span matches the authored window");
  assert.equal(span, 60, "sixty nodes for a 0.06-lap band at ds ≈ lap/1000");
  const k0Legacy = Math.round(s0 * n) % n;
  assert.ok(k0Legacy < 0, "legacy k0 was negative (lossy %)");
  assert.equal(k0, 980, "wrapped start sits near the lap end, not node −20");
  assert.equal(k1, 40);
});

test("singapore-style s ± 0.03 stays a six-node window at n=1000", () => {
  const n = 1000;
  const s = 0.02;
  const { span } = waterBandSpan(s - 0.03, s + 0.03, n);
  assert.equal(span, 60);
});
