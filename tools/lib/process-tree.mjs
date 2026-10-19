// @doc Process-tree shutdown shared by Apex jobs and bounded diagnostic supervisors.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

/** A process and every descendant, read BEFORE anything is killed: Playwright
 *  starts Chromium in its own process group, so killing the CLI's group left
 *  the browser running ~7 s after the lock read free (2026-10-03 re-test), and
 *  once its parent exits a browser is re-parented to init and unreachable. */
export function processTree(rootPid) {
  if (!rootPid) return [];
  let rows;
  try { rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8", timeout: 5000 }); } catch { return [rootPid]; }
  const kids = new Map();
  for (const line of rows.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid && ppid) { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push(pid); }
  }
  const out = [rootPid];
  for (let i = 0; i < out.length; i++) for (const k of kids.get(out[i]) || []) out.push(k);
  return out;
}
export const alive = (pid) => {
  try { return !/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8")); }   // a zombie is gone
  catch { try { process.kill(pid, 0); return true; } catch { return false; } }
};
/** SIGTERM every pid (and the root's group), SIGKILL survivors after graceMs,
 *  resolve once all are gone or maxMs passes. Release a lock only after this. */
export async function killTreeAndWait(pids, { graceMs = 3000, maxMs = 15000 } = {}) {
  const sig = (s) => { for (const p of pids) { try { process.kill(p, s); } catch { /* gone */ } } try { process.kill(-pids[0], s); } catch { /* not a leader */ } };
  sig("SIGTERM");
  const t0 = Date.now();
  let killed = false;
  while (pids.some(alive) && Date.now() - t0 < maxMs) {
    if (!killed && Date.now() - t0 > graceMs) { sig("SIGKILL"); killed = true; }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { pids: pids.length, survivors: pids.filter(alive) };
}
