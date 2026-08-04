#!/usr/bin/env node
/**
 * test-bg.mjs — start test groups in the BACKGROUND and hand back a log to tail.
 *
 * A foreground Playwright run on this software-rendered suite blocks for
 * minutes and prints nothing an editor can act on. `tools/test-shards.sh`
 * already runs groups concurrently, but it WAITS — so the terminal is still
 * gone. This detaches: it returns as soon as the children are up, prints the
 * tail commands, and leaves a status file per group.
 *
 *   node tools/test-bg.mjs smoke api collision   # start three groups
 *   node tools/test-bg.mjs --status              # what is running / how it ended
 *   node tools/test-bg.mjs --tail smoke          # print the tail command
 *   node tools/test-bg.mjs --wait                # block until all groups finish
 *   node tools/test-bg.mjs --stop                # kill everything still running
 *
 * Each group gets its own free port (via tools/run-playwright.mjs), its own
 * artifacts/report-<port>/ and its own artifacts/logs/<group>.log — so groups
 * cannot tear down each other's web server, and a stall is attributable to one
 * log rather than to "the run".
 *
 * Sizing: every worker is a Chromium + SwiftShader process, so total browsers
 * is groups × workers. WORKERS defaults to 2; on a small box 2-3 groups is the
 * sweet spot and more just thrashes.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGDIR = path.join(ROOT, "artifacts/logs");
const STATEFILE = path.join(LOGDIR, "test-bg.json");
const WORKERS = process.env.WORKERS || "2";

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATEFILE, "utf8")); } catch (_) { return { runs: [] }; }
};
const writeState = (s) => fs.writeFileSync(STATEFILE, JSON.stringify(s, null, 2));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };

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

  const fails = [...text.matchAll(/^\[[\d:]+\] x FAIL/gm)].length;
  return fails ? `died after ${fails} failure(s)` : "died before finishing";
}

function status() {
  const s = readState();
  if (!s.runs.length) return console.log("no background runs recorded");
  for (const r of s.runs) {
    console.log(`${r.group.padEnd(16)} pid=${String(r.pid).padEnd(8)} ${outcome(r).padEnd(34)} ${path.relative(ROOT, r.log)}`);
  }
}

async function wait() {
  const s = readState();
  const running = () => s.runs.filter((r) => alive(r.pid));
  while (running().length) {
    const line = `waiting on ${running().map((r) => r.group).join(", ")}`;
    process.stderr.write("\r" + line.padEnd(78).slice(0, 78));
    await new Promise((r) => setTimeout(r, 3000));
  }
  process.stderr.write("\r" + " ".repeat(78) + "\r");
  status();
  const bad = s.runs.filter((r) => !/^passed/.test(outcome(r)));
  process.exitCode = bad.length ? 1 : 0;
}

function stop() {
  const s = readState();
  let n = 0;
  for (const r of s.runs) {
    if (!alive(r.pid)) continue;
    try { process.kill(r.pid, "SIGTERM"); n++; } catch (_) {}
  }
  console.log(`sent SIGTERM to ${n} run(s)`);
}

function start(groups) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const unknown = groups.filter((g) => !pkg.scripts[`test:${g}`]);
  if (unknown.length) {
    console.error(`no such group: ${unknown.join(", ")}`);
    console.error(`available: ${Object.keys(pkg.scripts).filter((k) => k.startsWith("test:")).map((k) => k.slice(5)).join(" ")}`);
    process.exit(2);
  }
  fs.mkdirSync(LOGDIR, { recursive: true });
  const runs = [];
  for (const group of groups) {
    const log = path.join(LOGDIR, `${group}.log`);
    const fd = fs.openSync(log, "w");
    // --workers is a Playwright flag. A `node --test` group would take it as a
    // FILE PATH, so only the browser groups get it.
    const forward = /run-playwright/.test(pkg.scripts[`test:${group}`])
      ? ["--", `--workers=${WORKERS}`] : [];
    // detached + ignored stdin: the run must outlive this process and must
    // never block waiting for a terminal that is no longer attached.
    const child = spawn("npm", ["run", "--silent", `test:${group}`, ...forward], {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, APEX_HEARTBEAT: process.env.APEX_HEARTBEAT || "30" },
    });
    child.unref();
    fs.closeSync(fd);
    runs.push({ group, pid: child.pid, log, started: new Date().toISOString() });
    console.log(`> test:${group.padEnd(14)} pid=${child.pid}  log=${path.relative(ROOT, log)}`);
  }
  writeState({ runs, started: new Date().toISOString(), workers: WORKERS });
  console.log(`\ntail one:   tail -f ${path.relative(ROOT, runs[0].log)}`);
  console.log(`tail all:   tail -f ${runs.map((r) => path.relative(ROOT, r.log)).join(" ")}`);
  console.log(`check:      node tools/test-bg.mjs --status`);
  console.log(`block:      node tools/test-bg.mjs --wait`);
}

const argv = process.argv.slice(2);
if (argv.includes("--status")) status();
else if (argv.includes("--wait")) await wait();
else if (argv.includes("--stop")) stop();
else if (argv.includes("--tail")) {
  const g = argv[argv.indexOf("--tail") + 1];
  const r = readState().runs.find((x) => x.group === g);
  console.log(r ? `tail -f ${path.relative(ROOT, r.log)}` : `no run recorded for group "${g}"`);
} else if (!argv.length) {
  console.error("usage: node tools/test-bg.mjs <group> [group...]   |   --status | --wait | --stop | --tail <group>");
  process.exit(2);
} else start(argv.filter((a) => !a.startsWith("--")));
