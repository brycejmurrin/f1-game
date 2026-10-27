// #3673: the first-race census's pure half — flag parsing and the post-lights grouping a pre-mint reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, latePipelines } from "../../tools/perf/first-race-census.mjs";

test("parseArgs: defaults to a Lavapipe monza lap and refuses unknown flags", () => {
  const o = parseArgs([]);
  assert.equal(o.track, "monza"); assert.equal(o.lavapipe, true); assert.equal(o.lap, 100);
  assert.deepEqual(parseArgs(["--ls", "apex26.a=1 apex26.b=x", "--no-lavapipe"]).ls, [["apex26.a", "1"], ["apex26.b", "x"]]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown flag/);
});

test("latePipelines: only post-lights builds, grouped by key, object, winding, layout and target", () => {
  const p = (at, state, extra) => ({ at, state, key: "t,0.9|na", mat: "MeshStandardNodeMaterial:", obj: "Mesh:", sx: 1, attrs: "normal,position", rt: "canvas", ...extra });
  const pipes = [p(10, "count"), p(20, "race"), p(30, "race"), p(40, "race", { sx: -1 }), p(50, "race", { obj: "InstancedMesh::inst" }), p(60, null)];
  const { late, groups } = latePipelines(pipes, 15);
  assert.equal(late.length, 5);   // the count-state build is pre-lights; the null-state one after lightsAt counts
  assert.deepEqual(groups.map((g) => g.n), [3, 1, 1]);
  assert.equal(latePipelines([p(5, "count")], null).late.length, 0);
});
