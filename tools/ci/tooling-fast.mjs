#!/usr/bin/env node
// @doc Full structural floor or `--changed` diff-aware edit-loop runner; timing, buffered output, `--jobs=N`; exports the list.
// @section runner
/**
 * tooling-fast.mjs — run the structural unit suites with per-file progress.
 *
 * `npm run test:tooling-fast` used to dump ~80 files into one `node --test`
 * invocation, which parallelises by default and floods the terminal. This
 * runner owns the scheduling instead, and BUFFERS each file's output to emit it
 * whole on completion. The buffering is what made the log readable; running one
 * file at a time was never the part that fixed it.
 *
 * So `--jobs=N` runs N files at once and the log reads exactly as before: one
 * START and one PASS/FAIL per file, each with its own index and duration.
 * DEFAULT 1, so every existing caller is byte-identical; local runs pass --jobs=3
 * (AGENTS.md rule 4: a CPU-wide default is the box load that times runs out).
 *
 * WHY, measured here: the serial suite is ~230 s and the deploy pays it once per
 * push ATTEMPT. With five or six agent sessions landing on the deploy branch at
 * a median gap of 165 s, a 230 s window loses the race often — two of one
 * session's deploys were rejected once each and paid a full re-verify. Shrinking
 * the window shrinks the race for EVERY attempt, and it is the only lever left:
 * deploy.mjs cannot narrow a shipped-code retry, because pick-tests maps any
 * js/ or css/ edit to the whole tooling-fast group (see its RULES).
 *
 *   node tools/ci/tooling-fast.mjs                  # full suite, serial
 *   node tools/ci/tooling-fast.mjs --changed        # vs origin/<deploy>: affected files only
 *   node tools/ci/tooling-fast.mjs --changed --no-sync-shortcut  # a HEAD that is a pure deploy-tip merge selects gen:check + docs only; this selects the branch diff (preflip-probe)
 *   node tools/ci/tooling-fast.mjs --jobs=3         # …three at a time
 *   node tools/ci/tooling-fast.mjs --stop           # stop the registered run's whole process tree (artifacts/run/tooling-fast.json); never pkill -f / a PID kill
 *   node tools/ci/tooling-fast.mjs --print-scope    # CI guards shards: mode=full|changed (see guardsScope)
 *   node tools/ci/tooling-fast.mjs --bail           # stop STARTING files after the first failure (CI guard shards)
 *   node tools/ci/tooling-fast.mjs --changed --quiet  # console: FAIL lines, their detail and the verdict only (the log keeps START/PASS)
 *   node tools/ci/tooling-fast.mjs tests/unit/x…    # subset (same logging)
 *   … --order=list                                   # list order, not longest-first
 *   … --record                                       # rewrite tests/data/tooling-fast-timings.json
 *   … --test-timeout=S --file-timeout=S              # per-test / per-file bounds (seconds)
 *
 * `--jobs=N`, never `--jobs N`: a flag whose value is a bare positional gets
 * swallowed into the file list by the `!a.startsWith("--")` filter below. This
 * repo has shipped that bug once already — tools/ci/pick-tests.mjs documents
 * `--since HEAD~3` being read as a changed FILE. The `=` form cannot do it.
 *
 * The file list is the source of truth for coverage (test-coverage-audit
 * imports TOOLING_FAST_FILES). Keep package.json as `node tools/ci/tooling-fast.mjs`.
 *
 * NOT IN THE FLOOR, ON PURPOSE (audit4 E1, 2026-10-26): the files of node-plan's
 * ALWAYS_ON_TOPICAL groups (net-unit, state-unit, audio-unit, garage-unit, mcp …).
 * Those groups run on EVERY CI run as their own job, so CI's always-on node groups
 * are their gate; 199 of them used to sit here too and ran twice (−470 s local /
 * −599 s CI CPU per floor run once removed). `--changed` still selects them from
 * that pool when the diff's pins point at them, so the edit loop keeps them.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { augmentNodeCompileCache } = require("../lib/node-compile-cache.cjs");
import { changedPaths } from "../lib/changed-files.mjs";
import { loadGroups, filesOnly } from "../gen/gen-test-groups.mjs";
import { workTreeId } from "../lib/work-tree-id.mjs";
import { DEPLOY_BRANCH, selectionReceipt } from "./pick-tests.mjs";
import { TRACKED, circuitsTouched, isDocsOnly } from "./select-specs.mjs";
// Cycle-safe: node-plan reads TOOLING_FAST_FILES only inside functions, and this
// module reads ALWAYS_ON_TOPICAL only inside topicalPool().
import { ALWAYS_ON_TOPICAL } from "./node-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOGDIR = path.join(ROOT, "artifacts/logs");
// NOT "tooling-fast.log": that is the path tools/ci/test-bg.mjs gives the
// tooling-fast GROUP log, and writing the suite summary there truncated the
// group's START header out from under the child's appends.
const LOGFILE = path.join(LOGDIR, "tooling-fast-suite.log");

/**
 * The file list, read from tests/groups.json's `toolingFast` at import time
 * (2026-10-26). It used to be a 1,512-line block generated INTO this module,
 * which made this file a merge-conflict hot spot (5 conflicts / 228 two-sided
 * merges in one week; docs/notes/TOOLING-CONSOLIDATION-2026-10-26.md): every
 * PR that added a unit test edited both groups.json and this file. The `//`
 * note entries (why a file earns its place) stay beside their file in
 * groups.json and are dropped here.
 * @type {readonly string[]}
 */
export const TOOLING_FAST_FILES = Object.freeze(filesOnly(loadGroups().toolingFast));

const loadavgLine = () => {
  try {
    const [a, b, c] = os.loadavg().map((n) => n.toFixed(2));
    return `loadavg=${a} ${b} ${c}`;
  } catch (_) {
    return "loadavg=?";
  }
};

const fmtDur = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

/* LONGEST FIRST (2026-09-25). The pool used to start files in LIST order, and
 * the list is ordered by when a file was added, so the ~30-60 s files (game-vm,
 * parts-distinct-mesh, car-mesh-anchors, session-entry-vm …) started wherever
 * they happened to sit — one of them starting last leaves the other workers
 * idle while it runs alone. Scheduling longest-processing-time first is the
 * textbook fix for that tail (Graham's LPT bound: within 4/3 of optimal).
 *
 * The durations come from the last full run on THIS box when there is one
 * (artifacts/logs/tooling-fast-timings.json, written at the end of every full
 * run) and otherwise from the committed tests/data/tooling-fast-timings.json,
 * which is what a fresh CI runner reads. A file with no recorded duration is
 * scheduled FIRST: an unmeasured file is the one that may be slow, and a few
 * fast files started early cost nothing. `--order=list` restores list order;
 * `--record` rewrites the committed table from this run. */
export const TIMINGS_FILE = path.join(ROOT, "tests/data/tooling-fast-timings.json");
const LOCAL_TIMINGS_FILE = path.join(LOGDIR, "tooling-fast-timings.json");

/** { <repo-relative file>: ms } — local measurements override committed ones. */
export function loadTimings(files = [TIMINGS_FILE, LOCAL_TIMINGS_FILE]) {
  const out = {};
  for (const f of files) {
    try { Object.assign(out, JSON.parse(fs.readFileSync(f, "utf8")).ms || {}); } catch (_) { /* absent or unreadable: no hint */ }
  }
  return out;
}

/** Longest recorded duration first; unmeasured files ahead of all of them, in
 *  list order; ties keep list order (the sort is stable). Pure. */
export function scheduleLongestFirst(files, timings = {}) {
  const key = (f) => { const v = timings[path.isAbsolute(f) ? path.relative(ROOT, f) : f]; return typeof v === "number" ? v : Infinity; };
  return files.map((f, i) => ({ f, i, ms: key(f) }))
    .sort((a, b) => (b.ms - a.ms) || (a.i - b.i)).map((x) => x.f);
}

/** Estimate the local worker critical path for a selected file set. The real
 * runner uses the same longest-first order and assigns each file to the least
 * loaded worker, so this is a useful pre-PR wall-time estimate rather than a
 * misleading sum. Unknown files remain visible in `unmeasured`; their cost is
 * intentionally not invented. */
export function estimateToolingFast(files, timings = loadTimings(), jobs = 1) {
  const workerCount = Math.max(1, Number(jobs) || 1);
  const loads = Array(workerCount).fill(0);
  const rows = files.map((file, index) => ({
    file,
    index,
    ms: typeof timings[file] === "number" ? timings[file] : null,
  })).sort((a, b) => (b.ms ?? -1) - (a.ms ?? -1) || a.index - b.index);
  const unmeasured = [];
  for (const row of rows) {
    if (row.ms === null) unmeasured.push(row.file);
    const worker = loads.indexOf(Math.min(...loads));
    loads[worker] += row.ms ?? 0;
  }
  return {
    totalMs: loads.reduce((sum, ms) => sum + ms, 0),
    criticalPathMs: Math.max(...loads),
    workerMs: loads,
    unmeasured,
  };
}

/** The `# tests / # pass / # fail / # skipped / # todo / # cancelled` footer of a TAP run (null for a missing one). */
export function tapSummary(text) {
  const out = {};
  for (const k of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const m = new RegExp(`^# ${k} (\\d+)\\s*$`, "m").exec(String(text || "").replace(/\r/g, ""));
    out[k] = m ? Number(m[1]) : null;
  }
  return out;
}

/** Files whose tests are LEGITIMATELY all-skipped on some machines (a precondition the runner cannot
 *  provide). Row = repo-relative file -> why. Empty by default: a skip-everything file is a red until
 *  somebody writes the reason down. */
export const ALL_SKIP_OK = Object.freeze({});

/**
 * Exit 0 is not a verdict: a file that registers no test, skips every test, or calls
 * `process.exit(0)` before its tests run all exit 0 with a green-looking TAP footer.
 * Returns the reason a CLEAN exit does not count as a pass, or null.
 * @param {string} text  the child's stdout+stderr
 * @param {string} [file] repo-relative path (for the ALL_SKIP_OK opt-out)
 */
export function emptyRunReason(text, file = "") {
  const s = tapSummary(text);
  if (s.tests === null) return "no TAP footer (the file exited before the runner finished; process.exit(0)?)";
  if (s.tests === 0) return "ran zero tests (an empty file, or process.exit(0) before the tests ran)";
  // Measured (node v-current): a file that registers no test — an empty module, or one that calls
  // process.exit(0) at import — is counted by `node --test` as ONE passing test named after the file.
  if (s.tests === 1 && file) {
    const only = /^(?:not )?ok \d+ - (.+)$/m.exec(String(text || "").replace(/\r/g, ""));
    const base = file.split("/").pop();
    if (only && only[1].trim().endsWith(base)) return "registered no tests (node counted the file itself as the one test; an empty module or process.exit(0) at import)";
  }
  const done = s.pass + s.fail + s.skipped + s.todo + s.cancelled;
  if (done !== s.tests) return `only ${done} of ${s.tests} registered tests reported (process.exit(0) mid-run?)`;
  if (s.pass === 0 && !Object.hasOwn(ALL_SKIP_OK, file)) {
    return `no test passed (${s.skipped} skipped, ${s.todo} todo) — a file that skips everything verifies nothing; `
      + "list it in ALL_SKIP_OK with the reason if the skip is legitimately conditional";
  }
  return null;
}

/** Pull the diagnosable TAP failure lines from a child's stdout+stderr.
 *  Node's TAP puts deepEqual diffs under `error: |-` and array members under
 *  `actual:` / `expected:` as `0: …` rows — keeping only the bare keys left
 *  Structural guards red on 2026-10-04 with empty Expected/Received
 *  (run 37171017859, ratchets.test.mjs). */
export function tapFailureDetail(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let inError = false;
  for (const L of lines) {
    if (/^\s+(error:|name: 'AssertionError'|expected:|actual:|operator:)/.test(L)) {
      out.push(L);
      inError = /^\s+error:/.test(L);
      continue;
    }
    // Indexed actual/expected members: `    0: 'js/net/lobby.js lines: …'`
    if (/^\s+\d+:/.test(L)) { out.push(L); inError = false; continue; }
    // YAML block-scalar body under `error: |-` (the deepEqual +/- dump).
    if (inError && /^\s{4,}\S/.test(L)) { out.push(L); continue; }
    if (inError && /^\s*$/.test(L)) { out.push(L); continue; }
    inError = false;
  }
  return out;
}

/* A HUNG FILE FAILS BY NAME. Without a bound a file that never exits (an open
 * handle, a never-settled await) runs until the CI job's timeout-minutes, and
 * the job reports `cancelled` with every START line but no verdict — the shape
 * AGENTS.md rule 8 teaches everyone to read as a busy runner. Two layers:
 *   --test-timeout   node's own bound (ms, default Infinity:
 *                    https://nodejs.org/api/cli.html#--test-timeout). It bounds
 *                    each test (isolation "none", below: the file is no longer
 *                    a test of its own) — a stuck one fails as
 *                    `not ok … test timed out after Nms` with its name;
 *   the file timer   a hard wall per FILE, a minute later, because the
 *                    timeout cannot see work outside a test (a handle that
 *                    keeps the process alive after the last test). SIGKILLs
 *                    the child's whole process group, logs FAIL reason=timeout.
 * SIZED FOR A LOADED BOX: flyby-shots, the slowest file, measured 370 s at
 * loadavg ~15 on 4 cores (2026-09-25) and hit a 300 s bound at loadavg 20, so
 * 540 s; the 600 s wall still lands inside ci.yml's 15-minute guards job for a
 * file that starts first, which longest-first makes the slow ones do.
 * APEX_TOOLING_TEST_TIMEOUT_S / APEX_TOOLING_FILE_TIMEOUT_S override both. */
/* NO SECOND PROCESS PER FILE (#3885). This runner already gives each file its
 * own process, so node's default `--test-isolation=process` only adds a
 * grandchild whose results reach `node --test` as a v8-serialized stream on
 * stdout. Node 22's parser of that stream (lib/internal/test_runner/runner.js,
 * FileTest.parseMessage) defers a chunk's trailing 0xFF as a possible header
 * byte, then re-appends it AFTER the next chunk whenever the buffer head is
 * shorter than a frame header — a pipe read that ends 5 bytes into a frame
 * whose next byte is 0xFF scrambles the frame, and #drainRawBuffer then loops
 * forever on a message that can never complete: 100 % of one core, SIGTERM
 * unhandled (the handler is JS), no --test-timeout (the tests already ended).
 * Read sizes follow load, so it struck at random: perf-governor.test.mjs,
 * loadavg 7, ok 64 then silence until the 600 s wall (run 40411198783).
 * Repro: a test whose last stdout bytes are FF 0F 00 hangs `node --test`;
 * tooling-fast-runner.test.mjs pins it. Fixed upstream on main
 * (#pendingPartialV8Header), in no release as of v26.0.0. Isolation "none"
 * runs the file inside the runner, so no stream exists to misparse; the
 * per-test timeout still names a stuck test. Spelled --experimental-test-isolation
 * before v23.6 (https://nodejs.org/api/cli.html#--test-isolationmode). */
const [NODE_MAJOR, NODE_MINOR] = process.versions.node.split(".").map(Number);
export const TEST_ISOLATION_FLAG = NODE_MAJOR > 23 || (NODE_MAJOR === 23 && NODE_MINOR >= 6)
  ? "--test-isolation=none" : "--experimental-test-isolation=none";

const PER_TEST_TIMEOUT_MS = (Number(process.env.APEX_TOOLING_TEST_TIMEOUT_S) || 540) * 1000;
const PER_FILE_TIMEOUT_MS = (Number(process.env.APEX_TOOLING_FILE_TIMEOUT_S) || 600) * 1000;

/**
 * Run the structural suites one file at a time.
 * @param {string[]} [files]
 * @param {{ logPath?: string, isolatedFiles?: string[] }} [opts]
 * @returns {{ ok: boolean, passed: number, failed: number, results: object[], notStarted: number }}
 */
export async function runToolingFast(files = [...TOOLING_FAST_FILES], opts = {}) {
  const jobs = Math.max(1, Number(opts.jobs) || 1);
  const logPath = opts.logPath || LOGFILE;
  const testTimeoutMs = Number(opts.testTimeoutMs) || PER_TEST_TIMEOUT_MS;
  const fileTimeoutMs = Number(opts.fileTimeoutMs) || PER_FILE_TIMEOUT_MS;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const timings = opts.order === "list" ? {} : (opts.timings || loadTimings());
  if (opts.order !== "list") files = scheduleLongestFirst(files, timings);
  const lines = [];
  // --quiet keeps START/PASS lines in the log only: a 13-57K console was measured in Cursor agents' context (2026-10-21).
  const emit = (msg) => {
    const line = `[tooling-fast] ${msg}`;
    if (!opts.quiet || !/^(START|PASS) /.test(msg)) console.log(line);
    lines.push(line);
  };

  // The ready stamp names the tree this run MEASURED (tools/lib/work-tree-id.mjs),
  // not HEAD read afterwards: the edit loop runs the suite on a dirty tree, and
  // a stamp of HEAD blessed a committed tip the suite never saw (ledger M36).
  // Only a full suite stamps, so only a full suite pays for the tree hash.
  const rel = (f) => (path.isAbsolute(f) ? path.relative(ROOT, f) : f).replace(/\\/g, "/");
  // car-shade's unchanged CPU benchmark measured 1875 ms alongside other
  // files versus 293–562 ms alone. game-vm's unchanged 12 s boot/race wall
  // measured 40.5 s alongside other VM files versus 8.03 s alone. Run these
  // performance contracts exclusively; assertions, deadlines and pool limits stay intact.
  const isolated = new Set((opts.isolatedFiles || loadGroups().isolatedFiles || []).map(rel));
  const isolatedFiles = files.filter((file) => isolated.has(rel(file)));
  files = [...isolatedFiles, ...files.filter((file) => !isolated.has(rel(file)))];
  const ran = new Set(files.map(rel));
  const fullSuite = ran.size === TOOLING_FAST_FILES.length && TOOLING_FAST_FILES.every((f) => ran.has(f));
  const startHead = fullSuite ? spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() : "";
  const startTree = fullSuite ? workTreeId(ROOT) : null;

  const suiteStart = Date.now();
  const startedAt = new Date(suiteStart).toISOString();
  emit(`suite start at=${startedAt} files=${files.length} concurrency=${jobs} ${loadavgLine()}`);
  const unmeasured = files.filter((f) => typeof timings[path.isAbsolute(f) ? path.relative(ROOT, f) : f] !== "number").length;
  emit(opts.order === "list" ? "order=list" :
    `order=longest-first (${files.length - unmeasured} with a recorded duration, ${unmeasured} unmeasured scheduled first) ` +
    `test-timeout=${fmtDur(testTimeoutMs)} file-timeout=${fmtDur(fileTimeoutMs)}`);

  if (isolatedFiles.length) emit(`isolated prefix=${isolatedFiles.map(rel).join(",")} before parallel pool; order applies within each phase`);

  const results = [];
  let passed = 0;
  let failed = 0;
  // Each child leads its own process group (see runOne), so a signal to THIS
  // process no longer reaches them by itself: forward it, then exit, or an
  // interrupted run (Ctrl-C, test-bg --stop) would orphan every file in flight.
  const live = new Set();
  // NODE_TEST_CONTEXT is how node's runner marks the process it spawned for a
  // test file. Inherited by a nested `node --test` (this runner called from a
  // test, e.g. tooling-fast-runner.test.mjs), it switches that child into
  // report-to-parent mode, where a failing or hung file exits 0 — measured:
  // both hang tests "passed" until this line. Each child is a fresh runner.
  const childEnv = { ...process.env, ...augmentNodeCompileCache(process.env, ROOT) };
  delete childEnv.NODE_TEST_CONTEXT;
  const reap = (sig) => {
    for (const c of live) { try { process.kill(-c.pid, "SIGKILL"); } catch (_) { /* already gone */ } }
    process.exit(sig === "SIGINT" ? 130 : 143);
  };
  const onSig = { SIGINT: () => reap("SIGINT"), SIGTERM: () => reap("SIGTERM") };
  for (const [s, fn] of Object.entries(onSig)) process.on(s, fn);

  // One file, start to verdict. spawnSync CANNOT be pooled — it blocks the only
  // thread, so N of them still run strictly one after another; the first draft of
  // this did exactly that and was serial with extra ceremony. Async spawn, awaited.
  const runOne = (file, n) => new Promise((resolve) => {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    const rel = path.relative(ROOT, abs);
    const t0 = Date.now();
    emit(`START ${n}/${files.length} ${rel} at=${new Date(t0).toISOString()} ${loadavgLine()}`);

    if (!fs.existsSync(abs)) {
      failed++;
      const dur = Date.now() - t0;
      emit(`FAIL  ${n}/${files.length} ${rel} duration=${fmtDur(dur)} reason=missing-file`);
      results.push({ file: rel, ok: false, durationMs: dur, exit: null, missing: true });
      return resolve();
    }

    // detached: the child leads its own process group, so the file timer can
    // kill `node --test` and anything the file spawned in one signal.
    // The failure parser below consumes TAP. Node 23+ defaults to spec even
    // when stdout is piped, so the wire format must be explicit.
    // https://nodejs.org/api/test.html#test-reporters
    const child = spawn(process.execPath,
                        ["--test", TEST_ISOLATION_FLAG, "--test-reporter=tap", "--test-concurrency=1", `--test-timeout=${testTimeoutMs}`, abs],
                        { cwd: ROOT, env: childEnv, detached: true });
    live.add(child);
    let out = "", err = "", timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGKILL"); } catch (_) { try { child.kill("SIGKILL"); } catch (_) { /* gone */ } }
    }, fileTimeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { err += String(e && e.message || e); });
    child.on("close", (status, signal) => {
    clearTimeout(timer);
    const r = { status, stdout: out, stderr: err };
    const dur = Date.now() - t0;
    const cleanExit = r.status === 0 && !timedOut;
    const empty = cleanExit ? emptyRunReason((r.stdout || "") + (r.stderr || ""), rel.replace(/\\/g, "/")) : null;
    const ok = cleanExit && !empty;
    if (ok) passed++; else failed++;
    const verdict = ok ? "PASS" : "FAIL";
    live.delete(child);
    emit(`${verdict}  ${n}/${files.length} ${rel} duration=${fmtDur(dur)} exit=${r.status ?? signal}` +
      `${timedOut ? ` reason=timeout (no exit within ${fmtDur(fileTimeoutMs)}; process group killed)` : ""}` +
      `${empty ? ` reason=empty-run (${empty})` : ""} ${loadavgLine()}`);
    if (!ok) {
      const text = ((r.stdout || "") + (r.stderr || "")).replace(/\r/g, "");
      const notoks = text.split("\n").filter((L) => /^not ok /.test(L));
      if (notoks.length) {
        emit(`  | failed ${notoks.length} subtest(s):`);
        for (const L of notoks) emit(`  | ${L}`);
      }
      // Assertion bodies sit under each `not ok` TAP block. Keep them short
      // (name/error/expected/actual + deepEqual body) so a FAIL is diagnosable
      // without dumping the whole TAP stream into the sequential log.
      const detail = tapFailureDetail(text);
      for (const L of detail.slice(0, 40)) emit(`  | ${L.trimEnd()}`);
      if (detail.length > 40) emit(`  | … ${detail.length - 40} more assertion lines`);
      if (!notoks.length && !detail.length) {
        const tail = text.trim().split("\n").slice(-20);
        for (const L of tail) emit(`  | ${L}`);
      }
    }
    results.push({ file: rel, ok, durationMs: dur, exit: r.status });
      resolve();
    });
  });

  // N in flight, each worker pulling the next index off a shared cursor. Node's
  // own --test-concurrency stays 1 INSIDE each child: the parallel unit is one
  // FILE per process, which is what these suites are isolated at. Two files
  // sharing a fixed path or port would surface here, which is why this was
  // measured against a serial run rather than assumed equivalent.
  // --bail (CI guard shards, 2026-10-16 CI jobs review): once any file has
  // failed, no further file STARTS; the files already in flight finish, so the
  // log still names every failure that was running. A red shard used to run a
  // mean 5.9 min after its first failure. The verdict line is unchanged.
  const bail = opts.bail === true;
  const entries = files.map((file, index) => ({ file, index }));
  const serialEntries = entries.filter((entry) => isolated.has(rel(entry.file)));
  const parallelEntries = entries.filter((entry) => !isolated.has(rel(entry.file)));
  let started = 0;
  for (const entry of serialEntries) {
    if (bail && failed > 0) break;
    started++;
    await runOne(entry.file, entry.index + 1);
  }
  let next = 0;
  const worker = async () => {
    while (true) {
      if (bail && failed > 0) return;
      const entry = parallelEntries[next++];
      if (!entry) return;
      started++;
      await runOne(entry.file, entry.index + 1);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, parallelEntries.length) }, worker));
  const notStarted = bail && failed > 0 ? files.length - started : 0;
  if (notStarted) emit(`bail: stopped starting files after the first failure; ${notStarted} of ${files.length} file(s) not started`);

  const suiteDur = Date.now() - suiteStart;
  const ok = failed === 0;
  emit(`suite end at=${new Date().toISOString()} duration=${fmtDur(suiteDur)} ` +
    `passed=${passed} failed=${failed} ${loadavgLine()}`);
  // The tree must be the same before and after the run: an edit made while
  // the suite ran (the edit hook blocks only a live BROWSER run) means the
  // verdict is about neither tree.
  const endTree = fullSuite && startTree ? workTreeId(ROOT) : null;
  const stampTree = ok && fullSuite && startTree && startTree === endTree ? startTree : null;
  if (stampTree) emit(`= tree ${stampTree} head ${startHead}`);
  // --quiet drops PASS lines, so a red run names its files and its log here, always, before the verdict.
  if (!ok) {
    const bad = results.filter((r) => !r.ok).map((r) => r.file);
    emit(`failing files: ${bad.join(" ") || "(none finished)"}`);
    emit(`log: ${path.relative(ROOT, logPath) || logPath}`);
  }
  emit(`= run ${ok ? "passed" : "failed"} (${passed} passed, ${failed} failed)`);
  for (const [s, fn] of Object.entries(onSig)) process.off(s, fn);

  fs.writeFileSync(logPath, lines.join("\n") + "\n");
  // Full-suite green on an UNCHANGED tree → stamp it for ready-gate.mjs
  // (draft→ready must not flip without tooling-fast evidence; #1111
  // designer-canvas). The stamp is the START head plus the tree hash the suite
  // measured; ready-gate compares that hash with the tip commit's tree, and
  // the `= tree` line above ties the log to the same run. Subset / shard runs
  // and failures leave any prior stamp alone so a partial re-run cannot bless
  // a tip that never passed the full suite. (`ran` is a set: longest-first
  // reorders `files`.)
  if (stampTree) {
    try {
      const { stampReadySha } = await import("./ready-gate.mjs");
      if (startHead) stampReadySha(startHead, { tree: stampTree });
    } catch (_) { /* stamp is advisory for ready-gate; never fail the suite */ }
  }
  // Every run teaches the next one: the passing files' durations go to the
  // local table (a timed-out or failed file's duration says nothing about its
  // normal cost). --record also rewrites the committed table CI reads.
  const measured = Object.fromEntries(results.filter((r) => r.ok).map((r) => [r.file, Math.round(r.durationMs / 10) * 10]));
  const merge = (file, note) => {
    let prev = {};
    try { prev = JSON.parse(fs.readFileSync(file, "utf8")).ms || {}; } catch (_) { /* first run */ }
    const ms = Object.fromEntries(Object.entries({ ...prev, ...measured }).sort(([a], [b]) => a.localeCompare(b)));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ _doc: note, jobs, ms }, null, 2) + "\n");
  };
  if (opts.localTimingsPath !== null) {
    try { merge(opts.localTimingsPath || LOCAL_TIMINGS_FILE, "local per-file durations from the last tooling-fast run on this box (ms); overrides tests/data/tooling-fast-timings.json"); }
    catch (_) { /* a hint cache; never fail a run over it */ }
  }
  if (opts.record) {
    merge(TIMINGS_FILE, "Per-file tooling-fast durations (ms) for longest-first scheduling (tools/ci/tooling-fast.mjs). " +
      "Rewritten by `node tools/ci/tooling-fast.mjs --jobs=3 --record`; order hints only — a missing or stale entry never fails anything.");
  }
  return { ok, passed, failed, results, logPath, notStarted };
}

export const DEFAULT_JOBS = 1;

/** THE CLI'S OWN WIDTH WHEN NO --jobs IS GIVEN (2026-10-24, BUILD-HUNT B4).
 *  Serial, the full floor is ~47 min of file time on a 4-core container; at
 *  --jobs=3 it measured 16.1 min. deploy.mjs's gate measured --jobs=2 peaking
 *  at loadavg 2.57, under the >= 3 line this repo calls too busy to measure.
 *  So `npm run test:tooling-fast` takes AUTO_JOBS only on a quiet box: no live
 *  Playwright suite or host browser (rule 4: no node suite on top of a browser
 *  run) and 1-min loadavg under AUTO_JOBS_MAX_LOAD; otherwise DEFAULT_JOBS.
 *  An explicit --jobs (CI's 4, the deploy gate's 2) and the programmatic
 *  runToolingFast() default are unchanged. */
export const AUTO_JOBS = 2;
export const AUTO_JOBS_MAX_LOAD = 2;

/** Pick the CLI width from the box's state: `{ busy, load1 }` → `{ jobs, why }`. Unknown state is treated as busy. */
export function autoJobs({ busy, load1 } = {}) {
  if (busy !== false) return { jobs: DEFAULT_JOBS, why: busy ? "a Playwright suite or host browser is live" : "browser occupancy unknown" };
  if (!(Number(load1) < AUTO_JOBS_MAX_LOAD)) return { jobs: DEFAULT_JOBS, why: `loadavg ${Number(load1).toFixed(2)} >= ${AUTO_JOBS_MAX_LOAD}` };
  return { jobs: AUTO_JOBS, why: `no live browser run, loadavg ${Number(load1).toFixed(2)} < ${AUTO_JOBS_MAX_LOAD}` };
}

async function probeAutoJobs() {
  let busy = null;
  try {
    const { scanPlaywrightLines } = await import("./playwright-occupancy.mjs");
    busy = scanPlaywrightLines(execFileSync("ps", ["-eo", "pid,args"], { encoding: "utf8" })).busy;
  } catch (_) { /* no ps: stay serial */ }
  return autoJobs({ busy, load1: os.loadavg()[0] });
}

/** Paths that force a full tooling-fast run in --changed mode (fail-safe). */
const TOOLING_FAST_CHANGED_RUN_ALL = [
  /^tests\/groups\.json$/,
  /^package(-lock)?\.json$/,
  /^playwright\.config\.js$/,
  /^tools\/gen\/gen-test-groups\.mjs$/,
  /^tools\/manifest\.cjs$/,
  /^index\.html$/,
  /^sw\.js$/,
  /^version\.json$/,
  /^\.github\/workflows\//,
  /^tests\/helpers\//,
  /^tools\/lib\//,
];

const PATH_PIN_RE = /["'`]((?:js|css|tools|types|desktop|docs|tests\/|index\.html|AGENTS\.md|CLAUDE\.md|README\.md|\.claude\/|\.cursor\/|sw\.js|version\.json)[^"'`]+)["'`]/g;

// environment-json left this set with the audit4 E1 floor carve (2026-10-26): its always-on topical group runs it
// on every CI run, and a docs-only change cannot touch .cursor/environment.json.
const DOCS_FAST_TESTS = /\/(docs-integrity|agent-config|skill-progressive|hooks-documented|generated-docs|comment-citations|agent-surface)\.test\.mjs$/;

// Relative import specifiers ("../../tools/ci/x.mjs"): resolved against the importing file, indexed by exact path (#3907).
const REL_PIN_RE = /["'`](\.{1,2}\/[^"'`\s]+)["'`]/g;

let _pinIndex = null;

function indexPathKey(map, key, testFile, exact = false) {
  const norm = key.replace(/\\/g, "/");
  let cur = norm;
  while (cur) {
    if (!map.has(cur)) map.set(cur, new Set());
    map.get(cur).add(testFile);
    const slash = cur.lastIndexOf("/");
    if (slash < 0) break;
    cur = cur.slice(0, slash);
    if (exact) break;
  }
}

/** Map repo-relative paths → tooling-fast unit files that pin them in source. */
export function buildToolingFastPinIndex(files = TOOLING_FAST_FILES, root = ROOT) {
  const map = new Map();
  for (const f of files) {
    if (f.startsWith("//")) continue;
    const abs = path.join(root, f);
    let src = "";
    try { src = fs.readFileSync(abs, "utf8"); } catch (_) { continue; }
    PATH_PIN_RE.lastIndex = 0;
    let m;
    while ((m = PATH_PIN_RE.exec(src))) indexPathKey(map, m[1], f);
    REL_PIN_RE.lastIndex = 0;
    while ((m = REL_PIN_RE.exec(src))) {
      const rel = path.posix.normalize(path.posix.join(path.posix.dirname(f.replace(/\\/g, "/")), m[1]));
      if (!rel.startsWith("../")) indexPathKey(map, rel, f, true);
    }
  }
  return map;
}

function pinIndex() {
  // The floor plus the always-on topical pool: --changed may select either.
  if (!_pinIndex) _pinIndex = buildToolingFastPinIndex([...TOOLING_FAST_FILES, ...topicalPool()]);
  return _pinIndex;
}

/** CI tooling-fast shards: ci.yml guards-a..d run --shard=1/4 .. 4/4 (BUILD-HUNT B2, 2026-10-24). */
export const CI_SHARDS = 4;

/** Which CI tooling-fast shards (1/4 .. 4/4, ci.yml guards-a/b/c/d) touch any of `files`. */
export function shardsCoveringFiles(files, allFiles = TOOLING_FAST_FILES, shardCount = CI_SHARDS) {
  const want = new Set(files);
  const out = [];
  for (let i = 1; i <= shardCount; i++) {
    const spec = `${i}/${shardCount}`;
    if (ciShardFiles(allFiles, spec).some((f) => want.has(f))) out.push(spec);
  }
  return out;
}

/** Changed paths vs the deploy branch (merge-base with origin/DEPLOY_BRANCH). */
function changedVsDeploy(ref = `origin/${DEPLOY_BRANCH}`, root = ROOT) {
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", ref], { cwd: root, encoding: "utf8" }).trim();
    return changedPaths([base], { cwd: root });
  } catch (_) {
    try { return changedPaths(["HEAD~1"], { cwd: root }); } catch (_) { return []; }
  }
}

/**
 * #2890 — TRACKED / RUN_ALL paths that may stay narrow when their DIFF content
 * is benign (script-tag-only index.html, scripts/version-only package.json,
 * cache-version-only sw.js). select-specs TRACKED is unchanged: CI browser
 * selection still fail-safes on the path alone.
 */
export const NARROWABLE_INFRA = Object.freeze(["index.html", "package.json", "sw.js"]);

/** Unit tests seeded when a narrowable infra path is benign (#2890). */
export const NARROW_INFRA_TESTS = Object.freeze({
  "index.html": Object.freeze([
    "tests/unit/load-order.test.mjs",
    "tests/unit/shell-ids.test.mjs",
    "tests/unit/circuit-count-shell.test.mjs",
  ]),
  "package.json": Object.freeze([
    "tests/unit/change-driver-tools.test.mjs",
    "tests/unit/docs-integrity.test.mjs",
    "tests/unit/generated-docs.test.mjs",
  ]),
  "sw.js": Object.freeze([
    "tests/unit/service-worker.test.mjs",
    "tests/unit/sw-build-meta.test.mjs",
    "tests/unit/a11y-pwa-pass.test.mjs",
    "tests/unit/load-order.test.mjs",
  ]),
});

/**
 * GENERATED FILES -> their SOURCE (orchestration review 2026-10-29, Part 1 finding 2). A generated file is the
 * output of a generator, so a diff in it proves nothing the generator's `gen:check` does not: widening to the
 * whole floor on it measured 630-1261 s per run. These are dropped from the selection and replaced by
 * `genCheck` (the runner executes `npm run gen:check`, which regenerates each from its source and compares) plus
 * the tests that pin the generated file. `source` is the authored input; when it is ALSO in the diff it widens
 * (or not) on its own merits, so the mapping never hides an authored change.
 *   always: the whole file is generator output.   blocks: only its `@gen-shell` regions are (the rest is authored).
 */
export const GENERATED_FILES = Object.freeze({
  "js/roster.js": { source: "js/circuits/*.js", always: true },
  "tests/data/impact-map.json": { source: "tests/specs/*", always: true },
  "tests/data/ratchets.json": { source: "tests/data/ratchets.d/*.json", always: true },
  "docs/agent-index.json": { source: "tools/docs/gen-agent-index.mjs", always: true },
  "docs/agent-output/catalog.json": { source: "tools/gen/gen-output-surface.mjs", always: true },
  "docs/AGENT-HOOKS.md": { source: ".claude/hooks/*", always: true },
  "docs/TESTING-COVERAGE.md": { source: "tests/groups.json", always: true },
  "tools/README.md": { source: "tools/**/@doc headers", always: true },
  "CHANGELOG.md": { source: "docs/changelog.d/*", always: true },
  "tools/shot/scenery-locations.json": { source: "js/circuits/scenery/*", always: true },
  "version.json": { source: "tools/ci/bump-cache.mjs", always: true },
  "index.html": { source: "tools/manifest.cjs", blocks: true },
  "sw.js": { source: "tools/manifest.cjs", blocks: true },
  "tools/carview.html": { source: "tools/manifest.cjs", blocks: true },
});

/** Tests every generated-only diff runs beside `gen:check`. */
export const GENERATED_SEED_TESTS = Object.freeze([
  "tests/unit/generated-docs.test.mjs",
  "tests/unit/docs-integrity.test.mjs",
]);

/** `text` with every `@gen-shell:NAME` ... `/@gen-shell:NAME` region (markers included) removed. */
export function stripGenShellBlocks(text) {
  const out = [];
  let open = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /(\/?)@gen-shell:([\w:-]+)/.exec(line);
    if (open) {
      if (m && m[1] === "/" && m[2] === open) open = null;
      continue;
    }
    if (m && m[1] !== "/") { open = m[2]; continue; }
    out.push(line);
  }
  return out.join("\n");
}

/** True when two texts differ only inside `@gen-shell` regions. */
export function isGenShellOnlyChange(before, after) {
  return stripGenShellBlocks(before) === stripGenShellBlocks(after);
}

function readGenPair(file, opts = {}) {
  if (opts.filePairs && opts.filePairs[file]) return opts.filePairs[file];
  // An injected diff with no before/after pair is authoritative and unprovable here: authored (fail-safe).
  if (opts.fileDiffs && Object.prototype.hasOwnProperty.call(opts.fileDiffs, file)) return null;
  const root = opts.root || ROOT;
  const ref = opts.diffBase || `origin/${DEPLOY_BRANCH}`;
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", ref], { cwd: root, encoding: "utf8" }).trim();
    const before = execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    return { before, after: fs.readFileSync(path.join(root, file), "utf8") };
  } catch (_) {
    return null;
  }
}

/** The changed paths that are generator output only (see GENERATED_FILES); fail-safe: unreadable -> authored. */
export function generatedOnlyPaths(changed, opts = {}) {
  const out = [];
  for (const f of changed) {
    const norm = f.replace(/\\/g, "/");
    const g = GENERATED_FILES[norm];
    if (!g) continue;
    if (g.always) { out.push(norm); continue; }
    const pair = readGenPair(norm, opts);
    if (pair && isGenShellOnlyChange(pair.before, pair.after)) out.push(norm);
  }
  return out;
}

/**
 * A deploy-tip SYNC: HEAD is a merge and every path it changed against the first parent holds the second
 * parent's content (no hand-resolved conflict, nothing authored). The branch's own commits were verified by the
 * push before it, so the merge needs `gen:check` and docs-integrity, not the floor.
 * Also null: a dirty tree, a second parent that is not on the deploy branch, a HEAD already on it (`opts.tipRef` overrides the ref, null skips).
 * @returns {string[]|null} the paths the merge brought, or null when HEAD is not a pure sync
 */
export function syncMergePaths(root = ROOT, opts = {}) {
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const parents = git("rev-list", "--parents", "-n", "1", "HEAD").split(/\s+/).slice(1);
    if (parents.length !== 2) return null;
    const [p1, p2] = parents;
    // Uncommitted edits are authored work the merge says nothing about.
    if (git("status", "--porcelain")) return null;
    // The second parent must BE deploy history and HEAD must not be (the deploy tip is itself a merge commit).
    const reach = (a, b) => { try { execFileSync("git", ["merge-base", "--is-ancestor", a, b], { cwd: root, stdio: "ignore" }); return true; } catch (_) { return false; } };
    const tipRef = `origin/${DEPLOY_BRANCH}`;
    if (opts.tipRef !== null && (!reach(p2, opts.tipRef || tipRef) || reach("HEAD", opts.tipRef || tipRef))) return null;
    const paths = git("diff", "--name-only", p1, "HEAD").split("\n").filter(Boolean);
    if (!paths.length) return null;
    const blob = (rev, f) => { try { return git("rev-parse", "--verify", "-q", `${rev}:${f}`); } catch (_) { return ""; } };
    for (const f of paths) if (blob("HEAD", f) !== blob(p2, f)) return null;
    return paths;
  } catch (_) {
    return null;
  }
}

/** Selection for a pure sync merge: `gen:check` plus the docs tests. */
export function selectSyncMerge(paths, opts = {}) {
  const allFiles = (opts.allFiles || TOOLING_FAST_FILES).filter((f) => !f.startsWith("//"));
  const files = allFiles.filter((f) => GENERATED_SEED_TESTS.includes(f));
  return { files, reason: "sync-merge", genCheck: true, shards: shardsCoveringFiles(files, allFiles), changed: paths.length };
}

/** Wall-time estimate above which --changed prints the background-with-log hint. */
export const LONG_RUN_MS = 120_000;
export const LONG_RUN_HINT =
  "Long run: run in the background with a log, e.g. nohup npm run test:tooling-fast -- --changed > artifacts/logs/tooling-fast.log 2>&1 & (tool cap is 600 s)";

/** Content lines of a unified diff (added/removed only; ignores ---/+++ headers). */
export function unifiedDiffContentLines(diffText) {
  const out = [];
  for (const line of String(diffText || "").split(/\r?\n/)) {
    if (!line.length) continue;
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") ||
        line.startsWith("index ") || line.startsWith("@@") || line.startsWith("\\")) continue;
    if (line[0] === "+" || line[0] === "-") out.push(line.slice(1));
  }
  return out;
}

/** True when every changed line is a single-line `<script …></script>` (or blank / gen-shell scripts marker). */
export function isScriptTagOnlyIndexHtmlDiff(diffText) {
  const lines = unifiedDiffContentLines(diffText);
  if (!lines.length) return false;
  return lines.every((raw) => {
    const t = raw.trim();
    if (!t) return true;
    if (/^<!--\s*\/?@gen-shell:scripts\s*-->$/.test(t)) return true;
    if (/^<!--\s*@gen-shell:\/scripts\s*-->$/.test(t)) return true;
    if (/^<script\b[^>]*>\s*<\/script>$/i.test(t)) return true;
    if (/^<script\b[^>]*\/>$/i.test(t)) return true;
    return false;
  });
}

/** True when only top-level `scripts` and/or `version` differ between two package.json texts. */
export function isScriptsOnlyPackageJsonDiff(beforeText, afterText) {
  let before, after;
  try {
    before = JSON.parse(beforeText);
    after = JSON.parse(afterText);
  } catch (_) {
    return false;
  }
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return false;
  const keysB = Object.keys(before).sort();
  const keysA = Object.keys(after).sort();
  if (keysB.join("\0") !== keysA.join("\0")) return false;
  for (const k of keysB) {
    if (k === "scripts" || k === "version") continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) return false;
  }
  return true;
}

/** True when every changed sw.js line is a cache/version constant assignment or a comment. */
export function isVersionOnlySwJsDiff(diffText) {
  const lines = unifiedDiffContentLines(diffText);
  if (!lines.length) return false;
  return lines.every((raw) => {
    const t = raw.trim();
    if (!t) return true;
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return true;
    return /^(?:const|let|var)\s+\w*(?:VERSION|CACHE|BUILD|PREFIX|STAMP)\w*\s*=/.test(t);
  });
}

/** Human reason fragment for a WIDENED line when a narrowable path is NOT benign. */
function narrowWidenReason(file) {
  if (file === "index.html") return "index.html non-script change";
  if (file === "package.json") return "package.json non-scripts change";
  if (file === "sw.js") return "sw.js non-version change";
  return `${file} infra change`;
}

/** Read a file's unified diff vs opts.diffBase (or origin/DEPLOY); opts.fileDiffs overrides. */
function readNarrowDiff(file, opts = {}) {
  if (opts.fileDiffs && Object.prototype.hasOwnProperty.call(opts.fileDiffs, file)) {
    return opts.fileDiffs[file];
  }
  const root = opts.root || ROOT;
  const ref = opts.diffBase || `origin/${DEPLOY_BRANCH}`;
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", ref], { cwd: root, encoding: "utf8" }).trim();
    return execFileSync("git", ["diff", "-U0", base, "--", file], {
      cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    });
  } catch (_) {
    return null;
  }
}

/** before/after text for package.json; opts.filePairs overrides. */
function readPackagePair(opts = {}) {
  if (opts.filePairs && opts.filePairs["package.json"]) return opts.filePairs["package.json"];
  const root = opts.root || ROOT;
  const ref = opts.diffBase || `origin/${DEPLOY_BRANCH}`;
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", ref], { cwd: root, encoding: "utf8" }).trim();
    const before = execFileSync("git", ["show", `${base}:package.json`], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    const after = fs.readFileSync(path.join(root, "package.json"), "utf8");
    return { before, after };
  } catch (_) {
    return null;
  }
}

/**
 * Classify a narrowable infra path. Returns { benign, widenReason } — benign
 * false (and widenReason set) when the diff cannot be proven narrow (fail-safe).
 */
export function classifyNarrowableInfra(file, opts = {}) {
  const norm = String(file || "").replace(/\\/g, "/");
  if (norm === "index.html") {
    const diff = readNarrowDiff(norm, opts);
    if (diff == null) return { benign: false, widenReason: narrowWidenReason(norm) };
    return isScriptTagOnlyIndexHtmlDiff(diff)
      ? { benign: true, widenReason: null }
      : { benign: false, widenReason: narrowWidenReason(norm) };
  }
  if (norm === "package.json") {
    const pair = readPackagePair(opts);
    if (!pair) return { benign: false, widenReason: narrowWidenReason(norm) };
    return isScriptsOnlyPackageJsonDiff(pair.before, pair.after)
      ? { benign: true, widenReason: null }
      : { benign: false, widenReason: narrowWidenReason(norm) };
  }
  if (norm === "sw.js") {
    const diff = readNarrowDiff(norm, opts);
    if (diff == null) return { benign: false, widenReason: narrowWidenReason(norm) };
    return isVersionOnlySwJsDiff(diff)
      ? { benign: true, widenReason: null }
      : { benign: false, widenReason: narrowWidenReason(norm) };
  }
  return { benign: false, widenReason: `${norm} infra change` };
}

/** The always-on topical groups' files that are NOT in the floor: `--changed`
 *  may select them (edit loop), the full run never does (CI runs their groups). */
export function topicalPool(groups = loadGroups().groups, floor = TOOLING_FAST_FILES) {
  const tf = new Set(floor);
  const out = new Set();
  for (const g of ALWAYS_ON_TOPICAL) for (const f of groups[g]?.files || []) if (!tf.has(f)) out.add(f);
  return [...out].sort();
}

/** Select tooling-fast unit files for a changed-path list; fail-safe → full suite. */
export function selectToolingFastChanged(changed, opts = {}) {
  const allFiles = (opts.allFiles || TOOLING_FAST_FILES).filter((f) => !f.startsWith("//"));
  const tfSet = new Set(allFiles);
  const pool = (opts.topicalFiles || (opts.allFiles ? [] : topicalPool())).filter((f) => !tfSet.has(f));
  const poolSet = new Set(pool);
  // `changed` is the real diff size on EVERY path (it used to exist only on `empty`/`matched`, so a whole-floor
  // fallback printed `changed=0`); `because` names the first path that forced the fallback (#2663 follow-up).
  // `widened` is the human fragment for the first-line `WIDENED:` notice (#2890).
  const full = (reason, extra = {}) => {
    const because = extra.because;
    const widened = extra.widened || (because ? (
      NARROWABLE_INFRA.includes(because) ? narrowWidenReason(because) : `${because} forces full suite`
    ) : reason);
    return {
      files: [...allFiles],
      reason,
      shards: shardsCoveringFiles(allFiles, allFiles),
      changed: changed.length,
      widened,
      ...extra,
    };
  };

  if (!changed.length) return { files: [], reason: "empty", shards: [], changed: 0 };

  // Generator output is checked by `gen:check`, not by widening: drop it, select from what is authored.
  const genOnly = opts.noGeneratedSplit ? [] : generatedOnlyPaths(changed, opts);
  if (genOnly.length) {
    const authored = changed.filter((f) => !genOnly.includes(f.replace(/\\/g, "/")));
    const gindex = opts.pinIndex || pinIndex();
    const seeds = new Set(GENERATED_SEED_TESTS);
    for (const g of genOnly) {
      for (const t of (NARROW_INFRA_TESTS[g] || [])) seeds.add(t);
      for (const t of (gindex.get(g) || [])) seeds.add(t);
    }
    const seedFiles = [...allFiles, ...pool].filter((f) => seeds.has(f));
    if (!authored.length) {
      return { files: seedFiles, reason: "generated-only", genCheck: true, generated: genOnly,
        shards: shardsCoveringFiles(seedFiles, allFiles), changed: changed.length };
    }
    const sub = selectToolingFastChanged(authored, { ...opts, noGeneratedSplit: true });
    const files = [...allFiles, ...pool].filter((f) => seeds.has(f) || sub.files.includes(f));
    return { ...sub, files, genCheck: true, generated: genOnly, changed: changed.length,
      shards: shardsCoveringFiles(files, allFiles) };
  }

  if (isDocsOnly(changed)) {
    const docsTests = allFiles.filter((f) => DOCS_FAST_TESTS.test(f));
    const files = docsTests.length ? docsTests : allFiles;
    return { files, reason: "docs-only", shards: shardsCoveringFiles(files, allFiles), changed: changed.length };
  }

  const circ = circuitsTouched(changed, opts.ref || "");
  const narrowSeeds = new Set();
  const benignNarrow = new Set();
  const classifyOnce = (norm) => {
    const r = classifyNarrowableInfra(norm, opts);
    if (r.benign) {
      benignNarrow.add(norm);
      for (const t of (NARROW_INFRA_TESTS[norm] || [])) narrowSeeds.add(t);
    }
    return r;
  };

  const trackedRaw = changed.filter((f) => TRACKED.some((re) => re.test(f)) && !circ.dataResolved.includes(f));
  const tracked = [];
  for (const f of trackedRaw) {
    const norm = f.replace(/\\/g, "/");
    if (NARROWABLE_INFRA.includes(norm)) {
      const { benign, widenReason } = classifyOnce(norm);
      if (benign) continue;
      return full("tracked", { tracked: trackedRaw, because: norm, widened: widenReason });
    }
    tracked.push(f);
  }
  if (tracked.length) return full("tracked", { tracked, because: tracked[0] });

  const runAllCand = changed.filter((f) => TOOLING_FAST_CHANGED_RUN_ALL.some((re) => re.test(f)));
  for (const f of runAllCand) {
    const norm = f.replace(/\\/g, "/");
    if (NARROWABLE_INFRA.includes(norm)) {
      if (benignNarrow.has(norm)) continue;
      const { benign, widenReason } = classifyOnce(norm);
      if (benign) continue;
      return full("run-all-path", { because: norm, widened: widenReason });
    }
    return full("run-all-path", { because: norm });
  }

  let scripts = opts.scripts;
  if (!scripts) {
    try {
      scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
    } catch (_) {
      return full("no-package-json");
    }
  }
  // Benign narrowable infra must not count as "unmatched" against pick-tests RULES.
  const receiptChanged = changed.filter((f) => !benignNarrow.has(f.replace(/\\/g, "/")));
  if (receiptChanged.length) {
    const receipt = selectionReceipt(receiptChanged, scripts);
    if (receipt.reason === "unmatched") return full("unmatched", { unclaimed: receipt.unclaimed, because: (receipt.unclaimed || [])[0] });
  }

  const selected = new Set(narrowSeeds);
  const index = opts.pinIndex || pinIndex();

  for (const f of changed) {
    const norm = f.replace(/\\/g, "/");
    if (benignNarrow.has(norm)) continue;
    if (tfSet.has(norm) || poolSet.has(norm)) selected.add(norm);
    // A file edit has a precise dependency key and may also inherit its
    // nearest directory pins. Do not fall through to the bare top-level
    // `js`/`css`/`tools` key: those generic pins describe the whole tree and
    // made one UI edit select hundreds of unrelated structural tests. A
    // directory edit still reaches its root and remains deliberately broad.
    const fileLike = /\.[^/]+$/.test(norm);
    let cur = norm;
    while (cur) {
      if (fileLike && !cur.includes("/")) break;
      const hits = index.get(cur);
      if (hits) for (const t of hits) selected.add(t);
      const slash = cur.lastIndexOf("/");
      if (slash < 0) break;
      cur = cur.slice(0, slash);
    }
    if (/^tools\/ci\/tooling-fast\.mjs$/.test(norm)) selected.add("tests/unit/tooling-fast-runner.test.mjs");
  }

  if (!selected.size) return full("no-pin-match");

  const files = [...allFiles, ...pool].filter((f) => selected.has(f));
  if (!files.length) return full("no-listed-match");
  return { files, reason: narrowSeeds.size && files.every((f) => narrowSeeds.has(f)) ? "narrow-infra" : "matched",
    shards: shardsCoveringFiles(files, allFiles), changed: changed.length,
    ...(narrowSeeds.size ? { narrow: [...narrowSeeds].filter((t) => tfSet.has(t)) } : {}) };
}

/* CI GUARDS SCOPE (#3951, #3117 F3). ci.yml's four Structural guards shards
 * run the WHOLE floor only when a pull request's diff reaches what the floor
 * mostly tests — tools/, tests/, .github/, package.json/-lock — and `--changed`
 * (still sharded 1/4..4/4) otherwise. Every other event (a deploy-branch push,
 * the pages.yml train via workflow_call, the nightly, a dispatch) stays full,
 * so a file a narrowed PR left out runs on the merged tip before it ships.
 * The JOBS always run and report: a path-filtered workflow leaves its required
 * checks "Pending" and blocks the merge for good
 * (https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks
 * §Handling skipped but required checks), and a job skipped by `if:` reads
 * `skipped`, which the `Structural guards` join rejects. Only the file list
 * narrows. An empty diff stays full: `--changed` exits 3 on one. */
export const GUARDS_FULL_PATHS = Object.freeze([/^tools\//, /^tests\//, /^\.github\//, /^package(-lock)?\.json$/]);

/** @returns {{ mode: "full" | "changed", reason: string }} */
export function guardsScope(changed, eventName) {
  if (eventName !== "pull_request") return { mode: "full", reason: `event ${eventName || "local"}` };
  const paths = changed.map((c) => String(c.path || c).replace(/\\/g, "/"));
  if (!paths.length) return { mode: "full", reason: "empty diff" };
  const hit = paths.find((f) => GUARDS_FULL_PATHS.some((re) => re.test(f)));
  if (hit) return { mode: "full", reason: `${hit} is tooling` };
  return { mode: "changed", reason: `${paths.length} path(s), none under tools/ tests/ .github/ package.json` };
}

/** First output line when --changed falls back to the full suite (#2890). */
export function widenedLine(meta, fileCount) {
  if (!meta || !meta.widened) return null;
  return `WIDENED: ${meta.widened} (${fileCount} files)`;
}

/** The `--changed` header line: reason, the REAL diff size, the files chosen, and the path that forced a fallback. */
export function changedHeader(meta, fileCount) {
  return `[tooling-fast] --changed reason=${meta.reason} changed=${meta.changed ?? 0} files=${fileCount}` +
    `${meta.because ? ` because=${meta.because}` : ""} shards=${(meta.shards || []).join(",") || "none"}`;
}
export const EMPTY_DIFF_MESSAGE = `[tooling-fast] --changed: EMPTY diff against origin/${DEPLOY_BRANCH} — nothing was selected, nothing verified (exit 3).\n` +
  `  Commit or stage your edit, \`git fetch origin ${DEPLOY_BRANCH}\` if the ref is stale, or run without --changed for the whole floor.`;

/** Flags the CLI accepts. Anything else (incl. `--help` typo forms) must ERROR —
 *  never silently start the suite: `--help` used to launch all 300+ files. */
const TOOLING_FAST_FLAGS = Object.freeze([
  "--jobs", "--order", "--record", "--test-timeout", "--file-timeout", "--shard", "--changed", "--bail", "--quiet", "--stop", "--print-scope", "--no-sync-shortcut", "--help", "-h",
]);

export const TOOLING_FAST_USAGE = `usage: node tools/ci/tooling-fast.mjs [--stop] [--jobs=N] [--changed] [--no-sync-shortcut] [--bail] [--quiet] [--shard=i/n] [--order=list|longest-first] [--record] [--test-timeout=S] [--file-timeout=S] [file…]
       node tools/ci/tooling-fast.mjs --print-scope   # CI guards: mode=full|changed for this event and diff
       node tools/ci/tooling-fast.mjs --help`;

/** Split a file list across CI jobs (`--shard=1/2`).
 *
 *  Without `timings` the split is a stride (idx % n): cheap, but blind to cost. On 2026-10-20 the stride gave shard
 *  1/2 about 1407 s of recorded work and shard 2/2 about 770 s (1.8x), with the two slowest files (flyby-shots 217 s,
 *  real-replay-vm 186 s) in the same half; "Structural guards (tooling A)" ran 11.9 min against its 12 min cap and was
 *  cancelled twice that night (Pages #3864, #3230's run), while tooling B finished in 8.4 min.
 *
 *  With `timings` ({ file: ms }, the COMMITTED table) the files are packed longest first onto the least-loaded shard
 *  (Graham's LPT, the rule the runner and select-specs already use), unmeasured files costed at the table's median,
 *  ties broken by list order, so every shard computes the same plan from the same inputs. Pass the committed table
 *  only (`ciShardFiles`): a local measurement would make this box's split differ from CI's. Equal costs give the old
 *  stride. Each shard keeps list order. */
export function applyFileShard(files, spec, timings) {
  if (!spec) return files;
  const m = /^(\d+)\/(\d+)$/.exec(String(spec));
  if (!m) throw new Error(`bad --shard=${spec} (want i/n)`);
  const i = Number(m[1]), n = Number(m[2]);
  if (n < 1 || i < 1 || i > n) throw new Error(`bad --shard=${spec}`);
  const known = Object.values(timings || {}).filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (!known.length) return files.filter((_, idx) => idx % n === i - 1);
  const fallback = known[known.length >> 1];
  const cost = (f) => { const v = timings[path.isAbsolute(f) ? path.relative(ROOT, f) : f]; return typeof v === "number" ? v : fallback; };
  const order = files.map((f, idx) => ({ idx, ms: cost(f) })).sort((a, b) => (b.ms - a.ms) || (a.idx - b.idx));
  const load = new Array(n).fill(0), owner = new Array(files.length);
  for (const x of order) {
    let k = 0;
    for (let j = 1; j < n; j++) if (load[j] < load[k]) k = j;
    load[k] += x.ms; owner[x.idx] = k;
  }
  return files.filter((_, idx) => owner[idx] === i - 1);
}

/** The CI split: applyFileShard with the committed timings table and nothing else. */
export function ciShardFiles(files, spec) {
  return applyFileShard(files, spec, loadTimings([TIMINGS_FILE]));
}

/** The last line of every CLI run (efficiency review finding 4): a verdict a `| tail` cannot hide behind exit 0. */
export function closingLine(ok, nFiles, nFailed) {
  return `= tooling-fast ${ok ? "passed" : "failed"} (${nFiles} files, ${nFailed} failed)`;
}

/** Parse argv for the CLI entry. Unknown flags throw; `--help`/`-h` set help. */
export function parseToolingFastArgv(argv) {
  const unknown = [];
  for (const a of argv) {
    if (!a.startsWith("--") && a !== "-h") continue;
    if (a === "--help" || a === "-h") continue;
    const name = a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
    if (!TOOLING_FAST_FLAGS.includes(name)) unknown.push(name);
  }
  if (unknown.length) {
    throw new Error(`unknown flag ${unknown.join(", ")}\n${TOOLING_FAST_USAGE}`);
  }
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const args = argv.filter((a) => !a.startsWith("--") && a !== "-h");
  const val = (name) => {
    const a = argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : undefined;
  };
  return {
    help: false,
    files: args.length ? args : null, // null = full TOOLING_FAST_FILES
    changed: argv.includes("--changed"),
    bail: argv.includes("--bail"),
    quiet: argv.includes("--quiet"),
    noSyncShortcut: argv.includes("--no-sync-shortcut"),
    stop: argv.includes("--stop"),
    printScope: argv.includes("--print-scope"),
    jobs: val("jobs") ? Number(val("jobs")) : DEFAULT_JOBS,
    jobsExplicit: val("jobs") !== undefined,
    order: val("order"),
    record: argv.includes("--record"),
    shard: val("shard"),
    testTimeoutMs: val("test-timeout") ? Number(val("test-timeout")) * 1000 : undefined,
    fileTimeoutMs: val("file-timeout") ? Number(val("file-timeout")) * 1000 : undefined,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let parsed;
  try {
    parsed = parseToolingFastArgv(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (parsed.help) {
    console.log(TOOLING_FAST_USAGE);
    process.exit(0);
  }
  if (parsed.printScope) {
    // ci.yml's guards shards: `mode=` and `reason=` lines for $GITHUB_OUTPUT (see guardsScope).
    const r = guardsScope(changedVsDeploy(), process.env.GITHUB_EVENT_NAME);
    console.log(`mode=${r.mode}\nreason=${r.reason}`);
    process.exit(0);
  }
  if (parsed.stop) {
    // The sanctioned stop (#2663): the registered run's whole process tree, never `pkill -f` or a hand-typed PID.
    const { stop } = await import("../lib/run-pid.mjs");
    const r = await stop("tooling-fast");
    console.log(r.state === "stopped" ? `[tooling-fast] stopped pid ${r.pid} (${r.killed} processes${r.forced ? `, ${r.forced} killed hard` : ""})`
      : r.state === "stale" ? `[tooling-fast] the registered run (pid ${r.pid}) is already gone` : "[tooling-fast] no registered run");
    process.exit(0);
  }
  {
    const { register, release } = await import("../lib/run-pid.mjs");
    if (register("tooling-fast").ok) process.on("exit", () => release("tooling-fast"));   // a nested run (a test) leaves the outer's record alone
  }
  let files0 = parsed.files;
  let changedMeta = null;
  if (parsed.changed) {
    const synced = parsed.noSyncShortcut ? null : syncMergePaths();
    changedMeta = synced ? selectSyncMerge(synced) : selectToolingFastChanged(changedVsDeploy());
    files0 = changedMeta.files;
    const wide = widenedLine(changedMeta, files0.length);
    if (wide) console.log(wide);
    console.log(changedHeader(changedMeta, files0.length));
    if (changedMeta.reason === "empty") {
      // An empty diff selects zero files and the runner printed `= run passed (0 passed, 0 failed)` with exit 0: a
      // vacuous green that read as proof. Nothing was verified, so say so and fail (exit 3, distinct from a test failure).
      console.error(EMPTY_DIFF_MESSAGE);
      console.log(closingLine(false, 0, 0));
      process.exit(3);
    }
    // #2890: selections estimated over ~2 min print the background-with-log hint (edit-loop jobs=3).
    try {
      const est = estimateToolingFast(files0, loadTimings(), Math.max(parsed.jobs || DEFAULT_JOBS, 3));
      if ((est.criticalPathMs || 0) >= LONG_RUN_MS) console.log(LONG_RUN_HINT);
    } catch (_) { /* timings absent: no hint */ }
  } else if (!files0) {
    files0 = [...TOOLING_FAST_FILES];
  }
  const files = ciShardFiles(files0, parsed.shard);
  if (changedMeta?.genCheck) {
    // Generated files were not run through the floor; their generators prove them (`npm run gen:check`).
    const t0 = Date.now();
    const g = spawnSync("npm", ["run", "gen:check", "--silent"], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    if (g.status !== 0) {
      console.log(`[tooling-fast] gen:check FAILED after ${sec}s - run \`npm run gen\` and commit the result`);
      console.log(`${String(g.stdout || "").trim().split("\n").slice(-15).join("\n")}\n${String(g.stderr || "").trim().split("\n").slice(-15).join("\n")}`);
      console.log("[tooling-fast] = run failed (gen:check)");
      console.log(closingLine(false, files.length, 1));
      process.exit(1);
    }
    console.log(`[tooling-fast] gen:check ok (${sec}s)`);
  }
  {
    // The served generated files are gitignored (docs/notes/DEPLOY-TIME-GEN-2026-10-28.md): build what is missing or
    // stale before any suite reads js/ (the game VM, load-order, global-registry read every FULL file).
    const { ensureBuilt, builtLine } = await import("../gen/ensure-built.mjs");
    const line = builtLine(ensureBuilt());
    if (line) console.log(`[tooling-fast] ${line}`);
  }
  if (!parsed.jobsExplicit) {
    const pick = await probeAutoJobs();
    parsed.jobs = pick.jobs;
    console.log(`[tooling-fast] jobs=${pick.jobs} (auto: ${pick.why}; pass --jobs=N to choose)`);
  }
  const { ok, failed: nFailed } = await runToolingFast(files, {
    jobs: parsed.jobs,
    bail: parsed.bail,
    quiet: parsed.quiet,
    order: parsed.order,
    record: parsed.record,
    testTimeoutMs: parsed.testTimeoutMs,
    fileTimeoutMs: parsed.fileTimeoutMs,
  });
  console.log(closingLine(ok, files.length, nFailed));
  process.exit(ok ? 0 : 1);
}
