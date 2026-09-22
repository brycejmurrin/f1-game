// deploy.mjs --pr without gh: the REST fallback, driven against a fake `curl`
// on PATH so the call sequence and the way the token travels are pinned without
// the network. Three properties, each earned by a shipped bug:
//   - the token rides in the curl config on stdin, never the argv (`ps` shows
//     argv to every process on the box);
//   - the PR title comes from the branch's last NON-merge commit (#182 shipped
//     titled "Merge remote-tracking branch …");
//   - auto-merge is CONFIRMED by reading the PR back, never inferred from the
//     absence of an error, and GraphQL is never called at all — it is refused
//     from Claude Code sessions with a 200-shaped `{message}` that the first
//     version read as success, so #182 and #184 were both told auto-merge was
//     armed when neither timeline ever saw an `auto_merge_enabled` event.
// Under a second.
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
  *graphql*) echo "GraphQL must never be called" >&2; exit 23 ;;
  *ccr/auto_merge*) body='${replies.arm}' ;;
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

test("no open PR: create one, ARM auto-merge over the CCR route, and keep the token off the argv", () => {
  withFakeCurl({
    list: "[]",
    create: '{"html_url":"https://github.com/brycejmurrin/f1-game/pull/999","number":999}',
    arm: '{"ok":true}',
    readback: '{"html_url":"https://github.com/brycejmurrin/f1-game/pull/999","auto_merge":{"merge_method":"merge"}}',
  }, (dir) => {
    const r = openPrRest("claude/unit-branch", "ghp_SECRET_TOKEN");
    assert.equal(r.pr, "https://github.com/brycejmurrin/f1-game/pull/999");
    assert.equal(r.autoMerge, true);
    assert.match(r.note, /armed and CONFIRMED/);
    const c = calls(dir);
    assert.equal(c.length, 4, "list, create, arm, read back");
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
    assert.match(c[2].argv.at(-1), /\/pulls\/999\/ccr\/auto_merge$/, "auto-merge goes through the session's CCR route");
    assert.ok(c[2].argv.includes("PUT"));
    assert.match(c[3].argv.at(-1), /\/pulls\/999$/, "the PR is read back to confirm");
  });
});

test("an open PR for the head is reused, and nothing is created", () => {
  withFakeCurl({ list: '[{"html_url":"https://github.com/brycejmurrin/f1-game/pull/7"}]', create: "{}", arm: "{}", readback: "{}" }, (dir) => {
    const r = openPrRest("claude/unit-branch", "t");
    assert.equal(r.pr, "https://github.com/brycejmurrin/f1-game/pull/7");
    assert.match(r.note, /already open/);
    assert.equal(calls(dir).length, 1);
  });
});

test("a REFUSED arm is reported as not armed — the exact lie #182 and #184 were told", () => {
  // The arm call answers 200 with a message body and no `errors` key, which is
  // precisely the shape the proxy returns for GraphQL. The readback is the only
  // thing that can tell the difference, so it decides.
  withFakeCurl({
    list: "[]",
    create: '{"html_url":"https://github.com/brycejmurrin/f1-game/pull/8","number":8}',
    arm: '{"message":"GitHub GraphQL is not available from Claude Code sessions"}',
    readback: '{"html_url":"https://github.com/brycejmurrin/f1-game/pull/8","auto_merge":null}',
  }, () => {
    const r = openPrRest("claude/unit-branch", "t");
    assert.equal(r.pr, "https://github.com/brycejmurrin/f1-game/pull/8");
    assert.equal(r.autoMerge, false, "a 200 with no error is NOT evidence that auto-merge is armed");
    assert.match(r.note, /auto-merge NOT armed/);
    assert.match(r.note, /WATCH this PR and merge it yourself/);
  });
});
