// agent-history — import + digest of every agent's session logs. Fixtures are hand-built in each shape the tool sniffs:
// a ChatGPT export conversation (the 2026-10-24 export's fields: mapping tree, thoughts summaries, tool_icons,
// "Worked for" recaps, error_metadata work_usage_limit_exceeded, an abandoned regeneration branch), a Codex CLI
// rollout JSONL (session_meta, turn_context, shell function_call + exec_command_end, an MCP call, apply_patch,
// token_count, error — field names source-read from openai/codex main on 2026-10-26) and
// a history.jsonl, a Grok bot ReadTranscript dump (role/message lines, CallDynamicTool, <timestamp> turns), a local
// Claude Code transcript with one subagent, a claude-code-remote list_events page, a Cursor cloud run stream (SSE),
// and the import path (a Drive download spill holding a zip). The import test writes under os.tmpdir() and removes it. Pure functions only; under a second.
import test from "node:test";
import assert from "node:assert/strict";
import { sniff, digestText, digestChatgpt, digestRollout, summarize, summaryLine, summaryTable, exitOf, patchFiles,
  recapSeconds, mentions, pacific, costOf, digestLines, grokTime, grokSource, digestClaudeJsonl, digestClaudePage, digestCursorSse,
  group, unzip, importPath, importPaths } from "../../tools/ci/agent-history.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const T0 = 1792453000; // 2026-10-19 PT
const node = (id, parent, message, children = []) => ({ id, parent, children, message: message && { id, create_time: T0 + Object.keys(message).length, ...message } });
const msg = (role, content, metadata = {}, dt = 0) => ({ author: { role, name: null }, content, metadata, create_time: T0 + dt });

const CONV = {
  conversation_id: "conv-1", title: "Work on F1 Game", create_time: T0, update_time: T0 + 900, current_node: "e",
  mapping: {
    root: { id: "root", parent: null, children: ["u1"], message: null },
    u1: { id: "u1", parent: "root", children: ["t1", "x"], message: msg("user", { content_type: "text", parts: ["Fix the ghost import"] }, {}, 10) },
    x: { id: "x", parent: "u1", children: [], message: msg("assistant", { content_type: "text", parts: ["abandoned regeneration"] }, {}, 11) },
    t1: { id: "t1", parent: "u1", children: ["r1"], message: msg("assistant", { content_type: "thoughts", thoughts: [{ summary: "Ran tests in tools/ci/ci-watch.mjs", content: "", chunks: [] }] },
      { model_slug: "gpt-6.1-sol-wm", tool_icons: ["run-command", "/images/ecosystem/apps/github/icon.png", "https://www.google.com/s2/favicons?domain=nodejs.org&sz=128"] }, 20) },
    r1: { id: "r1", parent: "t1", children: ["a1"], message: msg("assistant", { content_type: "reasoning_recap", content: "Worked for 5m 39s" }, {}, 30) },
    a1: { id: "a1", parent: "r1", children: ["u2"], message: msg("assistant", { content_type: "text", parts: ["Put MERGE-HOLD: on the PR. Ran `node tools/ci/ci-watch.mjs --once` on js/game.js."] }, { model_slug: "gpt-6.1-sol-wm" }, 40) },
    u2: { id: "u2", parent: "a1", children: ["e"], message: msg("user", { content_type: "text", parts: ["Keep going"] }, {}, 50) },
    e: { id: "e", parent: "u2", children: [], message: msg("assistant", { content_type: "text", parts: [""] }, { error_metadata: { error_code: "work_usage_limit_exceeded", error_type: "info" } }, 60) },
  },
};

test("chatgpt: follows current_node, counts prompts, steps, tools, work time, branches and the limit stop", () => {
  const d = digestChatgpt(CONV);
  assert.equal(d.format, "chatgpt");
  assert.equal(d.turns, 2);
  assert.deepEqual(d.prompts.map((p) => p.text), ["Fix the ghost import", "Keep going"]);
  assert.equal(d.replies, 1, "the abandoned branch reply is not on the thread");
  assert.equal(d.branches, 1);
  assert.equal(d.steps, 1);
  assert.equal(d.workSec, 339);
  assert.deepEqual(d.tools, { "run-command": 1, github: 1, web: 1 });
  assert.deepEqual(d.web, { "nodejs.org": 1 });
  assert.equal(d.errors[0].code, "work_usage_limit_exceeded");
  assert.equal(d.final.state, "stopped: work_usage_limit_exceeded");
  assert.deepEqual(d.mentioned.commands, ["node tools/ci/ci-watch.mjs --once"]);
  assert.ok(d.mentioned.paths.includes("js/game.js") && d.mentioned.paths.includes("tools/ci/ci-watch.mjs"));
  assert.equal(d.patterns["merge-hold"], 1);
  assert.equal(d.patterns["usage-limit"], 1);
  assert.equal(d.durationSec, 900);
});

test("sniff: a conversations array, a rollout and a history file each land in their format; anything else is skipped", () => {
  assert.equal(sniff(JSON.stringify([CONV])).format, "chatgpt");
  assert.equal(sniff('{"timestamp":"2026-10-20T00:00:00Z","type":"session_meta","payload":{"id":"s"}}\n').format, "codex-rollout");
  assert.equal(sniff('{"id":"s","timestamp":"2026-10-20T00:00:00Z","instructions":""}\n{"type":"message","role":"user","content":[]}\n').format, "codex-rollout");
  assert.equal(sniff('{"session_id":"s","ts":1792453000,"text":"hi"}\n').format, "codex-history");
  assert.equal(sniff('{"export_files":[]}').format, null);
  assert.deepEqual(digestText('{"export_files":[]}', "m.json"), []);
});

const L = (s, type, payload) => ({ timestamp: `2026-10-20T07:00:${String(s).padStart(2, "0")}.000Z`, type, payload });
const ROLLOUT = [
  L(0, "session_meta", { id: "0199-abc", timestamp: "2026-10-20T07:00:00.000Z", cwd: "/w/f1-game", originator: "codex_cli_rs", cli_version: "0.50.0", git: { branch: "main", commit_hash: "abc" } }),
  L(1, "turn_context", { model: "gpt-5-codex", cwd: "/w/f1-game" }),
  L(1, "response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>cwd</environment_context>" }] }),
  L(2, "response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "Run the guards" }] }),
  L(2, "event_msg", { type: "user_message", message: "Run the guards" }),
  L(3, "response_item", { type: "reasoning", summary: [{ type: "summary_text", text: "Planning the run" }] }),
  L(4, "response_item", { type: "function_call", name: "shell", arguments: JSON.stringify({ command: ["bash", "-lc", "npm run test:guards"] }), call_id: "c1" }),
  L(5, "event_msg", { type: "exec_command_end", call_id: "c1", command: ["npm", "run", "test:guards"], aggregated_output: "1 failing", exit_code: 1, duration: { secs: 9, nanos: 0 }, status: "completed" }),
  L(5, "response_item", { type: "function_call_output", call_id: "c1", output: "1 failing" }),
  L(5, "response_item", { type: "function_call", name: "search", namespace: "mcp__github", arguments: "{}", call_id: "c3" }),
  L(6, "response_item", { type: "custom_tool_call", name: "apply_patch", call_id: "c2", input: "*** Begin Patch\n*** Update File: js/game.js\n@@\n-a\n+b\n*** Add File: docs/README.md\n+x\n*** End Patch" }),
  L(7, "response_item", { type: "custom_tool_call_output", call_id: "c2", output: "Success" }),
  L(8, "event_msg", { type: "token_count", info: { total_token_usage: { input_tokens: 20000, cached_input_tokens: 15000, output_tokens: 1000, reasoning_output_tokens: 400, total_tokens: 21000 }, last_token_usage: { input_tokens: 12000 }, model_context_window: 272000 } }),
  L(9, "event_msg", { type: "token_count", info: { total_token_usage: { input_tokens: 50000, cached_input_tokens: 40000, output_tokens: 2000, reasoning_output_tokens: 800, total_tokens: 52000 }, last_token_usage: { input_tokens: 30000 }, model_context_window: 272000 } }),
  L(10, "response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "Guards fail on one test." }] }),
  L(11, "event_msg", { type: "error", message: "You've hit your usage limit." }),
];

test("rollout: session meta, model, prompt (injected context skipped), commands with exit codes, patched files, tokens, ctx", () => {
  const d = digestRollout(ROLLOUT, "rollout-2026-10-20T07-00-00-0199-abc.jsonl");
  assert.equal(d.id, "0199-abc");
  assert.deepEqual(d.models, ["gpt-5-codex"]);
  assert.equal(d.cwd, "/w/f1-game");
  assert.deepEqual(d.git, { branch: "main", commit: "abc" });
  assert.deepEqual(d.prompts.map((p) => p.text), ["Run the guards"], "event user_message wins; response_item duplicate and env context dropped");
  assert.deepEqual(d.commands.map((c) => [c.cmd, c.exit]), [["npm run test:guards", 1]]);
  assert.deepEqual(d.filesEdited, ["js/game.js", "docs/README.md"]);
  assert.deepEqual(d.tools, { shell: 1, "mcp__github.search": 1, apply_patch: 1 });
  assert.equal(d.tokens.total, 52000);
  assert.deepEqual(d.ctx, { turns: 2, first: 12000, max: 30000, last: 30000, window: 272000 });
  assert.ok(d.errors.some((e) => e.code === "exit 1"));
  assert.match(d.final.state, /^stopped: You've hit your usage limit/);
  const s = summarize(d, { price: [1.25, 0.125, 10] });
  assert.equal(s.quota, "limit-stopped");
  assert.equal(s.failedCommands, 1);
  assert.ok(Math.abs(s.cost - ((10000 * 1.25 + 40000 * 0.125 + 2000 * 10) / 1e6)) < 1e-9);
  assert.equal(costOf(d, null), null, "no price, no cost");
});

test("rollout: legacy head + bare items still digest", () => {
  const d = digestRollout([{ id: "old-1", timestamp: "2025-06-01T00:00:00Z", instructions: "" },
    { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "hi" }] }], "x.jsonl");
  assert.equal(d.id, "old-1");
  assert.equal(d.turns, 1);
  assert.equal(d.final.state, "replied");
});

const G = (role, content) => ({ role, message: { content } });
const GROK = [
  G("user", [{ type: "text", text: "<memory_context>facts</memory_context>" }]),
  G("user", [{ type: "text", text: "<timestamp>Sunday, Oct 25, 2026, 9:07 PM (UTC-7)</timestamp>\n<user_query>\nCheck the queue\n</user_query>" }]),
  G("assistant", [{ type: "thinking", thinking: "plan" }, { type: "tool_use", id: "a", name: "Shell", input: { command: "git status" } },
    { type: "tool_use", id: "b", name: "CallDynamicTool", input: { namespace: "cursor", toolName: "CloudAgent", arguments: { action: "get" } } }]),
  G("tool", [{ type: "tool_result", tool_use_id: "a", name: "Shell", result: "<cursor_untrusted_data_redacted source=\"Shell\">\nExit code: 1\n\nCommand output:" },
    { type: "tool_result", tool_use_id: "b", name: "CallDynamicTool", result: "Error: 'agent_id' is required for the 'get' action." }]),
  G("user", [{ type: "text", text: "<timestamp>Sunday, Oct 25, 2026, 9:10 PM (UTC-7)</timestamp>\n<user_query>\n[GROK_BOT_HIDDEN_PROMPT][A background task just completed] done\n</user_query>" }]),
  G("assistant", [{ type: "tool_use", id: "c", name: "Write", input: { path: "/workspace/x.md" } }, { type: "tool_use", id: "d", name: "SendToUser", input: { content: "All clear" } }]),
];

test("grok: typed vs injected turns, <timestamp> times, unwrapped dynamic tools, Shell exit codes, tool errors", () => {
  assert.equal(sniff(GROK.map((l) => JSON.stringify(l)).join("\n")).format, "lines");
  const d = digestLines(GROK, "DAD.jsonl");
  assert.equal(d.format, "grok");
  assert.equal(d.id, "DAD");
  assert.deepEqual(d.prompts.map((p) => p.text), ["Check the queue"]);
  assert.deepEqual(d.sources, { typed: 1, task: 1 });
  assert.equal(d.start, "2026-10-26T04:07:00.000Z");
  assert.deepEqual(d.tools, { Shell: 1, "cursor.CloudAgent": 1, Write: 1, SendToUser: 1 });
  assert.deepEqual(d.commands.map((c) => [c.cmd, c.exit]), [["git status", 1]]);
  assert.deepEqual(d.filesEdited, ["/workspace/x.md"]);
  assert.ok(d.errors.some((e) => /cursor\.CloudAgent: Error: 'agent_id'/.test(e.code)));
  assert.ok(d.errors.some((e) => e.code === "exit 1"));
  assert.equal(d.final.state, "replied");
  assert.equal(grokTime("Thursday, Oct 1, 2026, 12:14 PM (UTC-7)"), "2026-10-01T19:14:00.000Z");
  assert.equal(grokSource("[GROK_BOT_HIDDEN_PROMPT][The user securely provided the requested secret: \"x\"]"), "secret");
});

test("history.jsonl groups prompts by session", () => {
  const ds = digestText('{"session_id":"a","ts":1792453000,"text":"one"}\n{"session_id":"b","ts":1792453100,"text":"two"}\n{"session_id":"a","ts":1792453200,"text":"three"}\n', "history.jsonl");
  assert.deepEqual(ds.map((d) => [d.id, d.turns]), [["a", 2], ["b", 1]]);
});

test("summary: the session-transcript one-line shape, and a table with a totals row", () => {
  const s = summarize(digestChatgpt(CONV));
  assert.match(summaryLine(s), /^Work on F1 Game \| \$\? \| last real turn 2026-10-1\d \d\d:\d\d PT \| limit-stopped \(×1\) \| 0 hook errors$/);
  const t = summaryTable([s]).split("\n");
  assert.equal(t.length, 4);
  assert.match(t[3], /^\| \*\*total: 1 sessions\*\* \| \| \$\? \|/);
});

test("helpers: exit codes, patch paths, recaps, mentions, Pacific time", () => {
  assert.equal(exitOf('{"output":"x","metadata":{"exit_code":2}}'), 2);
  assert.equal(exitOf("Exit code: 0\nWall time: 1s"), 0);
  assert.equal(exitOf("no code"), null);
  assert.deepEqual(patchFiles("*** Delete File: a/b.js\n*** Update File: c.md"), ["a/b.js", "c.md"]);
  assert.equal(recapSeconds("Worked for 1h 2m 3s"), 3723);
  assert.equal(recapSeconds("Worked for 44s"), 44);
  assert.deepEqual(mentions("see `git status -sb` and AGENTS.md").paths, ["AGENTS.md"]);
  assert.equal(pacific("2026-10-20T07:00:00Z"), "2026-10-20 00:00 PT");
});

const CL = (type, content, extra = {}) => ({ type, sessionId: "sess-1", timestamp: extra.ts || "2026-10-26T06:00:00.000Z", uuid: Math.random().toString(36),
  message: { role: type, content, ...(extra.m || {}) }, ...(extra.l || {}) });
const CLAUDE = [
  { type: "queue-operation", sessionId: "sess-1", timestamp: "2026-10-26T05:59:00.000Z" },
  CL("user", "<system-reminder>role card</system-reminder>"),
  CL("user", "Check drive again", { ts: "2026-10-26T06:00:01.000Z" }),
  CL("assistant", [{ type: "thinking", thinking: "" }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } },
    { type: "tool_use", id: "t2", name: "Agent", input: { subagent_type: "deploy-research", description: "Research format", prompt: "…" } }],
  { ts: "2026-10-26T06:00:02.000Z", m: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200, output_tokens: 50 } } }),
  CL("assistant", [{ type: "tool_use", id: "t3", name: "Edit", input: { file_path: "/w/tools/x.mjs" } }],
    { ts: "2026-10-26T06:00:03.000Z", m: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200, output_tokens: 50 } } }),
  CL("user", [{ type: "tool_result", tool_use_id: "t1", content: "Exit code 1\n1 failing", is_error: true }, { type: "tool_result", tool_use_id: "t3", content: "The user doesn't want to proceed with this tool use.", is_error: true }]),
  CL("assistant", [{ type: "text", text: "Tests fail; stopping." }], { ts: "2026-10-26T06:00:09.000Z" }),
  { type: "ai-title", sessionId: "sess-1", aiTitle: "Drive check" },
];
const SUB = [CL("user", "Research format", { l: { isSidechain: true, agentId: "abc" } }),
  CL("assistant", [{ type: "tool_use", id: "s1", name: "WebFetch", input: { url: "u" } }], { l: { isSidechain: true, agentId: "abc" } })];

test("claude jsonl: typed vs reminder, Bash exit from the result, denied edit, usage deduped by message id, subagent grouped", () => {
  assert.equal(sniff(CLAUDE.map((l) => JSON.stringify(l)).join("\n")).format, "claude");
  const d = digestClaudeJsonl(CLAUDE, "/p/sess-1.jsonl");
  assert.equal(d.id, "sess-1");
  assert.equal(d.title, "Drive check");
  assert.deepEqual(d.prompts.map((p) => p.text), ["Check drive again"]);
  assert.deepEqual(d.sources, { reminder: 1, typed: 1 });
  assert.deepEqual(d.commands.map((c) => [c.cmd, c.exit]), [["npm test", 1]]);
  assert.ok(d.errors.some((e) => e.code === "Edit: DENIED"));
  assert.deepEqual(d.tokens, { input: 10, cached: 1000, cacheWrite: 200, output: 50, total: 1260 });
  assert.equal(d.ctx.max, 1210);
  assert.equal(d.subagents[0].type, "deploy-research");
  assert.equal(d.final.state, "replied");
  const s = digestClaudeJsonl(SUB, "/p/sess-1/subagents/agent-abc.jsonl");
  assert.equal(s.format, "claude-subagent");
  assert.equal(s.parentSession, "sess-1");
  const g = group([d, s]);
  assert.equal(g.length, 1);
  assert.equal(g[0].subagentDigests[0].id, "agent-abc");
  assert.ok(Math.abs(costOf(d, [5, 0.5, 25]) - ((210 * 5 + 1000 * 0.5 + 50 * 25) / 1e6)) < 1e-12, "Claude input excludes cache reads");
});

test("claude-remote page: envelope sniffed, subagent steps counted under their Agent call, cost from the result event", () => {
  const ev = (k, s, body) => ({ created_at: `2026-10-26T07:00:0${s}.000Z`, [k]: { internal_anthropic_catchall: { uuid: `u${k}${s}`, session_id: "session_X", ...body } } });
  const events = [
    ev("user", 1, { message: { role: "user", content: "Audit the queue" } }),
    ev("assistant", 2, { message: { role: "assistant", id: "a", content: [{ type: "tool_use", id: "ag", name: "Agent", input: { subagent_type: "Explore", description: "find" } }] } }),
    ev("assistant", 3, { parent_tool_use_id: "ag", message: { role: "assistant", id: "b", content: [{ type: "tool_use", id: "g1", name: "Grep", input: { pattern: "x" } }] } }),
    ev("user", 4, { message: { role: "user", content: [{ type: "tool_result", tool_use_id: "ag", content: "found it" }] } }),
    ev("result", 5, { total_cost_usd: 1.5 }),
  ];
  const page = `<untrusted_external_data>\n${JSON.stringify({ ccr: { data: events, has_more: false } })}\n</untrusted_external_data>`;
  const s = sniff(page);
  assert.equal(s.format, "claude-remote");
  const d = digestClaudePage(s.data, "page.txt");
  assert.equal(d.id, "session_X");
  assert.equal(d.cost, 1.5);
  assert.equal(d.subagents[0].calls, 1);
  assert.equal(d.subagents[0].done, true);
  assert.deepEqual(d.prompts.map((p) => p.text), ["Audit the queue"]);
});

test("cursor cloud SSE: chat, tool calls with args, failures and the run result", () => {
  const sse = [
    ["assistant", { text: "Running checks" }],
    ["tool_call", { callId: "c1", name: "shell", status: "running", args: { command: "npm test" } }],
    ["tool_call", { callId: "c1", status: "completed", result: { error: { message: "exit 1" } } }],
    ["tool_call", { callId: "c2", name: "edit", status: "completed", args: { path: "js/game.js" }, result: { success: {} } }],
    ["result", { status: "FINISHED", text: "done", durationMs: 4000 }],
  ].map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n`).join("\n");
  assert.equal(sniff(sse).format, "cursor-sse");
  const d = digestCursorSse(sse, "abcd1234_run12345.sse");
  assert.deepEqual(d.tools, { shell: 1, edit: 1 });
  assert.deepEqual(d.filesEdited, ["js/game.js"]);
  assert.equal(d.commands[0].cmd, "npm test");
  assert.equal(d.errors.length, 1);
  assert.equal(d.final.state, "FINISHED");
  assert.equal(d.durationSec, 4);
});

// A minimal zip writer (one deflated entry) so unzip/import are tested without a binary fixture.
function zipOne(name, data) {
  const comp = zlib.deflateRawSync(data), nb = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nb.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(comp.length, 20);
  cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nb.length, 28); cen.writeUInt32LE(0, 42);
  const cenOff = 30 + nb.length + comp.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + nb.length, 12); end.writeUInt32LE(cenOff, 16);
  return Buffer.concat([local, nb, comp, cen, nb, end]);
}

test("import: a Drive download spill holding a zip unpacks to plain files that then sniff", () => {
  const jsonl = GROK.map((l) => JSON.stringify(l)).join("\n");
  const zip = zipOne("bots/DAD.jsonl", Buffer.from(jsonl));
  assert.equal(unzip(zip)[0].data.toString(), jsonl);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-history-"));
  try {
    const spill = path.join(dir, "mcp-Google_Drive-download_file_content-1.txt");
    fs.writeFileSync(spill, JSON.stringify({ content: zip.toString("base64"), id: "x", mimeType: "application/zip", title: "grok.zip" }));
    const out = importPath(spill, path.join(dir, "out"));
    assert.deepEqual(out.map((f) => path.relative(dir, f)), [path.join("out", "grok", "bots", "DAD.jsonl")]);
    assert.equal(sniff(fs.readFileSync(out[0], "utf8")).format, "lines");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("import: a byte-split zip (split -b → .partaa/.partab, each its own Drive spill) rejoins before unzipping", () => {
  const zip = zipOne("codex/rollout-1.jsonl", Buffer.from(ROLLOUT.map((l) => JSON.stringify(l)).join("\n")));
  const cut = Math.floor(zip.length / 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-history-"));
  try {
    const spill = (n, title, data) => { const f = path.join(dir, n); fs.writeFileSync(f, JSON.stringify({ content: data.toString("base64"), title })); return f; };
    // Out of order on purpose: parts join by suffix, not by argument order.
    const b = spill("dl-2.txt", "codex.zip.partab", zip.subarray(cut)), a = spill("dl-1.txt", "codex.zip.partaa", zip.subarray(0, cut));
    const r = importPaths([b, a], path.join(dir, "out"));
    assert.deepEqual(r.joined, ["codex.zip (2 parts)"]);
    assert.equal(r.written.length, 1);
    assert.equal(sniff(fs.readFileSync(r.written[0], "utf8")).format, "codex-rollout");
    assert.throws(() => importPaths([spill("dl-3.txt", "codex.z01", zip)], path.join(dir, "o2")), /spanned part/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("chatgpt canvas page: Yjs text runs recovered, agent edits and conversation ids counted", () => {
  const yjs = Buffer.concat([Buffer.from([1, 2, 3]), Buffer.from("title&Apex 26 Bug Hunt and Verification Plan'"), Buffer.from([0, 7]),
    Buffer.from("Full gate PASSED at 4181e3c0, all 17 stages; see tools/ci/ready-gate.mjs for the receipt."), Buffer.from([0xff, 0])]);
  const doc = { checkpoint: {}, document: { yjs_state_update: yjs.toString("base64"), block_attributions: [
    { actor: { actor_type: "agent", agent_kind: "chatgpt", conversation_id: "conv-1" }, block_id: "b1", changed_at: "2026-10-16T01:57:12Z" },
    { actor: { actor_type: "agent", agent_kind: "chatgpt", conversation_id: "conv-1" }, block_id: "b2", changed_at: "2026-10-16T19:27:00Z" }] } };
  const s = sniff(JSON.stringify(doc));
  assert.equal(s.format, "chatgpt-page");
  const d = digestText(JSON.stringify(doc), "pages/page_abc/content/checkpoints/c1.json")[0];
  assert.equal(d.id, "page_abc");
  assert.equal(d.title, "Apex 26 Bug Hunt and Verification Plan");
  assert.equal(d.steps, 2);
  assert.deepEqual(d.conversations, { "conv-1": 2 });
  assert.ok(d.mentioned.paths.includes("tools/ci/ready-gate.mjs"));
  assert.equal(d.durationSec, 62988);
});
