// @doc Source-bound evidence for ordinary local verification; never a landing permission.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { workTreeId } from "../lib/work-tree-id.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const treeId = (value) => typeof value === "string" && /^[a-f0-9]{40,64}$/.test(value);
export const verificationPath = (logPath) => `${logPath}.receipt.json`;
export const verificationMarker = (receipt) => `[tooling-fast] = verification ${receipt.id}`;

/** The whole committable tree includes untracked inputs and ignores artifacts.
 * A tree match survives committing the exact dirty bytes that were tested. */
export function verificationIdentity(root) {
  try {
    const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    return { root: fs.realpathSync(root), head: r.status === 0 ? r.stdout.trim() : null, tree: workTreeId(root) };
  } catch { return { root: null, head: null, tree: null }; }
}

// Selected suites may be ignored by git (for example artifacts/*.test.mjs).
// Read resolved file bytes, following symlinks, separately from the tree identity.
function inputHashes(files, source) {
  if (!source?.root || !Array.isArray(files)) return null;
  return files.map(file => {
    try { return { file, sha256: digest(fs.readFileSync(path.resolve(source.root, file))) }; }
    catch { return { file, sha256: null }; }
  });
}
const validHashes = (hashes, files) => Array.isArray(hashes) && hashes.length === files.length &&
  hashes.every((entry, i) => entry?.file === files[i] &&
    (entry.sha256 === null || typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256)));
const sameHashes = (a, b) => a.every((entry, i) => entry.sha256 === b[i].sha256);

function save(logPath, receipt) {
  const file = verificationPath(logPath), temp = `${file}.${receipt.id}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(receipt, null, 2) + "\n");
    fs.renameSync(temp, file);
    return receipt;
  } catch {
    try { fs.rmSync(temp, { force: true }); } catch { /* unavailable evidence */ }
    return null;
  }
}

export function beginVerification({ logPath, files, source, at = new Date().toISOString() }) {
  return save(logPath, { schema: 1, id: randomUUID(), runner: "tooling-fast", pid: process.pid,
    startedAt: at, state: "running", source, files: [...files], inputHashes: inputHashes(files, source) });
}

export function finishVerification(receipt, { logPath, source, ok, notStarted = 0, at = new Date().toISOString() }) {
  if (!receipt) return null;
  try {
    if (JSON.parse(fs.readFileSync(verificationPath(logPath), "utf8")).id !== receipt.id) return null;
    const log = fs.readFileSync(logPath);
    if (!log.toString("utf8").split("\n").includes(verificationMarker(receipt))) return null;
    return save(logPath, { ...receipt, finishedAt: at, state: "completed", verdict: ok ? "passed" : "failed",
      notStarted, endSource: source, endInputHashes: inputHashes(receipt.files, source), logHash: digest(log) });
  } catch { return null; }
}

/** Historical verdict and source applicability are separate observations. */
export function readVerification(logPath, current) {
  let r;
  try { r = JSON.parse(fs.readFileSync(verificationPath(logPath), "utf8")); }
  catch { return { status: "unknown", reason: "no readable source receipt" }; }
  if (r.schema !== 1 || r.runner !== "tooling-fast" || !Array.isArray(r.files)
    || !r.files.length || !r.files.every((f) => typeof f === "string") || !treeId(r.source?.tree)) {
    return { status: "unknown", reason: "unsupported or incomplete source receipt" };
  }
  const evidence = { id: r.id, source: r.source, files: r.files, verdict: r.verdict || null };
  if (r.state !== "completed") return { ...evidence, status: "unknown", reason: "run has no completed receipt" };
  if (!["passed", "failed"].includes(r.verdict) || !treeId(r.endSource?.tree)) {
    return { ...evidence, status: "unknown", reason: "missing terminal evidence" };
  }
  if (r.source.tree !== r.endSource.tree || r.source.root !== r.endSource.root) {
    return { ...evidence, status: "stale", reason: "source changed during verification" };
  }
  try {
    if (r.logHash !== digest(fs.readFileSync(logPath))) return { ...evidence, status: "stale", reason: "log differs from completed run" };
  } catch { return { ...evidence, status: "unknown", reason: "log unavailable" }; }
  if (!treeId(current?.tree) || !current?.root) return { ...evidence, status: "unknown", reason: "current source identity unavailable" };
  if (current.root !== r.source.root || current.tree !== r.source.tree) {
    return { ...evidence, status: "stale", reason: "current checkout or tree differs" };
  }
  // Schema-1 historical receipts remain readable but cannot prove selected inputs.
  if (!validHashes(r.inputHashes, r.files) || !validHashes(r.endInputHashes, r.files))
    return { ...evidence, status: "unknown", reason: "selected input snapshots unavailable" };
  if (!sameHashes(r.inputHashes, r.endInputHashes))
    return { ...evidence, status: "stale", reason: "selected input changed during verification" };
  if (r.inputHashes.some(entry => entry.sha256 === null))
    return { ...evidence, status: "unknown", reason: "selected input bytes unavailable during verification" };
  const now = inputHashes(r.files, current);
  if (!validHashes(now, r.files)) return { ...evidence, status: "unknown", reason: "current selected input snapshots unavailable" };
  if (!sameHashes(r.inputHashes, now))
    return { ...evidence, status: "stale", reason: "current selected input differs or is unavailable" };
  return { ...evidence, status: "current", reason: "same committable tree and selected input bytes; only the listed suites were run" };
}
