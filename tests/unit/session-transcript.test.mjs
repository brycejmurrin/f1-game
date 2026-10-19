// session-transcript — the digest of a saved claude-code-remote `list_events` page. The fixture is a
// hand-built page in the shape measured on 2026-10-16 (a 100-event page of a live session): the untrusted
// envelope around `{"ccr":…}`, a `control_response` blob to drop, a Bash call answered by its tool_result,
// an MCP call, a subagent whose inner steps carry the Agent call's id as parent_tool_use_id, a user-rejected
// call, a failed hook, a harness-injected turn and a turn result. Pure functions only; under a second.
import test from "node:test";
import assert from "node:assert/strict";
import { extractPage, normalize, render, describeCall } from "../../tools/ci/session-transcript.mjs";

const at = (s) => `2026-10-16T07:00:${String(s).padStart(2, "0")}.000Z`;
let n = 0;
const wrap = (k, s, body) => ({ created_at: at(s), [k]: { uuid: `u${n++}`, internal_anthropic_catchall: body } });
const say = (s, content, parent = null) => wrap("assistant", s, { parent_tool_use_id: parent, message: { role: "assistant", content } });
const hear = (s, content, extra = {}) => wrap("user", s, { parent_tool_use_id: null, message: { role: "user", content }, ...extra });
const use = (id, name, input) => ({ type: "tool_use", id, name, input });
const res = (id, text, is_error = false) => ({ type: "tool_result", tool_use_id: id, content: text, is_error });

const EVENTS = [
  wrap("control_response", 0, { response: { subtype: "success", response: { agents: ["x".repeat(5000)] } } }),
  hear(1, "Check the CI watch"),
  say(2, [{ type: "thinking", thinking: "", signature: "AAAA" }, use("t1", "Bash", { command: "git status --short", description: "Look at the tree" })]),
  hear(3, [res("t1", " M ci.yml")], { tool_result_meta: [{ id: "t1", permission_decision: { decision: "accept", reason_type: "classifier" } }] }),
  say(4, [use("t2", "mcp__github__pull_request_read", { method: "get", pullNumber: 7 })]),
  hear(5, [res("t2", "boom", true)]),
  say(6, [use("t3", "Agent", { subagent_type: "Explore", description: "Find the watcher", prompt: "…" })]),
  wrap("user", 7, { parent_tool_use_id: "t3", message: { role: "user", content: [{ type: "text", text: "Find the watcher" }] } }),
  say(8, [use("s1", "Grep", { pattern: "watch", path: "tools/ci" })], "t3"),
  wrap("user", 9, { parent_tool_use_id: "t3", message: { role: "user", content: [res("s1", "tools/ci/ci-watch.mjs")] } }),
  hear(10, [res("t3", "report delivered")]),
  say(11, [use("t4", "Edit", { file_path: "js/game.js" })]),
  hear(12, [res("t4", "The user doesn't want to proceed", true)], { tool_result_meta: [{ id: "t4", non_execution_kind: "user-rejected" }] }),
  wrap("system", 13, { subtype: "hook_response", hook_name: "Stop", outcome: "error", exit_code: 2, stderr: "uncommitted changes", output: "" }),
  wrap("system", 13, { subtype: "hook_response", hook_name: "UserPromptSubmit", outcome: "success", exit_code: 0, output: "Skill check" }),
  hear(14, "Stop hook feedback: uncommitted changes"),
  say(15, [{ type: "text", text: "Holding for your call." }]),
  wrap("result", 16, { subtype: "success", is_error: false, num_turns: 9, duration_ms: 42000, total_cost_usd: 1.5, subagent_stats: { spawned: 1, completed: 1, failed: 0 } }),
];
const PAGE = `<other-session nonce="n" untrusted="true">\nAnother Claude session's record…:\n    ${JSON.stringify({ ccr: { data: EVENTS, has_more: true, first_id: "f1", last_id: "l1" } })}\n</other-session nonce="n">`;

test("a saved page parses out of its untrusted envelope, with the cursor for the next page", () => {
  const p = extractPage(PAGE);
  assert.equal(p.events.length, EVENTS.length);
  assert.equal(p.hasMore, true);
  assert.equal(p.firstId, "f1");
  assert.throws(() => extractPage("no json here"), /no JSON/);
});

test("calls fold their results; MCP, Bash, Agent and the subagent's own steps each get a row", () => {
  const rows = normalize(extractPage(PAGE).events);
  const calls = rows.filter((r) => r.kind === "call");
  assert.deepEqual(calls.map((c) => c.tag), ["BASH", "MCP", "AGENT", "GREP", "EDIT"]);
  assert.equal(calls[0].text, "git status --short");
  assert.equal(calls[0].result.out, "M ci.yml");
  assert.equal(calls[0].result.by, "accept/classifier");
  assert.match(calls[1].text, /^github\.pull_request_read /);
  assert.equal(calls[1].err, true, "an MCP error marks the row");
  assert.equal(calls[2].text, "Explore: Find the watcher");
  assert.equal(calls[3].sub, "t3", "the subagent's Grep hangs off the Agent call");
  assert.equal(calls[4].result.denied, "user-rejected");
});

test("noise drops: control blobs, empty thinking, successful hooks; injected turns are not user prompts", () => {
  const rows = normalize(extractPage(PAGE).events);
  assert.equal(rows.filter((r) => r.kind === "user" && !r.sub).length, 1, "only the typed prompt counts");
  assert.ok(rows.some((r) => r.tag === "INJECT"), "Stop hook feedback is tagged INJECT");
  const hooks = rows.filter((r) => r.kind === "hook");
  assert.equal(hooks.find((h) => /Stop/.test(h.text)).err, true);
  assert.equal(hooks.find((h) => /UserPromptSubmit/.test(h.text)).quiet, true);
  assert.ok(!rows.some((r) => /x{100}/.test(r.text)), "no control_response payload leaks");
});

test("events across pages dedupe by uuid and sort by time", () => {
  const evs = extractPage(PAGE).events;
  const rows = normalize([...evs.slice(9), ...evs, ...evs.slice(0, 4)]);
  assert.equal(rows.filter((r) => r.kind === "call").length, 5);
  assert.deepEqual(rows.map((r) => r.t), [...rows.map((r) => r.t)].sort());
});

test("render: --only errors keeps the failures; the footer tallies and names the next cursor", () => {
  const p = extractPage(PAGE);
  const rows = normalize(p.events);
  const errs = render(rows, p, { only: ["errors"] });
  assert.match(errs, /MCP/);
  assert.match(errs, /DENIED \(user-rejected\)/);
  assert.match(errs, /HOOK +Stop error exit 2/);
  assert.doesNotMatch(errs, /^\S+ BASH/m, "a clean Bash call is not an error");
  const all = render(rows, p, {});
  assert.match(all, /^= .* 5 calls .* 2 failed\/denied · 1 user prompts · 2 subagent rows$/m);
  assert.match(all, /before_id f1/);
  assert.match(all, /TURN +success · 9 steps · 42 s · \$1\.50 cumulative · subagents 1/);
  assert.match(render(rows, p, { grep: /watch/i }), /GREP/);
});

test("describeCall shows the part a reader wants", () => {
  assert.equal(describeCall("Bash", { command: "npm  test\n", run_in_background: true }), "npm test  [bg]");
  assert.equal(describeCall("Read", { file_path: "a.js" }), "a.js");
  assert.equal(describeCall("mcp__x__y", { a: 1 }), '{"a":1}');
});

// ── quota-parked sessions (#2382): the retry run folds to one row, the state flags, --summary is one line ──
import { foldQuota, quotaState, summarize, summaryLine } from "../../tools/ci/session-transcript.mjs";

const LIMIT_SAY = "You've hit your weekly limit · resets Oct 20, 3pm (UTC)";
const retry = (s) => [
  say(s, [{ type: "text", text: LIMIT_SAY }]),
  wrap("result", s, { subtype: "success", is_error: false, num_turns: 1, duration_ms: 1000, total_cost_usd: 818.99, terminal_reason: "api_error" }),
];
const wake = (s) => hear(s, "[SYSTEM NOTIFICATION - NOT USER INPUT] check-in");
const PARKED = [
  hear(1, "Fix the flaky spec"),
  say(2, [use("p1", "Bash", { command: "git status" })]),
  hear(3, [res("p1", "clean")]),
  wrap("system", 4, { subtype: "hook_response", hook_name: "Stop", outcome: "error", exit_code: 2, stderr: "dirty" }),
  wrap("result", 5, { subtype: "success", is_error: false, num_turns: 4, duration_ms: 9000, total_cost_usd: 800.5 }),
  ...retry(10), wake(11), ...retry(12), wake(13), ...retry(14),
];

test("quota retries fold into one ×N row; wakes between them are counted, not listed", () => {
  const rows = foldQuota(normalize(PARKED));
  const q = rows.filter((r) => r.kind === "quota");
  assert.equal(q.length, 1);
  assert.equal(q[0].n, 3);
  assert.equal(q[0].wakes, 2);
  assert.match(q[0].text, /^×3 quota retries \(first 07:00:10 last 07:00:14\) · 2 wake messages · resets Oct 20, 3pm/);
  assert.ok(!rows.some((r) => r.kind === "turn" && /api_error/.test(r.text)), "no api_error turn row survives");
  assert.equal(rows.filter((r) => r.tag === "INJECT").length, 0);
});

test("a real turn or a typed prompt between retries splits the fold", () => {
  const evs = [...retry(1), hear(2, "are you there?"), ...retry(3), say(4, [{ type: "text", text: "Back." }]), ...retry(5)];
  assert.equal(foldQuota(normalize(evs)).filter((r) => r.kind === "quota").length, 3);
});

test("quota-parked only when the newest real turn is a limit error", () => {
  assert.deepEqual(
    (({ parked, reset, retries }) => ({ parked, reset, retries }))(quotaState(foldQuota(normalize(PARKED)))),
    { parked: true, reset: "Oct 20, 3pm", retries: 3 });
  const recovered = quotaState(foldQuota(normalize([...retry(1), say(2, [{ type: "text", text: "Resumed." }])])));
  assert.equal(recovered.parked, false);
  assert.equal(quotaState(foldQuota(normalize(EVENTS))).parked, false, "the ordinary fixture is not parked");
});

test("render folds by default, prints the state line, and --raw keeps every retry", () => {
  const page = { hasMore: true, firstId: "f9" };
  const rows = normalize(PARKED);
  const out = render(rows, page, {});
  assert.match(out, /QUOTA +×3 quota retries/);
  assert.match(out, /^= state: quota-parked until Oct 20, 3pm \(×3 retries; newest real turn: 07:00:05 TURN\)/m);
  assert.equal((out.match(/api_error/g) || []).length, 0);
  assert.match(render(normalize(EVENTS), extractPage(PAGE), {}), /^(?!.*quota-parked)/s);
  const raw = render(rows, page, { raw: true });
  assert.equal((raw.match(/api_error/g) || []).length, 3);
  assert.match(raw, /= state: quota-parked/, "the state line does not depend on folding");
});

test("--summary is one line: title, cost, last real turn, quota state, hook errors", () => {
  const s = summarize(normalize(PARKED));
  assert.deepEqual(s, { title: "Fix the flaky spec", cost: 818.99, lastRealTurn: "07:00:05", quota: "quota-parked",
    resets: "Oct 20, 3pm", retries: 3, hookErrors: 1 });
  assert.equal(Object.hasOwn(s, "by_type"), false, "by_type absent when subagent_stats has none");
  const line = summaryLine(s);
  assert.equal(line.split("\n").length, 1);
  assert.equal(line, "Fix the flaky spec | $818.99 | last real turn 07:00:05 | quota-parked until Oct 20, 3pm (×3) | 1 hook errors");
  const ok = summarize(normalize(extractPage(PAGE).events), { title: "CI watch" });
  assert.equal(ok.quota, "active");
  assert.equal(ok.title, "CI watch");
  assert.equal(ok.hookErrors, 1);
  assert.equal(Object.hasOwn(ok, "by_type"), false, "ordinary fixture has no by_type");
});

test("--summary / --json surface by_type from result.subagent_stats (#2893 item 10)", () => {
  const withTypes = [
    hear(1, "Run the board"),
    wrap("result", 2, {
      subtype: "success", is_error: false, num_turns: 3, duration_ms: 5000, total_cost_usd: 2.25,
      subagent_stats: { spawned: 6, completed: 6, failed: 0,
        by_type: { "general-purpose": 3, "deploy-research": 2, "ci-red-triage": 1 } },
    }),
  ];
  const s = summarize(normalize(withTypes));
  assert.deepEqual(s.by_type, { "general-purpose": 3, "deploy-research": 2, "ci-red-triage": 1 });
  assert.match(summaryLine(s), /by_type general-purpose×3,deploy-research×2,ci-red-triage×1/);
  const emptyType = [
    hear(1, "No agents"),
    wrap("result", 2, { subtype: "success", is_error: false, num_turns: 1, duration_ms: 100,
      total_cost_usd: 0.1, subagent_stats: { spawned: 0, completed: 0, failed: 0, by_type: {} } }),
  ];
  assert.equal(Object.hasOwn(summarize(normalize(emptyType)), "by_type"), false, "empty by_type omitted");
});
