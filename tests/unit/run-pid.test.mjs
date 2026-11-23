/* run-pid.test.mjs — tools/lib/run-pid.mjs: the sanctioned stop behind tooling-fast/sync-pr --stop (#2663). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";
import path from "node:path";
import { descendants, register, release, stop, runFile } from "../../tools/lib/run-pid.mjs";

const tmp = () => mkTmpDir("run-pid-");

test("descendants: deepest first, root last, unrelated pids excluded", () => {
  const table = [[10, 1], [11, 10], [12, 11], [13, 10], [99, 1]];
  assert.deepEqual(descendants(table, 10), [12, 11, 13, 10]);
});

test("register refuses a second live run of the same command, takes over a dead or foreign one; release is owner-only", () => {
  const dir = tmp();
  const live = { alive: () => true, cmdline: () => "node tools/ci/sync-pr.mjs b" };
  assert.equal(register("sync-pr-b", { dir, pid: 100, cmd: "tools/ci/sync-pr.mjs b", deps: live }).ok, true);
  const second = register("sync-pr-b", { dir, pid: 200, cmd: "tools/ci/sync-pr.mjs b", deps: live });
  assert.deepEqual([second.ok, second.pid], [false, 100]);
  assert.equal(register("sync-pr-b", { dir, pid: 200, cmd: "x", deps: { alive: () => false, cmdline: () => "" } }).ok, true);   // holder dead
  assert.equal(register("sync-pr-b", { dir, pid: 300, cmd: "x", deps: { alive: () => true, cmdline: () => "something else" } }).ok, true);   // pid recycled
  release("sync-pr-b", { dir, pid: 999 });
  assert.ok(fs.existsSync(runFile("sync-pr-b", dir)), "another pid cannot release it");
  release("sync-pr-b", { dir, pid: 300 });
  assert.ok(!fs.existsSync(runFile("sync-pr-b", dir)));
});

test("stop: none / stale / stopped; signals the tree leaf-first, SIGKILLs only survivors, never a recycled pid", async () => {
  const dir = tmp();
  assert.deepEqual(await stop("nothing", { dir }), { state: "none" });
  fs.writeFileSync(runFile("tf", dir), JSON.stringify({ pid: 50, cmd: "tools/ci/tooling-fast.mjs --changed" }));
  const sent = [];
  const alive = new Set([50, 51, 52]);
  const deps = {
    alive: (p) => alive.has(p), cmdline: () => "node tools/ci/tooling-fast.mjs --changed", table: () => [[50, 1], [51, 50], [52, 51]],
    kill: (p, sig) => { sent.push([p, sig]); if (sig === "SIGKILL" || p !== 52) alive.delete(p); }, sleep: async () => {},
  };
  const r = await stop("tf", { dir, graceMs: 0, deps });
  assert.deepEqual(sent.slice(0, 3), [[52, "SIGTERM"], [51, "SIGTERM"], [50, "SIGTERM"]]);
  assert.deepEqual(sent.slice(3), [[52, "SIGKILL"]]);
  assert.deepEqual([r.state, r.killed, r.forced], ["stopped", 3, 1]);
  assert.ok(!fs.existsSync(runFile("tf", dir)));
  fs.writeFileSync(runFile("tf", dir), JSON.stringify({ pid: 50, cmd: "tools/ci/tooling-fast.mjs" }));
  const rec = []; 
  const stale = await stop("tf", { dir, deps: { alive: () => true, cmdline: () => "bash unrelated", table: () => [], kill: (p) => rec.push(p) } });
  assert.equal(stale.state, "stale"); assert.deepEqual(rec, [], "a pid that is no longer our command is never signalled");
});

test("stop keeps parents alive until their terminated children have been reaped", async () => {
  const dir = tmp(), alive = new Set([50, 51, 52, 99]), terminating = new Set(), sent = [];
  fs.writeFileSync(runFile("reap", dir), JSON.stringify({ pid: 50, cmd: "tooling-fast.mjs" }));
  const children = new Map([[50, [51]], [51, [52]], [52, []]]);
  const r = await stop("reap", { dir, graceMs: 1000, deps: {
    alive: (p) => alive.has(p), cmdline: () => "node tooling-fast.mjs",
    table: () => [[50, 1], [51, 50], [52, 51], [99, 1]],
    kill: (p, signal) => {
      assert.equal(signal, "SIGTERM", "cooperative children need no escalation");
      assert.ok(children.get(p).every((c) => !alive.has(c)), "parent still owns and reaps each child");
      sent.push(p); terminating.add(p);
    },
    sleep: async () => { for (const p of terminating) alive.delete(p); terminating.clear(); },
  } });
  assert.deepEqual(sent, [52, 51, 50]); assert.equal(r.forced, 0);
  assert.deepEqual([...alive], [99], "unregistered bystander survives");
});

test("pidAlive treats a zombie as gone (hunt 2026-11-02)", async (t) => {
  // The stat reader is stubbed at the fs level (deploy-status calls fs.readFileSync at call time), and
  // process.kill with it: a real zombie is racy to catch (node reaps its own children), and the old
  // version of this test returned before its only assert whenever node won that race.
  const { pidAlive } = await import("../../tools/lib/deploy-status.mjs");
  const realRead = fs.readFileSync;
  let stat = null, killErr = null;
  const probes = [];
  t.mock.method(fs, "readFileSync", (file, ...rest) => {
    if (typeof file === "string" && /^\/proc\/\d+\/stat$/.test(file)) {
      if (stat === null) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return stat;
    }
    return realRead.call(fs, file, ...rest);
  });
  t.mock.method(process, "kill", (pid, sig) => { probes.push([pid, sig]); if (killErr) throw Object.assign(new Error(killErr), { code: killErr }); return true; });
  const alive = (s, err = null) => { stat = s; killErr = err; probes.length = 0; return pidAlive(4242); };

  assert.equal(alive("4242 (node) Z 1 4242 4242 0 -1"), false, "a zombie is gone");
  assert.deepEqual(probes, [], "a zombie is never signalled, not even with signal 0");
  assert.equal(alive("4242 (odd) name) Z 1 0"), false, "a comm containing ') ' still parses to its state");
  assert.equal(alive("4242 (node) S 1 4242"), true, "a sleeping process is alive");
  assert.deepEqual(probes, [[4242, 0]], "liveness is signal 0");
  assert.equal(alive("4242 (Zed) R 1 4242"), true, "a Z inside the comm is not the state");
  assert.equal(alive("4242 (node) S 1", "ESRCH"), false, "no such process");
  assert.equal(alive("4242 (node) S 1", "EPERM"), true, "exists but not ours: alive");
  assert.equal(alive(null), true, "no /proc: falls through to signal 0");
  assert.equal(alive(null, "ESRCH"), false);
});
