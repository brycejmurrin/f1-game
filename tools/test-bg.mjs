#!/usr/bin/env node
// @doc Starts test groups in the BACKGROUND and hands back a log to tail; sequential by default (`--parallel`, `--wait`).
// @section runner
/**
 * test-bg.mjs — start test groups in the BACKGROUND and hand back a log to tail.
 *
 * A foreground Playwright run on this software-rendered suite blocks for
 * minutes and prints nothing an editor can act on. `tools/test-shards.sh`
 * already runs groups concurrently, but it WAITS — so the terminal is still
 * gone. This detaches: it returns as soon as the children are up, prints the
 * tail commands, and leaves a status file per group.
 *
 *   node tools/test-bg.mjs smoke                 # start one group (default)
 *   node tools/test-bg.mjs smoke api collision   # SEQUENTIAL: one at a time
 *   node tools/test-bg.mjs --parallel smoke api  # concurrent up to core cap
 *   node tools/test-bg.mjs --status              # what is running / how it ended
 *   node tools/test-bg.mjs --tail smoke          # print the tail command
 *   node tools/test-bg.mjs --wait                # block until all groups finish
 *   node tools/test-bg.mjs --wait smoke api      # start each, wait, then next
 *   node tools/test-bg.mjs --stop                # kill everything still running
 *
 * Default is SEQUENTIAL (one group at a time). `--parallel` restores the old
 * core-capped concurrent start. AGENTS.md: ONE Playwright process, ONE browser
 * group per batch — bunching groups is how SwiftShader timeouts masquerade as
 * test failures.
 *
 * Each group gets its own free port (via tools/run-playwright.mjs), its own
 * artifacts/report-<port>/ and its own artifacts/logs/<group>.log — so groups
 * cannot tear down each other's web server, and a stall is attributable to one
 * log rather than to "the run".
 *
 * Sizing: every worker is a Chromium + SwiftShader process, so total browsers
 * is groups × workers. WORKERS defaults to 1 on ≤4 cores (2 above); keep concurrent
 * groups at 1 unless you know the box is quiet.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGDIR = path.join(ROOT, "artifacts/logs");
const STATEFILE = path.join(LOGDIR, "test-bg.json");
// One worker on a 4-core box: two SwiftShader workers push loadavg to 6-8 and
// every "failure" is then a timeout (tiny.log 2026-09-01: 3 false reds, all
// PASS solo). Bigger boxes keep 2.
const WORKERS = process.env.WORKERS || (os.cpus().length <= 4 ? "1" : "2");

// THE CAP EXISTS BECAUSE OVERSUBSCRIPTION DOES NOT LOOK LIKE OVERSUBSCRIPTION.
// Every Playwright worker drives a SwiftShader Chromium, so the real browser
// count is (groups × WORKERS) and they are all CPU-bound. Past the core count
// they starve each other and fail on their own timeouts — a screenshot that
// takes 60 s, a spec that takes 120 s — which reads as a broken change rather
// than as a busy machine. Measured here: five groups took the load average to
// 46 on 4 cores with 94 Chromium processes, and every "failure" was a timeout.
//
// Default concurrent cap is 1 (sequential). --parallel raises it to cores/WORKERS.
// --force overrides the cap entirely for a box that really is bigger.
const CORES = os.availableParallelism ? os.availableParallelism() : (os.cpus().length || 4);
const PARALLEL_MAX = Math.max(1, Math.floor(CORES / (+WORKERS || 2)));

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATEFILE, "utf8")); } catch (_) { return { runs: [] }; }
};
const writeState = (s) => fs.writeFileSync(STATEFILE, JSON.stringify(s, null, 2));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };
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
// tried first. See the long note above stop().
const signal = (pid, sig) => {
  try { process.kill(-pid, sig); return true; } catch (_) {
    try { process.kill(pid, sig); return true; } catch (_) { return false; }
  }
};
// Synchronous sleep: supersede() below must finish killing BEFORE the
// replacement is spawned, so it cannot hand control back to the event loop.
const sleepSync = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/* A run's outcome is read out of its own log, so there is no second source of
   truth to keep in sync. Two formats, because two kinds of group exist:
   Playwright groups end with live-reporter's "= run <status>" line, and
   node --test groups end with a TAP summary. A group whose log matches neither
   really did die early. */
function outcome(run) {
  if (alive(run.pid)) return "running";
  let text = "";
  try { text = fs.readFileSync(run.log, "utf8"); } catch (_) { return "gone (no log)"; }

  const pw = [...text.matchAll(/= run (\w+)\s+\(([^)]*)\)/g)].pop();
  if (pw) return `${pw[1]} (${pw[2]})`;

  const tap = text.match(/^# pass (\d+)$[\s\S]*?^# fail (\d+)$/m);
  if (tap) {
    const todo = (text.match(/^# todo (\d+)$/m) || [])[1];
    const suffix = todo && todo !== "0" ? `, ${todo} todo` : "";
    return `${tap[2] === "0" ? "passed" : "failed"} (${tap[1]} passed, ${tap[2]} failed${suffix})`;
  }

  // Plain-script groups (test:audit is `node tools/test-coverage-audit.mjs`)
  // print neither format, so a PASSING audit read as "died before finishing"
  // and --wait exited 1 on a green batch. start() appends this trailer to
  // every log for exactly this case; pw/tap stay first because they carry
  // richer detail.
  const bg = [...text.matchAll(/^= bg exit (\d+)$/gm)].pop();
  if (bg) return bg[1] === "0" ? "passed (exit 0)" : `failed (exit ${bg[1]})`;

  const fails = [...text.matchAll(/^\[[\d:]+\] x FAIL/gm)].length;
  return fails ? `died after ${fails} failure(s)` : "died before finishing";
}

function status() {
  const s = readState();
  if (!s.runs.length) return say("no background runs recorded");
  say(`status ${loadavgLine()} mode=${s.mode || "?"}`);
  for (const r of s.runs) {
    const started = r.started ? Date.parse(r.started) : NaN;
    const dur = alive(r.pid) ? `elapsed=${fmtDur(Date.now() - started)}`
      : (r.ended ? `duration=${fmtDur(Date.parse(r.ended) - started)}` : "");
    say(`${r.group.padEnd(16)} pid=${String(r.pid).padEnd(8)} ${outcome(r).padEnd(34)} ${dur} ${path.relative(ROOT, r.log)}`);
  }
}

async function waitForRunning() {
  const s = readState();
  const running = () => s.runs.filter((r) => alive(r.pid));
  while (running().length) {
    const live = running();
    const line = `waiting on ${live.map((r) => r.group).join(", ")} ${loadavgLine()}`;
    process.stderr.write("\r[test-bg] " + line.padEnd(70).slice(0, 70));
    await new Promise((r) => setTimeout(r, 3000));
  }
  process.stderr.write("\r" + " ".repeat(80) + "\r");
  // Stamp ended times for finished runs so --status can show duration.
  const final = readState();
  let changed = false;
  for (const r of final.runs) {
    if (!alive(r.pid) && !r.ended) {
      r.ended = new Date().toISOString();
      changed = true;
      const started = r.started ? Date.parse(r.started) : NaN;
      const o = outcome(r);
      say(`END   ${r.group} at=${r.ended} duration=${fmtDur(Date.now() - started)} ${o} ${loadavgLine()}`);
      try {
        fs.appendFileSync(r.log,
          `\n[test-bg] END group=${r.group} at=${r.ended} duration=${fmtDur(Date.now() - started)} ${o} ${loadavgLine()}\n`);
      } catch (_) { /* log may be gone */ }
    }
  }
  if (changed) writeState(final);
  status();
  const bad = final.runs.filter((r) => !/^passed/.test(outcome(r)));
  process.exitCode = bad.length ? 1 : 0;
}

// KILL THE PROCESS GROUP, NOT THE npm WRAPPER. `process.kill(pid)` reached only
// the `npm run test:<group>` shim; npm does not forward the signal, so
// run-playwright, the Playwright runner and every Chromium it had opened were
// orphaned and kept running — invisible to --status, still holding the CPU, and
// still writing to the log file the NEXT run truncated under them.
//
// That is how this tool produced fake results. Measured after three `--stop`ed
// groups: 117 Chromium processes on a 4-core box, load average 50.7, three
// orphaned runners (one of them re-running the same physics specs as the live
// run, into the same log). Every "failure" in that state was `Test timeout of
// 120000ms exceeded` and not one was an assertion.
//
// spawn() uses `detached: true`, which makes each child a process-group leader
// with pgid === pid, so a negative pid signals the whole tree. SIGTERM first so
// Playwright can close its browsers, then SIGKILL anything still up.
function stop({ graceMs = 4000 } = {}) {
  const s = readState();
  const live = s.runs.filter((r) => alive(r.pid));
  let n = 0;
  for (const r of live) if (signal(r.pid, "SIGTERM")) n++;
  say(`sent SIGTERM to ${n} run group(s)`);
  if (!n) return;
  const deadline = Date.now() + graceMs;
  const spin = () => {
    const still = live.filter((r) => alive(r.pid));
    if (!still.length) return say("all stopped");
    if (Date.now() < deadline) return setTimeout(spin, 250);
    for (const r of still) { signal(r.pid, "SIGKILL"); say(`SIGKILL ${r.group} (pgid ${r.pid})`); }
  };
  setTimeout(spin, 250);
}

// RESTARTING A LIVE GROUP MUST KILL IT, not just forget it. The state entry for
// a superseded group is replaced (see the note in start()), and for a while that
// was ALL that happened: the old process kept running with nobody holding its
// pid, so it was invisible to --status/--wait/--stop, it kept its SwiftShader
// Chromiums on a box that was now also running the replacement, and it went on
// writing into the very log file the new run had just truncated — the exact
// fake-results failure the stop() note above describes, reached by a different
// door. Same SIGTERM-then-SIGKILL ladder as --stop, but synchronous, because it
// has to be finished before the replacement is spawned.
function supersede(groups, { graceMs = 4000 } = {}) {
  const doomed = readState().runs.filter((r) => alive(r.pid) && groups.includes(r.group));
  if (!doomed.length) return;
  for (const r of doomed) {
    const ok = signal(r.pid, "SIGTERM");
    say(ok
      ? `superseding test:${r.group} — SIGTERM to pgid ${r.pid}`
      : `WARNING: could not signal the running test:${r.group} (pid ${r.pid}); it may still be writing to ${path.relative(ROOT, r.log)}`);
  }
  const deadline = Date.now() + graceMs;
  let still = doomed.filter((r) => alive(r.pid));
  while (still.length && Date.now() < deadline) {
    sleepSync(250);
    still = still.filter((r) => alive(r.pid));
  }
  for (const r of still) {
    signal(r.pid, "SIGKILL");
    say(`superseding test:${r.group} — SIGKILL pgid ${r.pid}`);
  }
  if (still.length) sleepSync(500);   // let the kernel reap before the log is truncated
}

function spawnGroup(group, pkg) {
  const log = path.join(LOGDIR, `${group}.log`);
  const started = new Date().toISOString();
  const header =
    `[test-bg] START group=${group} at=${started} ${loadavgLine()} workers=${WORKERS}\n`;
  fs.writeFileSync(log, header);
  const fd = fs.openSync(log, "a");
  // --workers is a Playwright flag. A `node --test` group would take it as a
  // FILE PATH, so only the browser groups get it.
  const forward = /run-playwright/.test(pkg.scripts[`test:${group}`])
    ? ["--", `--workers=${WORKERS}`] : [];
  // detached + ignored stdin: the run must outlive this process and must
  // never block waiting for a terminal that is no longer attached.
  // The `= bg exit N` trailer is the terminal line for groups that print
  // neither the Playwright reporter's `= run …` nor a TAP summary — see
  // outcome() above for why a log without one reads as a dead run.
  const cmd =
    `start_s=$(date +%s); ` +
    `npm run --silent test:${group}${forward.length ? " " + forward.join(" ") : ""}; ` +
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
  // Persist whether this group actually owns Chromium. Consumers that guard
  // browser automation must not mistake Node-only groups (tooling-fast,
  // sweeps) for Playwright merely because test-bg launched them.
  return { group, pid: child.pid, log, started, browser: forward.length > 0 };
}

function start(groups, { force = false, parallel = false } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const unknown = groups.filter((g) => !pkg.scripts[`test:${g}`]);
  if (unknown.length) {
    console.error(`[test-bg] no such group: ${unknown.join(", ")}`);
    console.error(`[test-bg] available: ${Object.keys(pkg.scripts).filter((k) => k.startsWith("test:")).map((k) => k.slice(5)).join(" ")}`);
    process.exit(2);
  }

  // Default: one group at a time. --parallel raises the cap to cores/WORKERS.
  // --force removes the cap (legacy escape hatch).
  const maxConcurrent = force ? Infinity : (parallel ? PARALLEL_MAX : 1);

  // A busy box measures the machine, not the code (AGENTS.md §Verification 5):
  // refuse to start a browser group above loadavg 3 unless --force. Every false
  // red in tiny.log on 2026-09-01 was a start at loadavg > 3.
  const load1 = os.loadavg()[0];
  if (!force && load1 >= 3) {
    console.error(`[test-bg] REFUSED: 1-min loadavg ${load1.toFixed(2)} >= 3 — a timeout now would measure the box, not the code.`);
    console.error(`[test-bg] wait for it to settle (cat /proc/loadavg), or pass --force and do not trust a timeout from this run.`);
    process.exit(3);
  }

  // Count what is ALREADY on the CPU. An earlier batch still running is exactly
  // as expensive as one started now, and is the case most likely to be forgotten
  // — it does not appear on this command line.
  //
  // A group being RESTARTED is excluded because supersede() below kills it
  // before anything is spawned, so it is not on the CPU by the time the new run
  // is: counting it would refuse the ordinary "re-run the group I am already
  // running" on a box that has room. The cap check runs FIRST so that a refusal
  // never kills a live run and then declines to replace it.
  const running = readState().runs.filter((r) => alive(r.pid) && !groups.includes(r.group));

  if (!parallel && !force && groups.length > 1) {
    // Sequential multi-group start without --wait: launch ONLY the first, and
    // print the rest as the next commands. Agents should not silently fan out.
    say(`sequential mode (default): starting 1 of ${groups.length} — use --wait <groups> to chain, or --parallel to fan out`);
    const rest = groups.slice(1);
    groups = groups.slice(0, 1);
    say(`next: node tools/test-bg.mjs ${rest.join(" ")}`);
  }

  const total = groups.length + running.length;
  if (total > maxConcurrent) {
    console.error(`[test-bg] REFUSING: ${total} group(s) would run at once (${groups.length} asked for` +
      `${running.length ? `, ${running.length} already running: ${running.map((r) => r.group).join(", ")}` : ""}),` +
      ` but concurrent cap is ${maxConcurrent === Infinity ? "unlimited (--force)" : maxConcurrent}` +
      ` (${parallel ? `parallel, ${CORES} cores / ${WORKERS} workers` : "sequential default"}).`);
    console.error(`[test-bg] Run them one at a time (default), or:\n`);
    for (const g of groups) console.error(`    node tools/test-bg.mjs ${g}`);
    if (groups.length > 1) {
      console.error(`\n    node tools/test-bg.mjs --wait ${groups.join(" ")}   # sequential chain`);
      console.error(`    node tools/test-bg.mjs --parallel ${groups.join(" ")}  # concurrent (cap ${PARALLEL_MAX})`);
    }
    console.error(`\n(--force overrides; WORKERS=1 raises the parallel cap.)`);
    process.exit(3);
  }

  // Kill any live run of a group being restarted BEFORE its log is truncated
  // and its replacement spawned.
  supersede(groups);
  fs.mkdirSync(LOGDIR, { recursive: true });
  const mode = parallel ? "parallel" : "sequential";
  say(`spawning ${groups.length} group(s) mode=${mode} maxConcurrent=${maxConcurrent === Infinity ? "∞" : maxConcurrent} ${loadavgLine()}`);
  const runs = [];
  for (const group of groups) {
    runs.push(spawnGroup(group, pkg));
  }
  // MERGE WITH WHAT IS STILL RUNNING, don't clobber it. Starting a second batch
  // used to replace the whole list, which ORPHANED everything already in
  // flight: --status stopped listing it, --wait returned as soon as the new
  // batch finished, and --stop left it running. That is not a cosmetic bug —
  // an orphaned run keeps its workers on the CPU, so the next batch is
  // measured against a machine that is quietly oversubscribed, and its
  // timeouts read as test failures. Observed exactly that: `test-bg physics`
  // then `test-bg tiny` left physics alive and invisible.
  //
  // A group started again SUPERSEDES its old entry — same log file. Dropping
  // the entry is only SAFE because supersede() has already killed that process:
  // dropping it while it still ran was how a superseded run became invisible
  // and went on interleaving output into the log the new run truncated.
  const prior = readState().runs.filter((r) => alive(r.pid) && !groups.includes(r.group));
  if (prior.length) say(`still running from an earlier start: ${prior.map((r) => r.group).join(", ")}`);
  writeState({ runs: [...prior, ...runs], started: new Date().toISOString(), workers: WORKERS, mode });
  say(`tail one:   tail -f ${path.relative(ROOT, runs[0].log)}`);
  say(`tail all:   tail -f ${runs.map((r) => path.relative(ROOT, r.log)).join(" ")}`);
  say(`check:      node tools/test-bg.mjs --status`);
  say(`block:      node tools/test-bg.mjs --wait`);
}

/** Start each group, wait for it to finish, then start the next. */
async function waitChain(groups, { force = false } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const unknown = groups.filter((g) => !pkg.scripts[`test:${g}`]);
  if (unknown.length) {
    console.error(`[test-bg] no such group: ${unknown.join(", ")}`);
    process.exit(2);
  }
  say(`sequential --wait chain: ${groups.length} group(s) ${loadavgLine()}`);
  let allOk = true;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    say(`── chain ${i + 1}/${groups.length}: ${g}`);
    // Cap is 1 in sequential; force still allows starting when something else is live.
    start([g], { force, parallel: false });
    await waitForRunning();
    const o = outcome(readState().runs.find((r) => r.group === g) || { pid: -1, log: "" });
    say(`── chain ${i + 1}/${groups.length} ${g}: ${o}`);
    if (!/^passed/.test(o)) {
      allOk = false;
      if (!process.argv.includes("--keep-going")) {
        say(`stopping chain after failure (pass --keep-going to continue)`);
        break;
      }
    }
  }
  process.exitCode = allOk ? 0 : 1;
}

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const parallel = argv.includes("--parallel");
const groups = argv.filter((a) => !a.startsWith("--"));

if (argv.includes("--status")) status();
else if (argv.includes("--stop")) stop();
else if (argv.includes("--tail")) {
  const g = argv[argv.indexOf("--tail") + 1];
  const r = readState().runs.find((x) => x.group === g);
  console.log(r ? `tail -f ${path.relative(ROOT, r.log)}` : `no run recorded for group "${g}"`);
} else if (argv.includes("--wait")) {
  if (groups.length) await waitChain(groups, { force });
  else await waitForRunning();
} else if (!groups.length) {
  console.error("usage: node tools/test-bg.mjs <group> [group...] [--parallel] [--force]");
  console.error("       node tools/test-bg.mjs --wait [group...] [--keep-going] [--force]");
  console.error("       node tools/test-bg.mjs --status | --stop | --tail <group>");
  process.exit(2);
} else start(groups, { force, parallel });
