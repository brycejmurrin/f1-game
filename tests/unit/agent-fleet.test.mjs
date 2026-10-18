// agent-fleet — the orchestrator/worker contract every vendor's session reads
// (.claude/skills/agent-fleet, docs/notes/MULTI-AGENT-ORCHESTRATION-2026-10-10.md).
// Each case is a mistake a real session made or was told to make on 2026-10-10:
// AGENTS.md called Claude Code's only PR-watch tool "a fake name", a launch
// prompt without the fields the launch policy requires, and a fleet
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
const ADAPT = read(".claude/skills/agent-fleet/references/adapters.md");

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

test("a subscription never stands alone: each host's timer is named beside it", () => {
  // anthropics/claude-code#62561: subscribe_pr_activity dropped check_run completions
  // and sessions sat idle through a red; the timer wake that reads CI is the fallback.
  for (const [file, text] of [["AGENTS.md", read("AGENTS.md")],
    ["steward/SKILL.md", read(".claude/skills/steward/SKILL.md")],
    ["agent-fleet/SKILL.md", SKILL], ["references/worker.md", WORKER]]) {
    assert.match(text, /send_later/, `${file} names Claude Code's timer`);
    assert.match(text, /subscribe_timer/, `${file} names Cursor's timer`);
  }
  assert.match(WORKER, /ci-watch\.mjs --sha <head> --once/, "worker reads CI on every wake");
  assert.match(WORKER, /tooling-fast\.mjs --changed/);
  assert.match(WORKER, /tooling-fast\.mjs --changed --jobs=3/, "worker's edit loop keeps the rule-4 job cap");
});

test("the adapter table covers each host's verified spawn path", () => {
  // The table moved from orchestrator.md to adapters.md (2026-10-18 split); the pins moved with it.
  const table = ADAPT.match(/## Per-vendor adapters[\s\S]*?\n\| spawn \|([^\n]*)/);
  assert.ok(table, "adapters.md has the adapter table with a spawn row");
  assert.match(table[1], /create_session/, "Claude Code spawn");
  assert.match(table[1], /environment: "cloud"/, "Cursor in-agent Task spawn");
  assert.match(table[1], /POST \/v1\/agents/, "Cursor API spawn");
  assert.match(table[1], /grok [^|]*-p /, "Grok Build headless spawn");
  assert.match(ADAPT, /--deny "Bash\(git push --force\*\)"/, "a Grok worker is denied force-push");
});

test("the steward card's hashes match the files it lets sessions skip", async () => {
  const { createHash } = await import("node:crypto");
  const card = read("docs/notes/APEX-STEWARD-CARD-2026-10-05.md");
  const line = card.match(/^HASHES: (.*)$/m);
  assert.ok(line, "card carries a HASHES line");
  const files = { steward: ".claude/skills/steward/SKILL.md",
    "check-changes": ".claude/skills/check-changes/SKILL.md",
    "pr-template": ".github/pull_request_template.md" };
  for (const [, key, want] of line[1].matchAll(/([a-z-]+)=([0-9a-f]{8})/g)) {
    assert.ok(files[key], `unknown HASHES key ${key}`);
    const got = createHash("sha256").update(fs.readFileSync(path.join(ROOT, files[key]))).digest("hex").slice(0, 8);
    assert.equal(got, want, `card says ${key}=${want} but ${files[key]} hashes to ${got}: refresh the card`);
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

test("the launch template carries every field the agent-fleet launch policy requires", () => {
  const tpl = ORCH.match(/## Launch template[\s\S]*?```text\n([\s\S]*?)```/);
  assert.ok(tpl, "orchestrator.md has the fenced launch template");
  for (const field of ["OWNED:", "FORBIDDEN:", "DONE WHEN:", "CAPS:", "ORCHESTRATOR:",
    "ready-gate.mjs", "Do not enable auto-merge or merge."]) {
    assert.ok(!tpl[1].includes("ready-full-cap"), "the ready cap was retired 2026-10-16");
    assert.ok(!tpl[1].includes("PUSH SLOT"), "paced push was retired 2026-10-16");
    assert.ok(tpl[1].includes(field), `launch template lost ${field}`);
  }
  // The policy moved from AGENTS.md §Concurrent PRs to the skill (2026-10-14 trim); the pin moved with it.
  const policy = read(".claude/skills/agent-fleet/references/launch-policy.md").split("## Launch policy")[1] || "";
  assert.match(policy, /the exact line `Do not enable auto-merge or merge\.`/,
    "the template's last line is the one the skill's §Launch policy mandates verbatim");
  assert.match(read("AGENTS.md"), /skill `agent-fleet` §Launch policy/, "AGENTS.md points launch policy at the skill");
});

test("the skill routes to both references and to its evidence note", () => {
  for (const ref of ["references/orchestrator.md", "references/authority.md", "references/adapters.md",
    "references/running.md", "references/worker.md"]) {
    assert.ok(SKILL.includes(ref), `SKILL.md links ${ref}`);
  }
  const note = "docs/notes/MULTI-AGENT-ORCHESTRATION-2026-10-10.md";
  assert.ok(SKILL.includes(note) && fs.existsSync(path.join(ROOT, note)), "evidence note exists and is linked");
  assert.match(read("AGENTS.md"), /skill `agent-fleet`/, "AGENTS.md points multi-agent runs at the skill");
});
