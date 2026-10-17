// @doc Contracts for deterministic geometry sweep shard packing.
import test from "node:test";
import assert from "node:assert/strict";
import { planSweepShards } from "../../tools/ci/sweep-shards.mjs";

const files = ["a", "b", "c", "d", "e", "f"];
const timings = { a: 100, b: 90, c: 80, d: 20, e: 10, f: 1 };

test("packs every suite exactly once and keeps the result deterministic", () => {
  const first = planSweepShards(files, { shards: 3, timings });
  const second = planSweepShards(files, { shards: 3, timings });
  assert.deepEqual(first, second);
  assert.deepEqual(first.flatMap((bin) => bin.files).sort(), files.slice().sort());
  assert.equal(new Set(first.flatMap((bin) => bin.files)).size, files.length);
});

test("unknown suites use a bounded fallback weight", () => {
  const plan = planSweepShards(["known", "new"], { shards: 2, timings: { known: 100 } });
  assert.equal(plan[0].seconds, 100);
  assert.ok(plan[1].seconds > 0);
  assert.deepEqual(plan.flatMap((bin) => bin.files).sort(), ["known", "new"]);
});

test("rejects duplicate suites and invalid shard counts", () => {
  assert.throws(() => planSweepShards(["a", "a"]), /duplicate/);
  assert.throws(() => planSweepShards(["a"], { shards: 0 }), /invalid shard/);
});
