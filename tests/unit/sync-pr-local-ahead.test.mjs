import "../helpers/git-fixture-env.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";
/* sync-pr-local-ahead.test.mjs — #7171: sync-pr must not push a head that silently drops the worker's unpushed local commits. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { localAheadRefusal } from "../../tools/ci/sync-pr.mjs";
import { gitRun, gitMust } from "../../tools/lib/git-run.mjs";

function fixture() {
  const root = mkTmpDir("sync-pr-ahead-");
  const origin = `${root}/origin.git`, work = `${root}/work`;
  const g = (cwd, ...a) => gitMust(gitRun(["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd }), a.join(" "));
  g(root, "init", "-q", "--bare", "-b", "main", origin);
  g(root, "clone", "-q", origin, work);
  g(work, "checkout", "-q", "-b", "topic");
  g(work, "commit", "-q", "--allow-empty", "-m", "base");
  g(work, "push", "-q", "-u", "origin", "topic");
  return { work, g, read: (a) => gitRun(a, { cwd: work }) };
}

test("a local commit ahead of origin/<branch> makes sync-pr refuse, naming the count", () => {
  const f = fixture();
  assert.equal(localAheadRefusal("topic", f.read), null, "in step: nothing to refuse");
  f.g(f.work, "commit", "-q", "--allow-empty", "-m", "the worker's fix");
  const r = localAheadRefusal("topic", f.read);
  assert.equal(r.ahead, 1);
  assert.ok(r.refusal.startsWith("local topic is 1 commit ahead of origin/topic") && r.refusal.includes("push them first"));
});

test("no local branch, or local behind origin, refuses nothing", () => {
  const f = fixture();
  assert.equal(localAheadRefusal("nope", f.read), null);
  f.g(f.work, "commit", "-q", "--allow-empty", "-m", "x");
  f.g(f.work, "push", "-q");
  f.g(f.work, "reset", "-q", "--hard", "HEAD~1");
  assert.equal(localAheadRefusal("topic", f.read), null);
});
