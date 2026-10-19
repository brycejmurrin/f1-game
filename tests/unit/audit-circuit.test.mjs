// tools/track/audit-circuit.cjs — the float check's verdict is the COUNT against
// the baseline cap, not float-audit's exit code.
//
// float-audit exits 1 on ANY floating cluster, so `ok: r.status === 0 && n <= cap`
// could never pass for a circuit whose cap is non-zero: madrid, donington and
// mexico (cap 2, measured 2) printed `float:FAIL 2 unsupported floating
// cluster(s), cap 2` and the circuit's overall `ok:false` (hunt F10,
// 2026-10-10). A genuine tool failure (spawn error, usage exit 2, a crash with
// no JSON) must still fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeJob } from "../../tools/shot/shot-jobs.mjs";

const require = createRequire(import.meta.url);
const AC = require("../../tools/track/audit-circuit.cjs");
const GA = require("../../tools/track/ground-audit.cjs");

test("audit CLI rejects empty, inherited, missing and unknown check selections before execution", (t) => {
  t.mock.method(console, "error", () => {});
  for (const args of [
    ["monza", "--checks", ""], ["monza", "--checks", ", ,"],
    ["monza", "--checks", "toString"], ["monza", "--checks", "__proto__"],
    ["monza", "--checks"], ["monza", "--checks", "--json"],
    ["monza", "--cheks", "verify"], ["monza", "spa", "--checks", "verify"],
    ["--checks", "verify"],
  ]) assert.equal(AC.main(args), 2, JSON.stringify(args));
});

test("audit CLI runs the selected check with options before the circuit and equals syntax", (t) => {
  const ids = [], output = [];
  t.mock.method(AC.CHECKS, "verify", (id) => { ids.push(id); return { ok: true, ms: 0 }; });
  t.mock.method(console, "log", (line) => output.push(line));
  assert.equal(AC.main(["--checks=verify", "--json", "monza"]), 0);
  assert.deepEqual(ids, ["monza"]);
  const result = JSON.parse(output[0]);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.checks), ["verify"]);
});

test("float verdict: floaters equal to the cap pass despite float-audit exiting 1", () => {
  assert.equal(AC.floatOk({ status: 1, error: null }, 2, 2), true);
  assert.equal(AC.floatOk({ status: 1, error: null }, 1, 2), true);
  assert.equal(AC.floatOk({ status: 0, error: null }, 0, 0), true);
});

test("float verdict: over the cap, or no cap, still fails", () => {
  assert.equal(AC.floatOk({ status: 1, error: null }, 3, 2), false);
  assert.equal(AC.floatOk({ status: 1, error: null }, 1, 0), false, "a circuit missing from the baseline reads as cap 0");
});

test("float verdict: a real tool error fails whatever the count says", () => {
  assert.equal(AC.floatOk({ status: 2, error: null }, 0, 2), false, "usage exit");
  assert.equal(AC.floatOk({ status: null, error: "spawn ENOENT" }, 0, 2), false, "spawn error");
  assert.equal(AC.floatOk({ status: 1, error: null }, null, 2), false, "exit 1 with no JSON is a crash, not a floater count");
});

test("CHECKS.float on a real circuit: ok is exactly count <= cap", () => {
  // A circuit with a non-zero cap is the case the exit-code verdict got wrong.
  const caps = JSON.parse(fs.readFileSync(new URL("../../tools/track/float-baseline.json", import.meta.url), "utf8"));
  const id = caps.mexico > 0 ? "mexico" : Object.keys(caps).find((k) => caps[k] > 0);
  assert.ok(id, "float-baseline.json carries at least one non-zero cap");
  const res = AC.CHECKS.float(id);
  assert.notEqual(res.floating, null, "float-audit produced JSON");
  assert.equal(res.ok, res.floating <= res.cap, `${id}: ${res.summary}`);
});

test("CHECKS.ground: a missing baseline row is cap 0, matching ground-audit --gate", () => {
  // Hunt 2026-10-10: audit-circuit treated absent rows as "no cap" (always ok)
  // while ground-audit --gate reads cap 0 — hungaroring flatCoplanar 1 slipped.
  // Run the real check against a baseline with hungaroring's rows removed: the
  // circuit's real counts must then read as over a cap of 0.
  const BASE = "scenery-audit-baseline.json";
  const real = JSON.parse(fs.readFileSync(new URL(`../../tests/data/${BASE}`, import.meta.url), "utf8"));
  assert.ok(real.flatCoplanar?.hungaroring > 0, "fixture: hungaroring carries a non-zero flatCoplanar cap");
  const stub = {};
  for (const [k, rows] of Object.entries(real))
    stub[k] = rows && typeof rows === "object" ? Object.fromEntries(Object.entries(rows).filter(([id]) => id !== "hungaroring")) : rows;
  const orig = fs.readFileSync;
  fs.readFileSync = function patched(file, ...rest) {
    return String(file).endsWith(BASE) ? JSON.stringify(stub) : orig.call(this, file, ...rest);
  };
  let res;
  try { res = AC.CHECKS.ground("hungaroring"); } finally { fs.readFileSync = orig; }
  assert.equal(res.ok, false, `absent baseline row must fail, got: ${res.summary}`);
  assert.ok(res.over.some((o) => /^flatCoplanar [1-9]\d* > 0$/.test(o)), `over: ${res.over.join(", ")}`);
});

test("CHECKS.ground: retain footprint advisories without treating them as baseline failures", () => {
  const result = AC.CHECKS.ground("monaco");
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.advisory.footprintSupport));
  assert.equal(result.warnings, result.advisory.total);
  assert.equal(result.advisory.footprintSupport.length, Math.min(3, result.warnings));
  assert.equal(result.advisory.omitted, result.warnings - result.advisory.footprintSupport.length);
  assert.ok(result.advisory.footprintSupport.every((f) => !Object.hasOwn(f, "samples") && !Object.hasOwn(f, "shots")),
    "the health response carries compact examples; detailed sampling stays in the ground report");
  assert.match(result.advisory.detailCommand, /ground-audit\.cjs monaco --why --json/);
  assert.ok(result.warnings > 0, "this hillside has review warnings despite passing existing gates");
  assert.match(result.summary, new RegExp(`footprint warnings ${result.warnings}`));
  assert.ok(!Object.hasOwn(result.counts, "footprintSupport"));
});

test("footprint CLI: JSON remains parseable with source attribution, gates and review shot jobs", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const artifacts = path.join(root, "artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  const dir = fs.mkdtempSync(path.join(artifacts, "footprint-cli-"));
  try {
    const shots = path.join(dir, "shots.json");
    const stdout = execFileSync(process.execPath, [path.join(root, "tools/track/ground-audit.cjs"),
      "monaco", "--json", "--why", "--gate", "--shots", shots], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const [row] = JSON.parse(stdout);
    assert.equal(row.id, "monaco");
    assert.deepEqual(Object.keys(row.counts), GA.CHECKS, "advisories never enter ratcheted counts");
    assert.ok(row.advisory.footprintSupport.length > 0);
    assert.ok(row.advisory.footprintSupport.every((f) => f.source && f.source !== "?"));
    const { jobs } = JSON.parse(fs.readFileSync(shots, "utf8"));
    assert.equal(jobs.length, Math.min(3, row.advisory.footprintSupport.length) * 3);
    assert.ok(jobs.map((job) => normalizeJob(job, { ROOT: root })).every((job) => job.trackId === "monaco"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
