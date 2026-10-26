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

/* ---- Per-stage gate receipts (W1, 2026-10-26) ----
 * `deploy.mjs --gate-only` is ~33 min median; a dropped task, a reclaimed exec transport or one red stage used to
 * mean starting over. Each stage now records { tree, head, verdict, seconds, at } under its name in
 * artifacts/logs/gate-receipts.json, keyed by the WORK-TREE id (tools/lib/work-tree-id.mjs: the content the stage
 * measured, dirty edits included), and `--resume` skips a stage whose receipt passed on the SAME tree. A different
 * tree refuses: a pass on other content proves nothing about this one. */
export const GATE_RECEIPTS = path.join("artifacts", "logs", "gate-receipts.json");
/** Where `--detach` records its child (pid, logs, tree) for --status and for a reader arriving cold. */
export const DETACH_RECEIPT = path.join("artifacts", "logs", "deploy-detach.json");
/** The detached gate's stdout/stderr (the status markers stay in the --log file). */
export const DETACH_LOG = path.join("artifacts", "logs", "deploy-gate.log");

export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, file);   // atomic: a reader never sees half a receipt
}

/** Can `--resume` reuse `doc` on work tree `tree`? `{ ok, why }`; `doc` null = nothing to resume (ok, run all). */
export function resumeVerdict(doc, tree) {
  if (!tree) return { ok: false, why: "cannot compute the work-tree id (git failed), so no receipt can be matched — run without --resume" };
  if (!doc) return { ok: true, why: "no receipts yet — every stage runs" };
  if (doc.tree !== tree) {
    return { ok: false, why: `the work tree moved since the receipts were written (receipts: tree ${String(doc.tree).slice(0, 12)} at head ${String(doc.head || "?").slice(0, 7)}; now: tree ${tree.slice(0, 12)}). ` +
      "A stage that passed there says nothing about this tree — run without --resume for a fresh gate" };
  }
  const passed = Object.entries(doc.stages || {}).filter(([, s]) => s.verdict === "passed" && s.tree === tree).map(([k]) => k);
  return { ok: true, why: `${passed.length} stage(s) already passed on this tree: ${passed.join(", ") || "none"}` };
}

/** True when `--resume` may skip `name`. */
export function stagePassed(doc, name, tree) {
  const s = doc && doc.stages && doc.stages[name];
  return !!(s && s.verdict === "passed" && tree && s.tree === tree);
}
