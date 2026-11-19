// tip-gate.mjs — the deploy tip's OWN cheap unit gate, for when Pages has not judged the tip yet.
// @doc Tip gate: the composition-budget unit tests on the bare deploy tip when no completed pages.yml run covers its sha.
// @section runner
//
// Why (2026-11-18/19): merge-gate's `base` row read only "the newest COMPLETED pages.yml run on the base branch".
// #5714 (23:59:45Z) and #5634 (00:07Z) were each green alone and together put the tip over the boot wall's budget
// (f0f5c5a4: 8,020,524 B against 8,018,484), but the tip's Pages runs sat pending or cancelled in a ~2.5 h backlog,
// so the gate kept reading an older green run and at least eight more PRs merged onto the red tip (8,026,058 B).
// Holding every merge until Pages reaches the tip would have stalled the green flow for those same hours, so the
// gate instead runs, on a detached worktree of the tip sha, the unit tests that two green PRs can turn red together
// (TIP_GATE_TESTS: byte budgets summed over many files). Measured 2026-11-19: ~3.5 s (worktree add) + 0.2 s (tests).
// The tip is merged code, so this runs no PR code: land.yml's trusted-rows job (deploy-branch checkout, read-only
// token, no install) can run it. Every test here imports node built-ins and repo files only.
// docs/notes/BUDGET-RATCHETS-2026-11-19.md is the design.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** The composition-sensitive unit tests: each sums a size over many files, so two green PRs can cross it together. */
export const TIP_GATE_TESTS = Object.freeze([
  "tests/unit/boot-load-budget.test.mjs",
  "tests/unit/css-critical-path.test.mjs",
]);
/** One run's cap (the trusted-rows job is 10 min for every PR; the cache below makes it once per tip). */
export const TIP_GATE_TIMEOUT_MS = 120_000;

const git = (run, args, cwd, extra = {}) => run("git", args, { cwd, encoding: "utf8", timeout: 120_000, ...extra });
const short = (s) => String(s || "").slice(0, 8) || "?";

/** The failing test names in `node --test` TAP output (top-level `not ok` lines). Pure. */
export function failedTests(out) {
  return [...String(out || "").matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
}

/**
 * Run TIP_GATE_TESTS on `sha` (the deploy tip). → { state: "green"|"code-red", sha, jobs, evidence, ms } | { error }.
 * Fetches `base` when the sha is not in this clone; builds BUILT_PATHS in the worktree (ensure-built, node only);
 * caches the verdict per sha and test list under artifacts/merge-gate/tip-gate/ so one gate job pays it once.
 */
export function runTipGate({ sha, base, root, run = spawnSync, tests = TIP_GATE_TESTS, now = Date.now } = {}) {
  const full = String(sha || "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(full)) return { error: `tip gate: not a commit sha: ${sha || "(none)"}` };
  const dir = path.join(root, "artifacts", "merge-gate", "tip-gate");
  const cacheFile = path.join(dir, `${full}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (c?.sha === full && JSON.stringify(c.tests) === JSON.stringify(tests) && (c.state === "green" || c.state === "code-red")) return { ...c, cached: true };
  } catch { /* no cache yet */ }
  if (git(run, ["cat-file", "-e", `${full}^{commit}`], root).status !== 0) {
    git(run, ["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`], root);
    if (git(run, ["cat-file", "-e", `${full}^{commit}`], root).status !== 0) return { error: `tip gate: ${short(full)} is not in this clone after fetching ${base}` };
  }
  const wt = path.join(dir, `wt-${full.slice(0, 12)}`);
  const cleanup = () => { git(run, ["worktree", "remove", "--force", wt], root); git(run, ["worktree", "prune"], root); fs.rmSync(wt, { recursive: true, force: true }); };
  cleanup();
  const t0 = now();
  const add = git(run, ["worktree", "add", "--detach", wt, full], root);
  if (add.status !== 0) { cleanup(); return { error: `tip gate: worktree add ${short(full)} failed: ${String(add.stderr || "").trim().split("\n")[0]}` }; }
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;   // a nested `node --test` inherits it and then exits 0 on a failure (merge-gate ratchetsOnMerge)
  const built = run(process.execPath, ["tools/gen/ensure-built.mjs", "--quiet"], { cwd: wt, env, encoding: "utf8", timeout: TIP_GATE_TIMEOUT_MS });
  if (built.error || built.status !== 0) { cleanup(); return { error: `tip gate: ensure-built failed on ${short(full)}: ${built.error?.message || String(built.stderr || built.stdout || "").trim().split("\n").pop()}` }; }
  const present = tests.filter((f) => fs.existsSync(path.join(wt, f)));
  const r = run(process.execPath, ["--test", ...present], { cwd: wt, env, encoding: "utf8", timeout: TIP_GATE_TIMEOUT_MS, maxBuffer: 16 << 20 });
  cleanup();
  const ms = now() - t0;
  if (r.error) return { error: `tip gate on ${short(full)}: ${r.error.message}` };
  const failed = failedTests(r.stdout);
  if (r.status !== 0 && !failed.length) return { error: `tip gate on ${short(full)}: node --test exit ${r.status} with no failing test named` };
  const v = r.status === 0
    ? { state: "green", sha: full, jobs: [], evidence: `the tip ${short(full)}'s own unit gate passed (${present.length} file(s), ${(ms / 1000).toFixed(1)} s)` }
    : { state: "code-red", sha: full, jobs: failed, evidence: `the tip ${short(full)}'s own unit gate fails: ${failed.slice(0, 2).map((n) => `"${n}"`).join(", ")}${failed.length > 2 ? ` and ${failed.length - 2} more` : ""}` };
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify({ ...v, tests, ms }) + "\n"); } catch { /* the cache is an optimisation */ }
  return { ...v, ms };
}

/**
 * The base row's view of the tip. `pages` is readDeployTip()'s tipState (the newest completed pages.yml run);
 * `tipSha` / `tipAt` the base branch's head commit and its committer date. Pages decides when it has judged the tip
 * itself or is red; otherwise (`pages.sha` is an older commit, or there is no run) the tip gate decides, through
 * `gate()` (runTipGate, injected). A gate that cannot run holds as "unverified": fail closed, the fixer routes still
 * apply. A red names the tip sha (the fixer's proof needs its head to contain it) and the tip commit's date (the
 * owner's escape label must be newer). Pure but for `gate`.
 */
export function tipView(pages, { tipSha, tipAt, gate }) {
  const full = String(tipSha || "").toLowerCase();
  if (pages?.state === "code-red" || !full || String(pages?.sha || "").toLowerCase() === full) return pages;
  const behind = pages?.sha ? `the newest completed pages.yml run is on ${short(pages.sha)} (${pages.state}), not the tip ${short(full)}` : `no completed pages.yml run on the base branch yet (tip ${short(full)})`;
  const g = gate();
  if (g?.error) return { state: "unverified", runId: null, sha: full, runAt: tipAt || null, jobs: [], evidence: `${behind}; ${g.error}: held until it runs or Pages reaches the tip` };
  if (g.state === "green") return { ...pages, state: "green", tipGate: g, evidence: `${behind}; ${g.evidence}` };
  return { state: "code-red", runId: null, sha: full, runAt: tipAt || null, jobs: g.jobs || [], tipGate: g, evidence: `${behind}; ${g.evidence}` };
}
