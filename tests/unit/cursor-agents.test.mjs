/* cursor-agents.test.mjs — the transcript digester counts what the Cursor run stream carries.
 *
 * No network and no real key: SSE parsing, the edit_file full-file echo, repeat reads,
 * MCP discovery duplicates and terminal classes; and the control verbs (launch,
 * followup, cancel, archive, delete) against a stubbed fetch: request shape, the
 * launch allow-list, idempotent retry and the typed BUSY / NOT_CANCELLABLE lines.
 *
 * Run: node --test tests/unit/cursor-agents.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseSse,
  digestRun,
  mergeDigests,
  formatDigest,
  buildLaunchBody,
  launchAgent,
  followUp,
  cancelRun,
  archiveAgent,
  deleteAgent,
  assertAllowed,
  readAllow,
  recordAllow,
  Refused,
  DEFAULT_MODEL,
} from "../../tools/ci/cursor-agents.mjs";

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

// ---- control verbs ------------------------------------------------------------------------------

const KEY = "test-key-never-printed";
const ID = "bc-11111111-2222-3333-4444-555555555555";
const OTHER = "bc-99999999-8888-7777-6666-555555555555";
const realFetch = globalThis.fetch;
process.env.CURSOR_API_KEY = KEY;
process.env.APEX_CURSOR_BACKOFF_CAP_MS = "1";

/** Stub fetch with a queue of [status, body] replies; returns the recorded calls. */
function stub(...replies) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const [status, body] = replies.shift() ?? [500, { error: { code: "stub_empty", message: "no reply queued" } }];
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return calls;
}
const tmpAllow = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cursor-agents-")), "launched.json");
const err = (code, message = "m") => ({ error: { code, message } });
const after = () => {
  globalThis.fetch = realFetch;
};

test("buildLaunchBody defaults to no PR, no live-branch push, a minted bc- id and a capped name", () => {
  const b = buildLaunchBody({ prompt: `  ${"x".repeat(300)}  ` });
  assert.equal(b.model.id, DEFAULT_MODEL);
  assert.ok((/^bc-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/).test(b.agentId));
  assert.equal(b.autoCreatePR, false);
  assert.equal(b.workOnCurrentBranch, false);
  assert.deepEqual(b.env, { type: "cloud" });
  assert.equal(b.name.length, 100);
  assert.equal(b.mode, undefined);
  assert.equal(b.repos[0].startingRef, undefined);
});

test("buildLaunchBody maps ref, pr, flags and rejects bad input", () => {
  assert.equal(buildLaunchBody({ prompt: "p", ref: "main" }).repos[0].startingRef, "main");
  const pr = buildLaunchBody({ prompt: "p", prUrl: "https://github.com/o/r/pull/1", createPr: true, onBranch: true, mode: "plan" });
  assert.equal(pr.repos[0].prUrl, "https://github.com/o/r/pull/1");
  assert.equal(pr.repos[0].startingRef, undefined);
  assert.equal(pr.autoCreatePR, true);
  assert.equal(pr.workOnCurrentBranch, true);
  assert.equal(pr.mode, "plan");
  assert.throws(() => buildLaunchBody({ prompt: "p", ref: "main", prUrl: "u" }), /exclusive/);
  assert.throws(() => buildLaunchBody({ prompt: "  " }), /empty/);
  assert.throws(() => buildLaunchBody({ prompt: "x".repeat(100001) }), /over/);
  assert.throws(() => buildLaunchBody({ prompt: "p", mode: "yolo" }), /agent or plan/);
});

test("assertAllowed refuses malformed and unrecorded ids, accepts recorded ones", () => {
  const file = tmpAllow();
  assert.throws(() => assertAllowed("../etc/passwd", file), Refused);
  assert.throws(() => assertAllowed(undefined, file), /no id/);
  assert.throws(() => assertAllowed(ID, file), /not launched by this tool/);
  recordAllow(ID, { launchedAt: "t" }, file);
  assertAllowed(ID, file);
  assert.deepEqual(Object.keys(readAllow(file)), [ID]);
});

test("launchAgent posts the documented body, records the id and never prints the key", async () => {
  const file = tmpAllow();
  const calls = stub([201, { agent: { id: ID }, run: { id: "run-1" } }]);
  try {
    const lines = await launchAgent({ prompt: "do it", agentId: ID }, { file });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /\/v1\/agents$/);
    assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.equal(calls[0].body.prompt.text, "do it");
    assert.equal(calls[0].body.agentId, ID);
    assert.ok((new RegExp(`^LAUNCH ${ID} run=run-1 model=composer-2.5 repo=f1-game pr=off$`)).test(lines[0]));
    assert.ok(!lines.join("\n").includes(KEY));
    assert.ok(readAllow(file)[ID]);
  } finally {
    after();
  }
});

test("launchAgent un-records the id when the API refuses (billing gate)", async () => {
  const file = tmpAllow();
  stub([400, err("usage_limit_exceeded", "On-demand usage is required")]);
  try {
    await assert.rejects(launchAgent({ prompt: "p", agentId: ID }, { file }), /usage_limit_exceeded/);
    assert.deepEqual(readAllow(file), {});
  } finally {
    after();
  }
});

test("launchAgent: a 5xx retry that finds the same agentId already created is a success, not a duplicate", async () => {
  const file = tmpAllow();
  const calls = stub([503, err("unavailable")], [409, err("agent_id_conflict")], [200, { id: ID, latestRunId: "run-7" }]);
  try {
    const lines = await launchAgent({ prompt: "p", agentId: ID }, { file });
    assert.deepEqual(calls.map((c) => c.method), ["POST", "POST", "GET"]);
    assert.equal(calls[0].body.agentId, calls[1].body.agentId);
    assert.ok((/run=run-7 .*already created/).test(lines[0]));
    assert.ok(readAllow(file)[ID]);
  } finally {
    after();
  }
});

test("launchAgent --dry-run sends nothing and records nothing", async () => {
  const file = tmpAllow();
  const calls = stub();
  try {
    const lines = await launchAgent({ prompt: "p", dryRun: true, agentId: ID }, { file });
    assert.equal(calls.length, 0);
    assert.ok((new RegExp(`^DRYRUN ${ID} promptChars=1 `)).test(lines[0]));
    assert.ok(!lines[0].includes('"text"'));
    assert.deepEqual(readAllow(file), {});
  } finally {
    after();
  }
});

test("followUp on an id this tool did not launch sends no request at all", async () => {
  const file = tmpAllow();
  recordAllow(ID, {}, file);
  const calls = stub();
  try {
    await assert.rejects(followUp(OTHER, "hi", undefined, { file }), Refused);
    await assert.rejects(cancelRun(OTHER, "r", { file }), Refused);
    await assert.rejects(archiveAgent(OTHER, { file }), Refused);
    await assert.rejects(deleteAgent(OTHER, { file }), Refused);
    assert.equal(calls.length, 0);
  } finally {
    after();
  }
});

test("followUp: 201 is FOLLOWUP, 409 agent_busy is BUSY, and a 5xx is not retried (could duplicate a run)", async () => {
  const file = tmpAllow();
  recordAllow(ID, {}, file);
  let calls = stub([201, { run: { id: "run-2" } }]);
  try {
    assert.deepEqual(await followUp(ID, "more", "plan", { file }), [`FOLLOWUP ${ID} run=run-2 HTTP 201`]);
    assert.deepEqual(calls[0].body, { prompt: { text: "more" }, mode: "plan" });
    stub([409, err("agent_busy")]);
    assert.ok((new RegExp(`^BUSY ${ID} `)).test((await followUp(ID, "again", undefined, { file }))[0]));
    calls = stub([500, err("boom")], [201, { run: { id: "never" } }]);
    await assert.rejects(followUp(ID, "x", undefined, { file }), /HTTP 500/);
    assert.equal(calls.length, 1);
  } finally {
    after();
  }
});

test("a 429 on a write is retried (the request was not processed)", async () => {
  const file = tmpAllow();
  recordAllow(ID, {}, file);
  const calls = stub([429, err("rate_limited")], [201, { run: { id: "run-3" } }]);
  try {
    assert.ok((/^FOLLOWUP /).test((await followUp(ID, "x", undefined, { file }))[0]));
    assert.equal(calls.length, 2);
  } finally {
    after();
  }
});

test("cancelRun uses latestRunId by default and maps 409 run_not_cancellable", async () => {
  const file = tmpAllow();
  recordAllow(ID, {}, file);
  let calls = stub([200, { id: ID, latestRunId: "run-9" }], [200, { id: "run-9" }]);
  try {
    assert.deepEqual(await cancelRun(ID, undefined, { file }), [`CANCELLED ${ID} run=run-9`]);
    assert.match(calls[1].url, /\/runs\/run-9\/cancel$/);
    stub([409, err("run_not_cancellable")]);
    assert.ok((/^NOT_CANCELLABLE /).test((await cancelRun(ID, "run-9", { file }))[0]));
    calls = stub([200, { id: ID }]);
    await assert.rejects(cancelRun(ID, undefined, { file }), /no run to cancel/);
  } finally {
    after();
  }
});

test("archive keeps the allow-list entry; delete forgets it", async () => {
  const file = tmpAllow();
  recordAllow(ID, {}, file);
  const calls = stub([200, { id: ID }], [200, { id: ID }]);
  try {
    assert.deepEqual(await archiveAgent(ID, { file }), [`ARCHIVED ${ID}`]);
    assert.ok(readAllow(file)[ID]);
    assert.deepEqual(await deleteAgent(ID, { file }), [`DELETED ${ID}`]);
    assert.deepEqual(readAllow(file), {});
    assert.deepEqual(calls.map((c) => c.method), ["POST", "DELETE"]);
  } finally {
    after();
  }
});
