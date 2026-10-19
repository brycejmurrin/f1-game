/* cursor-agents.test.mjs — the transcript digester counts what the Cursor run stream carries.
 *
 * Pure functions only (no network, no key): SSE parsing, the edit_file full-file
 * echo, repeat reads, MCP discovery duplicates and terminal classes.
 *
 * Run: node --test tests/unit/cursor-agents.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSse, digestRun, mergeDigests, formatDigest } from "../../tools/ci/cursor-agents.mjs";

const sse = (rows) => rows.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n`).join("\n");

test("parseSse keeps typed rows and skips a partial one", () => {
  const body = `${sse([["status", { status: "FINISHED" }]])}\nevent: tool_call\ndata: {"na\n`;
  const rows = parseSse(body);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, "status");
});

test("digestRun counts edit echo, repeat reads, discovery dups and terminal classes", () => {
  const call = (name, args, result) => ["tool_call", { name, args, result, callId: "c", status: "ok" }];
  const rows = parseSse(
    sse([
      call("edit_file", { path: "a.js", streamContent: "x" }, { success: { beforeFullFileContent: "a".repeat(100), afterFullFileContent: "b".repeat(120) } }),
      call("read_file", { path: "a.js", offset: 1, limit: 5 }, "ok"),
      call("read_file", { path: "a.js", offset: 1, limit: 5 }, "ok"),
      call("get_mcp_tools", { server: "x" }, "s"),
      call("get_mcp_tools", { server: "x" }, "s"),
      call("run_terminal_cmd", { command: "node tools/ci/sync-pr.mjs b" }, "out"),
      call("run_terminal_cmd", { toolCallId: "t" }, "out"),
      ["thinking", { text: "hmm" }],
    ]),
  );
  const m = digestRun(rows);
  assert.equal(m.editEchoChars, 220);
  assert.equal(m.repeatReads, 1);
  assert.equal(m.mcpDiscovery, 2);
  assert.equal(m.mcpDiscoveryDup, 1);
  assert.equal(m.terminal["sync-pr"].calls, 1);
  assert.equal(m.terminal["(args missing)"].calls, 1);
  assert.equal(m.noArgs, 1);
  assert.ok(m.thinkChars > 0);
});

test("mergeDigests sums runs and formatDigest prints typed lines", () => {
  const one = digestRun(parseSse(sse([["tool_call", { name: "grep_search", args: { q: "x", p: "y" }, result: "r" }]])));
  const t = mergeDigests([one, one]);
  assert.equal(t.runs, 2);
  assert.equal(t.calls.grep_search, 2);
  const lines = formatDigest(t);
  assert.match(lines[0], /^DIGEST runs=2 calls=2 /);
  assert.ok(lines.some((l) => l.startsWith("EDIT_ECHO ")));
});
