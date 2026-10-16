#!/usr/bin/env node
// @doc The generic background waiter: block until the 1-min load drops, a file is non-empty, or a pid is gone (exit 0 / 124).
//
// Replaces hand-rolled `until pgrep …; sleep` / `timeout N bash -c 'until awk … /proc/loadavg'` loops, which
// were killed with their worker and whose exit codes were misread (issue #2386). Run it as ONE background
// task (AGENTS.md rule 4), never a foreground wait. Conditions combine with AND; polling is in-process.
//
//   node tools/ci/wait-for.mjs --load-below 2.8 --timeout 40
//   node tools/ci/wait-for.mjs --file-nonempty artifacts/logs/x.log --timeout 10
//   node tools/ci/wait-for.mjs --pid-gone 12345 --timeout 30
//
// Exit 0 every condition held · 124 timeout (nothing is killed) · 1 usage error.
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { pidAlive } from "../lib/deploy-status.mjs";

export const FLAGS = ["--load-below", "--file-nonempty", "--pid-gone", "--timeout", "--poll", "--help"];
export const USAGE = `usage: node tools/ci/wait-for.mjs <condition>... [--timeout <min>] [--poll <sec>]
  --load-below <n>        1-min loadavg < n
  --file-nonempty <path>  file exists with size > 0
  --pid-gone <pid>        process <pid> no longer exists
  conditions combine with AND; exit 0 held / 124 timeout / 1 usage. Run it as one background task.`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const conds = [];
  let timeoutMin = 30, pollSec = 3;
  const num = (name, v, { positive = true } = {}) => {
    const n = Number(v);
    if (v === undefined || v.startsWith?.("-") || !Number.isFinite(n) || (positive && n <= 0)) throw new UsageError(`${name} needs a positive number, got ${JSON.stringify(v)}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    let [name, ...rest] = argv[i].split("=");
    let val = rest.length ? rest.join("=") : undefined;
    if (!name.startsWith("--")) throw new UsageError(`unexpected argument ${argv[i]}`);
    if (!FLAGS.includes(name)) throw new UsageError(`unknown flag ${name}\n  accepts: ${FLAGS.join(" ")}`);
    if (name === "--help") return { help: true };
    if (val === undefined) val = argv[++i];
    if (name === "--timeout") timeoutMin = num(name, val);
    else if (name === "--poll") pollSec = num(name, val);
    else if (name === "--load-below") conds.push({ kind: "load", max: num(name, val) });
    else if (name === "--pid-gone") {
      const pid = num(name, val);
      if (!Number.isInteger(pid) || pid > 2147483647) throw new UsageError(`${name} needs a positive 32-bit integer PID, got ${JSON.stringify(val)}`);
      conds.push({ kind: "pid", pid });
    }
    else {
      if (!val || val.startsWith("-")) throw new UsageError(`${name} needs a path`);
      conds.push({ kind: "file", path: val });
    }
  }
  if (!conds.length) throw new UsageError("give at least one condition");
  return { conds, timeoutMin, pollSec };
}

export const load1 = () => {
  try { return Number(fs.readFileSync("/proc/loadavg", "utf8").split(" ")[0]); } catch { return os.loadavg()[0]; }
};

/** One evaluation: `{ ok, pending[] }` — pending names what still blocks. */
export function check(conds, deps = {}) {
  const { load = load1, alive = pidAlive, size = (p) => { try { return fs.statSync(p).size; } catch { return 0; } } } = deps;
  const pending = [];
  for (const c of conds) {
    if (c.kind === "load") { const l = load(); if (!(l < c.max)) pending.push(`load ${l.toFixed(2)} >= ${c.max}`); }
    else if (c.kind === "pid") { if (alive(c.pid)) pending.push(`pid ${c.pid} alive`); }
    else if (!(size(c.path) > 0)) pending.push(`${c.path} empty or missing`);
  }
  return { ok: !pending.length, pending };
}

export async function waitFor(conds, { timeoutMin, pollSec = 3, deps, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now } = {}) {
  const deadline = now() + timeoutMin * 60_000;
  for (;;) {
    const r = check(conds, deps);
    if (r.ok) return { code: 0, text: "= wait held" };
    if (now() >= deadline) return { code: 124, text: `= wait timeout after ${timeoutMin} min — still: ${r.pending.join("; ")}` };
    // A long poll must not extend the user's deadline. Node also turns timer
    // delays above 2^31-1 into 1 ms, which would otherwise busy-poll.
    await sleep(Math.min(pollSec * 1000, Math.max(0, deadline - now()), 2147483647));
  }
}

async function main() {
  let a;
  try { a = parseArgs(process.argv.slice(2)); }
  catch (e) { if (!(e instanceof UsageError)) throw e; console.error(`wait-for: ${e.message}\n${USAGE}`); return 1; }
  if (a.help) { console.log(USAGE); return 0; }
  const r = await waitFor(a.conds, a);
  console.log(r.text);
  return r.code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(await main());
