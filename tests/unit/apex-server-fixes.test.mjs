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
  // Long-lived on purpose: the cancellation test must cancel a RUNNING job; a
  // 500 ms child finished first on a loaded CI runner and the job read "done".
  fs.writeFileSync(path.join(root, "tools/shot/frame-report.mjs"),
    'await new Promise(r=>setTimeout(r,30000)); console.log(JSON.stringify({ok:true,pid:process.pid}));\n');
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
    let attempts = 0;
    const failingOwner = () => f.make({ spawnJob() { attempts++; throw new Error("injected spawn failure"); } }).handlers;
    const x = failingOwner();
    const dir = path.join(f.root, "artifacts/logs/apex-jobs");
    for (let attempt = 1; attempt <= 4; attempt++) {
      // Re-enter through both the original handler and independent owners.
      const owner = attempt % 2 ? x : failingOwner();
      const r = body(owner.apex_job_start({ kind: "survey_track", track: "monza" }));
      assert.equal(r.error, "job_spawn_failed");
      assert.equal(attempts, attempt, "released admission permits another spawn attempt");
      assert.equal(f.locks(), 0, "failed reservation releases its browser lock");
      assert.deepEqual(fs.readdirSync(dir), [".admission"], "no starting manifest, job log or reservation remains");
      const coordination = path.join(dir, ".admission");
      const epochs = fs.readdirSync(coordination).sort();
      const expected = Array.from({ length: Math.min(attempt, 2) }, (_, i) => `${attempt - Math.min(attempt, 2) + i + 1}.json`);
      assert.deepEqual(epochs, expected, "only the latest two coordination epochs survive; no temporary files leak");
      for (const epoch of epochs) {
        const claim = JSON.parse(fs.readFileSync(path.join(coordination, epoch), "utf8"));
        assert.equal(claim.state, "released", "persistent coordination cannot leave admission held");
        assert.equal(claim.owner.pid, process.pid);
        assert.equal(typeof claim.owner.birth, "string");
        assert.ok(claim.owner.birth.length > 0);
        assert.match(claim.token, /^[0-9a-f-]{36}$/i, "each released epoch retains complete ownership identity");
      }
    }
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
    const id = "survey_track-mabc123-1-0000000000a1"; // the id shape jobStart mints
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
    const id = "survey_track-mabc123-1-0000000000a2", markerPath = path.join(dir, `${id}.cancelled`);
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, state: "running", browser: true,
      pid: child.pid, kind: "survey_track", started: Date.now(), argv: [],
      log: "artifacts/fixture.log", stderr: "artifacts/fixture.err" }));
    // Exercise the actual portable path even on Linux, without a real browser.
    fs.readFileSync = function (file, ...args) {
      if (String(file).startsWith("/proc/")) throw Object.assign(new Error("no procfs"), { code: "ENOENT" });
      return read.call(this, file, ...args);
    };
    process.env.TZ = "UTC0"; process.env.LC_ALL = "C";
    // jobStart records the root's launch identity; cancel signals only a root that still matches it.
    const { processBirth } = await import("../../tools/mcp/job-admission.mjs");
    const manifestPath = path.join(dir, `${id}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestPath, "utf8")), birth: processBirth(child.pid) }));
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

// ── apex_job_* id, path and launch-identity checks (W25). Node processes only; no browser. ──
import { spawn as spawnNode } from "node:child_process";
import { processBirth, compareBirth } from "../../tools/mcp/job-admission.mjs";
import { alive as pidAlive, killTreeAndWait as killPids } from "../../tools/lib/process-tree.mjs";
const sleeper = () => spawnNode(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });

async function jobSafetyFixture() {
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-job-safety-"));
  const dir = path.join(root, "artifacts/logs/apex-jobs");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, "scratch"), { recursive: true });
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const listeners = new Set();
  const signalled = [];
  const make = (over = {}) => {
    const before = new Set(process.listeners("exit"));
    const x = createExtras({ ROOT: root, toolResult, refuse, acquireLock: () => null, releaseLock() {}, occupancyRefuse: () => null,
      assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false,
      killJobTree: async (pids) => { signalled.push(...pids); return { survivors: [] }; }, ...over });
    for (const l of process.listeners("exit")) if (!before.has(l)) listeners.add(l);
    return x.handlers;
  };
  const cleanup = () => { for (const l of listeners) process.removeListener("exit", l); fs.rmSync(root, { recursive: true, force: true }); };
  return { root, dir, make, signalled, cleanup };
}

test("job ids outside jobStart's exact shape are refused by status, wait and cancel", async () => {
  const f = await jobSafetyFixture();
  const victim = sleeper();
  try {
    fs.writeFileSync(path.join(f.root, "secret.txt"), "SECRET-LINE\n");
    fs.mkdirSync(path.join(f.root, "elsewhere"));
    fs.writeFileSync(path.join(f.root, "elsewhere/evil.json"), JSON.stringify({ id: "x", kind: "frame_fleet", state: "running",
      pid: victim.pid, browser: false, started: Date.now(), argv: [], log: "secret.txt", stderr: "secret.txt" }));
    const h = f.make();
    for (const jobId of ["../../../elsewhere/evil", "frame_fleet-abc-1-0123456789ab/../../x", "nope_kind-abc-1-0123456789ab",
      "frame_fleet-abc-0-0123456789ab", "frame_fleet-abc-1-0123456789AB", ""]) {
      const s = body(h.apex_job_status({ jobId: jobId || "_" }));
      assert.equal(s.error, "bad_args", `status ${jobId}`);
      assert.equal(JSON.stringify(s).includes("SECRET"), false, "no file content in a refusal");
      assert.equal(body(await h.apex_job_status({ jobId: jobId || "_", wait: 1 })).error, "bad_args", `wait ${jobId}`);
      assert.equal(body(await h.apex_job_cancel({ jobId })).error, "bad_args", `cancel ${jobId}`);
    }
    assert.deepEqual(f.signalled, [], "nothing signalled");
    assert.equal(pidAlive(victim.pid), true);
  } finally { await killPids([victim.pid], { graceMs: 0 }); f.cleanup(); }
});

test("a manifest's log paths are read and pruned only under artifacts/ or scratch/", async () => {
  const f = await jobSafetyFixture();
  try {
    const outside = path.join(f.root, "outside.txt");
    fs.writeFileSync(outside, "OUTSIDE-CONTENT\n");
    const id = "frame_fleet-mabc123-1-00000000000b";
    fs.writeFileSync(path.join(f.dir, `${id}.json`), JSON.stringify({ id, kind: "frame_fleet", state: "done", exit: 0, pid: null,
      browser: false, started: 1, ended: 2, argv: [], log: "outside.txt", stderr: "../outside.txt" }));
    const h = f.make();
    const s = body(h.apex_job_status({ jobId: id }));
    assert.equal(s.state, "done");
    assert.equal(JSON.stringify(s).includes("OUTSIDE-CONTENT"), false, "tail/out never read outside the tree");
    body(h.apex_job_status({}));   // prune: ended long ago
    assert.equal(fs.existsSync(outside), true, "prune never removes a file outside artifacts/ or scratch/");
    // A manifest whose id field differs from its file name is not a job.
    const other = "frame_fleet-mabc123-1-00000000000c";
    fs.writeFileSync(path.join(f.dir, `${other}.json`), JSON.stringify({ id: "frame_fleet-mabc123-1-00000000000d", state: "done" }));
    assert.equal(body(h.apex_job_status({ jobId: other })).error, "unknown_job");
  } finally { f.cleanup(); }
});

test("cancel refuses an unproven root and never signals a reused PID", async () => {
  const f = await jobSafetyFixture();
  const victim = sleeper();
  try {
    const h = f.make();
    const noBirth = "frame_fleet-mabc123-1-0000000000e1";
    fs.writeFileSync(path.join(f.dir, `${noBirth}.json`), JSON.stringify({ id: noBirth, kind: "frame_fleet", state: "running", exit: null,
      pid: victim.pid, browser: false, started: Date.now(), argv: [], log: `artifacts/logs/apex-jobs/${noBirth}.log` }));
    const r = body(await h.apex_job_cancel({ jobId: noBirth }));
    assert.equal(r.error, "job_identity_unknown");
    assert.equal(fs.existsSync(path.join(f.dir, `${noBirth}.cancelled`)), false, "no marker written");

    const reused = "frame_fleet-mabc123-1-0000000000e2";
    const current = processBirth(victim.pid);
    const stale = current.replace(/[^:]+$/, "1");   // same scheme, another start: the launched process is gone
    assert.equal(compareBirth(stale, current), "different");
    fs.writeFileSync(path.join(f.dir, `${reused}.json`), JSON.stringify({ id: reused, kind: "frame_fleet", state: "running", exit: null,
      pid: victim.pid, birth: stale, browser: false, started: Date.now(), argv: [], log: `artifacts/logs/apex-jobs/${reused}.log` }));
    const s = body(h.apex_job_status({ jobId: reused }));
    assert.notEqual(s.state, "running", "a reused PID does not keep a job running");
    await h.apex_job_cancel({ jobId: reused });
    assert.deepEqual(f.signalled, []);
    assert.equal(pidAlive(victim.pid), true);
  } finally { await killPids([victim.pid], { graceMs: 0 }); f.cleanup(); }
});

test("jobStart records the launch identity and cancel signals that process", async () => {
  const f = await jobSafetyFixture();
  let pid;
  try {
    const h = f.make({ spawnJob: (_c, _a, options) => spawnNode(process.execPath, ["-e", "setInterval(()=>{},1000)"], options),
      killJobTree: undefined });
    const job = body(h.apex_job_start({ kind: "survey_track", track: "monza" }));
    assert.equal(job.ok, true);
    const m = JSON.parse(fs.readFileSync(path.join(f.dir, `${job.jobId}.json`), "utf8"));
    pid = m.pid;
    assert.equal(typeof m.birth, "string");
    assert.equal(m.birth, processBirth(pid));
    const c = body(await h.apex_job_cancel({ jobId: job.jobId }));
    assert.equal(c.state, "cancelled");
    assert.equal(c.survivors, 0);
    assert.equal(pidAlive(pid), false);
  } finally { if (pid) await killPids([pid], { graceMs: 0 }); f.cleanup(); }
});

test("designs must live under artifacts/ or scratch/ and a parse error does not quote the file", async () => {
  const f = await jobSafetyFixture();
  try {
    const h = f.make();
    fs.writeFileSync(path.join(f.root, "designs.json"), "{}");
    const out = body(h.apex_job_start({ kind: "shot_survey", track: "monza", designs: "designs.json", dryRun: true }));
    assert.equal(out.error, "path_escaped");
    fs.writeFileSync(path.join(f.root, "scratch/bad.json"), "PRIVATE=value not json");
    for (const call of [() => h.apex_job_start({ kind: "shot_survey", track: "monza", designs: "scratch/bad.json", dryRun: true }),
      () => h.apex_shot_survey({ track: "monza", designs: "scratch/bad.json", dryRun: true })]) {
      const r = body(await call());
      assert.equal(r.ok, false);
      assert.equal(r.message, "designs file is not valid JSON");
      assert.equal(JSON.stringify(r).includes("PRIVATE"), false, "no file content echoed");
    }
  } finally { f.cleanup(); }
});
