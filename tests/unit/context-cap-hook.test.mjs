/* context-cap-hook.test.mjs — .claude/hooks/context-cap.py: live context from the transcript's newest usage block,
 * caps from APEX_CTX_SOFT/HARD or the brief's STOP AT (the agent-fleet role table retired 2026-10-27), an advisory
 * once per level, and a spawn deny over the hard cap that still lets a hand-off create_session through.
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
    assert.match(first, /docs\/WORKERS\.md/);
    assert.equal(run(dir, ev), "", "the soft advisory is once per session");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("over the hard cap a spawn is denied, a hand-off create_session is allowed; APEX_CTX_CAP=off silences it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcap-"));
  try {
    const t = transcript(dir, "STOP AT: 100k", 160);
    const spawn = (tool, prompt) => run(dir, { hook_event_name: "PreToolUse", transcript_path: t, session_id: "s3",
      tool_name: tool, tool_input: { prompt } });
    const deny = JSON.parse(spawn("Agent", "hunt bugs"));
    assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
    assert.match(deny.hookSpecificOutput.permissionDecisionReason, /over the hard cap 150k/);
    assert.equal(spawn("mcp__claude-code-remote__create_session", "hand-off to a successor: CONTINUE PR #1"), "");
    assert.equal(run(dir, { hook_event_name: "PreToolUse", transcript_path: t, session_id: "s3", tool_name: "Agent",
      tool_input: {} }, { APEX_CTX_CAP: "off" }), "");
    assert.equal(run(dir, { hook_event_name: "PreToolUse", transcript_path: t, session_id: "s3", tool_name: "Agent",
      tool_input: {} }, { APEX_CTX_SOFT: "300" }), "", "the env cap wins over STOP AT");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('guard mode refuses malformed input while advisory mode stays silent',()=>{
 for(const payload of ['not json','[]','{"tool_input":[]}','{"tool_input":0}','{"tool_input":""}']){
  const run=guard=>spawnSync('python3',[HOOK,...(guard?['--guard']:[])],{input:payload,encoding:'utf8',
   env:{...process.env,CLAUDE_PROJECT_DIR:ROOT,APEX_CTX_CAP:''}});
  const guarded=run(true);assert.equal(guarded.status,2,payload+' '+guarded.stderr);assert.match(guarded.stderr,/BLOCKED/);
  const advisory=run(false);assert.equal(advisory.status,0,advisory.stderr);assert.equal(advisory.stdout,'');
 }
});
