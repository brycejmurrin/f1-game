/* test-bg-outcome.test.mjs — a background run's verdict never reads green when
 * its process exited non-zero, and the one-spec runner refuses what it must.
 *
 * test-bg.mjs reads a run's outcome out of its own log. A run can be two
 * commands (a twinned spec runs its VM twins, then Playwright), and until
 * 2026-09-24 the FIRST half's `= run passed` or `# fail 0` beat the
 * `= bg exit N` trailer, so a red second half — or a Playwright half killed
 * before its summary — read as passed and `--wait` exited 0.
 * Group mode (and its chain, parallel cap and sweep) went on 2026-11-03: agents
 * never run a browser test locally; the tool runs ONE spec for an attended session.
 *
 * Run: node --test tests/unit/test-bg-outcome.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { outcomeOf, outcome, aliveRun, procStart, parseTestBgArgv, probeChromeSessions, chromeRefusal, start, workerBudget, waitForRunning } from "../../tools/ci/test-bg.mjs";

test("parseTestBgArgv reads --timeout and --timeout=N as minutes", () => {
  assert.equal(parseTestBgArgv(["--wait", "--timeout", "45"]).waitTimeoutMin, 45);
  assert.equal(parseTestBgArgv(["--wait", "--timeout=45"]).waitTimeoutMin, 45);
  assert.throws(() => parseTestBgArgv(["--wait", "--timeout"]), /--timeout requires/);
  assert.throws(() => parseTestBgArgv(["--wait", "--timeout", "45", "smoke"]), /group mode is gone/, "a bare group name is no longer an argument");
});

test("a non-zero exit wins over an earlier passing summary", () => {
  const log = "[tooling-fast] = run passed (249 passed, 0 failed)\n…sweeps…\n# pass 3\n# fail 1\n= bg exit 1\n";
  assert.match(outcomeOf(log), /^failed \(exit 1; last summary: passed/);
  const killed = "# pass 12\n# fail 0\n[pw] running…\n= bg exit 137\n";
  assert.match(outcomeOf(killed), /^failed \(exit 137/, "a twin's `# fail 0` never covers a killed Playwright half");
});

test("exit 0 keeps the rich summary; the old formats still read", () => {
  assert.equal(outcomeOf("= run passed (12 passed, 0 failed)\n= bg exit 0\n"), "passed (12 passed, 0 failed)");
  assert.equal(outcomeOf("= run failed (11 passed, 1 failed)\n"), "failed (11 passed, 1 failed)", "no trailer yet: the summary");
  assert.equal(outcomeOf("# pass 4\n# fail 0\n= bg exit 0\n"), "passed (4 passed, 0 failed)");
  assert.equal(outcomeOf("✓ all covered\n= bg exit 0\n"), "passed (exit 0)", "a plain-script group");
  assert.equal(outcomeOf("booting…\n"), "died before finishing");
});

test("a stopped browser half never inherits its VM twin's passing TAP verdict", () => {
  const twin = "# pass 6\n# fail 0\n[playwright] VM twin(s) passed (6) — the browser half follows\n";
  const browser = "[playwright] main port=33461 pid=50751\n[20:41:20] = run start: 69 tests, 1 worker(s)\n";
  const failures = "[20:49:04] x FAIL   12/69 finishRace transitions\n[20:52:25] x FAIL   14/69 finishRace table\n";
  const interrupted = twin + browser + failures + "[playwright] child exited on SIGTERM\n";
  assert.equal(outcomeOf(interrupted), "interrupted (SIGTERM; 2 failure(s), browser summary missing)");
  assert.match(outcomeOf(twin + browser + "[playwright] child exited on SIGTERM\n"), /^interrupted \(SIGTERM; 0 failure/);
  assert.match(outcomeOf(twin + browser + failures), /^died after 2 failure/, "a killed wrapper may omit its signal line too");
  assert.match(outcomeOf(twin), /^died before finishing/, "interruption before browser launch still needs the browser verdict");
  assert.match(outcomeOf(twin + browser + "= bg exit 0\n"), /^died before finishing/, "exit 0 cannot stand in for the missing browser summary");
  assert.equal(outcomeOf(twin + browser + "[20:55:00] = run passed  (69/69 done, 0 failed, 0 skipped)\n= bg exit 0\n"),
    "passed (69/69 done, 0 failed, 0 skipped)", "a completed browser half keeps its rich summary");
});

test("a later browser shard must finish after an earlier browser pass", () => {
  const earlier = "[playwright] shared-shard port=33461 pid=50751\n[20:00:00] = run passed (1/1 done, 0 failed)\n";
  const later = "[playwright] mega:tests/specs/smoke.spec.js port=33461 pid=50752\n";
  assert.match(outcomeOf(earlier + later + "[playwright] child exited on SIGKILL\n"), /^interrupted \(SIGKILL/);
  assert.match(outcomeOf(earlier + "[20:00:01] = run start: 3 tests, 1 worker(s)\n"), /^died before finishing/);
});

test("a recycled pid is not the run: liveness needs the recorded start time and boot id", () => {
  /* test-bg recorded only the pid and tested kill(pid, 0). After a restart or a
     pid wrap an unrelated process holding that pid read as a live run — `--wait`
     ran to 124, the cap refused every start, and --stop signalled that
     process's GROUP. This process stands in for "whatever holds the pid now". */
  const me = process.pid;
  const st = procStart(me);
  assert.match(String(st), /^\d+$/, "procStart reads /proc/<pid>/stat field 22");
  assert.equal(aliveRun({ pid: me, starttime: st }), true, "same pid, same start: the run");
  assert.equal(aliveRun({ pid: me, starttime: String(Number(st) + 1) }), false, "same pid, other start: NOT the run");
  assert.equal(aliveRun({ pid: me, starttime: st, bootId: "another-boot" }, { boot: "this-boot" }), false,
    "a record from an earlier boot is never live");
  assert.equal(aliveRun({ pid: me }), true, "a legacy record without a start time keeps the pid test");
  assert.equal(aliveRun({ pid: -1 }), false);
  assert.equal(aliveRun({ pid: me, starttime: st }, { kill: () => { throw new Error("ESRCH"); } }), false, "a gone pid is gone");
  // The outcome of a stale entry is read from its log, never "running" — so
  // --wait ends and --stop (which signals only alive() runs) leaves it alone.
  const stale = { pid: me, starttime: "1", log: "/nonexistent/test-bg-stale.log" };
  assert.notEqual(outcome(stale), "running");
  assert.equal(outcome({ ...stale, starttime: st }), "running");
});


test("a zombie supervisor is not a live run (#1921)", async () => {
  /* A finished wrapper whose parent has not reaped it stays in /proc as state
     Z: kill(pid, 0) succeeds and its start time still matches, so the run read
     as live — `--wait` hung to 124 and the one-group cap refused the next
     group although the log already ended `= bg exit 0`. Build a real zombie:
     Wait until the parent has exec'd sleep before terminating its child: an
     immediately exiting child can be reaped by sh before that exec. */
  const { spawn } = await import("node:child_process");
  const fs = await import("node:fs");
  const parent = spawn("sh", ["-c", "sleep 30 & echo $!; exec sleep 30"], { stdio: ["ignore", "pipe", "ignore"] });
  let pid;
  try {
    pid = Number(await new Promise((res) => parent.stdout.once("data", (b) => res(String(b).trim()))));
    const parentExeced = () => { try { return fs.readFileSync(`/proc/${parent.pid}/comm`, "utf8").trim() === "sleep"; } catch (_) { return false; } };
    for (let i = 0; i < 100 && !parentExeced(); i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(parentExeced(), true, "the parent cannot reap children after exec");
    process.kill(pid, "SIGKILL");
    const stateOf = () => { try { return fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(")").pop().trim()[0]; } catch (_) { return null; } };
    for (let i = 0; i < 100 && stateOf() !== "Z"; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(stateOf(), "Z", "the fixture is a real zombie");
    const st = procStart(pid);
    assert.match(String(st), /^\d+$/, "a zombie keeps its start time");
    assert.equal(aliveRun({ pid, starttime: st }), false, "a zombie with a matching start time is not live");
    assert.equal(aliveRun({ pid }), false, "nor is a legacy record");
    assert.notEqual(outcome({ pid, starttime: st, log: "/nonexistent/test-bg-zombie.log" }), "running");
  } finally {
    if (pid) { try { process.kill(pid, "SIGKILL"); } catch (_) { /* already gone */ } }
    parent.kill("SIGKILL");
  }
  // Injected: dead states refuse, every other state keeps the identity checks.
  const me = process.pid, st = procStart(me);
  for (const s of ["Z", "X", "x"]) assert.equal(aliveRun({ pid: me, starttime: st }, { state: () => s }), false, `state ${s}`);
  for (const s of ["R", "S", "D", "T"]) assert.equal(aliveRun({ pid: me, starttime: st }, { state: () => s }), true, `state ${s}`);
  assert.equal(aliveRun({ pid: me, starttime: st }, { state: () => null }), true, "no /proc: the pid + start-time test stands");
});

// Skill mcp-probe hard rule 1 ("never render Chrome MCP while Playwright runs"),
// enforced both ways: test-bg refuses a browser group beside a live
// `probe-mcp.py chrome-start` daemon, and chrome-start refuses beside a live run.
test("test-bg refuses a spec run while the MCP Chrome daemon is live (box-wide, --force overrides)", () => {
  const sessions = probeChromeSessions(() => "work\nprobe-chrome-0123456789abcdef\nprobe-chrome-short\n");
  assert.deepEqual(sessions, ["probe-chrome-0123456789abcdef"], "only the daemon's exact session-name shape counts");
  assert.deepEqual(probeChromeSessions(() => { throw new Error("no tmux"); }), [], "no tmux = no daemon");
  assert.match(chromeRefusal({ browser: true, force: false, sessions }), /REFUSED[\s\S]*probe-mcp\.py chrome-stop/);
  assert.equal(chromeRefusal({ browser: true, force: true, sessions }), null, "--force overrides");
  assert.equal(chromeRefusal({ browser: false, force: false, sessions }), null, "a node-only run is not a Chromium run");
  assert.equal(chromeRefusal({ browser: true, force: false, sessions: [] }), null);
});

test("probe-mcp chrome-start refuses while a Playwright run is live in this checkout", () => {
  const tool = fileURLToPath(new URL("../../tools/mcp/probe-mcp.py", import.meta.url));
  // Import the CLI as a module and stub its edges: no tmux, no daemon, no live-run scan.
  const py = `
import importlib.util, argparse, sys
spec = importlib.util.spec_from_file_location("probe_mcp", ${JSON.stringify(tool)})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
def no_tmux(*a): raise SystemExit("tmux must not be called")
m._tmux = no_tmux
m.daemon_port = lambda: None
m.live_test_run = lambda: "4242:99 artifacts/logs/smoke.log"
print("refused", m.cmd_chrome_start(argparse.Namespace(port=0, force=False)))
calls = []
m.live_test_run = lambda: calls.append(1) or ""
m.shutil.which = lambda _n: None
print("clear", m.cmd_chrome_start(argparse.Namespace(port=0, force=False)), len(calls))
m.live_test_run = lambda: "4242:99 x"
print("forced", m.cmd_chrome_start(argparse.Namespace(port=0, force=True)))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^refused 1$/m);
  assert.match(r.stderr, /REFUSED: a Playwright run is live in this checkout \(4242:99/);
  assert.match(r.stdout, /^clear 1 1$/m, "no live run: it goes on to the tmux check (stubbed missing -> 1)");
  assert.match(r.stdout, /^forced 1$/m, "--force skips the live-run check");
});

test("parseTestBgArgv: --spec names the one spec, --workers and --tail are read, an unknown flag or a group name throws (audit3 T8)", () => {
  const p = parseTestBgArgv(["--spec", "tests/specs/hud-layout.spec.js", "--workers=1"]);
  assert.deepEqual(p.specs, ["tests/specs/hud-layout.spec.js"]);
  assert.equal(p.workers, "1");
  assert.equal(parseTestBgArgv(["--tail", "spec-hud-layout"]).tail, "spec-hud-layout");
  assert.throws(() => parseTestBgArgv(["--spec"]), /--spec requires a value/);
  assert.throws(() => parseTestBgArgv(["--wait", "--timout", "45"]), /unknown flag --timout/);
  assert.throws(() => parseTestBgArgv(["--workers", "0", "--spec", "x"]), /--workers requires a positive integer/);
  for (const retired of [["--parallel", "--spec", "x"], ["--sweep"], ["--last-failed", "--spec", "x"], ["--keep-going"]])
    assert.throws(() => parseTestBgArgv(retired), /unknown flag/, `${retired[0]} went with group mode`);
  assert.throws(() => parseTestBgArgv(["smoke", "tiny"]), /group mode is gone[\s\S]*remote-group\.mjs/);
});

// The real start controller with inert process/registry edges: no browser,
// subprocess, filesystem state, or signal is touched by these fixtures.
function startFixture({ runs = [], load = 0, sessions = [], spawnResult, beforeWrite } = {}) {
  const events = [], messages = [];
  let state = { runs: runs.map((r) => ({ ...r })) };
  const io = {
    probeChromeSessions: () => sessions,
    load1: () => load,
    readState: () => state,
    alive: (r) => !r.ended,
    mkdirLogs: () => events.push(["mkdir"]),
    spawnSpec: (spec) => {
      events.push(["spawn", spec]);
      return spawnResult ? spawnResult(spec) : { group: "spec-smoke", spec, pid: 200, log: "/fixture/spec-smoke.log", browser: true };
    },
    updateState: (mutate) => {
      events.push(["write"]);
      if (beforeWrite) beforeWrite(state);
      state = mutate(state);
    },
    say: (message) => messages.push(message),
    error: (message) => messages.push(message),
    exit: (code) => { throw Object.assign(new Error("start refused"), { code }); },
    now: () => "2026-10-29T00:00:00.000Z",
  };
  return { io, events, messages, state: () => state };
}
const SPEC = "tests/specs/smoke.spec.js";

test("start: load at the refusal threshold leaves the registry untouched; --force lifts only that", () => {
  const f = startFixture({ runs: [{ group: "spec-old", pid: 100, ended: "2026-10-28T00:00:00Z" }], load: 3 });
  assert.throws(() => start(SPEC, {}, f.io), { code: 3 });
  assert.deepEqual(f.events, [], "a refusal cannot spawn or rewrite the registry");
  assert.match(f.messages[0], /loadavg 3\.00 >= 3/);
  start(SPEC, { force: true }, f.io);
  assert.deepEqual(f.events, [["mkdir"], ["spawn", SPEC], ["write"]]);
});

test("start: a live MCP browser refuses before spawn", () => {
  const f = startFixture({ sessions: ["probe-chrome-0123456789abcdef"] });
  assert.throws(() => start(SPEC, {}, f.io), { code: 3 });
  assert.deepEqual(f.events, []);
});

test("start: ONE run at a time — a live run refuses the next, --force included", () => {
  for (const force of [false, true]) {
    const f = startFixture({ runs: [{ group: "spec-tiny", pid: 100, log: "/fixture/spec-tiny.log" }] });
    assert.throws(() => start(SPEC, { force }, f.io), { code: 3 }, `force=${force}`);
    assert.deepEqual(f.events, [], "the live run must not be superseded, forgotten or raced");
    assert.match(f.messages[0], /REFUSED: a run is live \(spec-tiny pid=100\)/);
    assert.deepEqual(f.state().runs, [{ group: "spec-tiny", pid: 100, log: "/fixture/spec-tiny.log" }]);
  }
});

test("start: a finished run's record survives beside the new one, and a concurrent writer's live run survives the merge", () => {
  const f = startFixture({ runs: [{ group: "spec-old", pid: 100, ended: "x" }], beforeWrite: (state) => state.runs.push({ group: "spec-other", pid: 101 }) });
  start(SPEC, {}, f.io);
  assert.deepEqual(f.state().runs.map((r) => [r.group, r.pid]), [["spec-old", 100], ["spec-other", 101], ["spec-smoke", 200]]);
  assert.equal(f.state().mode, "spec");
  assert.ok(f.messages.some((m) => m.startsWith("tail:")) && f.messages.some((m) => /--wait --timeout 45/.test(m)), "prints the tail and waiter commands");
});

test("start: a supervisor launch error cannot publish a fictitious run", () => {
  const f = startFixture({ spawnResult: () => { throw new Error("launch denied"); } });
  assert.throws(() => start(SPEC, {}, f.io), /launch denied/);
  assert.equal(f.events.some(([event]) => event === "write"), false);
  assert.deepEqual(f.state().runs, []);
});


test("workerBudget: five host CPUs with four available CPUs defaults to one worker", () => {
  const system = { cpus: () => Array(5), availableParallelism: () => 4 };
  assert.deepEqual(workerBudget({ env: {}, system }), { cores: 4, workers: "1" });
});

test("workerBudget: a budget above four defaults to two workers", () => {
  const system = { cpus: () => Array(16), availableParallelism: () => 5 };
  assert.deepEqual(workerBudget({ env: {}, system }), { cores: 5, workers: "2" });
});

test("workerBudget: older Node falls back to CPU count and an empty count falls back to four", () => {
  assert.deepEqual(workerBudget({ env: {}, system: { cpus: () => Array(5) } }), { cores: 5, workers: "2" });
  assert.deepEqual(workerBudget({ env: {}, system: { cpus: () => [] } }), { cores: 4, workers: "1" });
});

test("workerBudget: environment and parsed CLI overrides beat the available-CPU default", () => {
  const system = { cpus: () => Array(5), availableParallelism: () => 4 };
  assert.equal(workerBudget({ env: { WORKERS: "3" }, system }).workers, "3");
  const { workers } = parseTestBgArgv(["--workers=2", "--spec", "tests/specs/smoke.spec.js"]);
  assert.equal(workerBudget({ workers, env: { WORKERS: "3" }, system }).workers, "2");
});

test("production waiter returns 124 when its deadline expires with an owned runner still live", async () => {
  const oldExit = process.exitCode;
  const live = [{ group: "fixture-live-run" }];
  try {
    process.exitCode = 0;
    let reads = 0;
    const result = await waitForRunning({ deadline: Date.now() - 1 }, {
      running: () => { reads++; return live; },
    });
    assert.equal(result, 124, "the waiter returns its deadline result");
    assert.equal(process.exitCode, 124, "standalone --wait retains its terminal deadline status");
    assert.ok(reads > 0);
    assert.deepEqual(live, [{ group: "fixture-live-run" }], "the runner remains live and untouched");
  } finally { process.exitCode = oldExit; }
});
