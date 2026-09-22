// deploy.mjs --pr without gh: the REST/GraphQL fallback, driven against a fake
// `curl` on PATH so the three calls (find open PR, create, enable auto-merge)
// and the way the token travels are pinned without the network. The token must
// ride in the curl config on stdin, never on the argv — `ps` shows argv to
// every process on the box. Under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openPrRest, DEPLOY_BRANCH } from "../../tools/ci/deploy.mjs";

function fakeCurl(dir, replies) {
  // Each invocation appends its argv and its stdin to a log, and answers by URL.
  const script = `#!/usr/bin/env bash
url="\${@: -1}"
n=$(ls "${dir}"/call-* 2>/dev/null | wc -l)
printf '%s\\n' "$@" > "${dir}/call-$n.argv"
cat > "${dir}/call-$n.stdin"
case "$url" in
  *graphql*) printf '%s' '${replies.graphql}' ;;
  *"/pulls?"*) printf '%s' '${replies.list}' ;;
  *"/pulls") printf '%s' '${replies.create}' ;;
  *) echo "unexpected url $url" >&2; exit 22 ;;
esac
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

test("no open PR: create one from HEAD, enable auto-merge, and keep the token off the argv", () => {
  withFakeCurl({
    list: "[]",
    create: '{"html_url":"https://github.com/brycejmurrin/f1-game/pull/999","node_id":"PR_kwDO1"}',
    graphql: '{"data":{"enablePullRequestAutoMerge":{"clientMutationId":null}}}',
  }, (dir) => {
    const r = openPrRest("claude/unit-branch", "ghp_SECRET_TOKEN");
    assert.equal(r.pr, "https://github.com/brycejmurrin/f1-game/pull/999");
    assert.match(r.note, /auto-merge \(merge commit\) enabled/);
    const c = calls(dir);
    assert.equal(c.length, 3, "list, create, auto-merge");
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
    assert.ok(!/^Merge /.test(body.title),
      "the title must come from the branch's last NON-MERGE commit: a deploy merges the base tip before it opens the PR, so HEAD is a merge commit (PR #182 shipped titled 'Merge remote-tracking branch …')");
    const gql = JSON.parse(JSON.parse(/^data-binary = (".*")$/m.exec(c[2].stdin)[1]));
    assert.match(gql.query, /enablePullRequestAutoMerge/);
    assert.equal(gql.variables.id, "PR_kwDO1");
  });
});

test("an open PR for the head is reused, and nothing is created", () => {
  withFakeCurl({ list: '[{"html_url":"https://github.com/brycejmurrin/f1-game/pull/7"}]', create: "{}", graphql: "{}" }, (dir) => {
    const r = openPrRest("claude/unit-branch", "t");
    assert.equal(r.pr, "https://github.com/brycejmurrin/f1-game/pull/7");
    assert.match(r.note, /already open/);
    assert.equal(calls(dir).length, 1);
  });
});

test("a refused auto-merge is reported in the note, not thrown — the PR still exists", () => {
  withFakeCurl({
    list: "[]",
    create: '{"html_url":"https://github.com/brycejmurrin/f1-game/pull/8","node_id":"PR_2"}',
    graphql: '{"errors":[{"message":"Pull request Auto merge is not allowed for this repository"}]}',
  }, () => {
    const r = openPrRest("claude/unit-branch", "t");
    assert.equal(r.pr, "https://github.com/brycejmurrin/f1-game/pull/8");
    assert.match(r.note, /auto-merge NOT enabled \(Pull request Auto merge is not allowed/);
  });
});
