import assert from "node:assert/strict";
import test from "node:test";
import {
  compareCircuit,
  MAX_SHAPE_ERROR,
  validateMappings,
} from "../../tools/track/track-accuracy-validator.mjs";

const square = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];

test("validator accepts equivalent translated and scaled circuit shapes", () => {
  const result = compareCircuit(square, square.map(([x, y]) => [10 + x * 4, -3 + y * 4]));
  assert.equal(result.directionMatch, true);
  assert.ok(result.shapeError < 0.02);
});

test("validator rejects a reversed circuit fixture", () => {
  const result = compareCircuit(square, [...square].reverse());
  assert.equal(result.directionMatch, false);
});

test("validator rejects a materially distorted circuit fixture", () => {
  const distorted = [[0, 0], [1, 0], [4, 0.1], [0, 1], [0, 0]];
  const result = compareCircuit(square, distorted);
  assert.ok(result.shapeError > MAX_SHAPE_ERROR);
});

test("mapping validation reports every missing game and reference circuit", () => {
  const issues = validateMappings(
    { alpha: "ref-a", beta: "ref-b" },
    { alpha: { pts: square } },
    new Map([["ref-b", { geometry: { coordinates: square } }]]),
  );
  assert.deepEqual(issues, [
    'missing reference "ref-a" for game circuit "alpha"',
    'missing game circuit "beta" for reference "ref-b"',
  ]);
});
