#!/usr/bin/env node
// deploy.mjs — the ONE deploy command (2026-09-01).
// @doc the ONE deploy: fetch → merge → tooling-fast → verify-track → push the deploy branch (or --pr); pages.yml stamps it
//
//   node tools/deploy.mjs --plan        # print the steps + the union diffstat, run nothing
//   node tools/deploy.mjs               # fetch → merge → tooling-fast → verify-track (touched
//                                       #   circuits) → push HEAD to the deploy branch (retry ×3)
//   node tools/deploy.mjs --pr          # same checks, then push the session branch and open /
//                                       #   update a PR into the deploy branch (never pushes there)
//   node tools/deploy.mjs --json        # machine verdict on stdout, log on stderr
//
// What it replaces: the prose protocol in the deploy-merge skill — fetch, look,
// merge, re-bump the union, tooling-fast, sweeps, push, tinyfish live check.
// What changed underneath it (see pages.yml "Stamp the shell generation"): the
// build number is stamped by the deploy from the commit count, so there is no
// union re-bump; version.json/index.html conflicts resolve to EITHER side plus a
// a `gen-shell` regeneration (tags read ?v=dev; the deploy stamps hashes). Sweeps are CI's (ci.yml runs them on the
// same diff, conditionally); running them here only duplicated 10 minutes.
// The live check is pages.yml's `verify-live` job — this box cannot reach
// github.io, the runner can.
//
// Refuses: a dirty tree, loadavg >= 3, a live Playwright run, any conflict
// outside index.html/version.json, a non-fast-forward it cannot cure with a
// re-merge in three tries. Never --force, never rebase, never amend.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const JSON_OUT = flag("--json");
export const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";
const REMOTE = "origin";
const log = (m) => process.stderr.write(`[deploy] ${m}\n`);

function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
function must(r, what) {
  if (r.code !== 0) throw new Error(`${what} failed: ${r.err || r.out}`);
  return r.out;
}
function run(cmd, args, what) {
  log(`${what}: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: JSON_OUT ? ["ignore", "ignore", "inherit"] : "inherit" });
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status})`);
}

export function preflight() {
  const problems = [];
  if (git(["status", "--porcelain"]).out) problems.push("working tree is dirty — commit first");
  const load = os.loadavg()[0];
  if (load >= 3) problems.push(`loadavg ${load.toFixed(2)} >= 3 — a verification now measures the box`);
  const ps = spawnSync("pgrep", ["-f", "run-playwrigh[t]|playwright tes[t]"], { encoding: "utf8" });
  if (ps.status === 0 && ps.stdout.trim()) problems.push("a Playwright run is live — never merge or push under it");
  return problems;
}

export function touchedCircuits(base) {
  const out = git(["diff", "--name-only", base, "HEAD"]).out;
  return [...new Set(out.split("\n")
    .map((f) => /^js\/circuits\/(?:scenery\/)?([a-z_]+)\.js$/.exec(f))
    .filter(Boolean).map((m) => m[1]))];
}

export function plan() {
  must(git(["fetch", "--no-tags", REMOTE, DEPLOY_BRANCH]), "fetch");
  const tip = must(git(["rev-parse", `${REMOTE}/${DEPLOY_BRANCH}`]), "rev-parse");
  const head = must(git(["rev-parse", "HEAD"]), "rev-parse HEAD");
  const branch = git(["branch", "--show-current"]).out;
  const ancestor = git(["merge-base", "--is-ancestor", tip, head]).code === 0;
  const theirs = git(["log", "--oneline", `${head}..${tip}`]).out.split("\n").filter(Boolean);
  const ours = git(["log", "--oneline", `${tip}..${head}`]).out.split("\n").filter(Boolean);
  const stat = git(["diff", "--stat", `${head}...${tip}`]).out;
  const conflicts = ancestor ? [] : (() => {
    const mt = git(["merge-tree", "--write-tree", head, tip]);
    return (mt.err + "\n" + mt.out).split("\n").filter((l) => l.startsWith("CONFLICT")).map((l) => l.replace(/^CONFLICT \([^)]*\): /, ""));
  })();
  return { branch, head, tip, fastForward: ancestor, theirCommits: theirs, ourCommits: ours, theirDiffstat: stat, conflicts,
    touchedCircuits: touchedCircuits(tip),
    steps: [
      ancestor ? "merge: nothing to merge (deploy tip is an ancestor)" : "merge origin/" + DEPLOY_BRANCH + " (index.html/version.json conflicts resolve to theirs + gen-shell)",
      "npm run test:tooling-fast",
      "the Pages gate's node suites (ci.yml \"Pure-node unit suites\", read from the file)",
      "verify-track for touched circuits",
      flag("--pr") ? "push the session branch and open/update a PR into the deploy branch"
                   : "git push origin HEAD:" + DEPLOY_BRANCH + " (fast-forward, retry ×3)",
      "pages.yml stamps the build and verify-live confirms it",
    ] };
}

// The `npm run test:*` lines of ci.yml's "Pure-node unit suites" step — the
// deploy gate's node half. Empty (and logged) if the step is ever renamed, so
// a rename shows up as a missing verdict entry rather than a silent skip.
function gateNodeSuites() {
  let ci = "";
  try { ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8"); } catch (e) { return []; }
  const at = ci.indexOf("- name: Pure-node unit suites");
  if (at < 0) { log("WARN ci.yml has no 'Pure-node unit suites' step — gate suites not run"); return []; }
  const body = ci.slice(at).split(/\n      - name: /)[0];
  return [...body.matchAll(/^\s+npm run (test:[\w-]+)\s*$/gm)].map((m) => m[1]);
}

function mergeDeployTip(tip) {
  const r = git(["merge", "--no-edit", `${REMOTE}/${DEPLOY_BRANCH}`]);
  if (r.code === 0) return "merged";
  const conflicted = git(["diff", "--name-only", "--diff-filter=U"]).out.split("\n").filter(Boolean);
  const cureable = conflicted.every((f) => f === "index.html" || f === "version.json");
  if (!cureable) {
    git(["merge", "--abort"]);
    throw new Error(`real conflicts (not just the shell hashes): ${conflicted.join(", ")} — resolve by hand, re-measure on the union`);
  }
  for (const f of conflicted) must(git(["checkout", "--theirs", "--", f]), `checkout --theirs ${f}`);
  run("node", ["tools/gen-shell.mjs"], "regenerate the union shell from the manifest");
  must(git(["add", "index.html", "version.json"]), "add");
  must(git(["commit", "--no-edit", "-q"]), "merge commit");
  return "merged (shell hashes re-applied)";
}

function pushWithRetry() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = git(["push", REMOTE, `HEAD:${DEPLOY_BRANCH}`]);
    if (r.code === 0) return attempt;
    log(`push rejected (attempt ${attempt}): ${r.err.split("\n").pop()}`);
    must(git(["fetch", "--no-tags", REMOTE, DEPLOY_BRANCH]), "fetch");
    mergeDeployTip();
    run("npm", ["run", "test:tooling-fast"], "re-verify the new union");
  }
  throw new Error("push rejected three times — another session keeps landing; stop and look");
}

function openPr(branch) {
  must(git(["push", "-u", REMOTE, branch]), "push session branch");
  const gh = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (gh.status !== 0) {
    return { pr: null, note: `gh not installed — open https://github.com/brycejmurrin/f1-game/compare/${DEPLOY_BRANCH}...${branch}?expand=1` };
  }
  const existing = spawnSync("gh", ["pr", "list", "--head", branch, "--base", DEPLOY_BRANCH, "--json", "url", "-q", ".[0].url"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  if (existing) return { pr: existing, note: "PR already open; the push updated it" };
  const created = spawnSync("gh", ["pr", "create", "--base", DEPLOY_BRANCH, "--head", branch, "--fill"], { cwd: ROOT, encoding: "utf8" });
  if (created.status !== 0) throw new Error("gh pr create failed: " + created.stderr);
  const url = created.stdout.trim().split("\n").pop();
  spawnSync("gh", ["pr", "merge", "--auto", "--merge", url], { cwd: ROOT, encoding: "utf8" });
  return { pr: url, note: "auto-merge (merge commit) enabled; GitHub creates the merge so the PR is a real record" };
}

export function main() {
  const t0 = Date.now();
  if (flag("--help") || flag("-h")) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 26).join("\n")); return 0; }
  const p = plan();
  if (flag("--plan")) {
    if (JSON_OUT) console.log(JSON.stringify(p, null, 2));
    else {
      console.log(`branch ${p.branch} @ ${p.head.slice(0, 7)} — deploy tip ${p.tip.slice(0, 7)} ${p.fastForward ? "(ancestor: fast-forward)" : "(diverged)"}`);
      if (p.theirCommits.length) console.log("their new commits:\n  " + p.theirCommits.join("\n  "));
      if (p.ourCommits.length) console.log("our commits to ship:\n  " + p.ourCommits.join("\n  "));
      if (p.conflicts.length) console.log("conflicts a merge would hit:\n  " + p.conflicts.join("\n  "));
      if (p.touchedCircuits.length) console.log("touched circuits: " + p.touchedCircuits.join(" "));
      console.log("steps:\n  " + p.steps.join("\n  "));
    }
    return 0;
  }
  const problems = preflight();
  if (problems.length) { for (const x of problems) log("REFUSED: " + x); return 3; }
  const verdict = { branch: p.branch, merge: "none", verified: [], pushed: false, pr: null };
  if (!p.fastForward) verdict.merge = mergeDeployTip(p.tip);
  run("npm", ["run", "test:tooling-fast"], "guard suite on the union"); verdict.verified.push("tooling-fast");
  // The Pages gate runs MORE node suites than tooling-fast (quali-persist,
  // node-slow, the VM twins, …) and two deploys went red on pins tooling-fast
  // never runs (run 1889, 2026-09-02). Run exactly what the gate runs, read
  // from ci.yml so the two lists cannot drift apart.
  for (const script of gateNodeSuites()) { run("npm", ["run", script], `Pages gate: ${script}`); verdict.verified.push(script); }
  for (const id of touchedCircuits(p.tip)) { run("node", ["tools/verify-track.cjs", id], `verify-track ${id}`); verdict.verified.push(`verify-track:${id}`); }
  if (flag("--pr")) {
    Object.assign(verdict, openPr(p.branch));
  } else {
    verdict.pushAttempts = pushWithRetry();
    verdict.pushed = true;
  }
  verdict.next = "pages.yml stamps the build (2000 + commit count) and its verify-live job confirms the CDN serves it; read the run in the Actions tab";
  verdict.seconds = Math.round((Date.now() - t0) / 1000);
  if (JSON_OUT) console.log(JSON.stringify(verdict, null, 2));
  else log(JSON.stringify(verdict));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main()); }
  catch (e) { log("ERROR " + (e && e.message ? e.message : e)); process.exit(1); }
}
