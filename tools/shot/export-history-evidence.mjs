// @doc Export selected committed evidence files, preserving Git blob identities without executing the old checkout.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export function validateHistorySelection(sha, paths) {
  if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new Error("source_commit must be a full commit SHA");
  if (!Array.isArray(paths) || !paths.length || paths.length > 128) throw new Error("source_paths must contain 1–128 paths");
  for (const p of paths) {
    if (typeof p !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(p) || p.split("/").some((part) => !part || [".", "..", ".git", "node_modules"].includes(part))) throw new Error("unsafe historical path");
    if (!/^(artifacts|scratch|gallery|shots|qa|docs)(\/|$)/.test(p)) throw new Error("select evidence paths, not runtime/source directories");
  }
  return [...new Set(paths)];
}

export function exportHistoryEvidence({ root, sha, paths }) {
  paths = validateHistorySelection(sha, paths);
  root = fs.realpathSync(root);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { maxBuffer: 256 * 2 ** 20 });
  if (git("rev-parse", "HEAD").toString().trim() !== sha) throw new Error("capture checkout does not match source_commit");
  const entries = git("ls-tree", "-r", "-z", sha, "--", ...paths).toString().split("\0").filter(Boolean).map((row) => {
    const [header, name] = row.split("\t");
    const [mode, kind, blob] = header.split(" ");
    if (kind !== "blob" || !["100644", "100755"].includes(mode)) throw new Error("historical evidence must contain only regular files");
    validateHistorySelection(sha, [name]);
    return { name, blob };
  });
  if (paths.some((p) => !entries.some((e) => e.name === p || e.name.startsWith(p + "/")))) throw new Error("selected historical path is missing");
  const parent = path.join(root, "artifacts");
  if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error("artifacts/ must not be a symlink");
  const dir = path.join(parent, "promoted-evidence");
  if (fs.existsSync(dir)) throw new Error("promotion directory already exists");
  fs.mkdirSync(dir, { recursive: true });
  const files = entries.map(({ name, blob }) => {
    const bytes = git("cat-file", "blob", blob);
    const identity = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (identity !== blob) throw new Error("Git blob identity mismatch");
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: "wx" });
    return { path: name, gitBlobSha1: blob, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const origin = { schemaVersion: 1, archivedCommit: sha, sourceSelections: paths, captureSourceSha: null, captureSourceVerification: "Stored Git bytes verified; actual rendered revision requires producer metadata", files };
  fs.writeFileSync(path.join(dir, "_historical-origin.json"), JSON.stringify(origin, null, 2) + "\n", { flag: "wx" });
  return { dir, origin };
}
