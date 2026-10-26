// git-run.mjs — the shared git helpers for tools/ci (audit3 T11).
// @doc Shared git helpers: gitRun {code,out,err}, gitMust (throws), gitOut (throwing stdout), gitTry ("" on failure).
//
// WHY. Sixteen tools/ci files each carried a private `git()` with one of three
// error semantics — a {code,out,err} record, a throw, or "" on failure — and the
// "" form reads a failed git as "no branch / no sha" in a gate. The semantics
// are now NAMED, so a caller picks the one it means:
//
//   gitRun(args, opts)  → { code, out, err }   never throws; out/err trimmed
//   gitMust(r, what)    → r.out, or throws "<what> failed: <err>" when r.code !== 0
//   gitOut(args, opts)  → trimmed stdout; throws on a non-zero exit (execFileSync)
//   gitTry(args, opts)  → trimmed stdout, or "" on any failure (advisory reads only)
//
// `cwd` defaults to the repo root; `run` (gitRun) is injectable for tests;
// `trim: "end"` keeps leading whitespace (porcelain's index-status column).
import { spawnSync, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BIG = 64 << 20;   // a merge-tree or log of a busy branch overruns spawnSync's 1 MB default
const trimmer = (trim) => (s) => (trim === "end" ? String(s || "").trimEnd() : String(s || "").trim());

export function gitRun(args, { cwd = ROOT, run = spawnSync, maxBuffer = BIG, trim, ...opts } = {}) {
  const r = run("git", args, { cwd, encoding: "utf8", maxBuffer, ...opts });
  const t = trimmer(trim);
  return { code: r.status, out: t(r.stdout), err: t(r.stderr) };
}

export function gitMust(r, what) {
  if (r.code !== 0) throw new Error(`${what} failed: ${r.err || r.out}`);
  return r.out;
}

export function gitOut(args, { cwd = ROOT, maxBuffer = BIG, trim, ...opts } = {}) {
  return trimmer(trim)(execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer, stdio: ["ignore", "pipe", "pipe"], ...opts }));
}

export function gitTry(args, opts = {}) {
  const r = gitRun(args, opts);
  return r.code === 0 ? r.out : "";
}
