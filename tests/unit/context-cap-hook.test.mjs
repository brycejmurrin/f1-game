/* context-cap-hook.test.mjs — .claude/hooks/context-cap.py (audit 2026-10-26 #2/#3, D6).
 *
 * Live context = the last main-chain assistant row's usage (input + cache read
 * + cache creation) in a synthetic transcript. Soft cap by role from the first
 * prompt's TITLE (launch-policy.md §Size stop), APEX_STOP_AT_K or a quoted
 * override file; past soft PostToolUse warns once per 25k, past hard (soft +
 * 50k) PreToolUse refuses all but the hand-off kit. Its own errors fail OPEN.
 * Run: node --test tests/unit/context-cap-hook.test.mjs   (< 2 s)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/context-cap.py");

function fixture(title, k, { sidechainK = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "context-cap-"));
  const usage = (n) => ({ input_tokens: 2, cache_read_input_tokens: n * 1000 - 1002, cache_creation_input_tokens: 1000, output_tokens: 10 });
  const rows = [
    { type: "queue-operation" },
    { type: "user", message: { role: "user", content: `${title}\nTAGS: fleet:a\nSTOP AT: 999k` } },
    { type: "assistant", message: { usage: usage(102) } },
    { type: "assistant", message: { usage: usage(k) } },
  ];
  if (sidechainK) rows.push({ type: "assistant", isSidechain: true, message: { usage: usage(sidechainK) } });
  rows.push({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } });
  const t = path.join(root, "t.jsonl");
  fs.writeFileSync(t, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { root, t };
}
const run = ({ root, t }, event, tool = "Grep", input = {}, env = {}) => {
  const r = spawnSync("python3", [HOOK], {
    input: JSON.stringify({ hook_event_name: event, session_id: "s1", transcript_path: t, cwd: root, tool_name: tool, tool_input: input }),
    encoding: "utf8", timeout: 10000, env: { ...process.env, APEX_STOP_AT_K: "", ...env, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const W = "TITLE: [Worker] A·W1·L1 · ci · Opus — x";
const O = "TITLE: [Orchestrator] A·O9 · fleet · Opus — x";

test("under the soft cap: silent on both events", () => {
  const f = fixture(W, 140);
  assert.equal(run(f, "PostToolUse"), null);
  assert.equal(run(f, "PreToolUse"), null);
});

test("past soft: PostToolUse warns once per 25k step; PreToolUse still allows", () => {
  const f = fixture(W, 160);
  const w = run(f, "PostToolUse");
  assert.match(w.additionalContext, /160k >= soft cap 150k \(role worker\).*HANDOFF/);
  assert.equal(run(f, "PostToolUse"), null, "the same step warns once");
  assert.equal(run(f, "PreToolUse"), null);
  const g = fixture(W, 180);
  fs.cpSync(path.join(f.root, "artifacts"), path.join(g.root, "artifacts"), { recursive: true });
  assert.match(run(g, "PostToolUse").additionalContext, /180k/, "the next 25k step warns again");
});

test("past hard: PreToolUse denies work tools, allows the hand-off kit", () => {
  const f = fixture(W, 205);
  assert.equal(run(f, "PreToolUse", "Grep").permissionDecision, "deny");
  assert.match(run(f, "PreToolUse", "Grep").permissionDecisionReason, /205k >= 200k/);
  assert.equal(run(f, "PreToolUse", "Bash", { command: "npm run test:tooling-fast" }).permissionDecision, "deny");
  assert.equal(run(f, "PreToolUse", "Bash", { command: "git push -u origin cursor/x-1" }), null);
  assert.equal(run(f, "PreToolUse", "Bash", { command: "node tools/ci/fleet-bus.mjs send DONE" }), null);
  assert.equal(run(f, "PreToolUse", "mcp__claude-code-remote__send_message"), null);
  assert.equal(run(f, "PreToolUse", "mcp__github__update_pull_request"), null);
  // Enough to commit what is on disk (A·W58 was locked out holding unregistered files).
  for (const t of ["Edit", "Write", "ReadNotifications", "SendMessage"]) assert.equal(run(f, "PreToolUse", t), null, t);
  for (const command of ["node --test tests/unit/agent-config.test.mjs", "npm run gen", "npm run test:guards"])
    assert.equal(run(f, "PreToolUse", "Bash", { command }), null, command);
});

test("caps per role: an orchestrator gets 200k; an untitled session has no cap; a sidechain row is ignored", () => {
  assert.equal(run(fixture(O, 205), "PreToolUse"), null);
  assert.equal(run(fixture(O, 255), "PreToolUse").permissionDecision, "deny");
  assert.equal(run(fixture("fix the HUD please", 900), "PreToolUse"), null);
  assert.equal(run(fixture("fix the HUD please", 900), "PostToolUse"), null);
  assert.equal(run(fixture(W, 120, { sidechainK: 600 }), "PreToolUse"), null);
});

test("overrides: APEX_STOP_AT_K wins; an override file needs Bryce's quote", () => {
  const f = fixture(W, 205);
  assert.equal(run(f, "PreToolUse", "Grep", {}, { APEX_STOP_AT_K: "300" }), null);
  fs.mkdirSync(path.join(f.root, "artifacts/context-cap"), { recursive: true });
  const o = path.join(f.root, "artifacts/context-cap/override.json");
  fs.writeFileSync(o, JSON.stringify({ soft_k: 300 }));
  assert.equal(run(f, "PreToolUse").permissionDecision, "deny", "no quote, no override");
  fs.writeFileSync(o, JSON.stringify({ soft_k: 300, quote: "Keep going to 300k" }));
  assert.equal(run(f, "PreToolUse"), null);
});

test("fails open: junk payload, missing transcript, garbage transcript, subagent call", () => {
  const junk = spawnSync("python3", [HOOK], { input: "nope", encoding: "utf8" });
  assert.equal(junk.status, 0);
  assert.equal(junk.stdout.trim(), "");
  assert.match(junk.stderr, /fail open/);
  const f = fixture(W, 205);
  assert.equal(run({ root: f.root, t: path.join(f.root, "missing.jsonl") }, "PreToolUse"), null);
  fs.writeFileSync(f.t, "garbage\n{\n");
  assert.equal(run(f, "PreToolUse"), null);
  const g = fixture(W, 205);
  const sub = spawnSync("python3", [HOOK], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", agent_id: "a1", transcript_path: g.t, tool_name: "Grep" }),
    encoding: "utf8", env: { ...process.env, APEX_STOP_AT_K: "", CLAUDE_PROJECT_DIR: g.root },
  });
  assert.equal(sub.stdout.trim(), "");
});

test("settings.json wires it on PreToolUse and PostToolUse, fail open, and launch-policy's table matches CAPS", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8")).hooks;
  for (const ev of ["PreToolUse", "PostToolUse"]) {
    const g = hooks[ev].find((x) => x.hooks.some((h) => h.command.includes("context-cap.py")));
    assert.ok(g, `context-cap.py not wired on ${ev}`);
    assert.ok(g.hooks.every((h) => h.onFailure !== "block"), `${ev}: context-cap must fail open`);
  }
  const policy = fs.readFileSync(path.join(ROOT, ".claude/skills/agent-fleet/references/launch-policy.md"), "utf8");
  const src = fs.readFileSync(HOOK, "utf8");
  for (const [role, cap] of [["worker", 150], ["orchestrator", 200], ["reviewer", 150]]) {
    assert.match(policy, new RegExp(`\\| ${role} \\| ${cap}k`), `launch-policy.md ${role} row`);
    assert.match(src, new RegExp(`"${role}": ${cap}\\b`), `context-cap.py CAPS ${role}`);
  }
});
