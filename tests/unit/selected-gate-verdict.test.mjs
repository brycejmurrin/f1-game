// selected-gate-verdict — cancel/red stays red even with clean sibling junit.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectedGateVerdict, shardEvidence, plannedSpecs, ranSpecsUnder, recoverLostJunit, evidenceGap, tallyLine, parseTally, tallyUnder, TALLY_TITLE, SELECTED_JOB } from "../../tools/ci/selected-gate-verdict.mjs";

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
  for (const dropped of ["0", "2"]) {
    const draft = selectedGateVerdict({ ...base, selected: "skipped", draft: "true", dropped });
    assert.equal(draft.ok, true);
    assert.match(draft.reason, /browser execution deferred/);
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

// ---- #5802: a green shard's lost junit vs a shard that ran nothing ---------------------------------------
const SPEC_A = "tests/specs/boot-guard.spec.js", SPEC_B = "tests/specs/camera.spec.js";
const tallyNote = (leg, tests, specs) => ({ title: TALLY_TITLE, message: JSON.stringify({ leg, tests, specs }) });
const job = (conclusion, notes) => ({ name: `${SELECTED_JOB} (x, 1)`, conclusion, notes });
const plan2 = { specs: [SPEC_A, SPEC_B] };

test("#5802: tallyLine round-trips through parseTally; tallyUnder reads a shard's reporter folders", () => {
  const line = tallyLine("oversize-time-trial-2of2-18", { tests: 3, specs: [SPEC_A] });
  assert.equal(line, `::notice title=apex-selected-tally::{"leg":"oversize-time-trial-2of2-18","tests":3,"specs":["${SPEC_A}"]}`);
  assert.deepEqual(parseTally(line.split("::")[2]), { leg: "oversize-time-trial-2of2-18", tests: 3, specs: [SPEC_A] });
  assert.equal(tallyLine("a", { tests: 1, specs: ["100%"] }), `::notice title=apex-selected-tally::{"leg":"a","tests":1,"specs":["100%25"]}`, "% is escaped for the workflow command");
  assert.equal(parseTally("not json"), null);
  assert.equal(parseTally(JSON.stringify({ leg: "a", tests: -1, specs: [] })), null);
  const dir = mkTmpDir("sel-tally-");
  fs.mkdirSync(path.join(dir, "test-results-1"), { recursive: true });
  fs.writeFileSync(path.join(dir, "test-results-1", "junit.xml"), `<testsuites><testsuite><testcase classname="specs/boot-guard.spec.js" name="t"/><testcase classname="specs/boot-guard.spec.js" name="u"/></testsuite></testsuites>`);
  assert.deepEqual(tallyUnder(dir), { tests: 2, specs: [SPEC_A] });
  assert.deepEqual(tallyUnder(path.join(dir, "nope")), { tests: 0, specs: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("#5802: job green + junit lost is recovered from the shard's own tally and passes", () => {
  // #5634 run 44301029662: the marker arrived, the junit did not.
  const ev = { started: ["a-0", "b-1"], junit: ["a-0"], ran: [SPEC_A], planned: plan2 };
  assert.equal(evidenceGap(ev), true);
  assert.equal(selectedGateVerdict({ ...base, evidence: ev }).ok, false, "without the tally it is red, as before");
  const jobs = [job("success", [tallyNote("a-0", 2, [SPEC_A])]), job("success", [tallyNote("b-1", 4, [SPEC_B])])];
  const r = recoverLostJunit(ev, jobs, { planRows: 2 });
  assert.deepEqual(r.recovered, ["b-1"]);
  assert.deepEqual(r.zero, []);
  assert.equal(evidenceGap(r.evidence), false);
  const v = selectedGateVerdict({ ...base, evidence: r.evidence });
  assert.equal(v.ok, true);
  assert.equal(v.reason, "selected specs passed (the junit of b-1 was lost; each shard's job concluded success and its own tally annotation names its tests, #5802)");
  // #5636 run 44301033515 attempt 2: the download 404'd (after its retry). Every planned shard green and tallied clears it.
  const lost = { started: [], junit: [], ran: [], planned: plan2, downloadFailed: true };
  const all = recoverLostJunit(lost, jobs, { planRows: 2 });
  assert.equal(all.evidence.downloadFailed, false);
  assert.equal(selectedGateVerdict({ ...base, evidence: all.evidence }).ok, true);
  // ...but not when one planned shard is untallied, or the plan's row count is unknown
  assert.equal(recoverLostJunit(lost, jobs.slice(0, 1), { planRows: 2 }).evidence.downloadFailed, true);
  assert.equal(recoverLostJunit(lost, jobs, { planRows: null }).evidence.downloadFailed, true);
  assert.equal(selectedGateVerdict({ ...base, evidence: recoverLostJunit(lost, jobs.slice(0, 1), { planRows: 2 }).evidence }).ok, false);
});

test("#5802/#5334: a shard that ran nothing stays red, whatever its job concluded", () => {
  const ev = { started: ["a-0", "b-1"], junit: ["a-0"], ran: [SPEC_A], planned: { specs: [SPEC_A] } };
  const red = (jobs, planRows = 2) => selectedGateVerdict({ ...base, evidence: recoverLostJunit(ev, jobs, { planRows }).evidence });
  const a = job("success", [tallyNote("a-0", 2, [SPEC_A])]);
  // its own tally says 0 tests: the spec selection that runs nothing and passes
  const zero = recoverLostJunit(ev, [a, job("success", [tallyNote("b-1", 0, [])])], { planRows: 2 });
  assert.deepEqual(zero.zero, ["b-1"]);
  assert.equal(red([a, job("success", [tallyNote("b-1", 0, [])])]).reason, "selected specs success, but shard(s) b-1 reached the run step and left no junit with a testcase — they ran zero tests (or lost the upload); re-run the failed evidence, never read it as a pass");
  assert.equal(red([a, job("success", [])]).ok, false, "no tally");
  assert.equal(red([a, job("success", [tallyNote("b-1", 4, [SPEC_B]), tallyNote("b-1", 4, [SPEC_B])])]).ok, false, "two tallies: one is forged");
  assert.equal(red([a, job("failure", [tallyNote("b-1", 4, [SPEC_B])])]).ok, false, "the job did not succeed");
  assert.equal(red([a, job("success", null)]).ok, false, "annotation lookup failed");
  assert.equal(red(null).ok, false, "jobs lookup failed");
  assert.equal(red([a, { name: "Selected specs (verdict)", conclusion: "success", notes: [tallyNote("b-1", 4, [SPEC_B])] }]).ok, false, "only selected matrix jobs count");
  // a recovered shard does not excuse a planned spec nobody ran
  const ev2 = { ...ev, planned: { specs: [SPEC_A, SPEC_B, NEVER] } };
  const v = selectedGateVerdict({ ...base, evidence: recoverLostJunit(ev2, [a, job("success", [tallyNote("b-1", 4, [SPEC_B])])], { planRows: 2 }).evidence });
  assert.equal(v.ok, false);
  assert.equal(v.reason, `selected specs success, but 1 planned spec(s) left no junit testcase in any shard: ${NEVER} — they did not run (or their upload was lost); re-run, never read it as a pass`);
});

test("#7507 member 2: an empty drop count passes on workflow_dispatch only (run 46114816668)", () => {
  const input = { select: "success", selected: "skipped", guards: "success", dropped: "", called: "false", draft: "" };
  const dispatch = selectedGateVerdict({ ...input, event: "workflow_dispatch" });
  assert.equal(dispatch.ok, true, dispatch.reason);
  assert.match(dispatch.warn, /workflow_dispatch/);
  for (const event of ["pull_request", "push", "schedule", undefined]) {
    assert.equal(selectedGateVerdict({ ...input, event }).ok, false, `empty DROPPED on ${event} fails closed`);
  }
  assert.equal(selectedGateVerdict({ ...input, event: "workflow_dispatch", selected: "success", evidence: { started: ["a-1"], junit: ["a-1"] } }).ok, false,
    "a dispatch whose selected legs ran still needs a readable count");
  assert.equal(selectedGateVerdict({ ...input, event: "workflow_dispatch", dropped: "?" }).ok, false, "only an EMPTY count is the dispatch shape");
});
