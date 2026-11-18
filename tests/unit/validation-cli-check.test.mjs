// validation-cli-check.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/check: extract-module refuses bad ranges, bloat-scan reports a missing scope beside the scanned ones, and the ratchet preview is read-only.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { update, updateReceipt, DATA } from "../../tools/check/ratchets.mjs";
import { ROOT, cli, fixture } from "../helpers/validation-cli.mjs";

test("extraction rejects nonnumeric, reversed, oversized and empty ranges", (t) => {
  const dir = fixture(t), file = path.join(dir, "source.js");
  fs.writeFileSync(file, "function foo() { return external + offset; }\n\n");
  for (const range of [["x", "1"], ["2", "1"], ["1", "100"], ["1.5", "2"], ["2", "2"]]) {
    const result = cli("tools/check/extract-module.mjs", [file, ...range]);
    assert.equal(result.status, 1, `${range}: ${result.stdout} ${result.stderr}`);
    assert.match(result.stderr, /range|no source/);
  }
  const valid = cli("tools/check/extract-module.mjs", [file, "1", "1"]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, "external×1 offset×1\n");
});

test("bloat scan reports missing explicit scopes alongside successfully scanned files", (t) => {
  const missing = "definitely-no-validation-cli-scope";
  const result = cli("tools/check/bloat-scan.mjs", ["--json", "tools/check/extract-module.mjs", missing]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.deepEqual(report.coverage.missing, [missing]);
  assert.ok(report.coverage.scanned.includes("tools/check/extract-module.mjs"));
  const empty = fixture(t);
  const emptyResult = cli("tools/check/bloat-scan.mjs", ["--json", empty]);
  assert.equal(emptyResult.status, 1);
  assert.equal(JSON.parse(emptyResult.stdout).coverage.emptyScopes.length, 1);
  const absolute = cli("tools/check/bloat-scan.mjs", ["--json", path.join(ROOT, "tools/check/extract-module.mjs")]);
  assert.equal(absolute.status, 0, absolute.stderr);
  assert.ok(JSON.parse(absolute.stdout).coverage.scanned.includes("tools/check/extract-module.mjs"));
});

test("ratchet preview is read-only, lower-only receipt exposes skipped raises", async () => {
  const before = fs.readFileSync(DATA);
  const data = { files: { "tools/check/extract-module.mjs": { lines: 1 } }, tree: {} };
  const rows = await update(data, { dryRun: true });
  assert.deepEqual(fs.readFileSync(DATA), before);
  assert.equal(data.files["tools/check/extract-module.mjs"].lines, 1);
  const receipt = updateReceipt([...rows, { file: "smaller", metric: "lines", ceiling: 9, value: 2 }], { lowerOnly: true });
  assert.equal(receipt.skippedRaises.length, 1);
  assert.deepEqual(receipt.changes.map((r) => r.file), ["smaller"]);
});
