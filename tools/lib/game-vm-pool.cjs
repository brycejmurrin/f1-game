#!/usr/bin/env node
// @doc Pool of game-vm contexts in worker threads: one circuit's probe per worker, JSON back — assertions stay in the parent.
// game-vm-pool.cjs — N game-vm.cjs contexts in worker_threads, one circuit at a time.
//
// WHY. tools/lib/game-vm.cjs boots the real js/game.js in ~2.5 s and then costs
// ~1 s a circuit to build and ~3.13 ms a physics step with a 22-car field
// (docs/plans/research-2026-09-16/vm-harness.md, probe1/probe5). A per-circuit
// test file therefore runs at the speed of one core: elevation-tracks-vm was
// 399 s for 40 circuits, and ~70 % of that was stepping. Stepping cannot be
// made cheaper without changing the driving model — which a twin of a browser
// spec may never do — but forty INDEPENDENT circuits can run four at a time.
// Measured on this 4-core box, 2026-09-16: elevation-tracks-vm 400 s serial
// (APEX_VM_POOL=0) -> 191-210 s pooled, 47/47 green every run. The box was
// shared with other agents' suites throughout — the 210 s run averaged load
// 5.1, i.e. the four workers held about three of the four cores.
//
// WHAT IT IS NOT. Not a test runner and not an assertion surface: a worker
// returns a plain JSON-serialisable object and EVERY assert stays in the parent
// `test()`, so a failure still names the circuit, the threshold and the value,
// and the 1:1 spec<->twin mapping tools/ci/twinned-specs.mjs checks is
// untouched (a 4-way file split would break it — that is why this is a pool).
//
// THE PROBE IS SOURCE, not a closure. The parent hands over a function (or its
// text); the worker compiles it with vm.runInThisContext and calls
//
//     await probe(g, { circuit, ...options }, state)
//
// where `g` is the worker's game-vm handle and `state` is whatever the optional
// one-per-worker `init(g)` returned (the boot tuning, a mock, …). A probe that
// closes over module scope will throw in the worker — keep each one
// self-contained (tests/helpers/elevation-probes.cjs is the worked example).
//
// MEMORY is the reason for the caps. RSS grows ~40 MB a circuit and never comes
// back (probe6: 44 MB -> 453 MB over six circuits), so a worker is recycled
// after `maxJobs` circuits or as soon as it reports more than `rssLimitMb` —
// a fresh boot costs ~2.5 s, which is cheaper than a 2 GB worker on a shared
// box. Defaults: size min(4, cores), maxJobs 8, rssLimitMb 1200.
//
// Every job also carries the console errors and unhandled rejections the game
// logged while it ran (the `errorsSince(mark())` idiom of the VM twins), and a
// per-job timeout: a worker that hangs or dies fails its circuit's test with
// the circuit named, instead of hanging the file.
//
// Usage:
//   const { createPool } = require("./game-vm-pool.cjs");
//   const pool = createPool({ boot: { track: "monza" }, init: (g) => ({ PHYS0: { ...g.apex.tuning() } }) });
//   const jobs = ids.map((id) => pool.run({ circuit: id, probe: PROBE, options: { steps: 150 } }));
//   const { result, errors } = await jobs[0];      // plain JSON + what the game logged
//   await pool.close();                            // in after()
// CLI (smoke check, ~15 s): node tools/lib/game-vm-pool.cjs [circuit …]

"use strict";

const os = require("os");
const path = require("path");
const vm = require("vm");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const SELF = __filename;
const TAG = "__gameVmPool";

const srcOf = (fn) => (typeof fn === "function" ? fn.toString() : String(fn));
const compile = (src, what) => vm.runInThisContext(`(${src})`, { filename: `game-vm-pool:${what}` });
const cores = () => (typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length);

// ---------------------------------------------------------------------------
// Worker side
// ---------------------------------------------------------------------------

function startWorker() {
  const { createGame } = require(path.join(__dirname, "game-vm.cjs"));
  const cache = new Map();
  let g = null, state = null, booting = null;

  // One boot per worker, on the first job: a worker that never gets one costs
  // nothing. `init` runs once, right after the boot, and its return value is
  // handed to every probe (the twins use it for the boot tuning snapshot).
  const ready = () => {
    if (!booting) {
      booting = (async () => {
        const t0 = Date.now();
        g = await createGame(workerData.boot || {});
        if (workerData.init) state = await compile(workerData.init, "init")(g);
        return Date.now() - t0;
      })();
    }
    return booting;
  };

  parentPort.on("message", (job) => {
    (async () => {
      const bootMs = await ready();
      const probe = cache.get(job.probe) || cache.set(job.probe, compile(job.probe, "probe")).get(job.probe);
      // Marked BEFORE the probe races, so the window is the whole job — the
      // same span the serial twins mark before their startRace().
      const c0 = g.record.console.length, r0 = g.record.rejections.length;
      const t0 = Date.now();
      const result = await probe(g, Object.assign({ circuit: job.circuit }, job.options || {}), state);
      const errors = [
        ...g.record.console.slice(c0).filter((e) => e[0] === "error").map((e) => e[1]),
        ...g.record.rejections.slice(r0),
      ];
      parentPort.postMessage({
        id: job.id, ok: true, result, errors,
        ms: Date.now() - t0, bootMs, rssMb: Math.round(process.memoryUsage().rss / 1048576),
      });
    })().catch((e) => {
      parentPort.postMessage({
        id: job.id, ok: false, message: String((e && e.message) || e), stack: String((e && e.stack) || ""),
        rssMb: Math.round(process.memoryUsage().rss / 1048576),
      });
    });
  });
}

// A worker thread runs THIS file: it takes the branch above and never defines a
// pool of its own. (`return` at module top level parses in CommonJS but not as
// a script, which tests/unit/cross-file-paths.test.mjs refuses — hence the
// function.)
if (!isMainThread && workerData && workerData[TAG]) startWorker();

// ---------------------------------------------------------------------------
// Parent side
// ---------------------------------------------------------------------------

/**
 * createPool({ size, boot, init, maxJobs, rssLimitMb, jobTimeoutMs }) -> pool
 *   size         workers (default min(4, cores)); each holds one game-vm
 *   boot         createGame() options every worker boots with
 *   init         function (or source) run once per worker after the boot; its
 *                return value is the third argument of every probe
 *   maxJobs      circuits a worker takes before it is recycled (default 8)
 *   rssLimitMb   recycle as soon as a worker reports more (default 1200)
 *   jobTimeoutMs per-circuit ceiling (default 300000); a breach kills the
 *                worker and rejects that circuit's job, naming it
 * pool.run({ circuit, probe, options }) -> Promise<{ result, errors, ms, rssMb, worker }>
 * pool.stats() -> { size, spawned, recycled, done, failed, queued, running }
 * pool.close() -> Promise<void>   (call it in after(); it is idempotent)
 */
function createPool(opts) {
  opts = opts || {};
  const size = Math.max(1, opts.size || Math.min(4, cores()));
  const maxJobs = Math.max(1, opts.maxJobs || 8);
  const rssLimitMb = opts.rssLimitMb || 1200;
  const jobTimeoutMs = opts.jobTimeoutMs || 300000;
  const data = { [TAG]: true, boot: opts.boot || {}, init: opts.init ? srcOf(opts.init) : null };

  const queue = [];
  const slots = Array.from({ length: size }, (_, i) => ({ i, worker: null, jobs: 0, current: null, timer: null }));
  const stats = { size, spawned: 0, recycled: 0, done: 0, failed: 0 };
  let closed = false, seq = 0;

  // Returns the terminate promise so close() can wait for the threads to be
  // gone before a test file's after() lets node exit.
  const kill = (slot) => {
    const w = slot.worker;
    slot.worker = null; slot.jobs = 0;
    if (slot.timer) { clearTimeout(slot.timer); slot.timer = null; }
    if (!w) return Promise.resolve();
    w.removeAllListeners();
    return w.terminate().catch(() => {});
  };

  // A worker that dies mid-job fails THAT circuit — never a silent hang and
  // never a silent pass: the parent test sees the circuit name in the message.
  const failCurrent = (slot, why) => {
    const entry = slot.current;
    slot.current = null;
    kill(slot);
    if (entry) {
      stats.failed++;
      entry.reject(new Error(`game-vm-pool: ${entry.job.circuit} — ${why}`));
    }
    pump();
  };

  const spawn = (slot) => {
    const w = new Worker(SELF, { workerData: data });
    stats.spawned++;
    slot.worker = w; slot.jobs = 0;
    w.on("message", (msg) => onMessage(slot, msg));
    w.on("error", (e) => failCurrent(slot, `worker error: ${(e && e.message) || e}`));
    w.on("exit", (code) => { if (slot.current) failCurrent(slot, `worker exited (code ${code})`); });
    return w;
  };

  const onMessage = (slot, msg) => {
    const entry = slot.current;
    if (!entry || msg.id !== entry.id) return;
    slot.current = null;
    if (slot.timer) { clearTimeout(slot.timer); slot.timer = null; }
    slot.jobs++;
    if (msg.ok) {
      stats.done++;
      entry.resolve({ result: msg.result, errors: msg.errors, ms: msg.ms, bootMs: msg.bootMs, rssMb: msg.rssMb, worker: slot.i });
    } else {
      stats.failed++;
      const err = new Error(`game-vm-pool: ${entry.job.circuit} — ${msg.message}`);
      err.workerStack = msg.stack;
      entry.reject(err);
    }
    // The recycle: RSS never comes back (~40 MB a circuit), so the choice is a
    // 2.5 s re-boot or a worker that grows all run.
    if (slot.jobs >= maxJobs || (msg.rssMb && msg.rssMb > rssLimitMb)) { stats.recycled++; kill(slot); }
    pump();
  };

  const pump = () => {
    if (closed) return;
    for (const slot of slots) {
      if (slot.current || !queue.length) continue;
      const entry = queue.shift();
      slot.current = entry;
      if (!slot.worker) spawn(slot);
      slot.timer = setTimeout(() => failCurrent(slot, `no result in ${jobTimeoutMs} ms`), jobTimeoutMs);
      slot.worker.postMessage({ id: entry.id, circuit: entry.job.circuit, probe: entry.probe, options: entry.job.options || null });
    }
  };

  return {
    run(job) {
      if (closed) return Promise.reject(new Error("game-vm-pool: pool is closed"));
      if (!job || !job.probe) return Promise.reject(new Error("game-vm-pool: run({ circuit, probe }) needs a probe"));
      const entry = { id: ++seq, job, probe: srcOf(job.probe), resolve: null, reject: null };
      const p = new Promise((res, rej) => { entry.resolve = res; entry.reject = rej; });
      queue.push(entry);
      pump();
      return p;
    },
    stats: () => Object.assign({}, stats, { queued: queue.length, running: slots.filter((s) => s.current).length }),
    async close() {
      if (closed) return;
      closed = true;
      while (queue.length) queue.shift().reject(new Error("game-vm-pool: pool closed before the job ran"));
      const gone = slots.map((slot) => { slot.current = null; return kill(slot); });
      await Promise.all(gone);
    },
  };
}

module.exports = { createPool, srcOf };

// A smoke check, not a test: boot two workers, race a circuit in each, print
// what came back. `node tools/lib/game-vm-pool.cjs monza spa`.
if (require.main === module && isMainThread) {
  (async () => {
    const ids = process.argv.slice(2).filter((a) => !a.startsWith("-"));
    const circuits = ids.length ? ids : ["monza", "spa"];
    const pool = createPool({ size: Math.min(2, circuits.length), boot: {}, init: (g) => ({ PHYS0: { ...g.apex.tuning() } }) });
    const probe = async (g, o, state) => {
      g.apex.setPhysics(state.PHYS0);
      await g.race(o.circuit, "day", "dry");
      g.apex.jump(0.1, 40, 0);
      g.apex.setInput({ throttle: true, steer: 0 });
      for (let i = 0; i < o.steps; i++) g.apex.step(1 / 60, 1);
      const p = g.apex.physState();
      g.apex.clearInput();
      return { s: +p.s.toFixed(3), speed: +p.speed.toFixed(3), corners: g.apex.corners().length };
    };
    const rows = await Promise.all(circuits.map((id) => pool.run({ circuit: id, probe, options: { steps: 60 } })));
    await pool.close();
    console.log(JSON.stringify({ stats: pool.stats(), rows: rows.map((r, i) => ({ circuit: circuits[i], ...r })) }, null, 2));
  })().catch((e) => { console.error("FAIL:", (e && e.stack) || e); process.exit(1); });
}
