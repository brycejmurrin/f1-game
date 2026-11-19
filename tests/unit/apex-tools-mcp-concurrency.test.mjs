// apex-tools-mcp-concurrency.test.mjs — apex-tools MCP (local CLI wrap): cross-owner job admission and the two-job ceiling.
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network. One of eight files split from the
// original apex-tools-mcp.test.mjs (T1-16, #3043); shared fixtures: tests/helpers/apex-tools-mcp.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, extrasCtx, jid } from "../helpers/apex-tools-mcp.mjs";

// Independent contexts share only disk; spawn stubs never execute a workload.
test("MCP concurrency: starting reservations enforce the cross-owner two-job ceiling", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { EventEmitter } = await import("node:events");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-admission-"));
  const dir = path.join(root, "artifacts/logs/apex-jobs"), owners = [], children = [], answers = [], reservations = [];
  const body = r => JSON.parse(r.content[0].text);
  const argv = process.argv[2];
  try {
    process.argv[2] = "call";
    for (let i = 0; i < 3; i++) owners.push(createExtras(extrasCtx({ ROOT: root,
      acquireLock: () => { throw Error("tree jobs must not acquire the browser lock"); },
      spawnJob: (_command, args, options) => {
        assert.match(args[1], /read -r gate/);
        assert.equal(options.stdio[0], "pipe");
        const manifests = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
        reservations.push(manifests.filter(m => m.state === "starting").length);
        assert.ok(manifests.filter(m => m.state === "starting").every(m => m.owner?.birth && m.owner.pid === process.pid));
        const id = path.basename(options.env.APEX_JOB_EXIT_FILE, ".exit");
        if (i < 2) answers[i + 1] = body(owners[i + 1].handlers.apex_job_start({ kind: "parts_sweep" }));
        const child = new EventEmitter(); child.pid = process.pid; child.unref = () => {};
        child.stdin = new EventEmitter();
        child.stdin.end = gate => {
          assert.equal(gate, "go\n");
          const published = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"));
          assert.equal(published.state, "running", "workload gate follows durable running publication");
        };
        child.id = id;
        children.push(child); return child;
      },
    }).ctx));
    answers[0] = body(owners[0].handlers.apex_job_start({ kind: "parts_sweep" }));
    assert.deepEqual(reservations, [1, 2]);
    assert.equal(answers.filter(a => a.ok).length, 2);
    assert.equal(answers[2].error, "jobs_busy");
    assert.equal(body(owners[2].handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy", "sequential refusal remains intact");
    children.forEach(child => child.emit("exit", 0));
    const next = body(owners[2].handlers.apex_job_start({ kind: "parts_sweep" }));
    assert.equal(next.ok, true, JSON.stringify(next));
    children.at(-1).emit("exit", 0);
    assert.ok(fs.readdirSync(path.join(dir, ".admission")).filter(f => f.endsWith(".json")).length <= 2, "provably retired history stays bounded");
  } finally { process.argv[2] = argv; children.forEach(child => child.emit("exit", 0)); fs.rmSync(root, { recursive: true, force: true }); }
});

test("MCP concurrency: failed spawns and stale reservations free slots; live unknown owners remain reserved", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { EventEmitter } = await import("node:events");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-retirement-"));
  const dir = path.join(root, "artifacts/logs/apex-jobs"), children = [];
  const body = r => JSON.parse(r.content[0].text);
  let mode = "throw", capturedOwner;
  const argv = process.argv[2];
  try {
    process.argv[2] = "call";
    const ex = createExtras(extrasCtx({ ROOT: root, spawnJob: () => {
      const starting = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).find(m => m.state === "starting");
      capturedOwner = starting.owner;
      if (mode === "throw") throw Error("owned synchronous spawn failure");
      const child = new EventEmitter(); child.pid = process.pid; child.unref = () => {}; children.push(child); return child;
    } }).ctx);
    assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "job_spawn_failed");
    assert.equal(fs.readdirSync(dir).filter(f => f.endsWith(".json")).length, 0);
    mode = "ok";
    const first = body(ex.handlers.apex_job_start({ kind: "parts_sweep" }));
    assert.equal(first.ok, true);
    children[0].emit("error", Error("owned asynchronous spawn failure"));
    assert.equal(body(ex.handlers.apex_job_status({ jobId: first.jobId })).state, "failed");
    const reserve = (id, owner) => fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, kind: "parts_sweep", state: "starting", owner,
      started: Date.now(), log: `artifacts/logs/apex-jobs/${id}.log`, stderr: `artifacts/logs/apex-jobs/${id}.err` }));
    reserve(jid("parts_sweep", 1), { pid: 2147483647, birth: capturedOwner.birth });
    reserve(jid("parts_sweep", 2), { ...capturedOwner, birth: `${capturedOwner.birth}:different` });
    reserve(jid("parts_sweep", 3), { pid: process.pid });
    const next = body(ex.handlers.apex_job_start({ kind: "parts_sweep" }));
    assert.equal(next.ok, true, JSON.stringify(next));
    for (const id of [jid("parts_sweep", 1), jid("parts_sweep", 2)]) {
      const retired = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"));
      assert.equal(retired.state, "failed");
      assert.match(retired.exit, /owner exited/);
    }
    assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy", "unknown identity of a live owner must fail closed");
    children.at(-1).emit("exit", 0);
  } finally { process.argv[2] = argv; children.forEach(child => child.emit("exit", 0)); fs.rmSync(root, { recursive: true, force: true }); }
});

test("MCP concurrency: abandoned admission epochs recover while live claims refuse without spawning", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { EventEmitter } = await import("node:events");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-lock-recovery-"));
  const admission = path.join(root, "artifacts/logs/apex-jobs/.admission");
  const body = r => JSON.parse(r.content[0].text);
  let spawned = 0, acquired = 0, released = 0, child;
  const argv = process.argv[2];
  try {
    process.argv[2] = "call";
    fs.mkdirSync(admission, { recursive: true });
    fs.writeFileSync(path.join(admission, "1.json"), JSON.stringify({ state: "held", owner: { pid: process.pid } }));
    const ex = createExtras(extrasCtx({ ROOT: root, acquireLock: () => { acquired++; return null; }, releaseLock: () => { released++; }, spawnJob: () => {
      spawned++; child = new EventEmitter(); child.pid = process.pid; child.unref = () => {}; return child;
    } }).ctx);
    assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy");
    assert.equal(spawned, 0);
    for (const corrupt of ["null", "broken"]) {
      fs.writeFileSync(path.join(admission, "1.json"), corrupt);
      assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy", "uncertain latest ownership fails closed");
      assert.equal(spawned, 0);
    }
    fs.writeFileSync(path.join(admission, "1.json"), JSON.stringify({ state: "held", owner: { pid: 2147483647 } }));
    const started = body(ex.handlers.apex_job_start({ kind: "survey_track", track: "monza" }));
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(spawned, 1);
    assert.equal(acquired, 1, "browser admission still takes the separate browser lock");
    assert.equal(JSON.parse(fs.readFileSync(path.join(admission, "2.json"), "utf8")).state, "released");
    child.emit("exit", 0);
    assert.equal(released, 1);
  } finally { process.argv[2] = argv; if (child) child.emit("exit", 0); fs.rmSync(root, { recursive: true, force: true }); }
});

test("MCP concurrency: simultaneous OS owners cannot publish more than two running jobs", { timeout: 10000 }, async () => {
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-process-admission-"));
  const moduleUrl = new URL("../../tools/mcp/apex-extras.mjs", import.meta.url).href;
  const script = `
    import { createExtras } from ${JSON.stringify(moduleUrl)};
    import { EventEmitter } from "node:events";
    process.argv[2] = "call";
    const result = body => ({content:[{type:"text",text:JSON.stringify(body)}]});
    const ex = createExtras({ ROOT: process.argv[1], toolResult: result, refuse: (error,message) => result({ok:false,error,message}),
      acquireLock: () => { throw Error("unexpected browser lock"); }, releaseLock() {}, occupancyRefuse: () => null,
      assertSafeOut: p => p, knownCircuits: () => ["monza"], runSpawn: null, log() {}, mockMode: () => false,
      spawnJob: () => { const child = new EventEmitter(); child.pid=process.pid; child.unref=()=>{}; return child; } });
    process.on("message", message => {
      if (message === "stop") process.exit(0);
      process.send(JSON.parse(ex.handlers.apex_job_start({kind:"parts_sweep"}).content[0].text));
    });
    process.send({ready:true});
  `;
  const children = [];
  const message = child => new Promise((resolve, reject) => {
    child.once("message", resolve); child.once("error", reject);
  });
  try {
    const ready = [];
    for (let i = 0; i < 3; i++) {
      const child = spawn(process.execPath, ["--input-type=module", "-e", script, root], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
      children.push(child); ready.push(message(child));
    }
    assert.ok((await Promise.all(ready)).every(r => r.ready));
    const replies = children.map(message);
    children.forEach(child => child.send("start"));
    const results = await Promise.all(replies);
    const accepted = results.filter(r => r.ok).length;
    assert.ok(accepted >= 1 && accepted <= 2, JSON.stringify(results));
    assert.ok(results.filter(r => !r.ok).every(r => r.error === "jobs_busy"));
    const dir = path.join(root, "artifacts/logs/apex-jobs");
    const manifests = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    assert.equal(manifests.filter(m => m.state === "running").length, accepted);
  } finally {
    await Promise.all(children.map(child => new Promise(resolve => { child.once("exit", resolve); child.send("stop"); })));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("MCP concurrency: failed running publication withholds the workload gate and frees admission", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { EventEmitter } = await import("node:events");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-publication-failure-"));
  const rename = fs.renameSync, argv = process.argv[2], gates = [];
  const body = r => JSON.parse(r.content[0].text);
  try {
    process.argv[2] = "call";
    const ex = createExtras(extrasCtx({ ROOT: root, spawnJob: () => {
      fs.renameSync = (from, to) => {
        if (to.endsWith(".json") && !to.includes(`${path.sep}.admission${path.sep}`)) throw Error("owned publication failure");
        return rename(from, to);
      };
      const child = new EventEmitter(); child.pid = process.pid; child.unref = () => {};
      child.stdin = new EventEmitter(); child.stdin.end = gate => gates.push(gate); return child;
    } }).ctx);
    assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "job_spawn_failed");
    assert.deepEqual(gates, [undefined], "EOF aborts the wrapper before it executes the workload");
    fs.renameSync = rename;
    const dir = path.join(root, "artifacts/logs/apex-jobs");
    assert.equal(fs.readdirSync(dir).filter(f => f.endsWith(".json")).length, 0);
    assert.equal(body(ex.handlers.apex_job_status({})).total, 0);
  } finally { fs.renameSync = rename; process.argv[2] = argv; fs.rmSync(root, { recursive: true, force: true }); }
});

test("MCP concurrency: job wrapper aborts on owner EOF and executes normally after publication", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { EventEmitter } = await import("node:events");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-job-wrapper-"));
  const marker = path.join(root, "executed"), argv = process.argv[2];
  let command, args, options, child;
  try {
    process.argv[2] = "call";
    fs.mkdirSync(path.join(root, "tools/track"), { recursive: true });
    fs.writeFileSync(path.join(root, "tools/track/verify-track.cjs"), `require("fs").writeFileSync(${JSON.stringify(marker)}, "ok");`);
    const ex = createExtras(extrasCtx({ ROOT: root, spawnJob: (cmd, a, opts) => {
      command = cmd; args = a; options = opts;
      child = new EventEmitter(); child.pid = process.pid; child.unref = () => {}; return child;
    } }).ctx);
    const started = JSON.parse(ex.handlers.apex_job_start({ kind: "verify_all" }).content[0].text);
    assert.equal(started.ok, true);
    const aborted = spawnSync(command, args, { cwd: root, env: options.env, input: "", encoding: "utf8", timeout: 5000 });
    assert.equal(aborted.status, 125, aborted.stderr);
    assert.equal(fs.existsSync(marker), false, "owner EOF never runs the workload");
    const healthy = spawnSync(command, args, { cwd: root, env: options.env, input: "go\n", encoding: "utf8", timeout: 5000 });
    assert.equal(healthy.status, 0, healthy.stderr);
    assert.equal(fs.readFileSync(marker, "utf8"), "ok");
    assert.equal(fs.readFileSync(options.env.APEX_JOB_EXIT_FILE, "utf8"), "0", "durable exit format remains unchanged");
  } finally { process.argv[2] = argv; child?.emit("exit", 0); fs.rmSync(root, { recursive: true, force: true }); }
});

test("MCP concurrency: a delayed pruned-epoch contender cannot enter or replace current admission", async () => {
  const { takeJobAdmission } = await import("../../tools/mcp/job-admission.mjs");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-delayed-admission-"));
  const dir = path.join(root, ".admission"), link = fs.linkSync;
  const owner = { pid: process.pid, birth: "proc:owned-fixture" }, birth = () => owner.birth;
  let delayed = false, peerRelease, current;
  try {
    takeJobAdmission(dir, owner, birth)(); // epoch 1 released
    fs.linkSync = (from, to) => {
      if (!delayed && to === path.join(dir, "2.json")) {
        delayed = true;
        // Advance peer owners while this contender still holds its old next
        // sequence. Their latest admission prunes that retired sequence.
        takeJobAdmission(dir, owner, birth)();
        takeJobAdmission(dir, owner, birth)();
        peerRelease = takeJobAdmission(dir, owner, birth);
        current = fs.readFileSync(path.join(dir, "4.json"), "utf8");
        assert.equal(fs.existsSync(path.join(dir, "2.json")), false);
      }
      return link(from, to);
    };
    assert.equal(takeJobAdmission(dir, owner, birth), null);
    assert.equal(fs.readFileSync(path.join(dir, "4.json"), "utf8"), current, "a stale contender never replaces or removes the current peer claim");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "2.json"), "utf8")).state, "released", "losing own claim retires without entering");
    fs.linkSync = link;
    // Unreadable and live uncertain old metadata must survive history cleanup.
    fs.writeFileSync(path.join(dir, "0.json"), "broken");
    fs.writeFileSync(path.join(dir, "1.json"), JSON.stringify({ state: "held", owner: { pid: process.pid } }));
    peerRelease();
    takeJobAdmission(dir, owner, birth)();
    assert.equal(fs.readFileSync(path.join(dir, "0.json"), "utf8"), "broken");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "1.json"), "utf8")).state, "held");
    assert.equal(fs.existsSync(path.join(dir, "2.json")), false, "retired stale contender may be pruned by current owner");
  } finally { fs.linkSync = link; fs.rmSync(root, { recursive: true, force: true }); }
});

test("MCP concurrency: admission release failure cleans prelaunch resources and retries after recovery", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { EventEmitter } = await import("node:events");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-release-failure-"));
  const dir = path.join(root, "artifacts/logs/apex-jobs"), rename = fs.renameSync, open = fs.openSync, argv = process.argv[2];
  const body = r => JSON.parse(r.content[0].text), descriptors = [], children = [], gates = [];
  let held = false, acquired = 0, released = 0, spawns = 0;
  try {
    process.argv[2] = "call";
    const ctx = extrasCtx({ ROOT: root, acquireLock: () => { assert.equal(held, false); held = true; acquired++; return null; },
      releaseLock: () => { assert.equal(held, true); held = false; released++; }, spawnJob: () => {
        spawns++;
        const child = new EventEmitter(); child.pid = process.pid; child.unref = () => {};
        child.stdin = new EventEmitter(); child.stdin.end = gate => gates.push(gate); children.push(child); return child;
      } }).ctx;
    const ex = createExtras(ctx), peer = createExtras(ctx);
    fs.openSync = (file, ...args) => {
      const fd = open(file, ...args);
      if (typeof file === "string" && /\.(log|err)$/.test(file) && args[0] === "wx") descriptors.push(fd);
      return fd;
    };
    fs.renameSync = (from, to) => {
      if (to.includes(`${path.sep}.admission${path.sep}`)) throw Error("owned admission release failure");
      return rename(from, to);
    };
    const failed = body(ex.handlers.apex_job_start({ kind: "survey_track", track: "monza" }));
    assert.equal(failed.error, "job_spawn_failed");
    assert.match(failed.message, /owned admission release failure/);
    assert.equal(spawns, 0);
    assert.equal(held, false);
    assert.equal(acquired, 1); assert.equal(released, 1);
    assert.equal(descriptors.length, 2);
    descriptors.forEach(fd => assert.throws(() => fs.fstatSync(fd), { code: "EBADF" }, "prelaunch log descriptors close"));
    assert.deepEqual(fs.readdirSync(dir).filter(f => !f.startsWith(".")), [], "failed launch owns no leftover reservation or logs");
    const epoch = path.join(dir, ".admission/1.json");
    assert.equal(JSON.parse(fs.readFileSync(epoch, "utf8")).state, "held", "failed release keeps cross-owner admission closed");
    assert.equal(body(peer.handlers.apex_job_start({ kind: "parts_sweep" })).error, "jobs_busy");
    assert.equal(body(ex.handlers.apex_job_start({ kind: "parts_sweep" })).error, "job_spawn_failed", "retry stays closed while release publication still fails");
    assert.equal(spawns, 0);
    assert.equal(acquired, 1, "release recovery precedes any new reservation or browser lock");
    fs.renameSync = rename;
    fs.openSync = open;
    const recovered = body(ex.handlers.apex_job_start({ kind: "survey_track", track: "monza" }));
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(spawns, 1);
    assert.deepEqual(gates, ["go\n"]);
    assert.equal(JSON.parse(fs.readFileSync(epoch, "utf8")).state, "released");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, ".admission/2.json"), "utf8")).state, "released");
    children[0].emit("exit", 0);
    assert.equal(held, false); assert.equal(acquired, 2); assert.equal(released, 2);
  } finally {
    fs.renameSync = rename; fs.openSync = open; process.argv[2] = argv;
    children.forEach(child => child.emit("exit", 0)); fs.rmSync(root, { recursive: true, force: true });
  }
});

test("MCP concurrency: retrying admission release never replaces uncertain peer identity", async () => {
  const { takeJobAdmission } = await import("../../tools/mcp/job-admission.mjs");
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-release-identity-")), rename = fs.renameSync;
  const owner = { pid: process.pid, birth: "proc:owned-release-fixture" }, birth = () => owner.birth;
  try {
    const release = takeJobAdmission(dir, owner, birth), file = path.join(dir, "1.json");
    fs.renameSync = () => { throw Error("owned release failure"); };
    assert.throws(release, /owned release failure/);
    fs.renameSync = rename;
    const peer = JSON.stringify({ state: "held", owner: { pid: process.pid }, token: "uncertain-peer" });
    fs.writeFileSync(file, peer);
    assert.throws(release, /ownership changed/);
    assert.equal(fs.readFileSync(file, "utf8"), peer);
    assert.equal(takeJobAdmission(dir, owner, birth), null);
  } finally { fs.renameSync = rename; fs.rmSync(dir, { recursive: true, force: true }); }
});
