import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const body = (r) => JSON.parse(r.content[0].text);
const toolResult = (value, { isError = false } = {}) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  ...(isError || value.ok === false ? { isError: true } : {}),
});
const refuse = (error, message, fix) => toolResult({ ok: false, error, message, fix }, { isError: true });

async function fixture() {
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-server-fixes-"));
  fs.mkdirSync(path.join(root, "tools/shot"), { recursive: true });
  fs.mkdirSync(path.join(root, "tools/track"), { recursive: true });
  fs.writeFileSync(path.join(root, "tools/shot/frame-report.mjs"),
    'await new Promise(r=>setTimeout(r,500)); console.log(JSON.stringify({ok:true,pid:process.pid}));\n');
  fs.writeFileSync(path.join(root, "tools/shot/track-session.mjs"), `
    process.stdin.resume();
    setTimeout(()=>console.log(JSON.stringify({ready:true,track:"monza"})),400);
    process.stdin.on("data",d=>{ for(const line of String(d).trim().split("\\n")){ const x=JSON.parse(line); setTimeout(()=>console.log(JSON.stringify({id:x.id,ok:true})),400); } });
  `);
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  let locks = 0;
  const make = (overrides = {}) => createExtras({ ROOT: root, toolResult, refuse,
    acquireLock: () => { locks++; return null; }, releaseLock: () => { locks--; }, occupancyRefuse: () => null,
    assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false, ...overrides });
  return { root, make, locks: () => locks };
}

test("runSpawn treats byte-bounded truncation as an explicit failure", async () => {
  const { runSpawn } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const n = 8 * 1024 * 1024 + 4096;
  const r = body(await runSpawn([process.execPath, "-e", `process.stdout.write("x".repeat(${n})+JSON.stringify({ok:true}))`], { timeoutMs: 15000 }));
  assert.equal(r.ok, false);
  assert.equal(r.error, "output_truncated");
  assert.equal(r.out, null, "a missing terminal verdict cannot be success");
  assert.equal(Buffer.byteLength(r.stdout), 8 * 1024 * 1024, "returned output is byte-bounded");
  assert.deepEqual(r.truncated, { stdout: true, stderr: false, stdoutBytes: n + 11, stderrBytes: 0, capBytes: 8 * 1024 * 1024 });
});

test("durable jobs have exclusive cross-owner identities and cancellation converges", async () => {
  const f = await fixture();
  try {
    const a = f.make().handlers, b = f.make().handlers;
    const realNow = Date.now;
    Date.now = () => 1_800_000_000_000;
    let one, two;
    try {
      one = body(a.apex_job_start({ kind: "frame_fleet" }));
      two = body(b.apex_job_start({ kind: "frame_fleet" }));
    } finally { Date.now = realNow; }
    assert.notEqual(one.jobId, two.jobId);
    const dir = path.join(f.root, "artifacts/logs/apex-jobs");
    assert.ok(fs.existsSync(path.join(dir, `${one.jobId}.json`)) && fs.existsSync(path.join(dir, `${two.jobId}.json`)));
    assert.equal(body(await b.apex_job_cancel({ jobId: one.jobId })).state, "cancelled");
    assert.equal(body(await a.apex_job_cancel({ jobId: two.jobId })).state, "cancelled");
    // Deterministic worst interleaving: a stale owner writes failed after the
    // cancelling owner created its exclusive marker. The marker is authoritative.
    const oneManifest = path.join(dir, `${one.jobId}.json`);
    const stale = JSON.parse(fs.readFileSync(oneManifest));
    fs.writeFileSync(oneManifest, JSON.stringify({ ...stale, state: "failed", exit: 143, ended: Date.now() }));
    assert.equal(body(await a.apex_job_status({ jobId: one.jobId })).state, "cancelled", "original owner adopts disk cancellation");
    const filtered = body(await a.apex_job_status({ state: "cancelled" }));
    assert.ok(filtered.jobs.some((j) => j.jobId === one.jobId), "state filter reconciles before filtering");
    assert.equal(body(await a.apex_job_status({ jobId: one.jobId, wait: 1 })).state, "cancelled", "wait loop reconciles before waiting");
    assert.ok(fs.existsSync(path.join(dir, `${one.jobId}.cancelled`)), "exclusive marker survives stale manifest writes");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("job reservation failure removes owned files and releases a browser lock", async () => {
  const f = await fixture();
  try {
    const x = f.make({ spawnJob() { throw new Error("injected spawn failure"); } }).handlers;
    const r = body(x.apex_job_start({ kind: "survey_track", track: "monza" }));
    assert.equal(r.error, "job_spawn_failed");
    assert.equal(f.locks(), 0);
    const dir = path.join(f.root, "artifacts/logs/apex-jobs");
    assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], [], "only this failed start's reservations are removed");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("abort closes a persistent track open and releases its lock", async () => {
  const f = await fixture();
  try {
    const x = f.make().handlers;
    const ctl = new AbortController();
    const pending = x.apex_track({ op: "open", track: "monza" }, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 25);
    const r = body(await pending);
    assert.equal(r.error, "cancelled");
    assert.equal(f.locks(), 0);
    assert.equal(body(await x.apex_track({ op: "status" })).error, "track_not_open");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("abort of an active persistent track request closes the session", async () => {
  const f = await fixture();
  try {
    const x = f.make().handlers;
    assert.equal(body(await x.apex_track({ op: "open", track: "monza" })).ok, true);
    const ctl = new AbortController();
    const pending = x.apex_track({ op: "status" }, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 25);
    const r = body(await pending);
    assert.equal(r.error, "cancelled");
    for (let i = 0; i < 20 && f.locks() !== 0; i++) await sleep(25);
    assert.equal(f.locks(), 0);
    assert.equal(body(await x.apex_track({ op: "status" })).error, "track_not_open");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("track survey receives the dispatch abort signal before spawning", async () => {
  const f = await fixture();
  try {
    const ctl = new AbortController(); ctl.abort();
    const r = body(await f.make().handlers.apex_track({ op: "survey", track: "monza" }, { signal: ctl.signal }));
    assert.equal(r.error, "cancelled");
    assert.equal(f.locks(), 0);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
