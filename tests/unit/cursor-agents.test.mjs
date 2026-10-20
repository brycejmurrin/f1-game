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
  errorHead,
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
    assert.ok(/ written=1 skipped=0 expired=1$/.test(line));
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
  const masked = errorHead("read_file", { error: { message: "no file /workspace/js/a.js run-3d266b1c-15ea-4cd7-a549-b64a34435823" } });
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
    assert.ok(/ written=2 skipped=0 expired=1$/.test(line));
  } finally {
    t.restore();
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
