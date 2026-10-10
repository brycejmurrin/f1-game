// selected-gate-verdict — cancel/red with clean junit is infra-retry, not a hard fail.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectedGateVerdict, shardEvidence } from "../../tools/ci/selected-gate-verdict.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = {
  select: "success",
  selected: "success",
  guards: "success",
  dropped: "0",
  called: "false",
  draft: "false",
  failedSpecs: [],
  // Every shard that reached its run step left a junit with testcases.
  evidence: { started: ["a-1"], junit: ["a-1"] },
};

test("success and skipped plans pass", () => {
  assert.equal(selectedGateVerdict(base).ok, true);
  assert.match(selectedGateVerdict(base).reason, /selected specs passed/);
  const empty = selectedGateVerdict({ ...base, selected: "skipped" });
  assert.equal(empty.ok, true);
  assert.match(empty.reason, /empty plan is a pass/);
});

test("cancelled with clean junit is infra-retry (not a fail) — run 37493213168", () => {
  const v = selectedGateVerdict({ ...base, selected: "cancelled", failedSpecs: [] });
  assert.equal(v.ok, true);
  assert.equal(v.infraRetry, true);
  assert.match(v.reason, /infra-retry/);
});

test("failure with clean junit is infra-retry (setup/cap noise, no assertion red)", () => {
  const v = selectedGateVerdict({ ...base, selected: "failure", failedSpecs: [] });
  assert.equal(v.ok, true);
  assert.equal(v.infraRetry, true);
});

test("cancelled with junit failures stays a hard fail", () => {
  const v = selectedGateVerdict({
    ...base,
    selected: "cancelled",
    failedSpecs: ["tests/specs/image-grade-visual.spec.js"],
  });
  assert.equal(v.ok, false);
  assert.equal(v.infraRetry, false);
  assert.match(v.reason, /image-grade-visual/);
});

test("dropped routed specs still red off the train, even when selected succeeded", () => {
  const v = selectedGateVerdict({ ...base, dropped: "3" });
  assert.equal(v.ok, false);
  assert.match(v.reason, /dropped 3/);
});

test("train call warns on dropped instead of failing", () => {
  const v = selectedGateVerdict({ ...base, dropped: "2", called: "true" });
  assert.equal(v.ok, true);
  assert.match(v.warn, /dropped 2/);
});

test("guards or select red fails closed", () => {
  assert.equal(selectedGateVerdict({ ...base, guards: "failure" }).ok, false);
  assert.equal(selectedGateVerdict({ ...base, select: "failure" }).ok, false);
});

test("CLI: cancelled + staged clean junit exits 0 with infra-retry notice", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sel-gate-"));
  const slot = path.join(dir, "test-results-1");
  fs.mkdirSync(slot);
  fs.writeFileSync(path.join(slot, "junit.xml"),
    `<?xml version="1.0"?><testsuites><testsuite><testcase classname="specs/ok.spec.js" name="a"/></testsuite></testsuites>`);
  const out = execFileSync("node", ["tools/ci/selected-gate-verdict.mjs", "--junit-root", dir], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      SELECT: "success",
      SELECTED: "cancelled",
      GUARDS: "success",
      DROPPED: "0",
      CALLED: "false",
      DRAFT: "false",
    },
  });
  assert.match(out, /infra-retry/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI: cancelled + junit failure exits 1", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sel-gate-"));
  const slot = path.join(dir, "test-results-1");
  fs.mkdirSync(slot);
  fs.writeFileSync(path.join(slot, "junit.xml"),
    `<?xml version="1.0"?><testsuites><testsuite>` +
    `<testcase classname="specs/bad.spec.js" name="x"><failure message="boom">err</failure></testcase>` +
    `</testsuite></testsuites>`);
  let status = 0;
  try {
    execFileSync("node", ["tools/ci/selected-gate-verdict.mjs", "--junit-root", dir], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        SELECT: "success",
        SELECTED: "cancelled",
        GUARDS: "success",
        DROPPED: "0",
        CALLED: "false",
        DRAFT: "false",
      },
    });
  } catch (e) {
    status = e.status;
  }
  assert.equal(status, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 15-F2 (2026-10-10): "no failures read" from NO junit used to pass as infra-retry.
test("15-F2: a shard that reached the run step and left no junit is a red, not infra-retry", () => {
  for (const selected of ["cancelled", "failure"]) {
    const v = selectedGateVerdict({ ...base, selected, evidence: { started: ["a-1", "b-2"], junit: ["a-1"] } });
    assert.equal(v.ok, false, selected);
    assert.equal(v.infraRetry, false);
    assert.match(v.reason, /b-2/);
    assert.match(v.reason, /left no junit/);
  }
});

test("15-F2: a shard that never reached the run step (checkout/install died) stays infra noise", () => {
  const v = selectedGateVerdict({ ...base, selected: "failure", evidence: { started: ["a-1"], junit: ["a-1"] } });
  assert.equal(v.ok, true);
  assert.equal(v.infraRetry, true);
  // b-2 died before the marker: not in `started`, so not in the red set.
  const w = selectedGateVerdict({ ...base, selected: "cancelled", evidence: { started: [], junit: [] } });
  assert.equal(w.ok, true);
});

test("15-F2: unreadable evidence or a failed artifact download cannot be read as clean", () => {
  const none = selectedGateVerdict({ ...base, selected: "cancelled", evidence: undefined });
  assert.equal(none.ok, false);
  const dl = selectedGateVerdict({ ...base, selected: "cancelled", evidence: { started: [], junit: [], downloadFailed: true } });
  assert.equal(dl.ok, false);
  assert.match(dl.reason, /download failed/);
});

test("15-F2: shardEvidence counts only junit with testcases, per shard folder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sel-ev-"));
  const j = path.join(dir, "junit-in"), st = path.join(dir, "started-in");
  fs.mkdirSync(path.join(j, "spec-timings-junit-selected-a-1", "test-results-1"), { recursive: true });
  fs.writeFileSync(path.join(j, "spec-timings-junit-selected-a-1", "test-results-1", "junit.xml"),
    `<testsuites><testsuite><testcase classname="specs/x.spec.js" name="t"/></testsuite></testsuites>`);
  fs.mkdirSync(path.join(j, "spec-timings-junit-selected-b-2"), { recursive: true });
  fs.writeFileSync(path.join(j, "spec-timings-junit-selected-b-2", "junit.xml"), `<testsuites></testsuites>`);
  fs.mkdirSync(path.join(st, "selected-started-a-1"), { recursive: true });
  fs.mkdirSync(path.join(st, "selected-started-b-2"), { recursive: true });
  const ev = shardEvidence(j, st);
  assert.deepEqual(ev.started.sort(), ["a-1", "b-2"]);
  assert.deepEqual(ev.junit, ["a-1"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("15-F2 CLI: cancelled + a started shard with an empty junit exits 1; a classname-less failure exits 1", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sel-gate-"));
  fs.mkdirSync(path.join(dir, "started-in", "selected-started-a-1"), { recursive: true });
  fs.mkdirSync(path.join(dir, "junit-in"), { recursive: true });
  const run = (extra = []) => {
    try {
      return { status: 0, out: execFileSync("node", ["tools/ci/selected-gate-verdict.mjs", "--junit-in", path.join(dir, "junit-in"),
        "--started-in", path.join(dir, "started-in"), ...extra], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, SELECT: "success", SELECTED: "cancelled", GUARDS: "success", DROPPED: "0", CALLED: "false", DRAFT: "false", DOWNLOAD_FAILED: "false" } }) };
    } catch (e) { return { status: e.status, out: String(e.stderr) + String(e.stdout) }; }
  };
  const r = run();
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /a-1/);
  // A failure with NO classname (a load / setup error) is counted, not skipped.
  const slot = path.join(dir, "carry", "test-results-1");
  fs.mkdirSync(slot, { recursive: true });
  fs.writeFileSync(path.join(slot, "junit.xml"),
    `<testsuites><testsuite><testcase name="spec failed to load"><failure message="x">boom</failure></testcase></testsuite></testsuites>`);
  const q = run(["--junit-root", path.join(dir, "carry")]);
  assert.equal(q.status, 1, q.out);
  assert.match(q.out, /\(no spec\) spec failed to load/);
  fs.rmSync(dir, { recursive: true, force: true });
});
