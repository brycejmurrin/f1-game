// wait-for.mjs + deploy-status.mjs (issue #2386): the waiters that replace hand-rolled pgrep/sleep loops.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, check, waitFor, UsageError } from "../../tools/ci/wait-for.mjs";
import { readStatus, waitStatus, stamp } from "../../tools/lib/deploy-status.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "wf-"));
const fakeClock = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; } }; };

test("parseArgs: conditions, both flag spellings, defaults", () => {
  const a = parseArgs(["--load-below", "2.8", "--file-nonempty=x.log", "--pid-gone", "42", "--timeout=5"]);
  assert.deepEqual(a.conds, [{ kind: "load", max: 2.8 }, { kind: "file", path: "x.log" }, { kind: "pid", pid: 42 }]);
  assert.equal(a.timeoutMin, 5);
  assert.equal(parseArgs(["--pid-gone", "1"]).timeoutMin, 30);
});

test("parseArgs: unknown flag, no condition, bad numbers are usage errors", () => {
  assert.throws(() => parseArgs(["--nope"]), (e) => e instanceof UsageError && /unknown flag --nope/.test(e.message));
  assert.throws(() => parseArgs([]), /at least one condition/);
  assert.throws(() => parseArgs(["--load-below", "abc"]), UsageError);
  assert.throws(() => parseArgs(["--pid-gone", "--timeout", "3"]), UsageError);
  for (const pid of ["0", "-1", "1.5", "2147483648", "9007199254740993"]) {
    assert.throws(() => parseArgs(["--pid-gone", pid]), UsageError, `invalid PID ${pid}`);
  }
  assert.throws(() => parseArgs(["stray"]), UsageError);
});

test("check: names what still blocks, ANDs conditions", () => {
  const deps = { load: () => 3.5, alive: () => true, size: () => 0 };
  const r = check([{ kind: "load", max: 2.8 }, { kind: "pid", pid: 9 }, { kind: "file", path: "f" }], deps);
  assert.equal(r.ok, false);
  assert.equal(r.pending.length, 3);
  assert.equal(check([{ kind: "load", max: 4 }], deps).ok, true);
});

test("waitFor: held once the load drops; 124 on timeout with the blocker named", async () => {
  const c = fakeClock();
  let l = 5;
  const held = await waitFor([{ kind: "load", max: 2 }], { timeoutMin: 10, pollSec: 60, ...c, deps: { load: () => (l -= 1.5) } });
  assert.equal(held.code, 0);
  const c2 = fakeClock();
  const to = await waitFor([{ kind: "pid", pid: 1 }], { timeoutMin: 2, pollSec: 30, ...c2, deps: { alive: () => true } });
  assert.equal(to.code, 124);
  assert.match(to.text, /pid 1 alive/);
});

test("CLI: exit 1 on usage, 0 on a pid that is gone, 124 on a live pid", () => {
  const cli = path.resolve("tools/ci/wait-for.mjs");
  assert.equal(spawnSync("node", [cli, "--bogus"]).status, 1);
  assert.equal(spawnSync("node", [cli, "--pid-gone", "1.5"]).status, 1);
  assert.equal(spawnSync("node", [cli, "--pid-gone", "2147483646", "--timeout", "1"]).status, 0);
  assert.equal(spawnSync("node", [cli, "--pid-gone", String(process.pid), "--timeout", "0.01", "--poll", "0.01"]).status, 124);
});

test("waitFor caps polling at the deadline and Node's maximum timer delay", async () => {
  const c = fakeClock();
  const r = await waitFor([{ kind: "pid", pid: 1 }], {
    timeoutMin: 0.01, pollSec: 60, ...c, deps: { alive: () => true },
  });
  assert.equal(r.code, 124);
  assert.equal(c.now(), 600, "a 600 ms timeout must not wait for the 60 s poll");
  const long = fakeClock();
  const sleeps = [];
  const held = await waitFor([{ kind: "pid", pid: 1 }], {
    timeoutMin: 100000, pollSec: 3e6, ...long,
    sleep: async (ms) => { sleeps.push(ms); await long.sleep(ms); },
    deps: { alive: () => sleeps.length === 0 },
  });
  assert.equal(held.code, 0);
  assert.deepEqual(sleeps, [2147483647], "larger Node delays would collapse to 1 ms");
});

test("readStatus: none / running / done / died map to exit codes", () => {
  const f = path.join(tmp(), "deploy.log");
  assert.equal(readStatus(f).code, 1);
  stamp(f, "start pid=77 mode=--gate-only");
  assert.deepEqual([readStatus(f, () => true).state, readStatus(f, () => true).code], ["running", 124]);
  assert.deepEqual([readStatus(f, () => false).state, readStatus(f, () => false).code], ["died", 1]);
  stamp(f, "done exit=0");
  assert.deepEqual([readStatus(f, () => true).state, readStatus(f, () => true).code], ["done", 0]);
  stamp(f, "start pid=78 mode=default");
  stamp(f, "done exit=3");
  assert.equal(readStatus(f).code, 1, "the LAST verdict wins over an earlier pass");
});

test("waitStatus: returns when the run ends, 124 when it never does", async () => {
  const f = path.join(tmp(), "deploy.log");
  stamp(f, "start pid=5 mode=--pr");
  const c = fakeClock();
  let polls = 0;
  const s = await waitStatus(f, { timeoutMin: 10, pollMs: 1000, ...c, alive: () => (++polls < 3) });
  assert.equal(s.state, "died");
  const c2 = fakeClock();
  const to = await waitStatus(f, { timeoutMin: 1, pollMs: 20_000, ...c2, alive: () => true });
  assert.equal(to.code, 124);
  assert.match(to.text, /WAIT TIMEOUT/);
});

test("deploy.mjs --status / --wait read the marker log (exit 0 / 1)", () => {
  const f = path.join(tmp(), "deploy.log");
  stamp(f, "start pid=2147483646 mode=--gate-only");
  stamp(f, "done exit=0");
  const run = (...a) => spawnSync("node", ["tools/ci/deploy.mjs", ...a, `--log=${f}`], { encoding: "utf8" });
  assert.equal(run("--status").status, 0);
  assert.equal(run("--wait", "--timeout", "1").status, 0);
  stamp(f, "done exit=1");
  assert.equal(run("--status").status, 1);
});

test("--log-matches: holds once a log line matches; names the missing verdict; bad regex is a usage error", () => {
  const a = parseArgs(["--log-matches", "x.log", "^= run (passed|failed)"]);
  assert.equal(a.conds[0].kind, "log");
  const deps = { read: () => "starting\n= run passed (3)\n" };
  assert.equal(check(a.conds, deps).ok, true);
  const miss = check(a.conds, { read: () => "still going\n" });
  assert.equal(miss.ok, false);
  assert.match(miss.pending[0], /x\.log has no line matching/);
  assert.equal(check(a.conds, { read: () => "" }).ok, false);
  assert.throws(() => parseArgs(["--log-matches", "x.log"]), UsageError);
  assert.throws(() => parseArgs(["--log-matches", "x.log", "("]), UsageError);
});
