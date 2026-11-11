/* context-cap-hook.test.mjs — .claude/hooks/context-cap.py: live context from the transcript's newest usage block,
 * caps from APEX_CTX_SOFT/HARD or the brief's STOP AT, an advisory once per level, and a spawn deny over the hard
 * cap on the Agent tool only (the create_session branch and its launch-page coupling went 2026-11-03, plan §4.7).
 *
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

function transcript(dir, brief, ctxK) {
  const p = path.join(dir, "t.jsonl");
  const rows = [
    { type: "user", message: { content: brief } },
    { type: "assistant", message: { usage: { input_tokens: 1000, cache_read_input_tokens: ctxK * 1000 - 1000, cache_creation_input_tokens: 0 } } },
  ];
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return p;
}

function run(dir, payload, env = {}) {
  const r = spawnSync("python3", [HOOK], {
    input: JSON.stringify(payload), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, APEX_CTX_CAP: "", APEX_CTX_SOFT: "", APEX_CTX_HARD: "", ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test("no brief cap and no env cap: the hook says nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcap-"));
  try {
    const t = transcript(dir, "You are a worker. Fix the HUD.", 400);
    assert.equal(run(dir, { hook_event_name: "UserPromptSubmit", transcript_path: t, session_id: "s1" }), "");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("STOP AT sets the soft cap; the advisory fires once per level", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcap-"));
  try {
    const t = transcript(dir, "CONTINUE PR #1. STOP AT: 150k.", 170);
    const ev = { hook_event_name: "UserPromptSubmit", transcript_path: t, session_id: "s2" };
    const first = run(dir, ev);
    assert.match(first, /context 170k \/ cap 150k \(brief STOP AT; hard 200k\)/);
    assert.match(first, /skill handoff/);
    assert.doesNotMatch(first, /WORKERS\.md/, "docs/WORKERS.md is retired");
    assert.equal(run(dir, ev), "", "the soft advisory is once per session");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("over the hard cap an Agent spawn is denied; create_session is not this hook's business; APEX_CTX_CAP=off silences it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcap-"));
  try {
    const t = transcript(dir, "STOP AT: 100k", 160);
    const spawn = (tool, prompt, env) => run(dir, { hook_event_name: "PreToolUse", transcript_path: t, session_id: "s3",
      tool_name: tool, tool_input: { prompt } }, env);
    const deny = JSON.parse(spawn("Agent", "hunt bugs"));
    assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
    assert.match(deny.hookSpecificOutput.permissionDecisionReason, /over the hard cap 150k/);
    assert.equal(spawn("mcp__claude-code-remote__create_session", "anything"), "", "create_session is unguarded (the launch gate is gone)");
    assert.equal(spawn("Bash", "x"), "", "other tools are not spawns");
    assert.equal(spawn("Agent", "x", { APEX_CTX_CAP: "off" }), "");
    assert.equal(spawn("Agent", "x", { APEX_CTX_SOFT: "300" }), "", "the env cap wins over STOP AT");
    const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
    const g = settings.hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes("context-cap.py")));
    assert.equal(g.matcher, "Agent", "settings.json guards the Agent tool only");
    assert.equal(g.hooks[0].onFailure, "block");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("guard mode refuses malformed input while advisory mode stays silent", () => {
  for (const payload of ["not json", "[]", '{"tool_input":[]}', '{"tool_input":0}', '{"tool_input":""}']) {
    const go = (guard) => spawnSync("python3", [HOOK, ...(guard ? ["--guard"] : [])], { input: payload, encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, APEX_CTX_CAP: "" } });
    const guarded = go(true); assert.equal(guarded.status, 2, payload + " " + guarded.stderr); assert.match(guarded.stderr, /BLOCKED/);
    const advisory = go(false); assert.equal(advisory.status, 0, advisory.stderr); assert.equal(advisory.stdout, "");
  }
});

test("--guard fails closed when the cap is known and the count is not; the FIRST STOP AT is the cap", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcap-"));
  try {
    const g = (payload, env = {}) => {
      const r = spawnSync("python3", [HOOK, "--guard"], { input: JSON.stringify(payload), encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir, APEX_CTX_CAP: "", APEX_CTX_SOFT: "", APEX_CTX_HARD: "", ...env } });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "none";
    };
    const ev = (t) => ({ hook_event_name: "PreToolUse", tool_name: "Agent", transcript_path: t, session_id: "g", tool_input: { prompt: "x" } });
    assert.equal(g(ev(path.join(dir, "missing.jsonl")), { APEX_CTX_SOFT: "100" }), "deny", "env cap, no transcript");
    assert.equal(g(ev(path.join(dir, "missing.jsonl"))), "none", "no cap, no transcript: nothing to enforce");
    const zero = path.join(dir, "zero.jsonl");
    fs.writeFileSync(zero, [{ type: "user", message: { content: "STOP AT: 100k" } }, { type: "assistant", message: { usage: { input_tokens: 0 } } }]
      .map((r) => JSON.stringify(r)).join("\n") + "\n");
    assert.equal(g(ev(zero)), "deny", "a zero-usage newest entry is not a count");
    const noAsst = path.join(dir, "noasst.jsonl");
    fs.writeFileSync(noAsst, JSON.stringify({ type: "user", message: { content: "STOP AT: 100k" } }) + "\n");
    assert.equal(g(ev(noAsst)), "deny", "no assistant entry");
    const older = path.join(dir, "older.jsonl");
    fs.writeFileSync(older, [{ type: "user", message: { content: "STOP AT: 100k" } },
      { type: "assistant", message: { usage: { input_tokens: 10000 } } }, { type: "assistant", message: { usage: { input_tokens: 0 } } }]
      .map((r) => JSON.stringify(r)).join("\n") + "\n");
    assert.equal(g(ev(older)), "none", "the newest non-zero count is used: 10k under the cap");
    const first = transcript(dir, "STOP AT: 100k. (The last session was told STOP AT: 400k.)", 160);
    assert.equal(g(ev(first)), "deny", "160k is over the FIRST cap's hard 150k");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
