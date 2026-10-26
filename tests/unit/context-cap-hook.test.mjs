// context-cap-hook.test.mjs — .claude/hooks/context-cap.py (Fleet B audit 2026-10-26 row 12).
//
// The hook reads live context from the transcript's newest main-thread `usage` block and the cap from the brief
// (STOP AT, else the role in launch-policy.md §Size stop). Advisory modes print `context N k / cap C k` once per
// level; PreToolUse denies Agent / create_session over the hard cap, except a hand-off to a successor.
//
// Run: node --test tests/unit/context-cap-hook.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/context-cap.py");
const POLICY = fs.readFileSync(path.join(ROOT, ".claude/skills/agent-fleet/references/launch-policy.md"), "utf8");

function fixture(brief, ctxs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcap-"));
  fs.mkdirSync(path.join(dir, ".claude/skills/agent-fleet/references"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude/skills/agent-fleet/references/launch-policy.md"), POLICY);
  const lines = [{ type: "queue-operation" }, { type: "user", message: { role: "user", content: brief } }];
  for (const c of ctxs) lines.push({ type: "assistant", message: { usage: { input_tokens: 2, cache_read_input_tokens: c - 1002, cache_creation_input_tokens: 1000 } } });
  lines.push({ type: "assistant", isSidechain: true, message: { usage: { input_tokens: 900000 } } });
  const t = path.join(dir, "t.jsonl");
  fs.writeFileSync(t, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return { dir, t };
}
function run(fx, payload, env = {}) {
  const e = { ...process.env, CLAUDE_PROJECT_DIR: fx.dir, ...env };
  for (const k of ["APEX_CTX_CAP", "APEX_CTX_SOFT", "APEX_CTX_HARD"]) if (!(k in env)) delete e[k];
  const r = spawnSync("python3", [HOOK], { input: JSON.stringify({ session_id: "s1", transcript_path: fx.t, ...payload }), env: e, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const prompt = { hook_event_name: "UserPromptSubmit", prompt: "wake" };

test("soft cap from the role table: one line, once per level", () => {
  const fx = fixture("You are Fleet B worker B·W9 for the repo.", [100000, 212400]);
  assert.match(run(fx, prompt), /^context-cap: context 212k \/ cap 200k \(role worker \(launch-policy\.md\); hard 250k\)\. Over the soft cap/);
  assert.equal(run(fx, prompt), "", "printed once");
  const post = JSON.parse(run(fixture("You are Fleet B worker x.", [260000]), { hook_event_name: "PostToolUse", tool_name: "Bash" }));
  assert.equal(post.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(post.hookSpecificOutput.additionalContext, /context 260k \/ cap 200k .*Over the hard cap/);
});

test("STOP AT in the brief and env overrides beat the role; no brief means no cap", () => {
  assert.match(run(fixture("You are the orchestrator.\nSTOP AT: 120k context or $5", [125000]), prompt), /cap 120k \(brief STOP AT; hard 170k\)/);
  assert.match(run(fixture("You are a worker.", [125000]), prompt, { APEX_CTX_SOFT: "100", APEX_CTX_HARD: "110" }), /cap 100k \(APEX_CTX_SOFT; hard 110k\)/);
  assert.equal(run(fixture("Fix the HUD clipping on phones please", [400000]), prompt), "", "a typed session has no cap");
  assert.equal(run(fixture("You are a worker.", [400000]), prompt, { APEX_CTX_CAP: "off" }), "");
  assert.equal(run(fixture("You are a worker.", [140000]), prompt), "", "under the soft cap");
});

test("PreToolUse: over the hard cap an Agent or create_session spawn is denied; a hand-off is allowed", () => {
  const fx = fixture("You are Fleet B worker x.", [255000]);
  const deny = JSON.parse(run(fx, { hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { prompt: "hand off" } })).hookSpecificOutput;
  assert.equal(deny.permissionDecision, "deny");
  assert.match(deny.permissionDecisionReason, /context 255k \/ cap 200k, over the hard cap 250k/);
  const cs = { hook_event_name: "PreToolUse", tool_name: "mcp__claude-code-remote__create_session" };
  assert.equal(JSON.parse(run(fx, { ...cs, tool_input: { prompt: "do more work" } })).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(run(fx, { ...cs, tool_input: { prompt: "HANDOFF: you are my successor" } }), "");
  assert.equal(run(fixture("You are Fleet B worker x.", [180000]), { hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: {} }), "", "soft only: allowed");
  assert.equal(run(fx, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} }), "", "other tools untouched");
});

test("fails open on garbage and is wired in settings.json", () => {
  const r = spawnSync("python3", [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0); assert.equal(r.stdout, "");
  assert.ok(fs.statSync(HOOK).mode & 0o111, "executable");
  const h = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8")).hooks;
  const has = (ev) => h[ev].find((g) => g.hooks.some((x) => x.command.includes("context-cap.py")));
  assert.ok(has("UserPromptSubmit") && has("PostToolUse"));
  const pre = has("PreToolUse");
  for (const t of ["Agent", "mcp__claude-code-remote__create_session"]) assert.match(t, new RegExp(pre.matcher));
  assert.doesNotMatch("Bash", new RegExp(pre.matcher));
});
