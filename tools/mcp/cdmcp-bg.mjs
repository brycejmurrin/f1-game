#!/usr/bin/env node
/**
 * @doc Detach/status/wait/stop twin of `test-bg.mjs` for `cdmcp-measure.py`: `cdmcp-bg.mjs boot --port 3462`.
 * @skill mcp-probe
 * cdmcp-bg.mjs — start chrome-devtools MCP measurements in the BACKGROUND.
 *
 * Twin of tools/ci/test-bg.mjs for Chromium MCP probes. Detaches
 * tools/mcp/cdmcp-measure.py, leaves a log to tail, and exposes --status/--wait/
 * --stop. Anchor watchers on the terminal line:
 *
 *   = run passed|failed|timedout|interrupted
 *
 * Never on heartbeat-like text (there is none — but do not match "failed" inside
 * gate lines alone). Never run while a Playwright group is in flight.
 *
 *   APEX_PORT=3462 node tools/mcp/cdmcp-bg.mjs ui
 *   node tools/mcp/cdmcp-bg.mjs ui --port 3462
 *   node tools/mcp/cdmcp-bg.mjs full --url http://127.0.0.1:3462/?v=1138
 *
 * Port defaults: --port > APEX_PORT/PORT env > 3456. Each worktree keeps its
 * own artifacts/logs/; only the HTTP port must differ across concurrent trees.
 *
 *   node tools/mcp/cdmcp-bg.mjs --status
 *   node tools/mcp/cdmcp-bg.mjs --wait
 *   node tools/mcp/cdmcp-bg.mjs --stop
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOGDIR = path.join(ROOT, "artifacts/logs");
const LOG = path.join(LOGDIR, "cdmcp-measure.log");
const JSON_OUT = path.join(LOGDIR, "cdmcp-measure.json");
const STATE = path.join(LOGDIR, "cdmcp-bg.json");
const MEASURE = path.join(ROOT, "tools/mcp/cdmcp-measure.py");

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return null; }
};

function outcome() {
  let text = "";
  try { text = fs.readFileSync(LOG, "utf8"); } catch { /* */ }
  const m = [...text.matchAll(/= run (passed|failed|timedout|interrupted)\b[^\n]*/g)].pop();
  if (m) return m[0].replace(/^= run /, "");
  const st = readState();
  if (st?.pid && alive(st.pid)) return "running";
  return st?.pid ? "died before finishing" : "idle";
}

function status() {
  const st = readState();
  const o = outcome();
  if (!st) {
    console.log("cdmcp-measure   (no run recorded)");
    return;
  }
  console.log(`cdmcp-measure   pid=${st.pid}  ${o.padEnd(28)}  ${st.log || "artifacts/logs/cdmcp-measure.log"}`);
  if (fs.existsSync(JSON_OUT)) console.log(`json:           ${path.relative(ROOT, JSON_OUT)}`);
}

async function wait() {
  const st = readState();
  if (!st?.pid) {
    console.log("nothing to wait for");
    return;
  }
  process.stdout.write(`waiting on pid=${st.pid} …`);
  while (alive(st.pid)) {
    await new Promise((r) => setTimeout(r, 2000));
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  status();
  // Exit non-zero if last run failed
  const o = outcome();
  if (/^failed|^timedout|^interrupted|died/.test(o)) process.exit(1);
}

function stop() {
  const st = readState();
  if (!st?.pid || !alive(st.pid)) {
    console.log("nothing running");
    return;
  }
  try { process.kill(-st.pid, "SIGTERM"); } catch {
    try { process.kill(st.pid, "SIGTERM"); } catch { /* gone */ }
  }
  console.log(`sent SIGTERM to pid=${st.pid}`);
}

function start(argv) {
  fs.mkdirSync(LOGDIR, { recursive: true });
  const prior = readState();
  if (prior?.pid && alive(prior.pid)) {
    console.error(`cdmcp-measure already running (pid=${prior.pid}). --stop first, or --force.`);
    if (!argv.includes("--force")) process.exit(2);
    try { process.kill(-prior.pid, "SIGTERM"); } catch { /* */ }
  }

  const args = argv.filter((a) => a !== "--force");
  // Default profile
  if (!args.length || args[0].startsWith("--")) args.unshift("boot");

  const fd = fs.openSync(LOG, "w");
  const child = spawn("python3", [MEASURE, ...args], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  fs.closeSync(fd);

  const state = {
    pid: child.pid,
    log: path.relative(ROOT, LOG),
    json: path.relative(ROOT, JSON_OUT),
    started: new Date().toISOString(),
    args,
  };
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`> cdmcp-measure   pid=${child.pid}  log=${state.log}`);
  console.log(`\ntail:    tail -f ${state.log}`);
  console.log(`json:    cat ${state.json}`);
  console.log("check:   node tools/mcp/cdmcp-bg.mjs --status");
  console.log("block:   node tools/mcp/cdmcp-bg.mjs --wait");
  console.log(
    `watch:   until grep -qE '= run (passed|failed|timedout|interrupted)' ${state.log}; ` +
      `do sleep 15; done; grep -E '= run ' ${state.log} | tail -1`
  );
}

const argv = process.argv.slice(2);
if (argv.includes("--status")) status();
else if (argv.includes("--wait")) await wait();
else if (argv.includes("--stop")) stop();
else if (!argv.length) {
  console.error(
    "usage: node tools/mcp/cdmcp-bg.mjs <boot|ui|full> [--port N] [--url URL] [--force]\n" +
      "       node tools/mcp/cdmcp-bg.mjs --status | --wait | --stop"
  );
  process.exit(2);
} else start(argv);
