#!/usr/bin/env node
// @doc Runs ONE browser spec in the BACKGROUND under a one-run lock and a loadavg gate; `--status`, `--wait`, `--stop`.
// @section runner
/**
 * test-bg.mjs — run ONE Playwright spec in the background and hand back a log to tail.
 *
 * Agents do not run browser tests locally (AGENTS.md rule 5); this tool exists for a Bryce-attended single spec.
 * CI runs the tiers: every PR push gets the change-aware `selected` legs (one 5-min shard on a draft, the
 * 10-min budget once ready) and `node tools/ci/remote-group.mjs <group>` runs a whole group on the pushed
 * branch. Group mode (`test-bg.mjs <group>`, `--parallel`, `--wait <groups>`, `--sweep`, `--last-failed`) went
 * on 2026-11-03 with the 4-core local-run practice it served
 * (docs/plans/2026-11-03-agent-surface-reset.md §4.2).
 *
 *   node tools/ci/test-bg.mjs --spec tests/specs/<file>.spec.js   # ONE spec: `npm test -- <file>` detached, logging
 *                                                   #   to artifacts/logs/spec-<name>.log; verdict line `= bg exit N`
 *   node tools/ci/test-bg.mjs --status              # what is running / how it ended
 *   node tools/ci/test-bg.mjs --tail <name>         # print the tail command (name: spec-<basename>)
 *   node tools/ci/test-bg.mjs --wait --timeout 45   # block until the run finishes (run it as a background task):
 *                                                   #   exit 0 passed, 1 red, 124 still running after N minutes
 *   node tools/ci/test-bg.mjs --stop                # SIGTERM, then SIGKILL, the run's process group
 *   --grep <re>     Playwright --grep: run only matching test titles
 *   --workers <n>   Playwright workers (default: env WORKERS, else 1 on <= 4 cores, 2 above)
 *   --force         start despite loadavg >= 3 or a live MCP Chrome daemon (never beside another run)
 *   An unknown flag prints this usage and exits 2 (tools/lib/cli-args.mjs strictFlags).
 *
 * ONE run at a time, refused otherwise: every Playwright worker is a Chromium +
 * SwiftShader process, and past the core count they starve each other and fail
 * on their own timeouts — which reads as a broken change rather than a busy box.
 * The run gets its own free port (tools/ci/run-playwright.mjs), its own
 * artifacts/report-<port>/ and its own log, and `--status` reads its verdict
 * out of that log, so there is no second source of truth to keep in sync.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictFlags } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOGDIR = path.join(ROOT, "artifacts/logs");
const STATEFILE = path.join(LOGDIR, "test-bg.json");
/** Use the CPU budget available to this process, not the host's logical CPUs.
 *  Explicit CLI workers win over WORKERS; either wins over the default. */
export function workerBudget({ workers, env = process.env, system = os } = {}) {
  const cores = typeof system.availableParallelism === "function"
    ? system.availableParallelism() : (system.cpus().length || 4);
  return { cores, workers: workers || env.WORKERS || (cores <= 4 ? "1" : "2") };
}
// One worker reduces SwiftShader contention on a 4-core budget. Budgets above
// four keep two workers; explicit CLI and environment overrides are retained.
let WORKERS = workerBudget().workers;
/** `--grep <pattern>`: forwarded to Playwright (single-quoted for the `sh -c` that starts the run). */
let GREP = null;
export const shQuote = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATEFILE, "utf8")); } catch (_) { return { runs: [] }; }
};
// THE REGISTRY IS SHARED between every test-bg process alive at once: a
// `--wait` stamping `ended` while a second shell starts a run is the ordinary
// case, not a corner. So a write is (1) a RE-READ immediately before it, so the
// mutation applies to what is on disk now rather than to a copy taken seconds
// ago, (2) a merge BY PID — the pid is the one key two writers cannot both own
// — and (3) a tmp file + renameSync, so a reader never sees a half-written
// JSON. `mutate(fresh)` returns the next state (or edits in place).
// tools/mcp/apex-tools-mcp.mjs reads the same file (`runs[].browser`, `mode`)
// to keep its browser tools off a live run.
const updateState = (mutate) => {
  fs.mkdirSync(LOGDIR, { recursive: true });
  const fresh = readState();
  const next = mutate(fresh) || fresh;
  const tmp = `${STATEFILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, STATEFILE);
  return next;
};
/** `mine` wins for a pid both lists carry; everything else on disk survives. */
const mergeByPid = (disk, mine) => {
  const seen = new Set(mine.map((r) => r.pid));
  return [...disk.filter((r) => !seen.has(r.pid)), ...mine];
};
/* LIVENESS IS PID + START TIME (2026-10-04). `kill(pid, 0)` alone read any
 * process that later took a recorded pid as this run: after a container
 * restart (artifacts/ survives, pids restart low) or a pid wrap, a stale entry
 * stayed "running" forever, the one-run cap refused every start, and --stop
 * sent SIGTERM then SIGKILL to the process GROUP of an unrelated process. A
 * run now records its /proc/<pid>/stat starttime (field 22) and the kernel
 * boot id, and is alive only while both still match. An old record without
 * them falls back to the pid test. */
export function procStart(pid) {
  try { return fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(")").pop().trim().split(/\s+/)[19] || null; }
  catch (_) { return null; }
}
/* A ZOMBIE IS NOT A RUN (#1921). A finished wrapper its parent has not reaped
 * stays in /proc as Z with the same start time, and kill(pid, 0) still
 * succeeds — the run read as live although its log ended `= bg exit 0`. Field
 * 3 of /proc/<pid>/stat is the state; Z/X/x are dead. */
function procState(pid) {
  try { return fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(")").pop().trim()[0] || null; }
  catch (_) { return null; }
}
const BOOT_ID = (() => { try { return fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(); } catch (_) { return null; } })();
export function aliveRun(run, { kill = (p) => process.kill(p, 0), start = procStart, boot = BOOT_ID, state = procState } = {}) {
  const pid = run && +run.pid;
  if (!(pid > 0)) return false;
  try { kill(pid); } catch (_) { return false; }
  if (/^[ZXx]$/.test(state(pid) || "")) return false;
  if (run.bootId && boot && run.bootId !== boot) return false;
  if (run.starttime && start(pid) !== String(run.starttime)) return false;
  return true;
}
const alive = (run) => aliveRun(run);
const loadavgLine = () => {
  try {
    const [a, b, c] = os.loadavg().map((n) => n.toFixed(2));
    return `loadavg=${a} ${b} ${c}`;
  } catch (_) {
    return "loadavg=?";
  }
};
const say = (...a) => console.log(`[test-bg]`, ...a);
const fmtDur = (ms) => {
  if (ms == null || Number.isNaN(ms)) return "?";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
};

// A negative pid signals the whole process GROUP (spawn uses detached:true, so
// pgid === pid). The single-pid fallback is for a child that never became a
// group leader — it reaches the npm shim only, which is why the group form is
// tried first. See the note above stop().
const signal = (pid, sig) => {
  try { process.kill(-pid, sig); return true; } catch (_) {
    try { process.kill(pid, sig); return true; } catch (_) { return false; }
  }
};

/* A run's outcome is read out of its own log, so there is no second source of
   truth to keep in sync. Two formats, because two kinds of log exist:
   Playwright runs end with live-reporter's "= run <status>" line, and a
   node --test half ends with a TAP summary. A log that matches neither
   really did die early. */
export function outcome(run) {
  if (alive(run)) return "running";
  let text = "";
  try { text = fs.readFileSync(run.log, "utf8"); } catch (_) { return "gone (no log)"; }
  return outcomeOf(text);
}

/** The verdict in a finished log. THE EXIT CODE IS CHECKED FIRST (2026-09-24):
 *  a run can be two commands (a twinned spec is its VM twins then Playwright),
 *  and the first half's `= run passed` or `# fail 0` used to win over a
 *  non-zero `= bg exit`, so a red second half — or a Playwright half SIGKILLed
 *  before its summary — read as passed and `--wait` exited 0. The detail line
 *  still names the counts. */
export function outcomeOf(text) {
  const bgExit = [...text.matchAll(/^= bg exit (\d+)$/gm)].pop();
  const detail = [...text.matchAll(/= run (\w+)\s+\(([^)]*)\)/g)].pop();
  if (bgExit && bgExit[1] !== "0") {
    return `failed (exit ${bgExit[1]}${detail ? `; last summary: ${detail[1]} (${detail[2]})` : ""})`;
  }
  // --stop can terminate the supervisor shell before it writes a bg trailer.
  // A VM twin's TAP pass (or an earlier browser shard's summary) then says
  // nothing about the browser half that started afterwards. Require THAT
  // phase's terminal summary, even if an exit-0 trailer is present.
  const browserStart = [...text.matchAll(/^\[playwright\] .* (?:port=\d+ pid=\d+|browser half follows)$|^\[[\d:]+\] = run start:/gm)].pop();
  if (browserStart && (!detail || detail.index < browserStart.index)) {
    const phase = text.slice(browserStart.index);
    const signal = phase.match(/^\[playwright\] child exited on (SIG\w+)$/m);
    const fails = [...phase.matchAll(/^\[[\d:]+\] x FAIL/gm)].length;
    if (signal) return `interrupted (${signal[1]}; ${fails} failure(s), browser summary missing)`;
    return fails ? `died after ${fails} failure(s) (browser summary missing)` : "died before finishing (browser summary missing)";
  }
  const pw = detail;
  if (pw) return `${pw[1]} (${pw[2]})`;

  const tap = text.match(/^# pass (\d+)$[\s\S]*?^# fail (\d+)$/m);
  if (tap) {
    const todo = (text.match(/^# todo (\d+)$/m) || [])[1];
    const suffix = todo && todo !== "0" ? `, ${todo} todo` : "";
    return `${tap[2] === "0" ? "passed" : "failed"} (${tap[1]} passed, ${tap[2]} failed${suffix})`;
  }

  // A log with neither format but a trailer: the `= bg exit N` line start()
  // appends is the verdict. pw/tap stay first because they carry richer detail.
  const bg = [...text.matchAll(/^= bg exit (\d+)$/gm)].pop();
  if (bg) return bg[1] === "0" ? "passed (exit 0)" : `failed (exit ${bg[1]})`;

  const fails = [...text.matchAll(/^\[[\d:]+\] x FAIL/gm)].length;
  return fails ? `died after ${fails} failure(s)` : "died before finishing";
}

function status() {
  const s = readState();
  if (!s.runs.length) return say("no background runs recorded");
  say(`status ${loadavgLine()}`);
  for (const r of s.runs) {
    const started = r.started ? Date.parse(r.started) : NaN;
    const dur = alive(r) ? `elapsed=${fmtDur(Date.now() - started)}`
      : (r.ended ? `duration=${fmtDur(Date.parse(r.ended) - started)}` : "");
    say(`${r.group.padEnd(16)} pid=${String(r.pid).padEnd(8)} ${outcome(r).padEnd(34)} ${dur} ${path.relative(ROOT, r.log)}`);
  }
}

function waitDeadlineFromMin(waitTimeoutMin) {
  return waitTimeoutMin > 0 ? Date.now() + waitTimeoutMin * 60_000 : Infinity;
}

export const KNOWN_FLAGS = ["--timeout", "--workers", "--spec", "--force", "--grep", "--status", "--stop", "--tail", "--wait", "--help"];
/** The spec's run name, `spec-<basename>`: the registry key, the log name and the `--tail` argument. */
export const specGroupName = (file) => "spec-" + path.basename(String(file)).replace(/\.spec\.[cm]?js$/, "").replace(/[^a-z0-9._-]/gi, "_");
/** Parse the CLI. `--timeout` is minutes (AGENTS.md). Strict: an unknown `--flag`
 *  throws, and so does a bare word — group mode is gone (main prints the usage and exits 2). */
export function parseTestBgArgv(argv) {
  let waitTimeoutMin = 0;
  let workers = null;
  const specs = [];
  let grep = null;
  let tail = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const kv = /^(--workers|--spec|--grep|--tail)(?:=(.*))?$/.exec(a);
    if (kv) {
      const v = kv[2] !== undefined ? kv[2] : argv[++i];
      if (v == null || v === "" || v.startsWith("-")) throw new Error(`${kv[1]} requires a value`);
      if (kv[1] === "--grep") grep = v;
      else if (kv[1] === "--spec") specs.push(v);
      else if (kv[1] === "--tail") tail = v;
      else if (!(Number(v) >= 1 && Number.isInteger(Number(v)))) throw new Error("--workers requires a positive integer");
      else workers = String(Number(v));
      continue;
    }
    if (a === "--timeout") {
      const v = argv[++i];
      if (v == null || v.startsWith("-")) throw new Error("--timeout requires a value (minutes)");
      waitTimeoutMin = Number(v);
      if (!Number.isFinite(waitTimeoutMin) || waitTimeoutMin <= 0) throw new Error("--timeout requires a positive number of minutes");
      continue;
    }
    const eq = /^--timeout=(\d+(?:\.\d+)?)$/.exec(a);
    if (eq) {
      waitTimeoutMin = Number(eq[1]);
      if (!Number.isFinite(waitTimeoutMin) || waitTimeoutMin <= 0) throw new Error("--timeout requires a positive number of minutes");
      continue;
    }
    if (a.startsWith("--")) {
      if (!KNOWN_FLAGS.includes(a)) throw new Error(`unknown flag ${a}\n  accepts: ${KNOWN_FLAGS.join(" ")}`);
      continue;
    }
    throw new Error(`group mode is gone (2026-11-03): "${a}" is not a flag. Run ONE spec with --spec tests/specs/<file>.spec.js;`
      + ` a whole group runs on the PR (node tools/ci/remote-group.mjs <group>)`);
  }
  return { waitTimeoutMin, workers, grep, specs, tail, force: argv.includes("--force") };
}

export async function waitForRunning({ deadline, waitTimeoutMin = 0 } = {},
  { running = () => readState().runs.filter((r) => alive(r)) } = {}) {
  const dl = deadline ?? waitDeadlineFromMin(waitTimeoutMin);
  const t0 = Date.now();
  // Re-read the registry every poll: a run another shell starts while this
  // waits is part of "everything still running".
  while (running().length) {
    if (Date.now() > dl) {
      process.stderr.write("\r" + " ".repeat(80) + "\r");
      const mins = waitTimeoutMin > 0 ? waitTimeoutMin : Math.max(1, Math.round((Date.now() - t0) / 60_000));
      say(`WAIT TIMEOUT after ${mins} min — still running: ${running().map((r) => r.group).join(", ")} (left alive; --status later, --stop to end)`);
      process.exitCode = 124;
      return 124;
    }
    const live = running();
    const line = `waiting on ${live.map((r) => r.group).join(", ")} ${loadavgLine()}`;
    process.stderr.write("\r[test-bg] " + line.padEnd(70).slice(0, 70));
    await new Promise((r) => setTimeout(r, 3000));
  }
  process.stderr.write("\r" + " ".repeat(80) + "\r");
  // Stamp ended times for finished runs so --status can show duration. The
  // stamps are keyed by pid and applied to a FRESH read inside updateState, so
  // a run another shell started while this one waited is not clobbered.
  const stamped = new Map();
  for (const r of readState().runs) {
    if (!alive(r) && !r.ended) {
      const ended = new Date().toISOString();
      stamped.set(r.pid, ended);
      const started = r.started ? Date.parse(r.started) : NaN;
      const o = outcome(r);
      say(`END   ${r.group} at=${ended} duration=${fmtDur(Date.now() - started)} ${o} ${loadavgLine()}`);
      try {
        fs.appendFileSync(r.log,
          `\n[test-bg] END group=${r.group} at=${ended} duration=${fmtDur(Date.now() - started)} ${o} ${loadavgLine()}\n`);
      } catch (_) { /* log may be gone */ }
    }
  }
  const final = stamped.size
    ? updateState((s) => { for (const r of s.runs) if (!r.ended && stamped.has(r.pid)) r.ended = stamped.get(r.pid); })
    : readState();
  status();
  const bad = final.runs.filter((r) => !/^passed/.test(outcome(r)));
  process.exitCode = bad.length ? 1 : 0;
  return process.exitCode;
}

// KILL THE PROCESS GROUP, NOT THE npm WRAPPER. `process.kill(pid)` reached only
// the `npm test` shim; npm does not forward the signal, so run-playwright, the
// Playwright runner and every Chromium it had opened were orphaned and kept
// running — invisible to --status, still holding the CPU, and still writing to
// the log file the NEXT run truncated under them. Measured after three
// `--stop`ed runs: 117 Chromium processes on a 4-core box, load average 50.7,
// and every "failure" in that state a `Test timeout of 120000ms exceeded`.
// spawn() uses `detached: true`, which makes the child a process-group leader
// with pgid === pid, so a negative pid signals the whole tree. SIGTERM first so
// Playwright can close its browsers, then SIGKILL anything still up.
function stop({ graceMs = 4000 } = {}) {
  const s = readState();
  const live = s.runs.filter((r) => alive(r));
  let n = 0;
  for (const r of live) if (signal(r.pid, "SIGTERM")) n++;
  say(`sent SIGTERM to ${n} run(s)`);
  if (!n) { say("nothing registered is alive — if the box is still busy, `ps -eo pid,pcpu,args --sort=-pcpu | head` and kill a listed pid of yours"); return; }
  const deadline = Date.now() + graceMs;
  const spin = () => {
    const still = live.filter((r) => alive(r));
    if (!still.length) return say("all stopped");
    if (Date.now() < deadline) return setTimeout(spin, 250);
    for (const r of still) { signal(r.pid, "SIGKILL"); say(`SIGKILL ${r.group} (pgid ${r.pid})`); }
  };
  setTimeout(spin, 250);
}

function spawnSpec(spec) {
  const group = specGroupName(spec);
  const log = path.join(LOGDIR, `${group}.log`);
  const started = new Date().toISOString();
  const header = `[test-bg] START group=${group} spec=${spec} at=${started} ${loadavgLine()} workers=${WORKERS}\n`;
  fs.writeFileSync(log, header);
  const fd = fs.openSync(log, "a");
  const forward = [JSON.stringify(spec), `--workers=${WORKERS}`, ...(GREP ? [`--grep=${shQuote(GREP)}`] : [])];
  // detached + ignored stdin: the run must outlive this process and must
  // never block waiting for a terminal that is no longer attached.
  // The `= bg exit N` trailer is the terminal line: see outcome() above for
  // why a log without one reads as a dead run.
  const cmd =
    `start_s=$(date +%s); ` +
    `npm test --silent -- ${forward.join(" ")}; ` +
    `ec=$?; end_s=$(date +%s); ` +
    `echo "[test-bg] END group=${group} duration=$((end_s-start_s))s exit=$ec loadavg=$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || echo '?')"; ` +
    `echo "= bg exit $ec"`;
  const child = spawn("sh", ["-c", cmd], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env, APEX_HEARTBEAT: process.env.APEX_HEARTBEAT || "30" },
  });
  child.unref();
  fs.closeSync(fd);
  say(`START ${group.padEnd(14)} pid=${child.pid} at=${started} ${loadavgLine()} log=${path.relative(ROOT, log)}`);
  // `browser: true` is what apex-tools-mcp reads to keep its browser tools off this run.
  return { group, spec, pid: child.pid, starttime: procStart(child.pid), bootId: BOOT_ID, log, started, browser: true };
}

/** The live `probe-mcp.py chrome-start` daemons on this BOX (any checkout):
 *  its tmux sessions are named `probe-chrome-<sha256(root)[:16]>`. A Chrome
 *  rendering beside a Playwright run starves it (skill mcp-probe, hard rule 1),
 *  so the check is box-wide, not per worktree. No tmux = no daemon. */
export function probeChromeSessions(list = () => spawnSync("tmux", ["ls", "-F", "#S"], { encoding: "utf8", timeout: 3000 }).stdout || "") {
  let out = "";
  try { out = list(); } catch (_) { return []; }
  return String(out).split("\n").map((l) => l.trim()).filter((l) => /^probe-chrome-[0-9a-f]{16}$/.test(l));
}

/** The refusal text when a browser run would start beside a live MCP Chrome, else null. */
export function chromeRefusal({ browser = true, force, sessions }) {
  if (force || !browser || !sessions.length) return null;
  return `[test-bg] REFUSED: the MCP Chrome daemon is live (tmux ${sessions.join(", ")}) — a Chrome beside Playwright starves it.\n` +
    `[test-bg] park it to about:blank, then: python3 tools/mcp/probe-mcp.py chrome-stop   (or --force, and do not trust a timeout).`;
}

const LOAD_LIMIT = 3;   // start()'s refusal threshold (1-min loadavg)

// Inject only process/filesystem edges so start's ordering and registry
// mutations can be exercised without launching or signalling any browser run.
export function start(spec, { force = false } = {}, deps = {}) {
  const io = {
    probeChromeSessions, readState, alive, spawnSpec, updateState, say,
    load1: () => os.loadavg()[0],
    mkdirLogs: () => fs.mkdirSync(LOGDIR, { recursive: true }),
    error: (...args) => console.error(...args),
    exit: (code) => process.exit(code),
    now: () => new Date().toISOString(),
    ...deps,
  };
  const refusal = chromeRefusal({ browser: true, force, sessions: force ? [] : io.probeChromeSessions() });
  if (refusal) { io.error(refusal); io.exit(3); }

  // A busy box measures the machine, not the code: refuse to start above
  // loadavg 3 unless --force. Every false red in tiny.log on 2026-09-01 was a
  // start at loadavg > 3.
  const load1 = io.load1();
  if (!force && load1 >= LOAD_LIMIT) {
    io.error(`[test-bg] REFUSED: 1-min loadavg ${load1.toFixed(2)} >= ${LOAD_LIMIT} — a timeout now would measure the box, not the code.`);
    io.error(`[test-bg] wait for it to settle (cat /proc/loadavg), or pass --force and do not trust a timeout from this run.`);
    io.exit(3);
  }

  // ONE RUN AT A TIME, --force included: a second Playwright beside the first
  // starves both (and on the local path can attach to the first's server, so
  // stopping one kills the other mid-flight). The check runs before anything
  // is spawned, so a refusal never leaves a half-registered run.
  const running = io.readState().runs.filter((r) => io.alive(r));
  if (running.length) {
    io.error(`[test-bg] REFUSED: a run is live (${running.map((r) => `${r.group} pid=${r.pid}`).join(", ")}) — one at a time.`);
    io.error(`[test-bg] read it (--status, tail -f ${running.map((r) => path.relative(ROOT, r.log)).join(" ")}) or end it (--stop) first.`);
    io.exit(3);
  }

  io.mkdirLogs();
  io.say(`spawning ONE spec ${loadavgLine()}`);
  const run = io.spawnSpec(spec);
  // MERGE WITH WHAT IS ON DISK, don't clobber it: finished runs keep their
  // records (and their `ended` stamps) for --status. The read happens INSIDE
  // updateState, immediately before the rename, and the new run merges by pid.
  io.updateState((s) => ({ runs: mergeByPid(s.runs || [], [run]), started: io.now(), workers: WORKERS, mode: "spec" }));
  io.say(`tail:       tail -f ${path.relative(ROOT, run.log)}`);
  io.say(`check:      node tools/ci/test-bg.mjs --status`);
  io.say(`block:      node tools/ci/test-bg.mjs --wait --timeout 45`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const argv = isMain ? process.argv.slice(2) : [];
export const USAGE = `usage: node tools/ci/test-bg.mjs --spec tests/specs/<file>.spec.js [--grep <re>] [--workers <n>] [--force]   # one spec, detached
       node tools/ci/test-bg.mjs --wait [--timeout <min>]   # exit 1 red, 124 still running
       node tools/ci/test-bg.mjs --status | --stop | --tail <name>
(agents do not run browser tests locally, AGENTS.md rule 5: a whole group runs on the PR via tools/ci/remote-group.mjs)`;
let parsed;
if (isMain) {
  strictFlags(argv, KNOWN_FLAGS, USAGE);
  try { parsed = parseTestBgArgv(argv); } catch (e) {
    console.error(`[test-bg] ${e.message}`);
    process.exit(2);
  }
  if (parsed.specs.length > 1) { console.error(`[test-bg] ONE spec per run (got ${parsed.specs.length}); a whole group runs on the PR via tools/ci/remote-group.mjs`); process.exit(2); }
  for (const f of parsed.specs) {
    if (!fs.existsSync(path.resolve(ROOT, f))) { console.error(`[test-bg] --spec: no such file ${f}`); process.exit(2); }
  }
  GREP = parsed.grep;
  if (parsed.workers) WORKERS = workerBudget({ workers: parsed.workers }).workers;
}

if (!isMain) { /* imported for outcomeOf, aliveRun, parseTestBgArgv (tests, tools/mcp/apex-tools-mcp.mjs) */ }
else if (argv.includes("--status")) status();
else if (argv.includes("--stop")) stop();
else if (parsed.tail) {
  const r = readState().runs.find((x) => x.group === parsed.tail || x.group === specGroupName(parsed.tail));
  console.log(r ? `tail -f ${path.relative(ROOT, r.log)}` : `no run recorded for "${parsed.tail}"`);
} else if (argv.includes("--wait")) {
  await waitForRunning({ waitTimeoutMin: parsed.waitTimeoutMin });
} else if (!parsed.specs.length) {
  console.error(USAGE);
  process.exit(2);
} else start(parsed.specs[0], { force: parsed.force });
