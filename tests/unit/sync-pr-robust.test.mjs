/* sync-pr-robust.test.mjs — #2663: stale sync branch cleanup, moved-remote refusal, tooling-fast --stop parse, and a real --stop. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { staleSyncBranch, remoteMoved, foreignClaims } from "../../tools/ci/sync-pr.mjs";
import { parseToolingFastArgv } from "../../tools/ci/tooling-fast.mjs";
import { register, stop } from "../../tools/lib/run-pid.mjs";

// Records every argv so a test can assert WHAT git was asked, not just what the stub answered.
const calls = [];
const exact = (map) => (args) => { calls.push(args); const hit = Object.entries(map).find(([k]) => k === args.join(" ")); return hit ? hit[1] : { code: 1, out: "", err: "" }; };
const git = (map) => (args) => { const k = args.join(" "); const hit = Object.keys(map).find((m) => k.includes(m)); return hit ? map[hit] : { code: 1, out: "", err: "" }; };

test("staleSyncBranch: a leftover with no commits of its own is stale; one with commits is kept and says why", () => {
  assert.deepEqual(staleSyncBranch("sync-pr-x", "x", git({ "rev-list --count": { code: 0, out: "0", err: "" } })), { stale: true, why: "no commits of its own" });
  const kept = staleSyncBranch("sync-pr-x", "x", git({ "rev-list --count": { code: 0, out: "3", err: "" } }));
  assert.equal(kept.stale, false); assert.match(kept.why, /3 commit\(s\).*--resume/);
  assert.equal(staleSyncBranch("sync-pr-x", "x", git({})).stale, false, "an unreadable comparison deletes nothing");
});

test("remoteMoved: true when origin/<branch> is not contained in the merge result", () => {
  assert.equal(remoteMoved("sync-pr-x", "x", git({ "merge-base --is-ancestor": { code: 0, out: "", err: "" } })), false);
  assert.equal(remoteMoved("sync-pr-x", "x", git({ "merge-base --is-ancestor": { code: 1, out: "", err: "" } })), true);
});

test("sync-pr asks git for exactly these refs (a wrong ref or direction fails here, not in a real merge)", () => {
  calls.length = 0;
  const stale = staleSyncBranch("sync-pr-x", "x", exact({ "rev-list --count sync-pr-x ^origin/x ^origin/claude/f1-game-project-26h3ng": { code: 0, out: "0", err: "" } }));
  assert.equal(stale.stale, true, "the argv matched the expected command exactly");
  assert.deepEqual(calls, [["rev-list", "--count", "sync-pr-x", "^origin/x", "^origin/claude/f1-game-project-26h3ng"]]);
  calls.length = 0;
  assert.equal(remoteMoved("sync-pr-x", "x", exact({ "merge-base --is-ancestor origin/x sync-pr-x": { code: 0, out: "", err: "" } })), false);
  assert.deepEqual(calls, [["merge-base", "--is-ancestor", "origin/x", "sync-pr-x"]], "origin/<pr> must be the ANCESTOR argument, the sync branch the descendant");
});

test("tooling-fast accepts --stop (and still rejects unknown flags)", () => {
  assert.equal(parseToolingFastArgv(["--stop"]).stop, true);
  assert.equal(parseToolingFastArgv([]).stop, false);
  assert.throws(() => parseToolingFastArgv(["--stopp"]), /unknown flag/);
});

test("stop kills a real registered process tree and nothing else", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stop-real-"));
  const pidFile = path.join(dir, "grandchild.pid");
  // the registered process spawns a grandchild of its own, as tooling-fast's workers do
  const child = spawn(process.execPath, ["-e",
    `const {spawn}=require("node:child_process");const g=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});require("node:fs").writeFileSync(${JSON.stringify(pidFile)},String(g.pid));setInterval(()=>{},1000) // tooling-fast.mjs`], { stdio: "ignore" });
  const bystander = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  try {
    // cmd basename must appear in the child's cmdline, as a real tooling-fast's would
    for (let i = 0; i < 100 && !fs.existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 50));
    const grandchild = +fs.readFileSync(pidFile, "utf8");
    assert.ok(grandchild > 0, "the grandchild was spawned");
    assert.equal(register("rt", { dir, pid: child.pid, cmd: "tooling-fast.mjs" }).ok, true);
    const r = await stop("rt", { dir, graceMs: 2000 });
    assert.equal(r.state, "stopped");
    if (child.exitCode === null && child.signalCode === null) await new Promise((res) => child.once("exit", res));   // stop() already waited: it may be gone
    assert.equal(child.signalCode, "SIGTERM");
    assert.equal(bystander.exitCode, null, "an unregistered process survives");
    await new Promise((r) => setTimeout(r, 200));
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    assert.equal(alive(grandchild), false, "the registered process's descendant died with it (no orphan)");
  } finally {
    try { process.kill(+fs.readFileSync(pidFile, "utf8"), "SIGKILL"); } catch { /* already gone */ } child.kill("SIGKILL"); bystander.kill("SIGKILL"); }
});

test("Q6: foreignClaims names live claims on the branch held by another session", () => {
  const me = "a".repeat(24), other = "b".repeat(24);
  const c = (slug, over = {}) => ({ slug, who: "w", text: "t", ageMin: 5, stale: false, released: false, ...over });
  const claims = [
    c(`cursor--topic-1234-${other}`), c(`cursor--topic-1234-${me}`), c(`cursor--topic-1234-${other}`, { stale: true }),
    c(`cursor--topic-1234-${other}`, { released: true }), c(`cursor--topic-12345-${other}`), c(`other-branch-${other}`),
  ];
  assert.equal(foreignClaims(claims, "cursor/topic-1234", me).length, 1, "one live foreign claim on that branch only");
  assert.equal(foreignClaims(claims, "cursor/topic-1234", other).length, 1, "now mine is the other, and the first is foreign");
  assert.equal(foreignClaims(claims.slice(1, 2), "cursor/topic-1234", me).length, 0, "my own claim never blocks");
  assert.equal(foreignClaims([c("x-" + other)], "claude/x", null).length, 1, "claude/ prefix folded like claimSlug");
  assert.deepEqual(foreignClaims(null, "x"), []);
});

test("cachedRef / cachedPlan: a PR ref the clone never fetched is fetched, not handed back as an instruction (W2)", async () => {
  const { cachedRef, cachedPlan } = await import("../../tools/ci/sync-pr.mjs");
  const have = new Set(["origin/claude/f1-game-project-26h3ng"]);
  const seen = [];
  const g = (args) => {
    seen.push(args.join(" "));
    if (args[0] === "rev-parse") return have.has(args[2]) ? { code: 0, out: "a".repeat(40), err: "" } : { code: 128, out: "", err: "fatal: Needed a single revision" };
    if (args[0] === "fetch") { have.add(args[4].split(":")[1].replace("refs/remotes/", "")); return { code: 0, out: "", err: "" }; }
    return { code: 0, out: "", err: "" };
  };
  const plan = cachedPlan("cursor/new-pr-1a2b", g);
  assert.deepEqual(seen.filter((c) => c.startsWith("fetch")), ["fetch --quiet --no-tags origin +refs/heads/cursor/new-pr-1a2b:refs/remotes/origin/cursor/new-pr-1a2b"],
    "the missing PR ref is fetched once; the cached deploy ref is not re-fetched");
  assert.equal(plan.source, "cached-remote-refs (fetched missing: cursor/new-pr-1a2b)");
  const gone = (args) => (args[0] === "fetch" ? { code: 128, out: "", err: "fatal: couldn't find remote ref refs/heads/nope" } : { code: 128, out: "", err: "bad" });
  assert.throws(() => cachedRef("nope", gone), /origin\/nope is not cached and fetching it failed: fatal: couldn't find remote ref/);
});

test("gitPush: GIT_TERMINAL_PROMPT=0 always; one retry on a sideband / hung-up disconnect, never on auth (W2)", async () => {
  const { gitPush, isTransientPushError } = await import("../../tools/lib/git-push.mjs");
  assert.equal(isTransientPushError("error: RPC failed; curl 92\nfatal: unexpected disconnect while reading sideband packet"), true);
  assert.equal(isTransientPushError("fatal: the remote end hung up unexpectedly"), true);
  assert.equal(isTransientPushError("! [rejected] x -> x (fetch first)"), false);
  assert.equal(isTransientPushError("fatal: Authentication failed for 'https://github.com/a/b'\nfatal: the remote end hung up unexpectedly"), false, "auth is never retried");
  const script = (results) => {
    const calls = [];
    return { calls, run: (cmd, args, opts) => { calls.push({ cmd, args, prompt: opts.env.GIT_TERMINAL_PROMPT }); return results[calls.length - 1]; } };
  };
  const drop = { status: 1, stdout: "", stderr: "fatal: the remote end hung up unexpectedly" };
  const ok = { status: 0, stdout: "", stderr: "To github.com:x/y\n   a..b  x -> x" };
  let s = script([drop, ok]);
  let r = gitPush(["origin", "a:b"], { run: s.run, sleep: () => {}, env: {} });
  assert.deepEqual([r.code, r.attempts], [0, 2]);
  assert.deepEqual(s.calls.map((c) => [c.cmd, c.args.join(" "), c.prompt]), [["git", "push origin a:b", "0"], ["git", "push origin a:b", "0"]]);
  s = script([drop, drop]);
  r = gitPush(["origin", "a:b"], { run: s.run, sleep: () => {}, env: {} });
  assert.deepEqual([r.code, r.attempts, s.calls.length], [1, 2, 2], "a second drop is reported, not looped");
  s = script([{ status: 1, stdout: "", stderr: "! [rejected] (non-fast-forward)" }]);
  r = gitPush(["origin", "a:b"], { run: s.run, sleep: () => {}, env: {} });
  assert.deepEqual([r.code, r.attempts], [1, 1], "a rejection is not a disconnect");
});
