// agent-fleet — the orchestrator/worker contract every vendor's session reads
// (.claude/skills/agent-fleet, docs/notes/MULTI-AGENT-ORCHESTRATION-2026-10-10.md).
// Each case is a mistake a real session made or was told to make on 2026-10-10:
// AGENTS.md called Claude Code's only PR-watch tool "a fake name", a launch
// prompt without the fields AGENTS.md §Concurrent PRs requires, and a fleet
// block whose keys drifted between the skill and the worker reference.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SKILL = read(".claude/skills/agent-fleet/SKILL.md");
const ORCH = read(".claude/skills/agent-fleet/references/orchestrator.md");
const WORKER = read(".claude/skills/agent-fleet/references/worker.md");

test("every host's PR-subscription tool is named for its host, and none is called fake", () => {
  for (const [file, text] of [["AGENTS.md", read("AGENTS.md")],
    ["steward/SKILL.md", read(".claude/skills/steward/SKILL.md")],
    ["agent-fleet/SKILL.md", SKILL], ["references/worker.md", WORKER]]) {
    assert.doesNotMatch(text, /fake name|never invent `subscribe_pr_activity`/,
      `${file} must not call Claude Code's subscribe_pr_activity fake`);
    assert.match(text, /subscribe_pr_activity/, `${file} names the Claude Code tool`);
    assert.match(text, /subscribe_github_ci/, `${file} names the Cursor tool`);
  }
});

test("the fleet block keys are the same in the skill and the worker reference", () => {
  const block = SKILL.match(/```fleet\n([\s\S]*?)```/);
  assert.ok(block, "SKILL.md carries the fenced fleet block");
  const keys = [...block[1].matchAll(/^([a-z-]+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys, ["worker", "orchestrator", "owned", "state", "blocker", "needs-orchestrator"]);
  assert.match(block[1], /state: .*\bblocked\b/);
  for (const k of ["state: blocked", "needs-orchestrator: yes"]) {
    assert.ok(WORKER.includes(k), `worker.md escalation uses \`${k}\``);
    assert.ok(ORCH.includes(k), `orchestrator.md launch template uses \`${k}\``);
  }
  assert.ok(WORKER.includes("@orchestrator BLOCKED:") && ORCH.includes("@orchestrator BLOCKED:"),
    "one escalation comment prefix, the same in both references");
});

test("the launch template carries every field AGENTS.md §Concurrent PRs requires", () => {
  const tpl = ORCH.match(/## Launch template[\s\S]*?```text\n([\s\S]*?)```/);
  assert.ok(tpl, "orchestrator.md has the fenced launch template");
  for (const field of ["OWNED:", "FORBIDDEN:", "DONE WHEN:", "CAPS:", "ORCHESTRATOR:",
    "ready-gate.mjs", "ready-full-cap.mjs", "Do not enable auto-merge or merge."]) {
    assert.ok(tpl[1].includes(field), `launch template lost ${field}`);
  }
  assert.match(read("AGENTS.md"), /the exact line `Do not enable auto-merge or merge\.`/,
    "the template's last line is the one AGENTS.md mandates verbatim");
});

test("the skill routes to both references and to its evidence note", () => {
  for (const ref of ["references/orchestrator.md", "references/worker.md"]) {
    assert.ok(SKILL.includes(ref), `SKILL.md links ${ref}`);
  }
  const note = "docs/notes/MULTI-AGENT-ORCHESTRATION-2026-10-10.md";
  assert.ok(SKILL.includes(note) && fs.existsSync(path.join(ROOT, note)), "evidence note exists and is linked");
  assert.match(read("AGENTS.md"), /skill `agent-fleet`/, "AGENTS.md points multi-agent runs at the skill");
});
