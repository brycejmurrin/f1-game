// @doc Contracts for deterministic geometry sweep shard packing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
  assert.equal(plan[1].seconds, 27.821, "an unmeasured suite is charged the documented fallback");
  assert.deepEqual(plan.flatMap((bin) => bin.files).sort(), ["known", "new"]);
});

test("rejects duplicate suites and invalid shard counts", () => {
  assert.throws(() => planSweepShards(["a", "a"]), /duplicate/);
  assert.throws(() => planSweepShards(["a"], { shards: 0 }), /invalid shard/);
});

test("LPT packing balances shards: the heaviest-minus-lightest spread stays within the largest single suite", () => {
  const plan = planSweepShards(files, { shards: 3, timings });
  const secs = plan.map((bin) => bin.seconds);
  assert.deepEqual(secs, [101, 100, 100], "100+1 | 90+10 | 80+20 — LPT, not a count split");
  assert.ok(Math.max(...secs) - Math.min(...secs) <= Math.max(...Object.values(timings)));
});

test("every measured timing key names a suite test:sweeps still runs", () => {
  const src = fs.readFileSync(new URL("../../tools/ci/sweep-shards.mjs", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("SWEEP_TIMINGS_SEC = Object.freeze({"), src.indexOf("});", src.indexOf("SWEEP_TIMINGS_SEC")));
  const keys = [...block.matchAll(/"(tests\/unit\/[^"]+)":/g)].map((m) => m[1]);
  assert.ok(keys.length > 10, "timing table parsed");
  const pkg = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const sweeps = pkg.scripts["test:sweeps"].match(/tests\/unit\/[^\s]+/g);
  const stale = keys.filter((k) => !sweeps.includes(k));
  assert.deepEqual(stale, [], "a timing key for a suite that left test:sweeps is dead weight");
});

test("the CLI prints one shard's files as JSON for --shard/--json", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["tools/ci/sweep-shards.mjs", "--shards", "4", "--shard", "1", "--json"], { cwd: new URL("../..", import.meta.url), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.shard, 1);
  assert.equal(out.shards, 4);
  assert.ok(out.files.length > 0 && out.files.every((f) => f.startsWith("tests/unit/")), r.stdout.slice(0, 300));
  assert.ok(out.seconds > 0);
});
