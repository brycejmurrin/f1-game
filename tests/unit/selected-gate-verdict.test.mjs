// selected-gate-verdict — cancel/red stays red even with clean sibling junit.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";
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
  // A draft runs the selected legs on a 5-min budget (2026-11-03): an empty plan is the same pass there,
  // and a dropped spec is a warning, not a red (the ready run or remote-group.mjs runs it).
  for (const dropped of ["0", "2"]) {
    const draft = selectedGateVerdict({ ...base, selected: "skipped", draft: "true", dropped });
    assert.equal(draft.ok, true);
    assert.match(draft.reason, dropped === "0" ? /empty plan is a pass/ : /the plan had no jobs/);
    assert.equal(draft.infraRetry, false);
    assert.equal(Boolean(draft.warn), dropped !== "0");
    if (dropped !== "0") assert.match(draft.warn, /draft plan \(5-min budget\) dropped 2 routed spec/);
  }
});

test("cancelled with clean junit requires a rerun", () => {
  const v = selectedGateVerdict({ ...base, selected: "cancelled", failedSpecs: [] });
  assert.equal(v.ok, false);
  assert.equal(v.infraRetry, false);
  assert.equal(selectedGateVerdict({ ...base, selected: "cancelled", draft: "true", dropped: "2" }).ok, false);
  assert.match(v.reason, /re-run/);
});

test("failure with clean junit requires a rerun", () => {
  const v = selectedGateVerdict({ ...base, selected: "failure", failedSpecs: [] });
  assert.equal(v.ok, false);
  assert.equal(v.infraRetry, false);
  assert.equal(selectedGateVerdict({ ...base, selected: "failure", draft: "true", dropped: "2" }).ok, false);
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
  const draft = selectedGateVerdict({ ...base, dropped: "2", draft: "true" });
  assert.equal(draft.ok, true, "a draft's 5-min plan warns on a dropped spec; the ready run reds on it");
  assert.match(draft.warn, /dropped 2 routed spec/);
  assert.equal(selectedGateVerdict({ ...base, selected: "skipped", dropped: "2" }).ok, false);
});

test("train call warns on dropped instead of failing", () => {
  const v = selectedGateVerdict({ ...base, dropped: "2", called: "true" });
  assert.equal(v.ok, true);
  assert.match(v.warn, /dropped 2/);
});

test("a red select fails closed", () => {
  assert.equal(selectedGateVerdict({ ...base, select: "failure" }).ok, false);
  assert.equal(selectedGateVerdict({ ...base, select: "failure", selected: "skipped", draft: "true", dropped: "2" }).ok, false);
});

test("a red guards is not repeated here, and never hides a spec failure (2026-10-16)", () => {
  // The guards check and CI (ci-verdict needs guards) carry that red once.
  const green = selectedGateVerdict({ ...base, guards: "failure" });
  assert.equal(green.ok, true, "specs passed: this check says so, guards reports its own red");
  assert.match(green.reason, /Structural guards failure: reported by that check, which keeps CI red/);
  assert.equal(selectedGateVerdict({ ...base, guards: "cancelled" }).ok, true);
  // ...but every spec-side red still wins while guards is red.
  assert.equal(selectedGateVerdict({ ...base, guards: "failure", select: "failure" }).ok, false);
  assert.equal(selectedGateVerdict({ ...base, guards: "failure", dropped: "2" }).ok, false);
  assert.equal(selectedGateVerdict({ ...base, guards: "failure", selected: "failure", failedSpecs: ["tests/specs/smoke.spec.js"] }).ok, false);
  assert.equal(selectedGateVerdict({ ...base, guards: "failure", selected: "failure",
    evidence: { started: [], junit: [], downloadFailed: false } }).ok, false, "a failed matrix with no proof every leg ran stays red");
});

test("CLI: cancelled + staged clean junit fails closed despite clean sibling junit", () => {
  const dir = mkTmpDir("sel-gate-");
  const slot = path.join(dir, "test-results-1");
  fs.mkdirSync(slot);
  fs.writeFileSync(path.join(slot, "junit.xml"),
    `<?xml version="1.0"?><testsuites><testsuite><testcase classname="specs/ok.spec.js" name="a"/></testsuite></testsuites>`);
  assert.throws(() => execFileSync("node", ["tools/ci/selected-gate-verdict.mjs", "--junit-root", dir], {
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
  }), (e) => e.status === 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI: cancelled + junit failure exits 1", () => {
  const dir = mkTmpDir("sel-gate-");
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

test("15-F2: a shard that never reached the run step (checkout/install died) fails closed", () => {
  const v = selectedGateVerdict({ ...base, selected: "failure", evidence: { started: ["a-1"], junit: ["a-1"] } });
  assert.equal(v.ok, false);
  assert.equal(v.infraRetry, false);
  // b-2 died before its marker: available sibling evidence cannot clear it.
  const w = selectedGateVerdict({ ...base, selected: "cancelled", evidence: { started: [], junit: [] } });
  assert.equal(w.ok, false);
});

test("15-F2: unreadable evidence or a failed artifact download cannot be read as clean", () => {
  const none = selectedGateVerdict({ ...base, selected: "cancelled", evidence: undefined });
  assert.equal(none.ok, false);
  const dl = selectedGateVerdict({ ...base, selected: "cancelled", evidence: { started: [], junit: [], downloadFailed: true } });
  assert.equal(dl.ok, false);
  assert.match(dl.reason, /download failed/);
});

test("15-F2: shardEvidence counts only junit with testcases, per shard folder", () => {
  const dir = mkTmpDir("sel-ev-");
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

test("one matched artifact is extracted flat: started-in/marker.txt names the shard, a flat junit tree is its junit (#5282)", () => {
  const dir = mkTmpDir("sel-flat-");
  const j = path.join(dir, "junit-in"), st = path.join(dir, "started-in");
  fs.mkdirSync(path.join(j, "test-results-36127"), { recursive: true });
  fs.mkdirSync(st, { recursive: true });
  fs.writeFileSync(path.join(st, "marker.txt"), "oversize-bryce-phone-paint\n");
  fs.writeFileSync(path.join(j, "test-results-36127", "junit.xml"),
    `<testsuites><testsuite><testcase classname="specs/bryce-phone-paint.spec.js" name="t"/></testsuite></testsuites>`);
  const ev = shardEvidence(j, st);
  assert.deepEqual(ev, { started: ["oversize-bryce-phone-paint"], junit: ["oversize-bryce-phone-paint"] });
  const green = selectedGateVerdict({ select: "success", selected: "success", guards: "success", evidence: ev });
  assert.equal(green.ok, true, green.reason);
  // The same flat shard with no testcase is still a dead shard, not a pass.
  fs.writeFileSync(path.join(j, "test-results-36127", "junit.xml"), `<testsuites></testsuites>`);
  const dead = selectedGateVerdict({ select: "success", selected: "success", guards: "success", evidence: shardEvidence(j, st) });
  assert.equal(dead.ok, false);
  assert.match(dead.reason, /oversize-bryce-phone-paint reached the run step and left no junit/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("15-F2 CLI: cancelled + a started shard with an empty junit exits 1; a classname-less failure exits 1", () => {
  const dir = mkTmpDir("sel-gate-");
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

test("CI selection reporter annotates unreadable specs and counts them as dropped", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/ci-select-specs-step.sh"), "utf8");
  const report = src.slice(src.lastIndexOf("node -e '") + "node -e '".length, src.lastIndexOf("'"));
  const dir = mkTmpDir("sel-report-");
  const brokenSpec = ["tests", "specs", "broken.spec.js"].join("/");
  try {
    fs.writeFileSync(path.join(dir, "sel.json"), JSON.stringify({ reason: "helper", selected: [], groups: [], tracked: [], overBudgetSpecs: [], coveredByFixedGates: [], skipped: [], unreadable: [{ file: brokenSpec, tests: null }] }));
    const output = path.join(dir, "output");
    const text = execFileSync(process.execPath, ["-e", report], { cwd: dir, env: { ...process.env, GITHUB_OUTPUT: output }, encoding: "utf8" });
    assert.match(text, /::error::DROPPED .*unreadable.*tests\/specs\/broken.spec.js/);
    assert.match(fs.readFileSync(output, "utf8"), /dropped=1/);
    assert.equal(selectedGateVerdict({ ...base, dropped: "1" }).ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an unreadable DROPPED count fails closed with an honest message (#4481)", () => {
  const seen = [];
  for (const dropped of ["", "?", "2"]) {
    const v = selectedGateVerdict({ ...base, selected: "success", dropped });
    seen.push([v.ok, v.reason.indexOf("unreadable") > 0, v.reason.indexOf("dropped 2 routed spec") > 0]);
  }
  const draft = selectedGateVerdict({ ...base, selected: "skipped", draft: "true", dropped: "" });
  seen.push([draft.ok, draft.warn.indexOf("unreadable") > 0]);
  assert.deepEqual(seen, [[false, true, false], [false, true, false], [false, false, true], [true, true]]);
});

test("W31: the select step fails closed on an empty plan for a code diff; a docs diff's empty plan passes", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/ci-select-specs-step.sh"), "utf8");
  const report = src.slice(src.lastIndexOf("node -e '") + "node -e '".length, src.lastIndexOf("'"));
  const dir = mkTmpDir("sel-empty-");
  try {
    const run = (reason) => {
      fs.writeFileSync(path.join(dir, "sel.json"), JSON.stringify({ reason, selected: [], shards: [], groups: [], tracked: [], unmatched: [], overBudgetSpecs: [], coveredByFixedGates: [], skipped: [] }));
      try { execFileSync(process.execPath, ["-e", report], { cwd: dir, env: { ...process.env, GITHUB_OUTPUT: path.join(dir, "out") }, encoding: "utf8", stdio: "pipe" }); return 0; }
      catch (e) { return e.status; }
    };
    assert.equal(run("infra"), 1, "infra with no job fails closed");
    assert.equal(run("matched"), 1, "a code diff with no job fails closed");
    assert.equal(run("partial"), 1);
    assert.equal(run("docs"), 0, "docs-only: an empty plan is a pass");
    assert.equal(run("none"), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- #5241 G5: a green matrix that ran nothing ----
test("#5241 G5: selected=success with a started shard that left no testcase, or no evidence, is red", () => {
  assert.equal(selectedGateVerdict({ ...base }).ok, true);
  const zero = selectedGateVerdict({ ...base, evidence: { started: ["a-1", "b-2"], junit: ["a-1"] } });
  assert.equal(zero.ok, false);
  assert.match(zero.reason, /b-2.*zero tests/);
  assert.equal(selectedGateVerdict({ ...base, evidence: { started: [], junit: [] } }).ok, false);
  assert.equal(selectedGateVerdict({ ...base, evidence: { started: ["a-1"], junit: ["a-1"], downloadFailed: true } }).ok, false);
  assert.equal(selectedGateVerdict({ ...base, selected: "skipped", evidence: { started: [], junit: [] } }).ok, true, "an empty plan has no shard to prove");
});
