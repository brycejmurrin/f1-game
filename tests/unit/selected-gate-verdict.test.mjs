// selected-gate-verdict — cancel/red with clean junit is infra-retry, not a hard fail.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectedGateVerdict } from "../../tools/ci/selected-gate-verdict.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = {
  select: "success",
  selected: "success",
  guards: "success",
  dropped: "0",
  called: "false",
  draft: "false",
  failedSpecs: [],
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
