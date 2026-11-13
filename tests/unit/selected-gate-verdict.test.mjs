// selected-gate-verdict — cancel/red stays red even with clean sibling junit.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectedGateVerdict, shardEvidence, plannedSpecs, ranSpecsUnder } from "../../tools/ci/selected-gate-verdict.mjs";

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

test("#5304: groups the runner fan-out could not represent are named on the verdict line, never a verdict of their own", () => {
  const ok = selectedGateVerdict({ ...base, unrepresented: "test:perf-race-entry test:stall-reload-sw" });
  assert.equal(ok.ok, true);
  assert.match(ok.reason, /not run on this PR: test:perf-race-entry, test:stall-reload-sw, nightly rota covers them$/);
  assert.equal(selectedGateVerdict({ ...base, unrepresented: "" }).reason, selectedGateVerdict({ ...base }).reason);
  const red = selectedGateVerdict({ ...base, dropped: "1", unrepresented: "test:perf-session" });
  assert.equal(red.ok, false, "naming never exempts a drop");
});

test("#5403: on a green matrix every PLANNED spec needs a junit testcase in some shard", () => {
  const plan = JSON.stringify([
    { name: "selected-1", specs: "tests/specs/boot-guard.spec.js tests/specs/camera.spec.js", circuits: "" },
    { name: "oversize-c-1of2", specs: "tests/specs/quali.spec.js", shard: "1/2", circuits: "" },
    { name: "oversize-c-2of2", specs: "tests/specs/quali.spec.js", shard: "2/2", circuits: "" },
  ]);
  const planned = plannedSpecs(plan);
  assert.deepEqual(planned, { specs: ["tests/specs/boot-guard.spec.js", "tests/specs/camera.spec.js", "tests/specs/quali.spec.js"] });
  const ev = { started: ["selected-1"], junit: ["selected-1"], planned };
  // Before #5403 this was green: selected-1 left a testcase (a), so b and c were invisible.
  const miss = selectedGateVerdict({ ...base, evidence: { ...ev, ran: ["tests/specs/boot-guard.spec.js"] } });
  assert.equal(miss.ok, false);
  assert.equal(miss.reason, "selected specs success, but 2 planned spec(s) left no junit testcase in any shard: tests/specs/camera.spec.js, tests/specs/quali.spec.js — they did not run (or their upload was lost); re-run, never read it as a pass");
  const all = selectedGateVerdict({ ...base, evidence: { ...ev, ran: ["tests/specs/boot-guard.spec.js", "tests/specs/camera.spec.js", "tests/specs/quali.spec.js"] } });
  assert.equal(all.ok, true, all.reason);
  // No plan handed in (a pure caller or an older workflow): the per-shard rules alone, as before.
  assert.equal(plannedSpecs(""), null);
  assert.equal(selectedGateVerdict({ ...base, evidence: { ...ev, planned: null, ran: [] } }).ok, true);
  // A plan that cannot be read fails closed, never reads as "nothing planned".
  for (const bad of ["{not json", '{"specs":"x"}', '[{"name":"x"}]']) {
    const v = selectedGateVerdict({ ...base, evidence: { ...ev, planned: plannedSpecs(bad), ran: [] } });
    assert.equal(v.ok, false, bad);
    assert.equal(v.reason.split(" — ")[1], "cannot check each planned spec ran; failing closed", bad);
  }
  // The circuit lane: a per-circuit loop spec may collect zero tests for the scoped circuit, so its row is left out.
  assert.deepEqual(plannedSpecs(JSON.stringify([{ name: "selected-1", specs: "tests/specs/tracks-walls-a.spec.js tests/specs/tracks-walls-b.spec.js", circuits: "monza" }])), { specs: [] });
  // A red matrix is untouched: it is judged by the failure rules, never cleared by a full plan.
  const red = selectedGateVerdict({ ...base, selected: "failure", evidence: { ...ev, ran: ["tests/specs/boot-guard.spec.js", "tests/specs/camera.spec.js", "tests/specs/quali.spec.js"] } });
  assert.equal(red.ok, false);
});

// A spec name no tree carries, built so the source-path lint does not read it as a reference.
const NEVER = ["tests", "specs", "never-planned.spec.js"].join("/");

test("#5403 CLI: SHARDS names a spec no junit ran -> exit 1; every planned spec ran -> exit 0", () => {
  const dir = mkTmpDir("sel-plan-");
  const j = path.join(dir, "junit-in", "spec-timings-junit-selected-selected-1-0", "test-results-1");
  fs.mkdirSync(j, { recursive: true });
  fs.mkdirSync(path.join(dir, "started-in", "selected-started-selected-1-0"), { recursive: true });
  fs.writeFileSync(path.join(j, "junit.xml"),
    `<testsuites><testsuite><testcase classname="specs/boot-guard.spec.js" name="t"/><testcase classname="specs/camera.spec.js" name="u"><skipped/></testcase></testsuite></testsuites>`);
  assert.deepEqual(ranSpecsUnder(path.join(dir, "junit-in")), ["tests/specs/boot-guard.spec.js", "tests/specs/camera.spec.js"]);
  const run = (specs) => {
    try {
      execFileSync(process.execPath, [path.join(ROOT, "tools/ci/selected-gate-verdict.mjs"), "--junit-in", "junit-in", "--started-in", "started-in"], {
        cwd: dir, encoding: "utf8", stdio: "pipe",
        env: { ...process.env, SELECT: "success", SELECTED: "success", GUARDS: "success", DROPPED: "0", CALLED: "false", DRAFT: "false", DOWNLOAD_FAILED: "false",
          SHARDS: JSON.stringify([{ name: "selected-1", specs, circuits: "" }]) },
      });
      return { code: 0, err: "" };
    } catch (e) { return { code: e.status, err: String(e.stderr) }; }
  };
  assert.equal(run("tests/specs/boot-guard.spec.js tests/specs/camera.spec.js").code, 0);
  const r = run(`tests/specs/boot-guard.spec.js tests/specs/camera.spec.js ${NEVER}`);
  assert.equal(r.code, 1);
  assert.equal(r.err, "::error::selected specs success, but 1 planned spec(s) left no junit testcase in any shard: " + NEVER + " — they did not run (or their upload was lost); re-run, never read it as a pass\n");
  fs.rmSync(dir, { recursive: true, force: true });
});
