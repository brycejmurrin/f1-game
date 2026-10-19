// js-debugger-node.test.mjs fixture: a node:test file with one passing and one failing test.
import test from "node:test";
import assert from "node:assert/strict";
import { scale } from "./lib.fixture.cjs";
function add(a, b) {
  const sum = a + b;
  return sum;
}
test("adds", () => { for (let i = 0; i < 1500; i++) assert.equal(add(i, 1), i + 1); });
test("scales", () => { assert.equal(scale(3), 6); });
test("fails on purpose", () => { assert.equal(add(1, 1), 3); });
