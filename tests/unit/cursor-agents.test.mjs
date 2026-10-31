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
  foldCallEvent,
  groupCalls,
  parseRun,
  redact,
  squash,
  argsSummary,
  resultBody,
  renderLines,
  summaryLine,
  findCall,
  jsonRows,
  errorStreak,
} from "../../tools/lib/cursor-transcript.mjs";
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
  errorHead,
  parseMcpServers,
  parseSubagents,
  buildEnvVars,
  maskBody,
  interpolate,
  LAUNCH_ENV_ALLOW,
  mcpHostAllowed,
  loadRuns,
  handback,
  transcript,
  transcriptCall,
  clock,
  retryAfterMs,
  listAgents,
  waitAgent,
  dumpRuns,
  checkArtifactPath,
  listArtifacts,
  downloadArtifact,
  agentUsage,
} from "../../tools/ci/cursor-agents.mjs";

const sse = (rows) => rows.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n`).join("\n");

test("parseSse keeps typed rows and skips a partial one", () => {
  const body = `${sse([["status", { status: "FINISHED" }]])}\nevent: tool_call\ndata: {"na\n`;
  const rows = parseSse(body);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, "status");
});

test("digestRun counts edit echo, repeat reads, discovery dups and terminal classes", () => {
  let callN = 0; // real streams give every call its own callId
  const call = (name, args, result) => ["tool_call", { name, args, result, callId: `c${++callN}`, status: "completed" }];
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
    const [status, body, headers = {}] = replies.shift() ?? [500, { error: { code: "stub_empty", message: "no reply queued" } }];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
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
  const calls = stub([200, { items: [] }], [201, { agent: { id: ID }, run: { id: "run-1" } }]);
  try {
    const lines = await launchAgent({ prompt: "do it", agentId: ID }, { file });
    // The twin guard lists agents first, then the create is the only write.
    assert.deepEqual(calls.map((c) => c.method), ["GET", "POST"]);
    assert.ok(/\/v1\/agents$/.test(calls[1].url));
    assert.equal(calls[1].headers.Authorization, `Bearer ${KEY}`);
    assert.equal(calls[1].body.prompt.text, "do it");
    assert.equal(calls[1].body.agentId, ID);
    assert.ok((new RegExp(`^LAUNCH ${ID} run=run-1 model=composer-2.5 repo=f1-game pr=off$`)).test(lines[0]));
    assert.ok(!lines.join("\n").includes(KEY));
    assert.ok(readAllow(file)[ID]);
  } finally {
    after();
  }
});

test("launchAgent un-records the id when the API refuses (billing gate)", async () => {
  const file = tmpAllow();
  stub([200, { items: [] }], [400, err("usage_limit_exceeded", "On-demand usage is required")]);
  try {
    await assert.rejects(launchAgent({ prompt: "p", agentId: ID }, { file }), /usage_limit_exceeded/);
    assert.deepEqual(readAllow(file), {});
  } finally {
    after();
  }
});

test("launchAgent: a 5xx retry that finds the same agentId already created is a success, not a duplicate", async () => {
  const file = tmpAllow();
  const calls = stub([200, { items: [] }], [503, err("unavailable")], [409, err("agent_id_conflict")], [200, { id: ID, latestRunId: "run-7" }]);
  try {
    const lines = await launchAgent({ prompt: "p", agentId: ID }, { file });
    assert.deepEqual(calls.map((c) => c.method), ["GET", "POST", "POST", "GET"]);
    assert.equal(calls[1].body.agentId, calls[2].body.agentId);
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
    assert.ok(/\/runs\/run-9\/cancel$/.test(calls[1].url));
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

// ---- gap fixes: dump 410, Retry-After, list paging, wait, artifacts, usage ---------------------------

/** Replace the clock with a fake: sleep advances `now` and records the delay, no wall time passes. */
function fakeClock() {
  const real = { sleep: clock.sleep, now: clock.now };
  const t = { now: 1_000_000, slept: [] };
  clock.now = () => t.now;
  clock.sleep = async (ms) => {
    t.slept.push(ms);
    t.now += ms;
  };
  t.restore = () => Object.assign(clock, real);
  return t;
}
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "cursor-agents-"));

test("dump skips a 410 stream_expired, counts it, and keeps going", async () => {
  const dir = tmpDir();
  const calls = stub(
    [200, { items: [{ id: "run-aaaaaaaa", status: "FINISHED" }, { id: "run-bbbbbbbb", status: "FINISHED" }] }],
    [410, err("stream_expired")],
    [200, "event: status\ndata: {}\n\n"],
  );
  try {
    const line = await dumpRuns([ID], dir, { gapMs: 0 });
    assert.equal(calls.length, 3);
    assert.ok(/ written=1 skipped=0 expired=1 live=0 slow=0$/.test(line));
    assert.equal(fs.readdirSync(dir).length, 1);
    stub([200, { items: [{ id: "run-cccccccc", status: "FINISHED" }] }], [403, err("forbidden")]);
    await assert.rejects(dumpRuns([ID], dir, { gapMs: 0 }), /HTTP 403/);
  } finally {
    after();
  }
});

test("retryAfterMs reads seconds and HTTP dates, falls back on garbage, and caps", () => {
  const saved = process.env.APEX_CURSOR_BACKOFF_CAP_MS;
  process.env.APEX_CURSOR_BACKOFF_CAP_MS = "80000";
  try {
    assert.equal(retryAfterMs("7", 0, 0), 7000);
    assert.equal(retryAfterMs(" 1.5 ", 3, 0), 1500);
    assert.equal(retryAfterMs(new Date(10_000 + 30_000).toUTCString(), 0, 10_000), 30000);
    assert.equal(retryAfterMs("garbage", 2, 0), 20000);
    assert.equal(retryAfterMs(null, 1, 0), 10000);
    assert.equal(retryAfterMs(new Date(0).toUTCString(), 0, 60_000), 5000, "a past date is invalid, so exponential");
    assert.equal(retryAfterMs("3600", 0, 0), 80000, "capped");
    assert.equal(retryAfterMs(null, 9, 0), 80000);
    process.env.APEX_CURSOR_BACKOFF_CAP_MS = "2000";
    assert.equal(retryAfterMs("30", 0, 0), 2000);
  } finally {
    if (saved === undefined) delete process.env.APEX_CURSOR_BACKOFF_CAP_MS;
    else process.env.APEX_CURSOR_BACKOFF_CAP_MS = saved;
  }
});

test("a 429 with Retry-After sleeps that long, not the exponential default", async () => {
  const saved = process.env.APEX_CURSOR_BACKOFF_CAP_MS;
  process.env.APEX_CURSOR_BACKOFF_CAP_MS = "80000";
  const t = fakeClock();
  const calls = stub([429, err("rate_limited"), { "retry-after": "3" }], [429, err("rate_limited")], [200, { items: [] }]);
  try {
    await listAgents(5);
    assert.equal(calls.length, 3);
    assert.deepEqual(t.slept, [3000, 10000]);
  } finally {
    t.restore();
    after();
    process.env.APEX_CURSOR_BACKOFF_CAP_MS = saved;
  }
});

test("list pages 150 items across two pages and passes prUrl / includeArchived", async () => {
  const mk = (from, n) => Array.from({ length: n }, (_, i) => ({ id: `a${from + i}` }));
  let calls = stub([200, { items: mk(0, 100), nextCursor: "cur-1" }], [200, { items: mk(100, 50) }]);
  try {
    const out = await listAgents(150);
    assert.equal(out.length, 150);
    assert.equal(calls.length, 2);
    const u0 = new URL(calls[0].url);
    const u1 = new URL(calls[1].url);
    assert.equal(u0.searchParams.get("limit"), "100");
    assert.equal(u0.searchParams.get("cursor"), null);
    assert.equal(u1.searchParams.get("limit"), "50");
    assert.equal(u1.searchParams.get("cursor"), "cur-1");
    calls = stub([200, { items: [{ id: "x" }] }]);
    await listAgents(20, { prUrl: "https://github.com/o/r/pull/9", includeArchived: true });
    const u = new URL(calls[0].url);
    assert.equal(u.searchParams.get("prUrl"), "https://github.com/o/r/pull/9");
    assert.equal(u.searchParams.get("includeArchived"), "true");
    calls = stub([200, { items: [{ id: "x" }] }]);
    await listAgents(20);
    assert.equal(new URL(calls[0].url).searchParams.get("prUrl"), null);
    assert.equal(new URL(calls[0].url).searchParams.get("includeArchived"), null);
  } finally {
    after();
  }
});

test("wait returns at once on IDLE, maps CANCELLED to exit 1, and times out with 124", async () => {
  const t = fakeClock();
  try {
    stub([200, { id: ID, status: "IDLE", latestRunId: "run-1" }], [200, { items: [{ id: "run-1", status: "FINISHED" }] }]);
    assert.deepEqual(await waitAgent(ID), { code: 0, line: `WAIT ${ID} IDLE run=run-1 last=FINISHED` });
    assert.deepEqual(t.slept, []);
    stub([200, { id: ID, status: "ACTIVE" }], [200, { id: ID, status: "IDLE", latestRunId: "run-2" }], [200, { items: [{ id: "run-2", status: "CANCELLED" }] }]);
    const w = await waitAgent(ID, { intervalS: 5 });
    assert.equal(w.code, 1);
    assert.equal(w.line, `WAIT ${ID} IDLE run=run-2 last=CANCELLED`);
    assert.deepEqual(t.slept, [5000]);
    t.slept.length = 0;
    const calls = stub(...Array.from({ length: 50 }, () => [200, { id: ID, status: "ACTIVE", latestRunId: "run-3" }]));
    const to = await waitAgent(ID, { timeoutS: 12, intervalS: 5 });
    assert.equal(to.code, 124);
    assert.ok(to.line.startsWith(`WAIT ${ID} TIMEOUT `));
    assert.equal(calls.length, 3);
    assert.equal(t.slept.reduce((a, b) => a + b, 0), 10000);
  } finally {
    t.restore();
    after();
  }
});

test("artifact paths: traversal and absolute paths are refused with zero requests", async () => {
  const calls = stub();
  try {
    for (const bad of ["../x", "artifacts/../../etc/passwd", "/etc/passwd", "artifacts", "artifacts/", "other/x.png", "artifacts//x", "artifacts/./x", "artifacts\\x", "", undefined]) {
      await assert.rejects(downloadArtifact(ID, bad, tmpDir()), /artifact path/, String(bad));
    }
    assert.equal(calls.length, 0);
    assert.equal(checkArtifactPath("artifacts/a/b.png"), "artifacts/a/b.png");
  } finally {
    after();
  }
});

test("artifacts lists typed rows; artifact downloads via the presigned URL with no Authorization header", async () => {
  const out = tmpDir();
  try {
    stub([200, { items: [{ path: "artifacts/a.txt", sizeBytes: 5, updatedAt: "2026-10-20T00:00:00Z" }] }]);
    assert.deepEqual(await listArtifacts(ID), [`ARTIFACT ${ID} artifacts/a.txt 5 2026-10-20T00:00:00Z`]);
    const calls = stub([200, { url: "https://s3.example/presigned?sig=1", expiresAt: "x" }], [200, "hello"]);
    const lines = await downloadArtifact(ID, "artifacts/dir/a.txt", out);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.endsWith(`/v1/agents/${ID}/artifacts/download?path=artifacts%2Fdir%2Fa.txt`));
    assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.equal(calls[1].url, "https://s3.example/presigned?sig=1");
    assert.equal(calls[1].headers?.Authorization, undefined);
    assert.equal(fs.readFileSync(path.join(out, ID.slice(-8), "dir", "a.txt"), "utf8"), "hello");
    assert.ok(/^SAVED .*a\.txt 5$/.test(lines[0]));
    assert.ok(!lines[0].includes(KEY));
  } finally {
    after();
  }
});

test("usage reads cost from the live shape (top-level and per-run `cost`), n/a when absent, types 403, throws the rest", async () => {
  try {
    // Shape measured live 2026-10-20: totalUsage = tokens only; cost{rawCostCents,chargedCents} beside it and on each run.
    const tok = (n) => ({ inputTokens: n, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalTokens: n });
    stub([200, { totalUsage: tok(36170), cost: { rawCostCents: 40, chargedCents: 12 }, runs: [{ id: "r1", usage: tok(1), cost: { rawCostCents: 1, chargedCents: 1 } }, { id: "r2" }] }]);
    assert.equal((await agentUsage(ID))[0], `USAGE ${ID} tokens=36170 chargedCents=12 runs=2`);
    // No top-level cost: sum the runs that report one.
    stub([200, { totalUsage: tok(5), runs: [{ id: "r1", cost: { chargedCents: 3 } }, { id: "r2", cost: { chargedCents: 4 } }, { id: "r3" }] }]);
    assert.equal((await agentUsage(ID))[0], `USAGE ${ID} tokens=5 chargedCents=7 runs=3`);
    // Plan-included zeros stay 0; no cost anywhere is n/a, not a fabricated 0.
    stub([200, { totalUsage: tok(0), cost: { rawCostCents: 0, chargedCents: 0 }, runs: [] }]);
    assert.equal((await agentUsage(ID))[0], `USAGE ${ID} tokens=0 chargedCents=0 runs=0`);
    stub([200, { totalUsage: tok(9), runs: [{ id: "r1" }] }]);
    assert.equal((await agentUsage(ID))[0], `USAGE ${ID} tokens=9 chargedCents=n/a runs=1`);
    stub([403, err("feature_unavailable")]);
    assert.deepEqual(await agentUsage(ID), [`USAGE ${ID} UNAVAILABLE`]);
    stub([403, err("forbidden")]);
    await assert.rejects(agentUsage(ID), /forbidden/);
  } finally {
    after();
  }
});

// ---- transcript-driven improvements: failure digest, dump age skip, launch twin guard -------------------------------

test("errorHead groups tool failures by tool and masks ids and paths; success is null", () => {
  assert.equal(errorHead("get_mcp_tools", { success: { x: 1 } }), null);
  assert.equal(errorHead("get_mcp_tools", { error: { message: 'namespace "Github" not found. Available namespaces: cursor' } }), 'get_mcp_tools: namespace "Github" not found. Available namespaces: cursor');
  assert.equal(errorHead("run_terminal_cmd", { spawnError: { message: "ENOENT" } }), "run_terminal_cmd: spawnError ENOENT");
  const mcp = { success: { content: [{ text: { text: JSON.stringify({ ok: false, error: "endpoint is required: pass endpoint" }) } }] } };
  assert.equal(errorHead("mcp", mcp), "mcp: ok:false endpoint is required: pass endpoint");
  assert.equal(errorHead("mcp", { success: { content: [{ text: { text: JSON.stringify({ ok: true }) } }] } }), null);
  const masked = errorHead("read_file", { error: { message: "no file /workspace/a.js run-3d266b1c-15ea-4cd7-a549-b64a34435823" } });
  assert.equal(masked, "read_file: no file <path> run-<uuid>");
  assert.ok(errorHead("x", { error: { message: "y".repeat(500) } }).length <= 94);
});

test("digest counts failures, merges them across runs and prints ERRORS plus the top ERR lines", () => {
  const call = (name, result) => ["tool_call", { name, args: { q: "a" }, result }];
  const bad = { error: { message: "namespace \"Github\" not found" } };
  const a = digestRun(parseSse(sse([call("get_mcp_tools", bad), call("get_mcp_tools", { success: {} }), call("read_file", { success: {} })])));
  const b = digestRun(parseSse(sse([call("get_mcp_tools", bad)])));
  assert.equal(a.errCalls, 1);
  const lines = formatDigest(mergeDigests([a, b]));
  assert.ok(lines.includes("ERRORS calls=2 share=0.50 stormRuns=0 worstStreak=1"));
  assert.ok(lines.includes('ERR x2 get_mcp_tools: namespace "Github" not found'));
  assert.ok(formatDigest(mergeDigests([digestRun([])])).includes("ERRORS calls=0 share=0.00 stormRuns=0 worstStreak=0"));
  // A storm is the same failure repeated back to back; a success in between resets the streak.
  const storm = digestRun(parseSse(sse([call("get_mcp_tools", bad), call("get_mcp_tools", bad), call("get_mcp_tools", bad), call("read_file", { success: {} }), call("get_mcp_tools", bad)])));
  assert.equal(storm.errStreak, 3);
  // Different failures back to back are not a storm of one failure: the streak counts identical heads only.
  const other = { error: { message: "something else" } };
  assert.equal(digestRun(parseSse(sse([call("get_mcp_tools", bad), call("get_mcp_tools", bad), call("get_mcp_tools", other), call("get_mcp_tools", bad)]))).errStreak, 2);
  assert.ok(formatDigest(mergeDigests([storm, a])).some((l) => l.startsWith("ERRORS calls=5 ") && l.endsWith("stormRuns=1 worstStreak=3")));
});

test("dump skips a run past the retention window without a request, and keeps a run just inside it", async () => {
  const dir = tmpDir();
  const t = fakeClock();
  t.now = Date.parse("2026-10-20T20:00:00Z");
  const ago = (h) => new Date(t.now - h * 3600e3).toISOString();
  const calls = stub(
    [200, { items: [{ id: "run-aaaaaaaa", status: "FINISHED", createdAt: ago(40) }, { id: "run-bbbbbbbb", status: "FINISHED", createdAt: ago(24.04) }, { id: "run-cccccccc", status: "FINISHED", createdAt: ago(1) }] }],
    [200, "event: status\ndata: {}\n\n"],
    [200, "event: status\ndata: {}\n\n"],
  );
  try {
    const line = await dumpRuns([ID], dir, { gapMs: 0 });
    assert.deepEqual(calls.map((c) => c.url.split("/").slice(-2, -1)[0]), [ID, "run-bbbbbbbb", "run-cccccccc"]);
    assert.ok(/ written=2 skipped=0 expired=1 live=0 slow=0$/.test(line));
  } finally {
    t.restore();
    after();
  }
});

test("dump counts a RUNNING run as live without opening its stream (it would not close until the run ends)", async () => {
  const dir = tmpDir();
  const calls = stub([200, { items: [{ id: "run-aaaaaaaa", status: "RUNNING" }, { id: "run-bbbbbbbb", status: "FINISHED" }] }], [200, "event: status\ndata: {}\n\n"]);
  try {
    const line = await dumpRuns([ID], dir, { gapMs: 0 });
    assert.deepEqual(calls.map((c) => c.url.split("/").slice(-2, -1)[0]), [ID, "run-bbbbbbbb"]);
    assert.ok(/ written=1 skipped=0 expired=0 live=1 slow=0$/.test(line));
  } finally {
    after();
  }
});

test("dump cuts a stream that never closes at the timeout, counts it as slow, writes nothing for it and keeps going", async () => {
  const dir = tmpDir();
  const calls = stub([200, { items: [{ id: "run-aaaaaaaa", status: "FINISHED" }, { id: "run-bbbbbbbb", status: "FINISHED" }] }], [200, "event: status\ndata: {}\n\n"]);
  const stubbed = globalThis.fetch;
  globalThis.fetch = (url, init = {}) =>
    String(url).includes("run-aaaaaaaa")
      ? new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)))
      : stubbed(url, init);
  process.env.APEX_CURSOR_STREAM_TIMEOUT_S = "0.05";
  // AbortSignal.timeout's timer is unref'd and this fake holds no socket, so keep the loop alive as a real fetch would.
  const alive = setInterval(() => {}, 1000);
  try {
    const line = await dumpRuns([ID], dir, { gapMs: 0 });
    assert.ok(/ written=1 skipped=0 expired=0 live=0 slow=1$/.test(line), line);
    assert.deepEqual(fs.readdirSync(dir).map((f) => f.split("_")[1]), ["bbbbbbbb.sse"]);
    assert.equal(calls.length, 2);
  } finally {
    clearInterval(alive);
    delete process.env.APEX_CURSOR_STREAM_TIMEOUT_S;
    after();
  }
});

test("launch refuses a twin (same name, not archived) before any write, and --allow-twin or an archived twin passes", async () => {
  const file = tmpAllow();
  const name = "claude-launch: list the mcps";
  const calls = stub([200, { items: [{ id: OTHER, status: "IDLE", name: name.toUpperCase() }] }]);
  try {
    await assert.rejects(launchAgent({ prompt: "list the mcps", name, agentId: ID }, { file }), (e) => e instanceof Refused && e.message.startsWith(`TWIN ${OTHER} IDLE`));
    assert.deepEqual(calls.map((c) => c.method), ["GET"]);
    assert.deepEqual(readAllow(file), {});
    stub([200, { items: [{ id: OTHER, status: "ARCHIVED", name }] }], [201, { agent: { id: ID }, run: { id: "run-9" } }]);
    assert.ok((await launchAgent({ prompt: "list the mcps", name, agentId: ID }, { file }))[0].startsWith(`LAUNCH ${ID} `));
    const c2 = stub([201, { agent: { id: ID }, run: { id: "run-9" } }]);
    await launchAgent({ prompt: "list the mcps", name, agentId: ID, allowTwin: true }, { file });
    assert.deepEqual(c2.map((c) => c.method), ["POST"]);
  } finally {
    after();
  }
});

// ---- launch-time options: mcpServers, customSubagents, envVars ------------------------------------------------------

const SECRET = "tok_SECRETVALUE_12345";
// Allowlisted names carry the test secrets; the rest are the families security audit 4 X1 says must never leave the box.
const ENVV = { APEX_AGENT_WEBHOOK_AUTH: SECRET, APEX_FLEET_AS: "fleet_SECRETVALUE_99", APEX_AGENT_WEBHOOK_URL: "https://hooks.example.net/apex", AWS_SECRET_ACCESS_KEY: "aws_SECRETVALUE", GITHUB_TOKEN: "ghp_SECRETVALUE_1", FLEET_A_OAUTH_TOKEN: "oat_SECRETVALUE", GROK_API_KEY: "xai_SECRETVALUE", ANTHROPIC_API_KEY: "ant_SECRETVALUE", HTTPS_PROXY: "http://u:SECRETVALUE@proxy" };
const FORBIDDEN_ENV = ["AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "FLEET_A_OAUTH_TOKEN", "GROK_API_KEY", "ANTHROPIC_API_KEY", "HTTPS_PROXY"];
const leaks = (s) => String(s).includes("SECRETVALUE");

test("parseMcpServers accepts stdio and remote servers and fills allowlisted ${NAME} from the environment", () => {
  const out = parseMcpServers(
    [
      { name: "apex-tools", command: "node", args: ["tools/mcp/apex-tools-mcp.mjs"], env: { FLEET_AS: "${APEX_FLEET_AS}" } },
      { name: "hook", url: "https://hooks.example.net/mcp", headers: { Authorization: "Bearer ${APEX_AGENT_WEBHOOK_AUTH}" } },
      { name: "gh", type: "http", url: "https://api.github.com/mcp", auth: { CLIENT_ID: "id", CLIENT_SECRET: "${APEX_AGENT_WEBHOOK_AUTH}", scopes: ["repo"] } },
      { name: "cursor", url: "https://api.cursor.com/mcp" },
    ],
    ENVV,
  );
  assert.deepEqual(out[0], { name: "apex-tools", type: "stdio", command: "node", args: ["tools/mcp/apex-tools-mcp.mjs"], env: { FLEET_AS: ENVV.APEX_FLEET_AS } });
  assert.deepEqual(out[1], { name: "hook", type: "http", url: "https://hooks.example.net/mcp", headers: { Authorization: `Bearer ${SECRET}` } });
  assert.deepEqual(out[2].auth, { CLIENT_ID: "id", CLIENT_SECRET: SECRET, scopes: ["repo"] });
  // the names the placeholders read ride along (non-enumerable, so never in the POST body)
  assert.deepEqual(out.envRefs, ["APEX_AGENT_WEBHOOK_AUTH", "APEX_FLEET_AS"]);
  assert.ok(!JSON.stringify(out).includes("envRefs"));
  assert.equal(interpolate("no placeholders", {}), "no placeholders");
  assert.equal(LAUNCH_ENV_ALLOW.join(","), "APEX_FLEET_AS,APEX_SESSION_ID,APEX_AGENT_WEBHOOK_URL,APEX_AGENT_WEBHOOK_AUTH,CURSOR_API_KEY");
});

test("security audit 4 X1: placeholders resolve only from the allowlist and MCP urls only to allowlisted hosts", () => {
  const bad = (list, env, re) => assert.throws(() => parseMcpServers(list, env), (e) => re.test(e.message) && !leaks(e.message));
  for (const n of FORBIDDEN_ENV) {
    bad([{ name: "a", url: "https://github.com/mcp", headers: { A: `\${${n}}` } }], ENVV, new RegExp(`\\$\\{${n}\\}: ${n} is not in the launch env allowlist`));
    bad([{ name: "a", command: "node", env: { X: `\${${n}}` } }], ENVV, /is not in the launch env allowlist/);
    bad([{ name: "a", url: "https://github.com/mcp", auth: { CLIENT_ID: `\${${n}}` } }], ENVV, /is not in the launch env allowlist/);
  }
  // the host is named; a lookalike or a suffix trick is not GitHub
  for (const h of ["evil.example", "github.com.evil.example", "evilgithub.com", "api.cursor.com.evil.example", "cursor.com"]) bad([{ name: "a", url: `https://${h}/mcp` }], ENVV, new RegExp(`url host ${h.replace(/\./g, "\\.")} is not allowed`));
  // the webhook host comes from APEX_AGENT_WEBHOOK_URL; without it that host is refused
  bad([{ name: "a", url: "https://hooks.example.net/mcp" }], {}, /hooks\.example\.net is not allowed/);
  for (const h of ["api.cursor.com", "github.com", "api.github.com", "GITHUB.COM"]) assert.ok(mcpHostAllowed(h, {}), h);
  assert.ok(mcpHostAllowed("hooks.example.net", ENVV));
  assert.ok(!mcpHostAllowed("hooks.example.net", { APEX_AGENT_WEBHOOK_URL: "not a url" }));
});

test("parseMcpServers rejects every shape the spec forbids, and no message carries a secret", () => {
  const bad = (list, re) => assert.throws(() => parseMcpServers(list, ENVV), (e) => re.test(e.message) && !leaks(e.message));
  bad({}, /JSON array/);
  bad([{ name: "a" }], /exactly one of command/);
  bad([{ name: "a", command: "x", url: "https://github.com" }], /exactly one of command/);
  bad([{ name: "a", command: "x" }, { name: "a", command: "y" }], /duplicate name a/);
  bad([{ name: "a", command: "x", headers: {} }], /unknown field headers/);
  bad([{ name: "a", url: "https://github.com", env: {} }], /unknown field env/);
  bad([{ name: "a", url: "https://github.com", type: "sse" }], /do not support sse/);
  bad([{ name: "a", url: `https://user:${SECRET}@github.com/mcp` }], /must not carry credentials/);
  bad([{ name: "a", url: "ftp://github.com" }], /http or https/);
  bad([{ name: "a", url: "not a url" }], /not a valid URL/);
  bad([{ name: "a", url: "https://github.com", headers: { A: "${APEX_SESSION_ID}" } }], /\$\{APEX_SESSION_ID\} but it is not set/);
  bad([{ name: "a", url: "https://github.com", headers: { A: 5 } }], /object of strings/);
  bad([{ name: "a", url: "https://github.com", auth: { CLIENT_SECRET: "${APEX_FLEET_AS}" } }], /CLIENT_ID is required/);
  bad([{ name: "a", command: "x", args: [1] }], /array of strings/);
  bad(Array.from({ length: 51 }, (_, i) => ({ name: `s${i}`, command: "x" })), /over 50/);
});

test("parseSubagents enforces names, sizes and the built-in collision rule", () => {
  const ok = { name: "prober", description: "d", prompt: "p", model: "inherit" };
  assert.deepEqual(parseSubagents([ok, { ...ok, name: "other", model: { id: "composer-2.5" } }]).map((a) => a.name), ["prober", "other"]);
  const bad = (list, re) => assert.throws(() => parseSubagents(list), (e) => re.test(e.message));
  bad([{ ...ok, name: "Explore" }], /built-in/);
  bad([{ ...ok, name: "computerUse" }], /built-in/);
  bad([ok, { ...ok, name: "PROBER" }], /duplicate name/);
  bad([{ ...ok, prompt: "x".repeat(8193) }], /prompt is 8193 chars, over 8192/);
  bad([{ ...ok, description: "x".repeat(1001) }], /description is 1001 chars/);
  bad([{ ...ok, name: "x".repeat(101) }], /name is 101 chars/);
  bad([{ ...ok, tools: [] }], /unknown field tools/);
  bad([{ ...ok, model: 5 }], /model must be/);
  bad([{ name: "a", description: "d" }], /prompt is required/);
  bad(Array.from({ length: 21 }, (_, i) => ({ ...ok, name: `s${i}` })), /over 20/);
});

test("buildEnvVars reads names from the environment and NAME=VALUE lines, and never echoes a value", () => {
  assert.deepEqual(buildEnvVars({ names: ["APEX_AGENT_WEBHOOK_AUTH"] }, ENVV), { APEX_AGENT_WEBHOOK_AUTH: SECRET });
  const file = `# comment\n\nAPEX_FLEET_AS=1\nAPEX_SESSION_ID = "two words"\nAPEX_AGENT_WEBHOOK_URL='x'\n`;
  assert.deepEqual(buildEnvVars({ fileText: file }, {}), { APEX_FLEET_AS: "1", APEX_SESSION_ID: "two words", APEX_AGENT_WEBHOOK_URL: "x" });
  const bad = (a, env, re) => assert.throws(() => buildEnvVars(a, env), (e) => re.test(e.message) && !leaks(e.message));
  bad({ names: ["CURSOR_API_KEY"] }, ENVV, /reserved/);
  bad({ names: ["cursor_x"] }, ENVV, /reserved/);
  bad({ names: ["1BAD"] }, ENVV, /not a valid variable name/);
  bad({ names: ["APEX_SESSION_ID"] }, ENVV, /--env APEX_SESSION_ID: not set/);
  // security audit 4 X1: nothing outside the allowlist leaves the box, by --env or by an env file
  for (const n of [...FORBIDDEN_ENV, "NOPE"]) {
    bad({ names: [n] }, ENVV, new RegExp(`env name ${n} is not in the launch env allowlist`));
    bad({ fileText: `${n}=SECRETVALUE` }, {}, /is not in the launch env allowlist/);
  }
  bad({ fileText: "SECRETVALUE_no_equals_sign" }, {}, /line 1 is not NAME=VALUE/);
  bad({ fileText: "CURSOR_X=1" }, {}, /reserved/);
  bad({ fileText: `APEX_FLEET_AS=${"v".repeat(4097)}` }, {}, /APEX_FLEET_AS: value must be 1 to 4096 bytes/);
  bad({ fileText: "APEX_FLEET_AS=" }, {}, /APEX_FLEET_AS: value must be 1 to 4096 bytes/);
});

test("buildLaunchBody attaches the options, and envVars drops the client agentId (the spec forbids both)", () => {
  const plain = buildLaunchBody({ prompt: "p", agentId: ID });
  assert.equal(plain.agentId, ID);
  assert.ok(!("mcpServers" in plain) && !("customSubagents" in plain) && !("envVars" in plain));
  const body = buildLaunchBody({ prompt: "p", agentId: ID, mcpServers: [{ name: "a", type: "stdio", command: "x" }], customSubagents: [{ name: "s", description: "d", prompt: "p" }] });
  assert.equal(body.agentId, ID);
  assert.equal(body.mcpServers[0].name, "a");
  assert.equal(body.customSubagents[0].name, "s");
  const withEnv = buildLaunchBody({ prompt: "p", agentId: ID, envVars: { A: "1" } });
  assert.equal(withEnv.agentId, undefined);
  assert.deepEqual(withEnv.envVars, { A: "1" });
  assert.ok(!("envVars" in buildLaunchBody({ prompt: "p", envVars: {} })));
});

test("maskBody and the DRYRUN line carry names and counts, never a header, env, auth or variable value", async () => {
  const mcpServers = parseMcpServers(
    [
      { name: "s", command: "node", env: { T: "${APEX_FLEET_AS}" } },
      { name: "r", url: "https://github.com/mcp", headers: { Authorization: "Bearer ${APEX_AGENT_WEBHOOK_AUTH}" }, auth: { CLIENT_ID: "cid", CLIENT_SECRET: "${APEX_AGENT_WEBHOOK_AUTH}" } },
    ],
    ENVV,
  );
  // An explicit name: a derived one is the first 100 chars of the prompt by design (it is also what the Cursor dashboard shows).
  const body = buildLaunchBody({ prompt: "a very private prompt", name: "t", mcpServers, envVars: { APEX_SESSION_ID: SECRET } });
  const masked = JSON.stringify(maskBody(body));
  assert.ok(!leaks(masked) && !masked.includes("private prompt"));
  assert.deepEqual(maskBody(body).envVars, ["APEX_SESSION_ID"]);
  assert.deepEqual(maskBody(body).mcpEnvRefs, ["APEX_AGENT_WEBHOOK_AUTH", "APEX_FLEET_AS"]);
  assert.deepEqual(maskBody(body).mcpServers[1], { name: "r", type: "http", headerNames: ["Authorization"], auth: ["CLIENT_ID", "CLIENT_SECRET"] });
  const calls = stub();
  try {
    const lines = await launchAgent({ prompt: "x", dryRun: true, mcpServers, envVars: { APEX_SESSION_ID: SECRET } }, { file: tmpAllow() });
    assert.equal(calls.length, 0);
    assert.ok(lines[0].startsWith("DRYRUN (server-minted) promptChars=1 ") && !leaks(lines[0]));
  } finally {
    after();
  }
});

test("launch with envVars: no client id, no 5xx retry, the id is recorded from the response, counts (not values) are printed", async () => {
  const file = tmpAllow();
  const calls = stub([200, { items: [] }], [201, { agent: { id: ID }, run: { id: "run-1" } }]);
  try {
    const mcpServers = parseMcpServers([{ name: "a", command: "x", env: { T: "${APEX_FLEET_AS}" } }], ENVV);
    const lines = await launchAgent({ prompt: "p", envVars: { STAGING: SECRET }, mcpServers }, { file });
    assert.deepEqual(calls.map((c) => c.method), ["GET", "POST"]);
    assert.equal(calls[1].body.agentId, undefined);
    assert.deepEqual(calls[1].body.envVars, { STAGING: SECRET });
    // the forwarded env NAMES are logged (X1 audit trail), never their values
    assert.ok(lines[0].endsWith(" mcp=1 subagents=0 env=1 envNames=STAGING mcpEnvRefs=APEX_FLEET_AS") && !leaks(lines[0]), lines[0]);
    assert.ok(readAllow(file)[ID]);
  } finally {
    after();
  }
});

test("launch with envVars resolves an ambiguous 5xx by name instead of retrying, and does not record a launch it cannot find", async () => {
  const file = tmpAllow();
  const name = "claude-launch: ambiguous";
  let calls = stub([200, { items: [] }], [503, err("unavailable")], [200, { items: [{ id: ID, name, createdAt: new Date().toISOString(), latestRunId: "run-4" }] }]);
  try {
    const lines = await launchAgent({ prompt: "ambiguous", name, envVars: { A: "1" } }, { file });
    assert.deepEqual(calls.map((c) => c.method), ["GET", "POST", "GET"]);
    assert.ok(lines[0].includes(`LAUNCH ${ID} run=run-4`) && lines[0].includes("recovered after an ambiguous failure"));
    assert.ok(readAllow(file)[ID]);
    calls = stub([200, { items: [] }], [503, err("unavailable")], [200, { items: [{ id: OTHER, name: "something else", createdAt: new Date().toISOString() }] }]);
    await assert.rejects(launchAgent({ prompt: "ambiguous", name, envVars: { A: "1" } }, { file: tmpAllow() }), /HTTP 503/);
    assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  } finally {
    after();
  }
});

test("followUp can replace the inline MCP servers for one run", async () => {
  const file = tmpAllow();
  recordAllow(ID, {}, file);
  const calls = stub([201, { run: { id: "run-5" } }]);
  try {
    await followUp(ID, "go", undefined, { file, mcpServers: [{ name: "a", type: "stdio", command: "x" }] });
    assert.deepEqual(calls[0].body, { prompt: { text: "go" }, mcpServers: [{ name: "a", type: "stdio", command: "x" }] });
  } finally {
    after();
  }
});

test("launch with envVars resolves a dropped connection (a thrown fetch) by name too", async () => {
  const file = tmpAllow();
  const name = "claude-launch: dropped";
  const seq = [];
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    seq.push(init.method);
    n++;
    if (n === 1) return new Response(JSON.stringify({ items: [] }), { status: 200 });
    if (n === 2) throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ items: [{ id: ID, name, createdAt: new Date().toISOString(), latestRunId: "run-8" }] }), { status: 200 });
  };
  try {
    const lines = await launchAgent({ prompt: "dropped", name, envVars: { A: "1" } }, { file });
    assert.deepEqual(seq, ["GET", "POST", "GET"]);
    assert.ok(lines[0].includes(`LAUNCH ${ID} run=run-8`) && lines[0].includes("recovered"));
    assert.ok(readAllow(file)[ID]);
    n = 0;
    seq.length = 0;
    globalThis.fetch = async (url, init = {}) => {
      seq.push(init.method);
      if (init.method === "POST") throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    };
    await assert.rejects(launchAgent({ prompt: "dropped", name, envVars: { A: "1" } }, { file: tmpAllow() }), /fetch failed/);
  } finally {
    after();
  }
});

// ---- transcript reading: one call = several events, modes, masking, cache and retention ---------------------------------

const RUN1 = "run-aaaaaaaa-0000-4000-8000-0000000000a1";
const RUN2 = "run-bbbbbbbb-0000-4000-8000-0000000000b2";
const GROK = `grok_${"a1".repeat(16)}_${"b2".repeat(32)}`;
const mcpText = (o) => ({ success: { content: [{ text: { text: JSON.stringify(o) } }] } });
const FIX = [
  ["status", { status: "RUNNING" }],
  ["assistant", { text: "Looking " }],
  ["assistant", { text: "at the files." }],
  ["thinking", { text: "hmm" }],
  // t1: starts as an `mcp` placeholder with empty args, becomes `task`, completes (the real stream does this)
  ["tool_call", { callId: "t1-aaaa", name: "mcp", status: "running", args: {} }],
  ["tool_call", { callId: "t1-aaaa", name: "task", status: "running", args: { description: "probe", prompt: "p", environment: "SUBAGENT_EXECUTION_ENVIRONMENT_CLOUD" } }],
  ["tool_call", { callId: "t1-aaaa", name: "task", status: "completed", args: { description: "probe", prompt: "p", environment: "SUBAGENT_EXECUTION_ENVIRONMENT_CLOUD" }, result: { success: { conversationSteps: [{ assistantMessage: { text: "child says hi" } }] } } }],
  // t2: a transient error on a running event that the completed event replaces with a success
  ["tool_call", { callId: "t2-bbbb", name: "get_mcp_tools", status: "running", args: { toolCallId: "x" }, result: { error: { error: "Invalid arguments" } } }],
  ["tool_call", { callId: "t2-bbbb", name: "get_mcp_tools", status: "completed", args: { server: "apex-tools", toolName: "apex_help", toolCallId: "x" }, result: { success: { text: "ok" } } }],
  ["tool_call", { callId: "t3-cccc", name: "read_file", status: "completed", args: { path: "a.js", limit: 5 }, result: { success: { path: "a.js", totalLines: 10, readRange: { startLine: 1, endLine: 5 }, content: "x".repeat(5000) } } }],
  ["tool_call", { callId: "t4-dddd", name: "run_terminal_cmd", status: "completed", args: { command: "node x.mjs" }, result: { spawnError: { message: "ENOENT /workspace/js/x" } } }],
  ["tool_call", { callId: "t5-eeee", name: "mcp", status: "completed", args: {}, result: mcpText({ ok: false, error: "endpoint is required" }) }],
  ["tool_call", { callId: "t6-ffff", name: "run_terminal_cmd", status: "completed", args: { command: "curl -H 'Authorization: Bearer tok_SECRETVALUE_12345abcdef' x" }, result: { success: { stdout: `${GROK} ghp_SECRETVALUE_99aaaaaaaaaaaaaaaaaaaa password=hunter2hunter2` } } }],
  ["result", { runId: RUN1, status: "FINISHED", text: "All done. See above.", durationMs: 12345 }],
  ["done", {}],
];
const FIX_TEXT = sse(FIX);
const noSecret = (s) => !/SECRETVALUE|hunter2|a1a1a1a1/.test(String(s));

test("one call is several events: groupCalls folds them (latest name, richest args, last result) and digest counts calls", () => {
  const calls = groupCalls(parseSse(FIX_TEXT));
  assert.equal(parseSse(FIX_TEXT).filter((e) => e.event === "tool_call").length, 9);
  assert.equal(calls.length, 6);
  const t1 = calls.find((c) => c.callId === "t1-aaaa");
  assert.equal(t1.name, "task");
  assert.equal(t1.args.environment, "SUBAGENT_EXECUTION_ENVIRONMENT_CLOUD");
  assert.equal(calls.find((c) => c.callId === "t2-bbbb").result.error, undefined);
  assert.deepEqual(foldCallEvent({ name: "a", args: null }, { name: "b", args: { x: 1 }, result: 7, status: "completed" }), { name: "b", args: { x: 1 }, result: 7, status: "completed" });
  // The richest args win: a later event with fewer args (only toolCallId) must not erase them; an equal-size one replaces.
  const rich = { name: "t", args: { path: "a.js", limit: 5 } };
  foldCallEvent(rich, { name: "t", args: { toolCallId: "x" } });
  assert.deepEqual(rich.args, { path: "a.js", limit: 5 });
  foldCallEvent(rich, { name: "t", args: { path: "b.js", limit: 9 } });
  assert.deepEqual(rich.args, { path: "b.js", limit: 9 });
  // digest: 6 calls, not 9 events; the transient `Invalid arguments` is not a failure; spawnError and mcp ok:false are
  const m = digestRun(parseSse(FIX_TEXT));
  assert.equal(Object.values(m.calls).reduce((a, b) => a + b, 0), 6);
  assert.equal(m.errCalls, 2);
  assert.ok(!Object.keys(m.errHeads).some((h) => h.includes("Invalid arguments")));
  assert.equal(m.mcpDiscovery, 1);
});

test("parseRun gives rows in stream order with merged chat, call stats and the final result", () => {
  const p = parseRun(FIX_TEXT, { id: RUN1, createdAt: "2026-10-20T20:00:00Z" });
  assert.deepEqual(p.rows.map((r) => r.kind), ["status", "chat", "thinking", "tool", "tool", "tool", "tool", "tool", "tool", "result"]);
  assert.equal(p.rows[1].text, "Looking at the files.");
  assert.equal(p.status, "FINISHED");
  assert.equal(p.durationMs, 12345);
  assert.equal(p.run8, RUN1.slice(-8));
  assert.deepEqual(p.stats, { calls: 6, errors: 2, elidedArgs: 1 });
  assert.deepEqual(p.rows.filter((r) => r.kind === "tool").map((r) => r.name), ["task", "get_mcp_tools", "read_file", "run_terminal_cmd", "mcp", "run_terminal_cmd"]);
});

test("renderLines: modes, tool filter, grep, results, width, and no secret ever printed", () => {
  const p = [parseRun(FIX_TEXT, { id: RUN1 })];
  const all = renderLines(p);
  assert.ok(all[0].startsWith(`RUN ${RUN1.slice(-8)} FINISHED`));
  assert.equal(all.filter((l) => l.startsWith("TOOL ")).length, 6);
  assert.ok(all.some((l) => l.startsWith('CHAT ') && l.includes("Looking at the files.")));
  assert.ok(all.some((l) => l.startsWith("RESULT ") && l.includes("FINISHED")));
  const errs = renderLines(p, { only: ["errors"] });
  assert.equal(errs.length, 2);
  assert.ok(errs.every((l) => l.includes(" ERR ") && l.includes(" !! ")));
  assert.ok(errs.some((l) => l.includes("spawnError ENOENT <path>")));
  const task = renderLines(p, { only: ["tools"], tool: "task", results: true });
  assert.equal(task.length, 1);
  assert.ok(task[0].includes("probe") && task[0].includes("-> child says hi"));
  assert.equal(renderLines(p, { only: ["tools"], grep: "read_file" }).length, 1);
  assert.equal(renderLines(p, { only: ["tools"] }).find((l) => l.includes("mcp ERR")).includes("(elided)"), true);
  assert.ok(renderLines(p, { only: ["chat"] }).every((l) => /^(CHAT|RESULT) /.test(l)));
  assert.ok(renderLines(p, { only: ["tools"], results: true, width: 40 }).every((l) => l.length < 40 * 3 + 80));
  assert.ok(noSecret(renderLines(p, { results: true }).join("\n")) && noSecret(renderLines(p, { only: ["tools"], results: true, width: 400 }).join("\n")));
});

test("redact and squash mask credentials, ids and workspace paths, and cut with an ellipsis", () => {
  const dirty = `Bearer lin_api_abcdefghij-klmnop1234 Bearer tok_SECRETVALUE_12345abcdef ghp_SECRETVALUE_99aaaaaaaaaaaaaaaaaaaa ${GROK} ghp_aaaaaaaaaaaaaaaaaaaaaaaa sk-abcdefghijklmnopqrstu AKIAABCDEFGHIJKLMNOP ${"f".repeat(40)} password=hunter2hunter2 api_key: "secretsecretsecret"`;
  const out = redact(dirty);
  for (const bad of ["lin_api_abcdefghij", "SECRETVALUE", "abcdefghij-klmnop1234", GROK, "ghp_aaaa", "sk-abcdef", "AKIAABCD", "f".repeat(40), "hunter2", "secretsecretsecret"]) assert.ok(!out.includes(bad), bad);
  assert.equal(squash("a   b\n/workspace/js/x.js run-3d266b1c-15ea-4cd7-a549-b64a34435823", 100), "a b <path> run-<uuid>");
  assert.equal(squash("x".repeat(50), 10), `${"x".repeat(9)}…`);
  assert.equal(squash(null), "");
});

test("argsSummary and resultBody read each tool by shape and fall back to the longest string", () => {
  assert.equal(argsSummary("read_file", { toolCallId: "x" }), "(elided)");
  assert.equal(argsSummary("read_file", null), "(elided)");
  assert.equal(argsSummary("mcp", { serverIdentifier: "apex-tools", toolName: "apex_help", toolCallId: "x" }), "apex-tools/apex_help");
  assert.equal(argsSummary("run_terminal_cmd", { command: "ls -la", timeout: 5 }), "ls -la");
  assert.equal(argsSummary("zzz", { a: 1 }), '{"a":1}');
  assert.equal(resultBody("edit_file", { success: { path: "a.js", linesAdded: 2, linesRemoved: 1, message: "ok", afterFullFileContent: "y".repeat(900) } }).text, "a.js +2 -1 ok");
  assert.equal(resultBody("read_file", { success: { path: "a.js", totalLines: 9, readRange: { startLine: 3, endLine: 5 }, content: "z".repeat(900) } }).text, "a.js lines 3-5 of 9");
  assert.equal(resultBody("run_terminal_cmd", { success: { stdout: "hello" } }).text, "hello");
  assert.equal(resultBody("web_fetch", { success: { url: "https://x.io", markdown: "m".repeat(12) } }).text, "https://x.io 12 chars");
  assert.equal(resultBody("whatever", { success: { a: "short", b: { c: "the longest string here" } } }).text, "the longest string here");
  assert.deepEqual(resultBody("x", undefined), { size: 0, text: "" });
});

test("findCall finds one result by callId prefix or run#seq, masks it, and cuts at max", () => {
  const p = [parseRun(FIX_TEXT, { id: RUN1 })];
  const byId = findCall(p, "t6-ff", { max: 4000 });
  assert.equal(byId.name, "run_terminal_cmd");
  assert.ok(noSecret(byId.text) && noSecret(byId.args));
  const bySeq = findCall(p, `${p[0].run8}#3`, { max: 60 });
  assert.equal(bySeq.name, "read_file");
  assert.equal(bySeq.truncated, true);
  assert.equal(bySeq.text.length, 60);
  assert.ok(bySeq.chars > 5000);
  assert.equal(findCall(p, "nope"), null);
});

test("jsonRows are bounded and masked, never the raw result; errorStreak counts identical failures only", () => {
  const p = [parseRun(FIX_TEXT, { id: RUN1 })];
  const rows = jsonRows(p, { width: 50 });
  assert.equal(rows[0].kind, "run");
  assert.deepEqual([rows[0].calls, rows[0].errors], [6, 2]);
  const tools = rows.filter((r) => r.kind === "tool");
  assert.equal(tools.length, 6);
  assert.ok(tools.every((r) => !("result" in r) && r.resultHead.length <= 50));
  assert.equal(tools.find((r) => r.name === "task").ok, true);
  assert.ok(noSecret(JSON.stringify(rows)));
  assert.equal(jsonRows(p, { only: ["errors"] }).filter((r) => r.kind === "tool").length, 2);
  const row = (error) => ({ kind: "tool", error });
  assert.equal(errorStreak([row("a"), row("a"), row("b"), row("a")]), 2);
  assert.equal(errorStreak([row("a"), row(null), row("a")]), 1);
});

test("loadRuns reads the cache first, skips runs past retention without a request, counts a 410, and caches what it fetches", async () => {
  const dir = tmpDir();
  const t = fakeClock();
  t.now = Date.parse("2026-10-20T20:00:00Z");
  const ago = (h) => new Date(t.now - h * 3600e3).toISOString();
  const list = { items: [{ id: RUN2, status: "FINISHED", createdAt: ago(1) }, { id: RUN1, status: "FINISHED", createdAt: ago(40) }] };
  let calls = stub([200, list], [200, FIX_TEXT]);
  try {
    const first = await loadRuns(ID, { dir, sel: "all" });
    assert.deepEqual([first.parsed.length, first.expired, first.notCached], [1, 1, 0]);
    assert.equal(calls.filter((c) => c.url.includes("/stream")).length, 1);
    assert.ok(calls[1].url.includes(RUN2));
    assert.equal(fs.readdirSync(dir).length, 1);
    // second read: from the cache, no stream request
    calls = stub([200, list]);
    const second = await loadRuns(ID, { dir, sel: "all", fetchMissing: false });
    assert.deepEqual([second.parsed.length, second.expired, second.notCached], [1, 0, 1]);
    assert.equal(calls.length, 1);
    // last = the newest run; a run id suffix selects; no match throws
    stub([200, list]);
    assert.equal((await loadRuns(ID, { dir, sel: "last", fetchMissing: false })).parsed[0].runId, RUN2);
    stub([200, list]);
    assert.equal((await loadRuns(ID, { dir, sel: RUN2.slice(-8), fetchMissing: false })).parsed.length, 1);
    stub([200, list]);
    await assert.rejects(loadRuns(ID, { dir, sel: "zzzz" }), /no run matches zzzz/);
    // a 410 inside the window is counted, not thrown
    const dir2 = tmpDir();
    stub([200, { items: [{ id: RUN2, status: "FINISHED", createdAt: ago(1) }] }], [410, err("stream_expired")]);
    const gone = await loadRuns(ID, { dir: dir2, sel: "last" });
    assert.deepEqual([gone.parsed.length, gone.expired], [0, 1]);
  } finally {
    t.restore();
    after();
  }
});

test("transcript and call: summary, json, validation, and one result in full with a | prefix", async () => {
  const dir = tmpDir();
  const t = fakeClock();
  t.now = Date.parse("2026-10-20T20:00:00Z");
  const list = { items: [{ id: RUN1, status: "FINISHED", createdAt: new Date(t.now - 3600e3).toISOString() }] };
  stub([200, list], [200, FIX_TEXT]);
  try {
    const sum = await transcript(ID, { sel: "all", summary: true, dir });
    assert.equal(sum.length, 2);
    assert.ok(sum[0].startsWith("RUN ") && sum[0].includes("calls=6 err=2"));
    assert.equal(sum[1], `TRANSCRIPT ${ID} runs=1 expired=0 notCached=0`);
    stub([200, list]);
    const js = JSON.parse((await transcript(ID, { json: true, only: ["errors"], dir }))[0]);
    assert.equal(js.agent, ID);
    assert.equal(js.rows.filter((r) => r.kind === "tool").length, 2);
    assert.ok(noSecret(JSON.stringify(js)));
    stub([200, list]);
    await assert.rejects(transcript(ID, { only: ["nope"], dir }), /--only takes tools, errors, chat, turns/);
    await assert.rejects(transcript(ID, { grep: "(", dir }), /not a valid regular expression/);
    stub([200, list]);
    const call = await transcriptCall(ID, "t6-ff", { dir, max: 4000 });
    assert.ok(call[0].startsWith("CALL ") && call[0].includes("run_terminal_cmd ok"));
    assert.ok(call.slice(1).every((l) => l.startsWith("| ")));
    assert.ok(noSecret(call.join("\n")));
    stub([200, list]);
    await assert.rejects(transcriptCall(ID, "missing", { dir }), /not found in 1 run/);
  } finally {
    t.restore();
    after();
  }
});

test("parseRun merges assistant chunks across streaming updates and starts a new message only at a boundary", () => {
  const rows = parseRun(
    sse([
      ["assistant", { text: "p" }],
      ["interaction_update", { type: "text-delta" }],
      ["interaction_update", { type: "text-delta" }],
      ["assistant", { text: "ong" }],
      ["tool_call", { callId: "k1", name: "read_file", args: { path: "a.js" }, result: { success: { path: "a.js" } } }],
      ["assistant", { text: "after the tool" }],
      ["thinking", { text: "..." }],
      ["assistant", { text: "after thinking" }],
    ]),
    { id: RUN1 },
  ).rows;
  assert.deepEqual(rows.filter((r) => r.kind === "chat").map((r) => r.text), ["pong", "after the tool", "after thinking"]);
});

test("handback waits, caches every retrievable run, and returns a bounded digest with failures and the artifact count", async () => {
  const dir = tmpDir();
  const t = fakeClock();
  t.now = Date.parse("2026-10-20T20:00:00Z");
  const ago = (h) => new Date(t.now - h * 3600e3).toISOString();
  const bad = sse([["tool_call", { callId: "k1", name: "get_mcp_tools", status: "completed", args: { server: "x" }, result: { error: { error: 'namespace "Github" not found' } } }, ], ["result", { status: "FINISHED", text: "done", durationMs: 1000 }]]);
  const runs = { items: [{ id: RUN2, status: "FINISHED", createdAt: ago(1) }, { id: RUN1, status: "FINISHED", createdAt: ago(40) }] };
  stub(
    [200, { id: ID, status: "IDLE", latestRunId: RUN2 }],
    [200, runs],
    [200, runs],
    [200, bad],
    [200, { items: [{ path: "artifacts/a.md" }, { path: "artifacts/b.md" }] }],
  );
  try {
    const r = await handback(ID, { dir });
    assert.equal(r.code, 0);
    assert.equal(r.lines[0], `WAIT ${ID} IDLE run=${RUN2} last=FINISHED HANDBACK runs=1 expired=1 notCached=0 calls=1 err=1`);
    assert.equal(r.lines.filter((l) => l.startsWith("RUN ")).length, 1);
    assert.ok(r.lines.some((l) => l.startsWith("TOOL ") && l.includes("get_mcp_tools ERR") && l.includes('namespace "Github" not found')));
    assert.equal(r.lines.at(-1), `ARTIFACTS 2 (artifacts ${ID})`);
    assert.equal(fs.readdirSync(dir).length, 1, "the retrievable run is cached on disk");
  } finally {
    t.restore();
    after();
  }
});

test("handback: a timeout returns 124 and reads no transcript; failures beyond the cap are counted; artifacts may be unreadable", async () => {
  const dir = tmpDir();
  const t = fakeClock();
  t.now = Date.parse("2026-10-20T20:00:00Z");
  let calls = stub(...Array.from({ length: 10 }, () => [200, { id: ID, status: "ACTIVE", latestRunId: RUN1 }]));
  try {
    const r = await handback(ID, { dir, timeoutS: 6, intervalS: 5 });
    assert.equal(r.code, 124);
    assert.equal(r.lines.length, 1);
    assert.ok(r.lines[0].startsWith(`WAIT ${ID} TIMEOUT`));
    assert.ok(!calls.some((c) => c.url.includes("/stream")), "no stream read while the agent is still working");
    // 7 failing calls, cap 5: five lines and a count of the rest; the artifacts request fails -> "unreadable"
    const many = sse([...Array.from({ length: 7 }, (_, i) => ["tool_call", { callId: `k${i}`, name: "read_file", status: "completed", args: { path: `f${i}.js` }, result: { error: { message: `boom ${i}` } } }]), ["result", { status: "FINISHED", text: "x" }]]);
    const run = { items: [{ id: RUN1, status: "FINISHED", createdAt: new Date(t.now - 3600e3).toISOString() }] };
    stub([200, { id: ID, status: "IDLE", latestRunId: RUN1 }], [200, run], [200, run], [200, many], [500, err("boom")]);
    const r2 = await handback(ID, { dir: tmpDir(), errors: 5 });
    assert.equal(r2.lines.filter((l) => l.startsWith("TOOL ")).length, 5);
    assert.ok(r2.lines.includes(`… 2 more failures (transcript ${ID} --only errors)`));
    assert.equal(r2.lines.at(-1), "ARTIFACTS unreadable");
  } finally {
    t.restore();
    after();
  }
});

test("handback keeps wait's exit code: a cancelled last run is 1, and the digest still prints", async () => {
  const t = fakeClock();
  t.now = Date.parse("2026-10-20T20:00:00Z");
  const run = { items: [{ id: RUN1, status: "CANCELLED", createdAt: new Date(t.now - 3600e3).toISOString() }] };
  const stream = sse([["status", { status: "CANCELLED" }], ["result", { status: "CANCELLED", text: "" }]]);
  stub([200, { id: ID, status: "IDLE", latestRunId: RUN1 }], [200, run], [200, run], [200, stream], [200, { items: [] }]);
  try {
    const r = await handback(ID, { dir: tmpDir() });
    assert.equal(r.code, 1);
    assert.ok(r.lines[0].includes("last=CANCELLED HANDBACK runs=1"));
    assert.equal(r.lines.at(-1), "ARTIFACTS 0");
  } finally {
    t.restore();
    after();
  }
});

// Claude Code adapter contract: shares this registered agent-control suite.
{
const { createClaudeAgents, runClaude, cloudId, validateClaudeRequest } = await import("../../tools/ci/claude-agents.mjs");
const { CLAUDE_CATALOG, createClaudeTools } = await import("../../tools/mcp/apex-claude-agents.mjs");
const { fileURLToPath } = await import("node:url");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ID = "cse_test123";
const request = (text = "Report status only") => ({ verb: "followup", id: ID, options: { text } });
const receipt = { exit: 0, stdout: JSON.stringify({ ok: true, session_id: ID }), stderr: "" };
function workspace(t) {
  const parent = path.join(ROOT, "artifacts", "claude-adapter-tests");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "case-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("cloud ids accept official URLs but never reinterpret cshk links or flags", () => {
  assert.equal(cloudId(`https://claude.ai/code/${ID}?from=cli`), ID);
  assert.equal(cloudId("session_abc"), "session_abc");
  for (const id of ["cshk_share123", "--help", "cse_a\n", "https://evil.test/code/cse_a", "https://user@claude.ai/code/cse_a", "https://claude.ai/code/cse_a/more"]) assert.throws(() => cloudId(id), { code: "bad_args" });
});

test("strict per-verb validation refuses typos and unsupported cloud controls before spawning", async () => {
  const handle = createClaudeAgents({ run: () => assert.fail("must not spawn") });
  for (const args of [
    { verb: "launch" }, { verb: "__proto__" }, { verb: {} },
    { ...request(), options: { text: "hello", model: "opus" } },
    { ...request(), options: { text: "hello", textFile: "scratch/a" } },
    { ...request(), options: { textFile: "scratch/../key" } },
    { ...request(), options: { textFile: "scratch\\key" } },
    { ...request(), options: { text: "" } },
    { ...request(), dryRun: "true" }, { ...request(), token: "secret" },
    { verb: "list", options: { limit: 1.5 } }, { verb: "list", options: { limit: "5" } },
    { verb: "local-logs", id: "--help" }, { verb: "local-list", options: { all: "yes" } },
  ]) assert.equal((await handle(args)).ok, false, JSON.stringify(args));
});

test("dryRun and MCP mock validate but neither read files nor send or echo message contents", async (t) => {
  const root = workspace(t);
  const run = () => assert.fail("dryRun must not call CLI");
  const tool = createClaudeTools({ root, run, mock: () => true });
  for (const args of [request("Do not echo this message"), { verb: "remember", id: ID, options: { title: "known" } }, { verb: "followup", id: ID, options: { textFile: "scratch/missing.txt" } }]) {
    const r = await tool.handlers.apex_claude_agents(args);
    assert.equal(r.structuredContent.dryRun, true);
    assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
    assert.equal(r.isError, false);
    assert.ok(!r.content[0].text.includes("Do not echo this message"));
  }
  assert.equal(fs.existsSync(path.join(root, "artifacts")), false);
});

test("followup preserves the message on stdin and reports only queued delivery", async () => {
  const message = "--help\nKeep $() and `literal` unchanged\n";
  let calls = 0;
  const handle = createClaudeAgents({ run: async (argv, options) => {
    calls++;
    assert.deepEqual(argv, ["-p", "--cloud", ID, "--output-format", "json"]);
    assert.equal(options.input, message);
    return receipt;
  } });
  const r = await handle(request(message));
  assert.equal(calls, 1);
  assert.equal(r.ok, true);
  assert.equal(r.delivery, "queued");
  assert.equal(r.replyRetrieved, false);
  assert.equal(r.retrySafe, false);
  assert.ok(!JSON.stringify(r).includes(message));
});

test("ambiguous sends, mismatched receipts and nonzero exits never become delivery success or retry", async () => {
  for (const result of [
    { exit: null, error: "timeout", started: true }, { exit: null, error: "output_limit", started: true },
    { exit: 0, stdout: "not json" }, { ...receipt, exit: 1 },
    { exit: 0, stdout: JSON.stringify({ ok: true, session_id: "cse_someone_else" }) },
    { exit: 0, stdout: JSON.stringify({ ok: true }) },
  ]) {
    let calls = 0;
    const r = await createClaudeAgents({ run: async () => { calls++; return result; } })(request());
    assert.equal(calls, 1);
    assert.equal(r.ok, false);
    assert.equal(r.error, "delivery_unknown");
    assert.equal(r.retrySafe, false);
  }
  const rejected = await createClaudeAgents({ run: async () => ({ exit: 1, stdout: JSON.stringify({ ok: false, error: "Session archived" }) }) })(request());
  assert.equal(rejected.delivery, "rejected");
});

test("a missing CLI is not mistaken for a message attempt", async () => {
  const r = await createClaudeAgents({ run: async () => ({ error: "cli_unavailable", started: false }) })(request());
  assert.equal(r.error, "cli_unavailable");
  assert.equal(r.delivery, "not_attempted");
});

test("auth drops account identity and credentials; logged-out status remains failure", async () => {
  const handle = createClaudeAgents({ run: async () => ({ exit: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "max", email: "private@example.test", accessToken: "never-return-this" }) }) });
  assert.deepEqual(await handle({ verb: "auth" }), { ok: true, loggedIn: true, authMethod: "claude.ai", subscriptionType: "max" });
  const r = await createClaudeAgents({ run: async () => ({ exit: 1, stdout: '{"loggedIn":false,"authMethod":"none"}' }) })({ verb: "auth" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "not_authenticated");
});

test("reference listing is explicit, bounded, read-only and never a provider ownership claim", async (t) => {
  const root = workspace(t);
  const handle = createClaudeAgents({ root, run: () => assert.fail("registry does not call provider"), now: () => "2026-10-31T00:00:00Z" });
  assert.equal((await handle({ verb: "list" })).total, 0);
  assert.equal(fs.existsSync(path.join(root, "artifacts")), false);
  const added = await handle({ verb: "remember", id: ID, options: { title: "Garage" } });
  assert.equal(added.verifiedOwnership, false);
  const file = path.join(root, "artifacts", "claude-agents.json");
  const before = fs.statSync(file);
  const r = await handle({ verb: "list", options: { limit: 1 } });
  assert.equal(r.source, "local_reference_registry");
  assert.equal(r.live, false);
  assert.equal(r.sessions[0].id, ID);
  assert.equal(fs.statSync(file).mtimeMs, before.mtimeMs);
  assert.equal(before.mode & 0o777, 0o600);
  fs.writeFileSync(file + ".lock", "");
  assert.equal((await handle({ verb: "remember", id: ID, options: { title: "updated" } })).error, "registry_busy");
  assert.equal((await handle({ verb: "list" })).sessions[0].title, "Garage");
});

test("message files refuse escapes and symlinks; in-scope content travels only on stdin", async (t) => {
  const root = workspace(t), outside = workspace(t);
  fs.mkdirSync(path.join(root, "scratch"));
  fs.writeFileSync(path.join(outside, "external.txt"), "outside content");
  fs.symlinkSync(path.join(outside, "external.txt"), path.join(root, "scratch", "escape.txt"));
  let calls = 0;
  const handle = createClaudeAgents({ root, run: async (_argv, options) => { calls++; assert.equal(options.input, "status only"); return receipt; } });
  assert.equal((await handle({ verb: "followup", id: ID, options: { textFile: "scratch/escape.txt" } })).error, "path_escaped");
  assert.equal(calls, 0);
  fs.writeFileSync(path.join(root, "scratch", "message.txt"), "status only");
  assert.equal((await handle({ verb: "followup", id: ID, options: { textFile: "scratch/message.txt" } })).delivery, "queued");
  fs.mkdirSync(path.join(root, "artifacts"));
  fs.symlinkSync(path.join(outside, "external.txt"), path.join(root, "artifacts", "claude-agents.json"));
  assert.equal((await handle({ verb: "list" })).error, "path_escaped");
});

test("local sessions and logs retain their source, bounds and untrusted-data label", async () => {
  const list = await createClaudeAgents({ run: async (argv) => { assert.deepEqual(argv, ["agents", "--json", "--all"]); return { exit: 0, stdout: JSON.stringify([{ sessionId: "local1", name: "one", secret: "drop" }, { sessionId: "local2" }]) }; } })({ verb: "local-list", options: { all: true, limit: 1 } });
  assert.equal(list.source, "local_cli_sessions");
  assert.equal(list.truncated, true);
  assert.equal(list.sessions.length, 1);
  assert.ok(!JSON.stringify(list).includes("drop"));
  const logs = await createClaudeAgents({ run: async (argv) => { assert.deepEqual(argv, ["logs", "local1"]); return { exit: 0, stdout: "abcdefgh" }; } })({ verb: "local-logs", id: "local1", options: { maxChars: 3 } });
  assert.equal(logs.text, "fgh"); assert.equal(logs.truncated, true); assert.equal(logs.untrustedData, true);
});

test("real child transport uses argv/stdin without shell expansion and handles absence and cancellation", async (t) => {
  const root = workspace(t);
  const bin = path.join(root, "fake-claude");
  fs.writeFileSync(bin, '#!/usr/bin/env node\nlet s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.stringify({argv:process.argv.slice(2),input:s})));\n', { mode: 0o700 });
  const r = await runClaude(["auth", "status"], { cwd: root, env: { ...process.env, APEX_CLAUDE_BIN: bin }, input: "$(touch must-not-exist)" });
  assert.equal(r.exit, 0);
  assert.deepEqual(JSON.parse(r.stdout), { argv: ["auth", "status"], input: "$(touch must-not-exist)" });
  assert.equal(fs.existsSync(path.join(root, "must-not-exist")), false);
  const missing = await runClaude([], { env: { ...process.env, APEX_CLAUDE_BIN: path.join(root, "missing") } });
  assert.equal(missing.error, "cli_unavailable"); assert.equal(missing.started, false);
  const cancelled = await runClaude([], { signal: AbortSignal.abort() });
  assert.equal(cancelled.error, "cancelled"); assert.equal(cancelled.started, false);
});

test("MCP descriptor is compact and exposes honest mutation/network hints", async () => {
  const descriptor = CLAUDE_CATALOG[0];
  assert.equal(descriptor.name, "apex_claude_agents");
  assert.deepEqual(Object.keys(descriptor.inputSchema.properties), ["verb", "id", "options", "dryRun"]);
  assert.equal(descriptor.annotations.readOnlyHint, false);
  assert.equal(descriptor.annotations.idempotentHint, false);
  assert.equal(descriptor.annotations.openWorldHint, true);
  const tool = createClaudeTools({ run: () => assert.fail("unsupported operation must not run") });
  const rejected = await tool.handlers.apex_claude_agents({ verb: "launch" });
  assert.equal(rejected.isError, true);
  assert.equal(rejected.structuredContent.error, "unsupported_verb");
  assert.equal(validateClaudeRequest({ verb: "list" }).options.limit, 20);
});

}

// Cloud transcript snapshots: same registered suite, no live provider traffic.
{
const { createClaudeAgents } = await import("../../tools/ci/claude-agents.mjs");
const { createClaudeTools } = await import("../../tools/mcp/apex-claude-agents.mjs");
const { spawnSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ID = "cse_transcript123";
function fixture(t) {
  const parent = path.join(ROOT, "artifacts", "claude-transcript-tests");
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, "case-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("cloud transcript retrieval publishes a pinned, bounded snapshot and reuses it without refetch", async (t) => {
  const root = fixture(t); let calls = 0; let exported;
  const handle = createClaudeAgents({ root, now: () => "2026-10-31T00:00:00Z", runReader: async (argv, options) => {
    calls++; assert.equal(options.executable, "python3"); assert.equal(options.timeoutMs, 48000);
    assert.equal(argv[argv.indexOf("--id") + 1], ID);
    exported = argv[argv.indexOf("--output") + 1];
    fs.writeFileSync(exported, "user: status\nassistant: READY\n0123456789");
    return { exit: 0, stdout: JSON.stringify({ ok: true, source: "cloud_teleport_export" }) };
  } });
  const first = await handle({ verb: "transcript", id: ID, options: { maxChars: 8 } });
  assert.equal(first.ok, true); assert.equal(first.text, "user: st");
  assert.deepEqual([first.live, first.untrustedData, first.source], [false, true, "cloud_teleport_export"]);
  assert.equal(first.nextOffset, 8);
  assert.equal(fs.statSync(exported).mode & 0o777, 0o600);
  const second = await handle({ verb: "transcript", id: ID, options: { offset: first.nextOffset, snapshotId: first.snapshotId, maxChars: 8 } });
  assert.deepEqual([second.text, calls], ["atus\nass", 1]);
  const changed = await handle({ verb: "transcript", id: ID, options: { offset: 8, snapshotId: "a".repeat(64) } });
  assert.equal(changed.error, "snapshot_changed");
  fs.appendFileSync(exported, "tampered");
  assert.equal((await handle({ verb: "transcript", id: ID })).error, "snapshot_changed");
});

test("transcript dryRun/invalid continuations never create files or invoke the reader", async (t) => {
  const root = fixture(t);
  const tools = createClaudeTools({ root, runReader: () => assert.fail("must not fetch") });
  const invoke = (args) => tools.handlers.apex_claude_agents({ verb: "transcript", id: ID, ...args });
  assert.equal((await invoke({ dryRun: true })).structuredContent.dryRun, true);
  for (const options of [{ offset: 1 }, { offset: -1 }, { refresh: "yes" }, { maxChars: 32001 }, { snapshotId: "bad" }, { refresh: true, offset: 2, snapshotId: "a".repeat(64) }]) assert.equal((await invoke({ options })).isError, true);
  assert.equal(fs.existsSync(path.join(root, "artifacts")), false);
});

test("failed refresh never substitutes a stale snapshot; missing export and malformed receipts fail", async (t) => {
  const root = fixture(t); let fail = false;
  const handle = createClaudeAgents({ root, runReader: async (argv) => {
    if (fail) return { exit: 1, stdout: '{"ok":false,"error":"reader_busy"}' };
    fs.writeFileSync(argv[argv.indexOf("--output") + 1], "history");
    return { exit: 0, stdout: '{"ok":true,"source":"cloud_teleport_export"}' };
  } });
  assert.equal((await handle({ verb: "transcript", id: ID })).ok, true); fail = true;
  const rejected = await handle({ verb: "transcript", id: ID, options: { refresh: true } });
  assert.equal(rejected.ok, false); assert.equal(rejected.error, "reader_busy");
  for (const result of [{ error: "timeout" }, { exit: 0, stdout: "broken" }, { exit: 0, stdout: '{"ok":true,"source":"cloud_teleport_export"}' }]) {
    const other = createClaudeAgents({ root: fixture(t), runReader: async () => result });
    assert.equal((await other({ verb: "transcript", id: ID })).ok, false);
  }
});

test("PTY export driver sends only the built-in export command and rejects trust prompts", (t) => {
  const root = fixture(t), helper = path.join(ROOT, "tools/ci/claude-transcript.py");
  const cli = path.join(root, "fake-claude");
  fs.writeFileSync(cli, '#!/usr/bin/env python3\nimport sys,pathlib,time\nassert sys.argv[1:5]==["--safe-mode","--tools","","--strict-mcp-config"]\nprint("Session resumed\\n❯",flush=True)\nline=sys.stdin.readline().strip()\nassert line.startswith("/export "),line\npathlib.Path(line[8:]).write_text("user: status\\nassistant: fixture reply")\nprint("Conversation expor ed to: "+line[8:],flush=True)\nsys.stdout.write("\\x1b[1A\\x1b[19Gt\\x1b[1B");sys.stdout.flush()\ntime.sleep(3)\n', { mode: 0o700 });
  const output = path.join(root, "snapshot.txt");
  const code = 'import importlib.util,sys,pathlib,json;spec=importlib.util.spec_from_file_location("reader",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);print(json.dumps(m.drive(sys.argv[2],"cse_fixture",pathlib.Path(sys.argv[3]),pathlib.Path(sys.argv[4]),5)))';
  const r = spawnSync("python3", ["-c", code, helper, cli, root, output], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout); assert.equal(body.ok, true); assert.equal(body.newCloudMessagesSent, 0);
  assert.equal(fs.readFileSync(output, "utf8"), "user: status\nassistant: fixture reply");
  const cli2 = path.join(root, "trust-claude");
  fs.writeFileSync(cli2, '#!/usr/bin/env python3\nimport time\nprint("Yes, I trust this folder",flush=True)\ntime.sleep(3)\n', { mode: 0o700 });
  const denied = spawnSync("python3", ["-c", code, helper, cli2, root, path.join(root, "absent.txt")], { encoding: "utf8", timeout: 10000 });
  assert.equal(JSON.parse(denied.stdout).error, "reader_setup_required");
  assert.equal(fs.existsSync(path.join(root, "absent.txt")), false);
});
}
