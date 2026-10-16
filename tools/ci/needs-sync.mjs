#!/usr/bin/env node
/**
 * @doc Verdict line: does a PR branch need a deploy-tip sync? conflict | stale-red | no (sync only when you must).
 * @section runner
 * @skill steward
 *
 *   node tools/ci/needs-sync.mjs <branch>            # fetch, decide, print `= sync needed: …`
 *   node tools/ci/needs-sync.mjs <branch> --json     # the facts behind the verdict
 *   node tools/ci/needs-sync.mjs <branch> --offline  # cached refs, no fetch, no API (CI state unknown)
 *
 * Verdicts (issue #2449 design, phase 0):
 *   conflict   `git merge-tree --write-tree` of the deploy tip and the branch exits 1
 *              (sync-pr.mjs still cures generated-file-only conflicts itself)
 *   stale-red  the newest ci.yml run on the branch head failed AND the deploy tip gained
 *              a commit after that run started: a re-run re-tests the stale merge ref,
 *              only a new head can clear it. A heuristic (a flake looks the same): name
 *              the failing job in the PR, and never re-run twice.
 *   no         up to date, or merely behind with no conflict and no red: a green PR
 *              merges as it stands, and a clean refresh buys a full tier that repeats
 *              the old verdict.
 * Exit: 0 sync needed (conflict | stale-red), 1 no sync needed, 2 bad args, 3 could not
 * decide (fetch / git / merge-tree failed). The API half degrades: no token or an API
 * error leaves ci "unknown", so only `conflict` can fire (the line says so).
 * Needs the merge base: a shallow clone must be deep enough for `git merge-tree`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, DEPLOY } from "./ready-full-cap.mjs";
import { ciState } from "./pr-board.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const VERDICTS = ["conflict", "stale-red", "no"];

/**
 * The verdict from the facts. Pure.
 * @param {{ behind: boolean, conflict: boolean, ci?: string, runStartedAt?: string|null, tipNewestAt?: string|null }} f
 *   tipNewestAt = committer date of the newest commit on the tip that the branch lacks.
 * @returns {{ verdict: "conflict"|"stale-red"|"no", why: string }}
 */
export function decideSync(f) {
  if (!f.behind) return { verdict: "no", why: "the branch already contains the deploy tip" };
  if (f.conflict) return { verdict: "conflict", why: "merging the deploy tip conflicts" };
  const ran = Date.parse(f.runStartedAt || ""), tipAt = Date.parse(f.tipNewestAt || "");
  if (f.ci === "failure" && ran && tipAt && tipAt > ran) {
    return { verdict: "stale-red", why: "ci.yml is red on the head and the tip has moved since that run started" };
  }
  const red = f.ci === "failure" ? "ci red but the tip has not moved since" : f.ci === "unknown" ? "ci state unknown" : `ci ${f.ci || "none"}`;
  return { verdict: "no", why: `behind with no conflict (${red}): clean-behind is not a reason` };
}

function git(args, run = spawnSync) {
  const r = run("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

/**
 * Gather facts and decide. `readGit` / `request` injectable.
 * @returns {{ ok: boolean, error?: string, branch?: string, head?: string, tip?: string, behind?: boolean, conflict?: boolean,
 *   ci?: string, verdict?: string, why?: string, note?: string|null }}
 */
export function needsSync(branch, { fetch = true, offline = false, readGit = git, request = api } = {}) {
  if (fetch && !offline) {
    const f = readGit(["fetch", "--no-tags", "origin", branch, DEPLOY]);
    if (f.code !== 0) return { ok: false, error: `fetch failed: ${f.err || f.out}` };
  }
  const head = readGit(["rev-parse", "--verify", `origin/${branch}`]);
  const tip = readGit(["rev-parse", "--verify", `origin/${DEPLOY}`]);
  if (head.code !== 0 || tip.code !== 0) return { ok: false, error: `cannot resolve origin/${head.code !== 0 ? branch : DEPLOY}` };
  const behind = readGit(["merge-base", "--is-ancestor", tip.out, head.out]).code !== 0;
  let conflict = false;
  if (behind) {
    // exit 0 clean, 1 conflicts, anything else (>1) is an error, not a verdict.
    const m = readGit(["merge-tree", "--write-tree", "--name-only", tip.out, head.out]);
    if (m.code !== 0 && m.code !== 1) return { ok: false, error: `git merge-tree failed (${m.code}): ${m.err || m.out}` };
    conflict = m.code === 1;
  }
  let ci = "unknown", runStartedAt = null, note = null;
  if (behind && !conflict && !offline) {
    const r = request(`actions/workflows/ci.yml/runs?head_sha=${head.out}&per_page=20`);
    if (r.error) note = `CI state unreadable (${r.error}): only a conflict can be detected`;
    else {
      const runs = r.json?.workflow_runs || [];
      const s = ciState(runs);
      ci = s.state;
      const run = runs.find((x) => x.id === s.runId);
      runStartedAt = run?.run_started_at || run?.created_at || null;
    }
  } else if (offline) note = "offline: CI state not read, only a conflict can be detected";
  const tipNewestAt = behind ? readGit(["log", "-1", "--format=%cI", `${head.out}..${tip.out}`]).out || null : null;
  const d = decideSync({ behind, conflict, ci, runStartedAt, tipNewestAt });
  return { ok: true, branch, head: head.out, tip: tip.out, behind, conflict, ci, ...d, note };
}

/** The one verdict line. */
export const verdictLine = (v) => `= sync needed: ${v.verdict}`;
export const exitCode = (v) => (!v.ok ? 3 : v.verdict === "no" ? 1 : 0);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const branch = argv.find((a) => !a.startsWith("--"));
  const bad = argv.find((a) => a.startsWith("--") && !["--json", "--offline", "--help"].includes(a));
  if (argv.includes("--help") || !branch || bad || argv.filter((a) => !a.startsWith("--")).length !== 1) {
    console.error(`usage: node tools/ci/needs-sync.mjs <branch> [--json] [--offline]${bad ? `\nunknown arg: ${bad}` : ""}
verdict line: ${VERDICTS.map((v) => `= sync needed: ${v}`).join(" | ")}
exit: 0 sync needed (conflict|stale-red), 1 no, 2 bad args, 3 could not decide`);
    process.exit(argv.includes("--help") ? 0 : 2);
  }
  const v = needsSync(branch, { offline: argv.includes("--offline") });
  if (!v.ok) { console.error(`needs-sync: ${v.error}`); process.exit(3); }
  if (argv.includes("--json")) console.log(JSON.stringify(v, null, 2));
  else { if (v.note) console.error(`needs-sync: ${v.note}`); console.log(`${verdictLine(v)} (${v.why})`); }
  process.exit(exitCode(v));
}
