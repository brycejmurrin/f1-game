// deploy.mjs --pr without gh: the REST fallback, driven against a fake `curl`
// on PATH so the call sequence and the way the token travels are pinned without
// the network. Properties earned by shipped bugs:
//   - the token rides in the curl config on stdin, never the argv (`ps` shows
//     argv to every process on the box);
//   - the PR title comes from the branch's last NON-merge commit (#182 shipped
//     titled "Merge remote-tracking branch …");
//   - auto-merge is NEVER armed from deploy (2026-10-06): only CI Watch arms
//     SQUASH on ready PRs — no CCR auto_merge, no `gh pr merge --auto`.
// Under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openPrRest, DEPLOY_BRANCH } from "../../tools/ci/deploy.mjs";

function fakeCurl(dir, replies) {
  // Each invocation appends its argv and its stdin to a log, and answers by URL.
  const script = `#!/usr/bin/env bash
url="\${@: -1}"
n=$(ls "${dir}"/call-* 2>/dev/null | wc -l)
printf '%s\\n' "$@" > "${dir}/call-$n.argv"
cat > "${dir}/call-$n.stdin"
case "$url" in
  *graphql*) echo "GraphQL must never be called" >&2; exit 23 ;;
  *ccr/auto_merge*) echo "auto-merge must never be armed from deploy" >&2; exit 24 ;;
  *"/pulls?"*) body='${replies.list}' ;;
  *"/pulls/"*) body='${replies.readback}' ;;
  *"/pulls") body='${replies.create}' ;;
  *) echo "unexpected url $url" >&2; exit 22 ;;
esac
# Real curl was given -w '\\n%{http_code}', so the status rides on its own
# LAST line after the body. The fake has to do the same or the parser under
# test never sees a status at all.
printf '%s\\n%s' "$body" "${replies.status || 200}"
`;

  fs.writeFileSync(path.join(dir, "curl"), script, { mode: 0o755 });
}

function withFakeCurl(replies, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-fake-curl-"));
  fakeCurl(dir, replies);
  const PATH = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${PATH}`;
  try { return fn(dir); }
  finally { process.env.PATH = PATH; fs.rmSync(dir, { recursive: true, force: true }); }
}

const calls = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".argv")).sort()
  .map((f) => ({ argv: fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean),
                 stdin: fs.readFileSync(path.join(dir, f.replace(/\.argv$/, ".stdin")), "utf8") }));

test("no open PR: create one, never arm auto-merge, and keep the token off the argv", () => {
  withFakeCurl({
    list: "[]",
    create: '{"html_url":"https://github.com/brycejmurrin/f1-game/pull/999","number":999}',
  }, (dir) => {
    const r = openPrRest("claude/unit-branch", "ghp_SECRET_TOKEN");
    assert.equal(r.pr, "https://github.com/brycejmurrin/f1-game/pull/999");
    assert.equal(r.autoMerge, undefined);
    assert.match(r.note, /do not arm auto-merge/i);
    const c = calls(dir);
    assert.equal(c.length, 2, "list + create only — no arm, no readback");
    for (const call of c) {
      assert.ok(!call.argv.join(" ").includes("ghp_SECRET_TOKEN"), "token on the argv");
      assert.match(call.stdin, /^header = "Authorization: Bearer ghp_SECRET_TOKEN"$/m);
      assert.ok(call.argv.includes("-K") && call.argv.includes("-"), "curl must read its config from stdin");
    }
    assert.match(c[0].argv.at(-1), new RegExp(`/pulls\\?state=open&head=brycejmurrin:claude%2Funit-branch&base=${encodeURIComponent(DEPLOY_BRANCH).replace(/\//g, "\\/")}`));
    const body = JSON.parse(JSON.parse(/^data-binary = (".*")$/m.exec(c[1].stdin)[1]));
    assert.equal(body.head, "claude/unit-branch");
    assert.equal(body.base, DEPLOY_BRANCH);
    assert.ok(body.title.length > 0, "a title is always sent");
    // The title is the branch's last NON-MERGE commit: a deploy merges the base
    // tip before it opens the PR, so HEAD is a merge commit (PR #182 shipped
    // titled 'Merge remote-tracking branch …'). Compared against git itself,
    // not a /^Merge / pattern: that read the REAL repo's HEAD, so any branch
    // whose last ordinary commit was titled "Merge deploy tip; …" failed here
    // (PR #303, 2026-09-24) while a real merge commit could not reach it.
    const git = (a) => execFileSync("git", a, { encoding: "utf8" }).trim();
    const nonMerge = [`origin/${DEPLOY_BRANCH}..HEAD`, `${DEPLOY_BRANCH}..HEAD`, "HEAD"]
      .map((r) => { try { return git(["log", "-1", "--no-merges", "--format=%s", r]); } catch { return ""; } })
      .find(Boolean);
    assert.equal(body.title, nonMerge, "the title must be the last NON-MERGE commit's subject");
    const headIsMerge = git(["rev-list", "--parents", "-n", "1", "HEAD"]).split(" ").length > 2;
    if (headIsMerge) assert.notEqual(body.title, git(["log", "-1", "--format=%s", "HEAD"]), "never the merge commit's own subject");
    assert.ok(!c.some((x) => /ccr\/auto_merge/.test(x.argv.at(-1))), "must never hit CCR auto_merge");
  });
});

test("an open PR for the head is reused, nothing is created, and auto-merge is not armed", () => {
  withFakeCurl({
    list: '[{"html_url":"https://github.com/brycejmurrin/f1-game/pull/7","number":7}]',
    create: "{}",
  }, (dir) => {
    const r = openPrRest("claude/unit-branch", "t");
    assert.equal(r.pr, "https://github.com/brycejmurrin/f1-game/pull/7");
    assert.match(r.note, /already open/);
    assert.equal(r.autoMerge, undefined);
    assert.match(r.note, /do not arm auto-merge/i);
    const urls = calls(dir).map((c) => c.argv.at(-1));
    assert.equal(urls.length, 1, "list only");
    assert.ok(!urls.some((u) => /\/pulls$/.test(u)), "nothing may be created when a PR is already open");
    assert.ok(!urls.some((u) => /ccr\/auto_merge/.test(u)), "must never arm");
  });
});

test("a non-2xx PR lookup is an ERROR, not an empty list", () => {
  // Read as "no PR is open" it goes on to create one and dies on GitHub's 422,
  // reporting a create failure instead of saying it could not look.
  withFakeCurl({
    list: '{"message":"Bad credentials"}', status: 401,
    create: "{}",
  }, () => {
    assert.throws(() => openPrRest("claude/unit-branch", "t"), /PR lookup failed \(HTTP 401\)/);
  });
});

test("deploy never arms auto-merge: no CCR route, no gh --auto --merge", () => {
  // 2026-10-06: foreign MERGE arms from agents/tools (#1134/#1135). Only CI
  // Watch arms SQUASH on ready PRs. Pinned by source for the gh path (needs
  // real gh to exercise) and by the fake-curl exit-24 for the REST path.
  const src = fs.readFileSync(new URL("../../tools/ci/deploy.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /ccr\/auto_merge/, "REST path must not call CCR auto_merge");
  assert.doesNotMatch(src, /merge_method/, "no merge_method payload");
  const openPr = src.slice(src.indexOf("function openPr(branch)"));
  const body = openPr.slice(0, openPr.indexOf("\nexport function gateOnly") >= 0
    ? openPr.indexOf("\nexport function gateOnly")
    : openPr.indexOf("\n/* THE GATE"));
  // Fallback: take until next top-level export/comment after openPr's closing brace
  const fn = openPr.match(/^function openPr\(branch\) \{[\s\S]*?\n\}/m)?.[0] || body;
  assert.doesNotMatch(fn, /"pr", "merge"/, "gh path must not call gh pr merge");
  assert.doesNotMatch(fn, /--auto/, "gh path must not pass --auto");
  assert.match(fn, /CI Watch arms SQUASH/, "gh path must point at CI Watch squash arm");
});
