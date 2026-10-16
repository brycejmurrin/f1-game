// @doc deploy.mjs verdict markers (`= deploy start/done` in artifacts/logs/deploy.log) and the reader for --status/--wait.
//
// A deploy run is 2-15 min and agents hand-rolled `until pgrep -f 'ci/deploy\.mj[s]'` waiters whose exit
// code they then misread (docs/notes/TRANSCRIPT-MINING-2026-10-16.md §5, issue #2386). The run now
// stamps its own start and end, so the verdict is a line, not a process-table guess:
//   = deploy start pid=<n> mode=<flags> at=<iso>
//   = deploy done exit=<n> at=<iso>
// Exit codes mirror `test-bg.mjs --wait`: 0 pushed/passed, 1 failed (or died with no verdict), 124 still running.
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_LOG = path.join("artifacts", "logs", "deploy.log");

export const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }
};

export function stamp(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `= deploy ${line} at=${new Date().toISOString()}\n`);
}

/** Read the final marker. `{ state: "none"|"running"|"done"|"died", exit, pid, mode }` and the exit code a caller should use. */
export function readStatus(file, alive = pidAlive) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { /* no log yet */ }
  const marks = [...text.matchAll(/^= deploy (start|done) (.*)$/gm)];
  const last = marks[marks.length - 1];
  if (!last) return { state: "none", code: 1, text: `no deploy verdict in ${file}` };
  const kv = Object.fromEntries([...last[2].matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1], m[2]]));
  if (last[1] === "done") {
    const exit = Number(kv.exit);
    return { state: "done", exit, code: exit === 0 ? 0 : 1, text: `deploy ${exit === 0 ? "passed" : "failed"} (exit ${exit}) ${kv.at || ""}`.trim() };
  }
  const pid = Number(kv.pid);
  if (pid && alive(pid)) return { state: "running", pid, mode: kv.mode, code: 124, text: `deploy running (pid ${pid}, ${kv.mode || "?"}) since ${kv.at || "?"}` };
  return { state: "died", pid, code: 1, text: `deploy pid ${pid} is gone with no verdict line — it was killed or its container restarted` };
}

/** Block until the run leaves "running" or `timeoutMin` passes. Resolves to a readStatus result (code 124 on timeout). */
export async function waitStatus(file, { timeoutMin = 0, pollMs = 3000, alive = pidAlive, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now } = {}) {
  const deadline = timeoutMin > 0 ? now() + timeoutMin * 60_000 : Infinity;
  for (;;) {
    const s = readStatus(file, alive);
    if (s.state !== "running") return s;
    if (now() >= deadline) return { ...s, code: 124, text: `WAIT TIMEOUT after ${timeoutMin} min — ${s.text} (left alive)` };
    await sleep(pollMs);
  }
}
