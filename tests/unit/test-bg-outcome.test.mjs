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
import { outcomeOf, outcome, aliveRun, procStart, procInfo } from "../../tools/ci/test-bg.mjs";

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


test("proc stat zombie identity does not keep a completed background run alive", () => {
  // Captured /proc/820854/stat: completed physics-core wrapper, PPID 1.
  // Its matching start time and successful kill(0) previously left --wait/cap stuck.
  const captured = "820854 (sh) Z 1 820854 820854 0 -1 4227340 304 3304017 0 0 0 0 19298 1983 20 0 1 0 7855793 0 0";
  const read = (path, encoding) => {
    assert.equal(path, "/proc/820854/stat"); assert.equal(encoding, "utf8"); return captured;
  };
  const info = procInfo(820854, read);
  assert.deepEqual(info, { state: "Z", starttime: "7855793" });
  const run = { pid: 820854, starttime: info.starttime, bootId: "same-boot" };
  const deps = { kill() {}, start: () => info.starttime, state: () => info.state, boot: "same-boot" };
  assert.equal(aliveRun(run, deps), false);
  assert.equal(aliveRun({ pid: run.pid }, deps), false, "legacy records also reject zombies");
  for (const state of ["X", "x"]) assert.equal(aliveRun(run, { ...deps, state: () => state }), false);
  for (const state of ["S", "R", "D", "T", undefined]) {
    assert.equal(aliveRun(run, { ...deps, state: () => state }), true, "live states and unavailable proc state retain identity checks");
    assert.equal(aliveRun({ ...run, starttime: "other" }, { ...deps, state: () => state }), false);
    assert.equal(aliveRun({ ...run, bootId: "other" }, { ...deps, state: () => state }), false);
  }
  assert.equal(procInfo(820854, () => { throw new Error("proc unavailable"); }), null);
  const named = captured.replace("(sh)", "(wrapper (with) spaces)");
  assert.deepEqual(procInfo(820854, () => named), info, "command parentheses do not shift stat fields");
});

test("a zombie supervisor is not a live run (#1921)", async () => {
  /* A finished wrapper whose parent has not reaped it stays in /proc as state
     Z: kill(pid, 0) succeeds and its start time still matches, so the run read
     as live — `--wait` hung to 124 and the one-group cap refused the next
     group although the log already ended `= bg exit 0`. Build a real zombie:
     `sleep 0` exits under an exec'd parent that never waits on it. */
  const { spawn } = await import("node:child_process");
  const fs = await import("node:fs");
  const parent = spawn("sh", ["-c", "sleep 0 & echo $!; exec sleep 30"], { stdio: ["ignore", "pipe", "ignore"] });
  try {
    const pid = Number(await new Promise((res) => parent.stdout.once("data", (b) => res(String(b).trim()))));
    const stateOf = () => { try { return fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(")").pop().trim()[0]; } catch (_) { return null; } };
    for (let i = 0; i < 100 && stateOf() !== "Z"; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(stateOf(), "Z", "the fixture is a real zombie");
    const st = procStart(pid);
    assert.match(String(st), /^\d+$/, "a zombie keeps its start time");
    assert.equal(aliveRun({ pid, starttime: st }), false, "a zombie with a matching start time is not live");
    assert.equal(aliveRun({ pid }), false, "nor is a legacy record");
    assert.notEqual(outcome({ pid, starttime: st, log: "/nonexistent/test-bg-zombie.log" }), "running");
  } finally { parent.kill("SIGKILL"); }
  // Injected: dead states refuse, every other state keeps the identity checks.
  const me = process.pid, st = procStart(me);
  for (const s of ["Z", "X", "x"]) assert.equal(aliveRun({ pid: me, starttime: st }, { state: () => s }), false, `state ${s}`);
  for (const s of ["R", "S", "D", "T"]) assert.equal(aliveRun({ pid: me, starttime: st }, { state: () => s }), true, `state ${s}`);
  assert.equal(aliveRun({ pid: me, starttime: st }, { state: () => null }), true, "no /proc: the pid + start-time test stands");
});
