// @doc Bounded deploy child supervision, including descendants and cooperative shutdown.
// https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
// spawnSync's timeout waits for the child to exit after signalling; use spawn
// so escalation and the shutdown ceiling remain under the supervisor's control.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import { processTree, alive } from "../lib/process-tree.mjs";

// Pin a PID to its start time before sending any signal. A dead descendant's
// PID can be reused while the cooperative grace period is running.
function identity(pid) {
  try {
    if (process.platform === "linux") {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
    }
    return execFileSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8", timeout: 1000 }).trim() || null;
  } catch { return null; }
}

export async function superviseDeployChild(cmd, args, {
  cwd, env, stdio, timeoutMs, graceMs = 1000, cleanupMs = 5000,
} = {}) {
  let child, timer, stopping, resolveStop, interrupted = null, launchError = null;
  const stopped = new Promise(resolve => { resolveStop = resolve; });
  const owned = new Map();
  const remember = () => {
    for (const pid of processTree(child?.pid)) {
      const id = identity(pid);
      if (id && !owned.has(pid)) owned.set(pid, id);
    }
  };
  const survivors = () => [...owned].filter(([pid, id]) => identity(pid) === id && alive(pid)).map(([pid]) => pid);
  const signalOwned = signal => {
    // The tree snapshot covers descendants which started their own groups.
    for (const pid of survivors()) { try { process.kill(pid, signal); } catch { /* exited */ } }
  };
  const stop = reason => {
    if (stopping) return stopping;
    interrupted = reason;
    remember(); // snapshot BEFORE the parent can exit and reparent its children
    stopping = (async () => {
      signalOwned("SIGTERM");
      const started = Date.now();
      while (survivors().length && Date.now() - started < graceMs) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      // A cooperative handler can launch cleanup children during its grace.
      // Include those while the original parent is still reachable.
      remember();
      signalOwned("SIGKILL");
      const killed = Date.now();
      while (survivors().length && Date.now() - killed < cleanupMs) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return survivors();
    })();
    stopping.then(pids => resolveStop({ status: null, signal: reason === "ETIMEDOUT" ? "SIGKILL" : reason, survivors: pids }));
    return stopping;
  };
  const onInt = () => { void stop("SIGINT"); }, onTerm = () => { void stop("SIGTERM"); };
  process.on("SIGINT", onInt); process.on("SIGTERM", onTerm);
  try {
    child = spawn(cmd, args, { cwd, env, stdio, detached: process.platform !== "win32" });
    const exit = new Promise(resolve => {
      child.once("error", error => { launchError = error; });
      child.once("close", (status, signal) => resolve({ status, signal }));
    });
    timer = setTimeout(() => { void stop("ETIMEDOUT"); }, timeoutMs);
    // Cleanup has its own ceiling: never await a SIGTERM-resistant child first.
    const result = await Promise.race([exit, stopped]);
    if (stopping) result.survivors = await stopping;
    if (interrupted) {
      result.error = Object.assign(new Error(interrupted === "ETIMEDOUT" ? "deploy child timed out" : `deploy interrupted by ${interrupted}`), { code: interrupted });
    } else if (launchError) result.error = launchError;
    if (result.survivors?.length) result.error = Object.assign(new Error(`child cleanup failed; surviving PIDs: ${result.survivors.join(", ")}`), { code: "ECLEANUP" });
    return result;
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", onInt); process.off("SIGTERM", onTerm);
  }
}
