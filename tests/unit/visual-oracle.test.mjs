import test from "node:test";
import assert from "node:assert/strict";
import { frameContent, frameDelta } from "../helpers/visual-oracle.js";
const frame = (fn) => Array.from({ length: 64 }, (_, i) => fn(i)).flatMap((v) => [v, v, v, 255]);
test("visual content rejects black, white and transparent solid frames", () => {
  for (const v of [0, 255]) assert.equal(frameContent(frame(() => v)).nonblank, false);
  assert.equal(frameContent(frame((i) => i * 4).map((v, i) => i % 4 === 3 ? 0 : v)).nonblank, false);
  assert.equal(frameContent(frame((i) => i * 4)).nonblank, true);
});
test("motion oracle rejects frozen frames and dimension mismatch", () => {
  const a = frame((i) => i * 3), b = frame((i) => 255 - i * 3);
  assert.equal(frameDelta(a, a), 0);
  assert.ok(frameDelta(a, b) > 1);
  assert.throws(() => frameDelta(a, []), /dimensions/);
});
