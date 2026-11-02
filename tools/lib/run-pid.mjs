// run-pid.mjs — a sanctioned stop for a long foreground/background CLI (tooling-fast, sync-pr).
// @doc Pidfile + tree kill behind `tooling-fast.mjs --stop` and `sync-pr.mjs --stop`; no pgrep -f, no hand-typed PID.
//
// A run registers `artifacts/run/<name>.json` {pid, started, cmd}. `--stop` reads it, checks the pid still belongs
// to that command (/proc cmdline: a recycled pid is never signalled), SIGTERMs the whole descendant tree leaf-first,
// SIGKILLs what survives a grace period and removes the file. A second registration while the first is alive is
// refused, which doubles as the per-name lock (sync-pr uses it per branch).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RUN_DIR = path.join(ROOT, "artifacts", "run");
const safe = (n) => String(n).replace(/[^\w.-]/g, "-");
export const runFile = (name, dir = RUN_DIR) => path.join(dir, `${safe(name)}.json`);

const realDeps = {
  alive: (pid) => { try { if (/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8"))) return false; } catch { /* no /proc */ } try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } },
  cmdline: (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " "); } catch { return ""; } },
  table: () => {
    const r = spawnSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" });
    return String(r.stdout || "").split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
  },
  kill: (pid, sig) => { try { process.kill(pid, sig); } catch { /* gone */ } },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** pid + every descendant, deepest first. Pure over a [pid, ppid][] table. */
export function descendants(table, root) {
  const kids = new Map();
  for (const [pid, ppid] of table) (kids.get(ppid) || kids.set(ppid, []).get(ppid)).push(pid);
  const order = [];
  const walk = (p) => { for (const c of kids.get(p) || []) walk(c); order.push(p); };
  walk(root);
  return order;
}

/** Claim `name` for this process. { ok:false, pid } when a live run of the same command already holds it. */
export function register(name, { dir = RUN_DIR, pid = process.pid, cmd = process.argv.slice(1).join(" "), deps = {} } = {}) {
  const d = { ...realDeps, ...deps };
  const file = runFile(name, dir);
  try {
    const cur = JSON.parse(fs.readFileSync(file, "utf8"));
    if (cur.pid !== pid && d.alive(cur.pid) && d.cmdline(cur.pid).includes(path.basename(String(cur.cmd).split(" ")[0] || "")) ) return { ok: false, pid: cur.pid, cmd: cur.cmd };
  } catch { /* none or unreadable: take it */ }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ pid, started: new Date().toISOString(), cmd }));
  return { ok: true, file };
}
export function release(name, { dir = RUN_DIR, pid = process.pid } = {}) {
  const file = runFile(name, dir);
  try { if (JSON.parse(fs.readFileSync(file, "utf8")).pid === pid) fs.unlinkSync(file); } catch { /* already gone */ }
}

/** Stop the registered run. Returns { state: "none"|"stale"|"stopped", pid?, killed? }. */
export async function stop(name, { dir = RUN_DIR, graceMs = 3000, deps = {} } = {}) {
  const d = { ...realDeps, ...deps };
  const file = runFile(name, dir);
  let rec;
  try { rec = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { state: "none" }; }
  const script = path.basename(String(rec.cmd).split(" ")[0] || "");
  if (!d.alive(rec.pid) || !d.cmdline(rec.pid).includes(script)) { try { fs.unlinkSync(file); } catch { /* gone */ } return { state: "stale", pid: rec.pid }; }
  const table = d.table(), tree = descendants(table, rec.pid);
  const pending = new Set(tree), signalled = new Set();
  const children = new Map(tree.map((p) => [p, []]));
  for (const [pid, parent] of table) if (pending.has(pid) && children.has(parent)) children.get(parent).push(pid);
  const deadline = Date.now() + graceMs;
  // Let each parent reap its children before terminating it. Sending the whole
  // tree SIGTERM in one tick leaves zombies with container PID 1 on hosts
  // without an init reaper. All waves share the original grace deadline.
  while (Date.now() < deadline && pending.size) {
    for (const p of pending) if (!d.alive(p)) pending.delete(p);
    for (const p of pending) if (!signalled.has(p) && !children.get(p).some((c) => pending.has(c))) {
      d.kill(p, "SIGTERM"); signalled.add(p);
    }
    if (pending.size) await d.sleep(20);
  }
  // Zero grace, or an unresponsive descendant: still signal every registered
  // ancestor before escalating, without extending the caller's grace period.
  for (const p of tree) if (!signalled.has(p) && d.alive(p)) d.kill(p, "SIGTERM");
  const left = tree.filter((p) => d.alive(p));
  for (const p of left) d.kill(p, "SIGKILL");
  try { fs.unlinkSync(file); } catch { /* gone */ }
  return { state: "stopped", pid: rec.pid, killed: tree.length, forced: left.length };
}
