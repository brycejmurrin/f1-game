// @doc Content id of the WORKING TREE (tracked + untracked, ignore rules honoured) as a git tree hash, and of a commit's tree.
//
// WHY. tooling-fast stamps "this tree passed" for ready-gate.mjs, and the stamp
// used to be `git rev-parse HEAD` read AFTER the run (ledger M36, 2026-10-09).
// The loop in AGENTS.md is "make ALL edits, then verify ONCE", so the suite
// normally runs on a DIRTY tree: the stamp named the pre-edit commit. That
// reads as `local stamp != tip` once the edits are committed (annoying), and
// the reverse is a hole: a red committed tip A plus an uncommitted fix ran
// green, stamped A, and `ready-gate --local` on A said "passed" for a tree that
// never passed.
//
// A tree hash is the content itself, so the comparison is exact in both
// directions: the stamp holds the hash of the tree the suite actually ran on,
// and the gate compares it with the TIP COMMIT'S tree. Verify dirty, commit
// exactly that, and the hashes agree; commit anything else (or none of it) and
// they do not. Computed in a throwaway index copied from the real one (its
// stat cache keeps `git add -A` to a second or two), never touching the
// repo's own index.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Git tree hash of everything the working tree would commit with `add -A`,
 *  or null when git cannot say (callers treat null as "no evidence"). */
export function workTreeId(cwd = ROOT, run = spawnSync) {
  const git = (args, env) => run("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  const ip = git(["rev-parse", "--git-path", "index"]);
  if (ip.status !== 0) return null;
  const real = path.resolve(cwd, String(ip.stdout).trim());
  // Next to the real index, i.e. inside the git dir: a file in the work tree
  // would be part of the tree being hashed.
  const tmp = `${real}.tree-id-${process.pid}`;
  try {
    fs.copyFileSync(real, tmp);
    // KEEP THE REAL INDEX'S MTIME ON THE COPY. git decides "racily clean" (an
    // entry whose mtime is not older than the index file's, so a same-size
    // rewrite in the same timestamp tick would look unchanged) by comparing each
    // entry with the INDEX FILE's mtime, and copyFileSync gives the copy a fresh
    // one: every entry then looked safely older, git trusted its stat cache and
    // `add -A` returned the PREVIOUS tree for a same-size edit (a ready-gate test
    // flaked on CI this way). The original's mtime keeps exactly the entries
    // git itself would re-hash, at the cost of re-hashing only those.
    try { const st = fs.statSync(real); fs.utimesSync(tmp, st.atimeMs / 1000, st.mtimeMs / 1000); } catch { fs.utimesSync(tmp, 0, 0); }
    const env = { GIT_INDEX_FILE: tmp };
    if (git(["add", "-A", "--", "."], env).status !== 0) return null;
    const w = git(["write-tree"], env);
    const id = String(w.stdout || "").trim();
    return w.status === 0 && /^[0-9a-f]{40,64}$/.test(id) ? id : null;
  } catch { return null; }
  finally { try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ } }
}

/** Tree hash of a commit-ish, or null when it does not resolve in this clone. */
export function commitTreeId(rev, cwd = ROOT, run = spawnSync) {
  const r = run("git", ["rev-parse", "--verify", "-q", `${rev}^{tree}`], { cwd, encoding: "utf8" });
  const id = String(r.stdout || "").trim();
  return r.status === 0 && /^[0-9a-f]{40,64}$/.test(id) ? id : null;
}
