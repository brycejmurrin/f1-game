#!/usr/bin/env node
/**
 * @doc Pages release train: the tip's own fast-tier state for the reuse verdict, and the end-of-run re-arm decision.
 * @section runner
 *
 *   node tools/ci/pages-train.mjs fast-tier <sha>   → `green <run-id>` | `red <run-id> <url>` | `none <why>`
 *   node tools/ci/pages-train.mjs rearm <sha>       → `rearm=true|false` (GITHUB_OUTPUT), the reason on stderr
 *
 * FAST-TIER (2026-10-14, Actions audit T1/T4). pages-reuse-verdict.sh used to
 * list only COMPLETED successful runs for the sha, but when ci.yml's
 * `poke-train` dispatches the train, the poking run is still in progress (its
 * `CI` aggregator runs after poke-train), so 71 of 82 poked trains re-ran the
 * tree-only jobs the fast tier had just passed. The newest deploy-branch
 * ci.yml push run on the exact sha now counts while it is still running, as
 * long as every tree-only job ci.yml's `fast_tier_run` input skips
 * (TREE_ONLY below) is listed, completed and green. A run whose newest
 * attempt concluded `failure` is RED: the train fails at once instead of
 * spending a ~135 job-minute gate on a tip its own fast tier already failed.
 *
 * REARM (2026-10-14, audit T3). poke-train refuses to dispatch while a train
 * is queued or running (single-flight), and nothing re-poked afterwards, so a
 * commit whose fast tier went green mid-train waited for the cron. pages.yml's
 * last job asks: did the branch tip move past the commit THIS run took, is the
 * tip's fast tier green, and is no other pages.yml run queued or running? Only
 * then does it dispatch. It compares against this run's sha, not the live sha:
 * a run whose gate failed on the tip must not re-dispatch the same red tree.
 * Any API doubt is "no" — the hourly cron is the backstop, and a second
 * dispatch would replace a pending train (one pending run per group).
 *
 * Docs relied on (read 2026-10-14):
 *   https://docs.github.com/en/rest/actions/workflow-runs  (head_sha / event / branch filters)
 *   https://docs.github.com/en/rest/actions/workflow-jobs  (jobs of a run; status + nullable conclusion)
 *   https://docs.github.com/en/actions/concepts/security/github_token  (workflow_dispatch by GITHUB_TOKEN creates a run)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ci.yml jobs gated on `inputs.fast_tier_run == ''`: the ones a train skips
// when it names a fast run. Driving model may be skipped by the plan step's own
// path filter (ci-verdict and poke-train read that as a pass); every other
// row must be green. Node suites are a matrix: at least one expanded row, all
// green (a job-level skip reports one unexpanded row, conclusion skipped).
// The node-slice plan lives in `Select specs for this change` since
// 2026-10-15 (was the `Plan node unit slices` job); that job re-runs on the
// train, so it is not a tree-only row.
export const TREE_ONLY = ["Structural guards (tooling A)", "Structural guards (tooling B)", "Structural guards"];
export const NODE_SUITES = "Pure-node unit suites (";
export const DRIVING = "Driving model (characterization traces)";

/** `gh api --paginate` concatenates JSON pages; split and merge their `jobs`. */
export function parseJobPages(text) {
  const jobs = [];
  for (const page of String(text || "").split(/(?=\{"total_count")/)) if (page.trim()) jobs.push(...(JSON.parse(page).jobs || []));
  return jobs;
}

/** The newest deploy-branch ci.yml push run on `sha`, as a state. Listing order is newest first. */
export function pickFastTier(runs, { sha, deployBranch }) {
  if (!deployBranch) return { state: "none", why: "DEPLOY_BRANCH unset" };
  const r = (runs || []).find((x) => x.path === ".github/workflows/ci.yml" && x.event === "push"
    && x.head_branch === deployBranch && x.head_sha === sha);
  if (!r) return { state: "none", why: "no deploy-branch ci.yml push run for this sha" };
  if (r.status !== "completed") return { state: "running", id: String(r.id), url: r.html_url || "" };
  if (r.conclusion === "success") return { state: "green", id: String(r.id), url: r.html_url || "" };
  if (r.conclusion === "failure") return { state: "red", id: String(r.id), url: r.html_url || "" };
  return { state: "none", why: `run ${r.id} concluded ${r.conclusion}` };
}

/** Did every tree-only job of this run complete green? `missing` names what did not. */
export function treeOnlyGreen(jobs) {
  const rows = (jobs || []).map((j) => ({ name: String(j.name || "").replace(/^ci \/ /, ""), status: j.status, conclusion: j.conclusion }));
  const done = (r) => r.status === undefined || r.status === "completed";
  const bad = [];
  for (const name of TREE_ONLY) {
    const mine = rows.filter((r) => r.name === name);
    if (!mine.length || !mine.every((r) => done(r) && r.conclusion === "success")) bad.push(name);
  }
  const suites = rows.filter((r) => r.name.startsWith(NODE_SUITES));
  if (!suites.length || !suites.every((r) => done(r) && r.conclusion === "success")) bad.push(`${NODE_SUITES}…)`);
  const drive = rows.filter((r) => r.name === DRIVING);
  if (!drive.length || !drive.every((r) => done(r) && (r.conclusion === "success" || r.conclusion === "skipped"))) bad.push(DRIVING);
  return { ok: bad.length === 0, missing: bad };
}

/** The end-of-run re-arm decision. `active` counts OTHER pages.yml runs not yet completed (null = unknown). */
export function rearmDecision({ ref, deployBranch, sha, tip, active, tipFast }) {
  if (!deployBranch || ref !== deployBranch) return { rearm: false, why: `not the deploy branch (${ref || "?"})` };
  if (!tip) return { rearm: false, why: "branch tip unreadable; the cron is the backstop" };
  if (tip === sha) return { rearm: false, why: `this run took the tip ${sha.slice(0, 9)}` };
  if (active == null) return { rearm: false, why: "pages.yml run listing unreadable; never risk a dual dispatch" };
  if (active > 0) return { rearm: false, why: `${active} other train run(s) already queued or running (single-flight)` };
  if (!tipFast || tipFast.state !== "green") {
    return { rearm: false, why: `tip ${tip.slice(0, 9)} fast tier is ${tipFast ? tipFast.state : "unknown"}; its own poke-train dispatches when it goes green` };
  }
  return { rearm: true, why: `tip ${tip.slice(0, 9)} moved past ${sha.slice(0, 9)} with green fast tier run ${tipFast.id} and no train moving` };
}

function gh(path, { paginate = false } = {}) {
  return execFileSync("gh", ["api", path, ...(paginate ? ["--paginate"] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
const repo = () => process.env.GITHUB_REPOSITORY || "";
const listFastRuns = (sha) => JSON.parse(gh(`repos/${repo()}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=20`)).workflow_runs || [];

/** fast-tier CLI: one line, `green <id>`, `red <id> <url>` or `none <why>`. Lookup failure is `none`. */
export function fastTierLine(sha, env = process.env) {
  let ft;
  try { ft = pickFastTier(listFastRuns(sha), { sha, deployBranch: env.DEPLOY_BRANCH || "" }); } catch (_) { return "none run listing failed"; }
  if (ft.state === "red") return `red ${ft.id} ${ft.url}`.trim();
  if (ft.state === "none") return `none ${ft.why}`;
  let jobs;
  try { jobs = parseJobPages(gh(`repos/${repo()}/actions/runs/${ft.id}/jobs?per_page=100`, { paginate: true })); } catch (_) { return `none jobs lookup failed for run ${ft.id}`; }
  const t = treeOnlyGreen(jobs);
  return t.ok ? `green ${ft.id}` : `none run ${ft.id} (${ft.state}) has not passed: ${t.missing.join(", ")}`;
}

function rearmCli(sha, env = process.env) {
  const deployBranch = env.DEPLOY_BRANCH || "";
  let tip = "", active = null, tipFast = null;
  try { tip = JSON.parse(gh(`repos/${repo()}/branches/${deployBranch}`)).commit.sha; } catch (_) { /* unreadable: no */ }
  try {
    const runs = JSON.parse(gh(`repos/${repo()}/actions/workflows/pages.yml/runs?branch=${deployBranch}&per_page=20`)).workflow_runs || [];
    active = runs.filter((r) => r.status !== "completed" && String(r.id) !== String(env.GITHUB_RUN_ID || "")).length;
  } catch (_) { /* unknown: no */ }
  if (tip && tip !== sha) { try { tipFast = pickFastTier(listFastRuns(tip), { sha: tip, deployBranch }); } catch (_) { /* unknown */ } }
  const d = rearmDecision({ ref: env.GITHUB_REF_NAME || "", deployBranch, sha, tip, active, tipFast });
  process.stderr.write(`${d.rearm ? "RE-ARMING" : "NOT RE-ARMING"}: ${d.why}\n`);
  process.stdout.write(`rearm=${d.rearm}\nwhy=${d.why}\n`);
}

const USAGE = `usage: node tools/ci/pages-train.mjs fast-tier|rearm <sha>
  fast-tier  the newest deploy-branch ci.yml push run on <sha>: green <id> | red <id> <url> | none <why>
  rearm      GITHUB_OUTPUT lines rearm=true|false + why= (pages.yml's last job; needs GH_TOKEN, DEPLOY_BRANCH)`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, sha] = process.argv.slice(2);
  if (["--help", "-h", "help"].includes(cmd)) { console.log(USAGE); process.exit(0); }
  if (!sha || !/^[0-9a-f]{7,40}$/.test(sha) || !["fast-tier", "rearm"].includes(cmd)) {
    process.stderr.write(USAGE + "\n");
    process.exit(2);
  }
  if (cmd === "fast-tier") process.stdout.write(fastTierLine(sha) + "\n");
  else rearmCli(sha);
}
