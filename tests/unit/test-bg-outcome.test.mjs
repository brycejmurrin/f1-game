/* test-bg-outcome.test.mjs — a background run's verdict never reads green when
 * its process exited non-zero.
 *
 * test-bg.mjs reads a run's outcome out of its own log. A group can be two
 * commands (`test:tooling` is tooling-fast && sweeps; a twinned group runs its
 * VM twins, then Playwright), and until 2026-09-24 the FIRST half's
 * `= run passed` or `# fail 0` beat the `= bg exit N` trailer, so a red second
 * half — or a Playwright half killed before its summary — read as passed and
 * `--wait` exited 0.
 *
 * Run: node --test tests/unit/test-bg-outcome.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { outcomeOf, outcome, aliveRun, procStart, parseTestBgArgv } from "../../tools/ci/test-bg.mjs";

test("parseTestBgArgv reads --timeout and --timeout=N as minutes", () => {
  assert.equal(parseTestBgArgv(["--wait", "--timeout", "45"]).waitTimeoutMin, 45);
  assert.equal(parseTestBgArgv(["--wait", "--timeout=45"]).waitTimeoutMin, 45);
  assert.throws(() => parseTestBgArgv(["--wait", "--timeout"]), /--timeout requires/);
  assert.deepEqual(parseTestBgArgv(["--wait", "--timeout", "45", "smoke"]).groups, ["smoke"]);
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
