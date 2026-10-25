// tooling-timings — CI-measured per-file durations for the tooling-fast shard packer (tools/ci/tooling-timings.mjs).
//
// Pure fixtures, no network: the PASS-line parser, the median fold that keeps
// old entries and drops files no longer listed, the shard-wall predictor, and
// one pass over the committed table (the shards still partition the list;
// docs/notes/BUILD-HUNT-2026-10-24.md B1).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseDurations, median, foldTable, predictShards } from "../../tools/ci/tooling-timings.mjs";
import { TOOLING_FAST_FILES, TIMINGS_FILE, CI_SHARDS, applyFileShard } from "../../tools/ci/tooling-fast.mjs";

const LOG = [
  "2026-10-24T01:36:39.8806444Z [tooling-fast] PASS  1/285 fx-a duration=158ms exit=0 loadavg=1.96 0.62 0.22",
  "2026-10-24T01:36:42.3716189Z [tooling-fast] PASS  3/285 fx-b duration=2.6s exit=0 loadavg=1.96 0.62 0.22",
  "2026-10-24T01:36:43.0000000Z [tooling-fast] FAIL  4/285 fx-c duration=9.0s exit=1 loadavg=1.96 0.62 0.22",
  "2026-10-24T01:36:41.7286472Z [tooling-fast] START 13/285 fx-d at=2026-10-24T01:36:41.725Z",
].join("\n");

test("parseDurations reads PASS lines in ms and s, and ignores FAIL and START", () => {
  assert.deepEqual(parseDurations(LOG), { "fx-a": [158], "fx-b": [2600] });
  const acc = parseDurations(LOG);
  parseDurations(LOG, acc);
  assert.deepEqual(acc["fx-b"], [2600, 2600]);
});

test("median of odd, even and empty samples", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("foldTable takes the CI median, keeps an unsampled old entry, drops unlisted files", () => {
  const files = ["fx-a", "fx-b", "fx-keep"];
  const out = foldTable(
    { "fx-a": [100, 300, 204], "fx-gone": [50] },
    { "fx-keep": 777, "fx-a": 9999, "fx-gone": 1 },
    files,
  );
  assert.deepEqual(out, { "fx-a": 200, "fx-keep": 780 });
});

test("predictShards: a measured table balances what an empty one cannot", () => {
  const files = ["f1", "f2", "f3", "f4", "f5", "f6"];
  const truth = { f1: 600, f2: 500, f3: 400, f4: 300, f5: 200, f6: 100 };
  const balanced = predictShards(truth, truth, { files, shards: 2, jobs: 1 });
  assert.deepEqual(balanced, [1100, 1000]);   // LPT: 600+300+200 | 500+400+100
  const blind = predictShards({}, truth, { files, shards: 2, jobs: 1 });
  assert.deepEqual(blind, [1200, 900]);       // stride: f1+f3+f5 | f2+f4+f6
});

test("the committed table keeps the CI shards a partition of the list", () => {
  // The table only moves files between shards; it can never drop or double one.
  // How many files it measures is printed by tooling-fast's `order=` line, not gated:
  // new test files land unmeasured and must not red unrelated PRs.
  const ms = JSON.parse(fs.readFileSync(TIMINGS_FILE, "utf8")).ms;
  assert.equal(CI_SHARDS, 4, "ci.yml guards-a..d");
  const union = Array.from({ length: CI_SHARDS }, (_, i) => applyFileShard(TOOLING_FAST_FILES, `${i + 1}/${CI_SHARDS}`, ms)).flat();
  assert.equal(union.length, TOOLING_FAST_FILES.length);
  assert.equal(new Set(union).size, TOOLING_FAST_FILES.length);
});
