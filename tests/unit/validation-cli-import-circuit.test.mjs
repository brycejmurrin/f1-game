// validation-cli-import-circuit.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/track/import-circuit-path.mjs: imports without fetching, validates options first, and does not claim success without coverage.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-import-circuit.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { project, meanError, main as importMain } from "../../tools/track/import-circuit-path.mjs";
import { cli, fixture } from "../helpers/validation-cli.mjs";

test("importer imports without fetching, and help/invalid options are validated before fetching", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error("fetch forbidden"); };
  try {
    assert.equal(await importMain(["--help"]), 0);
    for (const args of [["--unknown", "monza:it-1922"], ["--source"], ["--self-check", "fuji"], ["not-a-pair"], []])
      await assert.rejects(importMain(args), /Unknown|requires|Unsupported|Expected|Pass/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
  assert.throws(() => project([]), /coordinates/);
  assert.throws(() => project([[1, 2], [NaN, 3], [4, 5]]), /coordinates/);
});

test("self-check error ignores a constant shift and a differing vertex count", () => {
  const ring = [[0, 0], [100, 0], [200, 50], [200, 150], [100, 200], [0, 150]];
  const shifted = ring.map(([x, z]) => [x, z - 3.5]);
  assert.ok(meanError(ring, shifted).err < 0.01);
  // a hand-added vertex on an edge is the same polyline, so it stays inside the 2 m bar
  const extra = [...ring.slice(0, 2), [150, 25], ...ring.slice(2)];
  assert.ok(meanError(ring, extra).err < 0.01);
  // a real deviation still reads
  const moved = ring.map(([x, z], i) => (i === 3 ? [x + 60, z] : [x, z]));
  assert.ok(meanError(ring, moved).err > 5);
});

test("importer does not claim success when source has no requested circuit coverage", (t) => {
  const dir = fixture(t), source = path.join(dir, "empty.geojson");
  fs.writeFileSync(source, JSON.stringify({ type: "FeatureCollection", features: [] }));
  const result = cli("tools/track/import-circuit-path.mjs", ["--source", source, "--self-check", "monza", "--json"]);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.requested, 1);
  assert.equal(report.checked, 0);
  assert.equal(report.skipped.length, 1);
});
