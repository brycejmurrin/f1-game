/* run-pid.test.mjs — tools/lib/run-pid.mjs: the sanctioned stop behind tooling-fast/sync-pr --stop (#2663). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { descendants, register, release, stop, runFile } from "../../tools/lib/run-pid.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "run-pid-"));

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
