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
  // Outlives the test: the jobs are cancelled, never awaited. A short sleep let a
  // loaded shard finish job two ("done") before its cancel landed.
  fs.writeFileSync(path.join(root, "tools/shot/frame-report.mjs"),
    'await new Promise(r=>setTimeout(r,60000)); console.log(JSON.stringify({ok:true,pid:process.pid}));\n');
  fs.writeFileSync(path.join(root, "tools/shot/track-session.mjs"), `
    process.stdin.resume();
    setTimeout(()=>console.log(JSON.stringify({ready:true,track:"monza"})),400);
    process.stdin.on("data",d=>{ for(const line of String(d).trim().split("\\n")){ const x=JSON.parse(line); setTimeout(()=>console.log(JSON.stringify({id:x.id,ok:true})),400); } });
  `);
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  let locks = 0;
  const ownedExitListeners = new Set();
  const make = (overrides = {}) => {
    const before = new Set(process.listeners("exit"));
    const extras = createExtras({ ROOT: root, toolResult, refuse,
      acquireLock: () => { locks++; return null; }, releaseLock: () => { locks--; }, occupancyRefuse: () => null,
      assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false, ...overrides });
    for (const listener of process.listeners("exit")) if (!before.has(listener)) ownedExitListeners.add(listener);
    return extras;
  };
  const cleanup = () => {
    for (const listener of ownedExitListeners) process.removeListener("exit", listener);
    fs.rmSync(root, { recursive: true, force: true });
  };
  return { root, make, cleanup, locks: () => locks };
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
  } finally { f.cleanup(); }
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
  } finally { f.cleanup(); }
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
  } finally { f.cleanup(); }
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
  } finally { f.cleanup(); }
});

test("track survey receives the dispatch abort signal before spawning", async () => {
  const f = await fixture();
  try {
    const ctl = new AbortController(); ctl.abort();
    const r = body(await f.make().handlers.apex_track({ op: "survey", track: "monza" }, { signal: ctl.signal }));
    assert.equal(r.error, "cancelled");
    assert.equal(f.locks(), 0);
  } finally { f.cleanup(); }
});

// These are Node processes only: browser:true exercises occupancy without ever
// importing a browser launcher or spawning the planned survey executable.
test("cross-owner browser cancellation retains occupancy until detached descendants are gone", async () => {
  const { spawn } = await import("node:child_process");
  const { alive, killTreeAndWait } = await import("../../tools/lib/process-tree.mjs");
  const f = await fixture();
  let childPid, rootPid, pending;
  try {
    const ready = path.join(f.root, "descendant.json");
    const script = `
      const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,['-e',${JSON.stringify(`process.on('SIGTERM',()=>{}); require('node:fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid})); setInterval(()=>{},1000);`)}],{detached:true,stdio:'ignore'});
      setInterval(()=>{},1000);
    `;
    let held = false;
    let observer;
    const make = (extra = {}) => f.make({
      acquireLock: () => held || observer.runningBrowserJob() ? refuse("occupied", "browser work active", "Wait") : (held = true, null),
      releaseLock: () => { held = false; },
      spawnJob: (_cmd, _argv, options) => spawn(process.execPath, ["-e", script], options),
      ...extra,
    });
    const owner = make(), canceller = make(); observer = make();
    const job = body(owner.handlers.apex_job_start({ kind: "survey_track", track: "monza" }));
    assert.equal(job.ok, true);
    for (let i = 0; i < 200 && !fs.existsSync(ready); i++) await sleep(25);
    assert.ok(fs.existsSync(ready), "Node descendant installed its SIGTERM handler");
    childPid = JSON.parse(fs.readFileSync(ready)).pid;
    const manifest = path.join(f.root, "artifacts/logs/apex-jobs", `${job.jobId}.json`);
    rootPid = JSON.parse(fs.readFileSync(manifest)).pid;
    pending = canceller.handlers.apex_job_cancel({ jobId: job.jobId });
    for (let i = 0; i < 80 && alive(rootPid); i++) await sleep(25);
    assert.equal(alive(rootPid), false, "root exited during cancellation grace period");
    assert.equal(alive(childPid), true, "detached descendant still needs escalation");
    assert.equal(held, true, "original owner's exit callback must retain the lock");
    // Also verify the persistent owner eventually unlinks its own lock.
    // The following stale-owner simulation exercises the independent disk path.
    held = false; // a one-shot owner's lock may be stale/reaped by the third caller
    assert.equal(observer.runningBrowserJob()?.id, job.jobId, "disk cleanup state retains occupancy without an owner lock");
    const refused = body(observer.handlers.apex_job_start({ kind: "survey_track", track: "monza" }));
    assert.equal(refused.error, "occupied");
    const cancelled = body(await pending); pending = null;
    assert.equal(cancelled.state, "cancelled");
    assert.equal(cancelled.survivors, 0);
    assert.equal(alive(childPid), false);
    assert.equal(observer.runningBrowserJob(), null);
    assert.equal(owner.runningBrowserJob(), null, "original owner converges with durable completion");
    assert.equal(held, false);
  } finally {
    if (pending) await pending;
    if (rootPid || childPid) await killTreeAndWait([rootPid, childPid].filter(Boolean), { graceMs: 0 });
    f.cleanup();
  }
});


test("surviving cleanup remains occupied and another owner can retry it", async () => {
  const { spawn } = await import("node:child_process");
  const { alive, killTreeAndWait } = await import("../../tools/lib/process-tree.mjs");
  const f = await fixture();
  let rootPid;
  try {
    let held = false;
    const release = () => { held = false; };
    const owner = f.make({ acquireLock: () => (held = true, null), releaseLock: release,
      spawnJob: (_cmd, _argv, options) => spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], options) });
    const interrupted = f.make({ releaseLock: release, killJobTree: async (pids) => ({ survivors: pids.filter(alive) }) });
    const retry = f.make({ releaseLock: () => {} }); // another process cannot release the owner's lock
    const job = body(owner.handlers.apex_job_start({ kind: "survey_track", track: "monza" }));
    const manifest = path.join(f.root, "artifacts/logs/apex-jobs", `${job.jobId}.json`);
    rootPid = JSON.parse(fs.readFileSync(manifest)).pid;
    const left = body(await interrupted.handlers.apex_job_cancel({ jobId: job.jobId }));
    assert.equal(left.ok, false, "cleanup with survivors must not claim success");
    assert.equal(left.survivors, 1);
    assert.equal(held, true);
    assert.equal(retry.runningBrowserJob()?.id, job.jobId);
    const waiting = body(await retry.handlers.apex_job_status({ jobId: job.jobId, wait: 1 }));
    assert.equal(waiting.cleanupPending, true);
    assert.equal(waiting.stillRunning, true, "status wait includes unfinished cleanup");
    assert.equal(body(await retry.handlers.apex_job_cancel({ jobId: job.jobId })).survivors, 0);
    for (let i = 0; i < 40 && held; i++) await sleep(25);
    assert.equal(held, false, "persistent owner releases only after durable completion");
    assert.equal(retry.runningBrowserJob(), null);
    assert.equal(alive(rootPid), false);
  } finally {
    if (rootPid) await killTreeAndWait([rootPid], { graceMs: 0 });
    f.cleanup();
  }
});


test("same-owner cancellation clears the old watcher before a new lock is acquired", async () => {
  const { spawn } = await import("node:child_process");
  const { killTreeAndWait } = await import("../../tools/lib/process-tree.mjs");
  const f = await fixture();
  let rootPid;
  try {
    let held = false, releases = 0;
    const owner = f.make({ acquireLock: () => (held = true, null),
      releaseLock: () => { held = false; releases++; },
      spawnJob: (_cmd, _argv, options) => spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], options) });
    const job = body(owner.handlers.apex_job_start({ kind: "survey_track", track: "monza" }));
    rootPid = JSON.parse(fs.readFileSync(path.join(f.root, "artifacts/logs/apex-jobs", `${job.jobId}.json`))).pid;
    assert.equal(body(await owner.handlers.apex_job_cancel({ jobId: job.jobId })).survivors, 0);
    assert.equal(held, false);
    const released = releases;
    held = true; // the next operation acquired a fresh lock under the same server PID
    await sleep(350); // more than two cleanup-watcher intervals
    assert.equal(held, true, "old cleanup cannot unlink the next operation's lock");
    assert.equal(releases, released, "successful cancellation releases exactly once");
  } finally {
    if (rootPid) await killTreeAndWait([rootPid], { graceMs: 0 });
    f.cleanup();
  }
});


test("durable cleanup excludes reused PIDs and keeps unknown live identities occupied", async () => {
  const { spawn } = await import("node:child_process");
  const { alive, killTreeAndWait } = await import("../../tools/lib/process-tree.mjs");
  const f = await fixture();
  const unrelated = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  try {
    const observer = f.make();
    const dir = path.join(f.root, "artifacts/logs/apex-jobs");
    fs.mkdirSync(dir, { recursive: true });
    const id = "stale_birth_fixture";
    const markerPath = path.join(dir, `${id}.cancelled`);
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, state: "cancelled", browser: true,
      pid: unrelated.pid, kind: "survey_track", started: Date.now(), ended: Date.now(), argv: [],
      log: "artifacts/fixture.log", stderr: "artifacts/fixture.err" }));
    const marker = { state: "cancelled", ended: Date.now(), cleanup: { pids: [unrelated.pid], complete: false } };
    fs.writeFileSync(markerPath, JSON.stringify(marker));
    const unknown = body(await observer.handlers.apex_job_cancel({ jobId: id }));
    assert.equal(unknown.ok, false);
    assert.equal(unknown.survivors, 1);
    assert.equal(observer.runningBrowserJob()?.id, id, "unknown identity fails closed");
    assert.equal(alive(unrelated.pid), true);
    const alternateScheme = fs.existsSync("/proc/sys/kernel/random/boot_id") ? "ps" : "proc";
    marker.cleanup.identities = [{ pid: unrelated.pid, birth: `${alternateScheme}:incompatible-record` }];
    fs.writeFileSync(markerPath, JSON.stringify(marker));
    const incompatible = body(await observer.handlers.apex_job_cancel({ jobId: id }));
    assert.equal(incompatible.ok, false);
    assert.equal(incompatible.survivors, 1);
    assert.equal(observer.runningBrowserJob()?.id, id, "incompatible birth schemes retain occupancy");
    assert.equal(alive(unrelated.pid), true, "incompatible identity cannot authorize a signal");
    const currentScheme = alternateScheme === "ps" ? "proc" : "ps-utc-v1";
    marker.cleanup.identities = [{ pid: unrelated.pid, birth: `${currentScheme}:previous-boot:stale-start` }];
    fs.writeFileSync(markerPath, JSON.stringify(marker));
    const stale = body(await observer.handlers.apex_job_cancel({ jobId: id }));
    assert.equal(stale.survivors, 0, "original identity is gone");
    assert.equal(alive(unrelated.pid), true, "PID-reusing process must never be signalled");
    assert.equal(observer.runningBrowserJob(), null);
  } finally {
    await killTreeAndWait([unrelated.pid], { graceMs: 0 });
    f.cleanup();
  }
});

test("portable cleanup identities survive timezone changes and retain legacy ambiguity", async () => {
  const { spawn, execFileSync } = await import("node:child_process");
  const { alive, killTreeAndWait } = await import("../../tools/lib/process-tree.mjs");
  const f = await fixture();
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  const read = fs.readFileSync;
  const saved = Object.fromEntries(["TZ", "LC_ALL", "LANG"].map((key) => [key, process.env[key]]));
  try {
    const dir = path.join(f.root, "artifacts/logs/apex-jobs");
    fs.mkdirSync(dir, { recursive: true });
    const id = "portable_birth_fixture", markerPath = path.join(dir, `${id}.cancelled`);
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, state: "running", browser: true,
      pid: child.pid, kind: "survey_track", started: Date.now(), argv: [],
      log: "artifacts/fixture.log", stderr: "artifacts/fixture.err" }));
    // Exercise the actual portable path even on Linux, without a real browser.
    fs.readFileSync = function (file, ...args) {
      if (String(file).startsWith("/proc/")) throw Object.assign(new Error("no procfs"), { code: "ENOENT" });
      return read.call(this, file, ...args);
    };
    process.env.TZ = "UTC0"; process.env.LC_ALL = "C";
    const legacyBirth = `ps:${execFileSync("ps", ["-p", String(child.pid), "-o", "lstart="], { encoding: "utf8" }).trim()}`;
    const signalled = [];
    const observer = f.make({ killJobTree: async (pids) => { signalled.push(...pids); return { survivors: pids }; } });
    const first = body(await observer.handlers.apex_job_cancel({ jobId: id }));
    assert.equal(first.ok, false);
    assert.deepEqual(signalled, [child.pid]);
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    assert.match(marker.cleanup.identities[0].birth, /^ps-utc-v1:/);
    process.env.TZ = "America/Los_Angeles"; process.env.LC_ALL = "POSIX"; process.env.LANG = "fr_FR.UTF-8";
    signalled.length = 0;
    const retry = body(await observer.handlers.apex_job_cancel({ jobId: id }));
    assert.equal(retry.ok, false);
    assert.deepEqual(signalled, [child.pid], "timezone/locale changes still identify the same live process");
    assert.equal(observer.runningBrowserJob()?.id, id);

    marker.cleanup.identities = [{ pid: child.pid, birth: legacyBirth }];
    fs.writeFileSync(markerPath, JSON.stringify(marker));
    signalled.length = 0;
    const legacy = body(await observer.handlers.apex_job_cancel({ jobId: id }));
    assert.equal(legacy.ok, false);
    assert.equal(legacy.cleanupPending, true);
    assert.deepEqual(signalled, [], "legacy ps identity cannot authorize a signal or prove PID reuse");
    assert.equal(observer.runningBrowserJob()?.id, id);
    assert.equal(alive(child.pid), true);
    fs.readFileSync = read;
    await killTreeAndWait([child.pid], { graceMs: 0 });
    const finished = body(await observer.handlers.apex_job_cancel({ jobId: id }));
    assert.equal(finished.ok, true, "legacy cleanup completes once the original PID is actually gone");
    assert.equal(observer.runningBrowserJob(), null);
  } finally {
    fs.readFileSync = read;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await killTreeAndWait([child.pid], { graceMs: 0 });
    f.cleanup();
  }
});
