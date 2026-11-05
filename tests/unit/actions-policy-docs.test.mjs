import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseYAML } from "yaml";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

test("queue catalog has exactly the supported intent labels; issue templates do not enqueue findings", () => {
  const labels = JSON.parse(read(".github/labels.json"));
  assert.deepEqual(labels.map((l) => l.name).sort(), ["queue:paused", "queue:priority", "queue:ready"]);
  for (const label of labels) {
    assert.match(label.color, /^[a-f0-9]{6}$/i);
    assert.ok(label.description.length > 0 && label.description.length <= 100, "GitHub label description limit");
  }
  for (const name of fs.readdirSync(path.join(ROOT, ".github/ISSUE_TEMPLATE"))) {
    if (!/\.ya?ml$/.test(name) || name === "config.yml") continue;
    const template = parseYAML(read(`.github/ISSUE_TEMPLATE/${name}`));
    assert.ok(!template.labels || template.labels.length === 0, `${name} must require explicit intake`);
  }
});

// Exercise the real shared guard with a local API stand-in. No live GitHub call is made.
function guard(input, { current = "", apiCode = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-policy-"));
  try {
    const gh = path.join(dir, "gh");
    fs.writeFileSync(gh, '#!/bin/sh\nprintf "%s\\n" "$APEX_POLICY_TEST_LABELS"\nexit "$APEX_POLICY_TEST_RC"\n', { mode: 0o755 });
    const result = spawnSync("bash", [path.join(ROOT, ".claude/hooks/github-mcp-guard.sh")], {
      cwd: ROOT, input: JSON.stringify({ tool_name: "mcp__github__issue_write", tool_input: input }),
      encoding: "utf8", timeout: 5000,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, APEX_POLICY_TEST_LABELS: current,
        APEX_POLICY_TEST_RC: String(apiCode) },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput : null;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const update = (labels) => ({ owner: "fixture", repo: "fixture", method: "update", issue_number: 7, labels });

test("replacement label lists cannot silently clear a queue pause or unknown current state", () => {
  assert.equal(guard(update(["queue:paused", "queue:ready"]), { apiCode: 1 }), null,
    "explicitly retaining the pause requires no destructive read");
  assert.equal(guard(update(["queue:ready"]), { current: "queue:paused" }).permissionDecision, "ask");
  assert.equal(guard(update([]), { apiCode: 1 }).permissionDecision, "ask");
  assert.equal(guard(update(["queue:ready"]), { current: "queue:ready" }), null);
  assert.equal(guard({ owner: "fixture", repo: "fixture", issue_number: 7, body: "checkpoint" }), null,
    "body updates do not replace labels");
});

test("legacy label attachments no longer act as pause aliases", () => {
  for (const current of ["hold", "claimed", "blocked", "dispatch:pause"]) {
    assert.equal(guard(update(["queue:ready"]), { current }), null, current);
  }
});

test("active queue guidance does not teach retired label controls", () => {
  const files = ["AGENTS.md", ".github/pull_request_template.md", ".claude/skills/steward/SKILL.md",
    ".claude/skills/dispatcher/SKILL.md", ".claude/skills/check/SKILL.md", ".claude/skills/ship/SKILL.md",
    ".claude/skills/handoff/SKILL.md", ".claude/rules/ci-tools.md", ".claude/rules/claude-config.md",
    ".claude/memory/track-with-tasks-and-messages.md", ".claude/memory/survey-then-fix.md",
    "tools/ci/worker-prompt.md", "docs/README.md", "docs/TESTING.md"];
  const retired = /`(?:hold|claimed|config-ok|needs-owner|needs-decision|lane:(?:claude|codex|cursor)|dispatch:(?:pause|merge-pause))`|label:ready|labels\[\]=(?:ready|claimed|land)|`land` label/;
  for (const name of files) assert.doesNotMatch(read(name), retired, name);
});
