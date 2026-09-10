#!/usr/bin/env node
// deploy.mjs — the ONE deploy command (2026-09-01).
// @doc the ONE deploy: fetch → merge → tooling-fast → verify-track → push the deploy branch (or --pr); pages.yml stamps it
//
//   node tools/ci/deploy.mjs --plan        # print the steps + the union diffstat, run nothing
//   node tools/ci/deploy.mjs               # fetch → merge → tooling-fast → verify-track (touched
//                                       #   circuits) → push HEAD to the deploy branch (retry ×3)
//   node tools/ci/deploy.mjs --pr          # same checks, then push the session branch and open /
//                                       #   update a PR into the deploy branch (never pushes there)
//   node tools/ci/deploy.mjs --json        # machine verdict on stdout, log on stderr
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
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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
      ancestor ? "merge: nothing to merge (deploy tip is an ancestor)" : "merge origin/" + DEPLOY_BRANCH + " (conflicts in GENERATED files cure themselves: index.html/version.json via gen-shell, ratchets.json re-measured, package.json from groups.json, tools/README.md from the tools' @doc headers)",
      `tools/ci/tooling-fast.mjs ${GATE_JOBS} (the full node gate, two files at a time)`,
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
  // THROWS rather than returning []. The comment above used to promise a rename
  // would "show up as a missing verdict entry rather than a silent skip" — but
  // verdict.verified simply omitted the nine scripts, nothing set ok:false, and
  // main() pushed to the DEPLOY BRANCH having run only tooling-fast. This leg
  // exists because two deploys went red on pins tooling-fast never runs, so
  // losing it to a workflow rename is exactly the failure it was added to stop.
  let ci = "";
  try { ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8"); }
  catch (e) { throw new Error("deploy: cannot read .github/workflows/ci.yml — the node half of the gate is undefined: " + e.message); }
  const at = ci.indexOf("- name: Pure-node unit suites");
  if (at < 0) throw new Error("deploy: ci.yml has no 'Pure-node unit suites' step — the node half of the gate cannot be derived. Fix the step name or update gateNodeSuites().");
  const body = ci.slice(at).split(/\n      - name: /)[0];
  const scripts = [...body.matchAll(/^\s+npm run (test:[\w-]+)\s*$/gm)].map((m) => m[1]);
  if (!scripts.length) throw new Error("deploy: the 'Pure-node unit suites' step parsed to ZERO scripts — refusing to push on a gate that measured nothing.");
  return scripts;
}

// tools/manifest.cjs MOVED (written by tools/gen/move-tree.mjs): old path -> new.
function manifestMoved() {
  try { return createRequire(import.meta.url)(path.join(ROOT, "tools/manifest.cjs")).MOVED || {}; } catch (_) { return {}; }
}

const RATCHETS = "tests/data/ratchets.json";
const TOOLS_README = "tools/README.md";

/* Every number in ratchets.json, flattened to `scope/name` -> value, so the
   three sides of a conflict can be compared metric by metric. */
export function ratchetMetrics(json) {
  const out = {};
  for (const [file, m] of Object.entries((json && json.files) || {})) {
    for (const [k, v] of Object.entries(m)) if (typeof v === "number") out[`${file}/${k}`] = v;
  }
  for (const [name, m] of Object.entries((json && json.tree) || {})) {
    if (m && typeof m.ceiling === "number") out[`(tree)/${name}`] = m.ceiling;
  }
  return out;
}
function ratchetStage(n) {
  const r = git(["show", `:${n}:${RATCHETS}`]);
  if (r.code !== 0) return null;
  try { return ratchetMetrics(JSON.parse(r.out)); } catch (_) { return null; }
}

/* ratchets.json is DERIVED — `ratchets.mjs --update` measures the tree and
   writes what it finds — so a conflict in it is never a disagreement about
   intent. It is two sessions who each deliberately raised a ceiling for their
   own change, and the answer is arithmetic: the merged tree's real
   measurement. Resolved by hand three times on 2026-09-08, identically each
   time, at the cost of a full re-verification cycle apiece.

   The guard is what makes automating it safe. Each side's raise against the
   MERGE BASE is a decision a human made; their SUM is the most the union can
   legitimately need. If the merged tree measures more than that, the merge
   duplicated something, and blessing it would ratchet in a defect — so that
   case still stops and asks. A pure --update with no ceiling on the result is
   exactly how a bad merge becomes the new floor. */
export function ratchetOverruns(base, ours, theirs, got) {
  const over = [];
  for (const [k, v] of Object.entries(got)) {
    if (base[k] == null || ours[k] == null || theirs[k] == null) continue;
    const mine = Math.max(0, ours[k] - base[k]);
    const budget = theirs[k] + mine;   // their ceiling, plus the raise we made against the base
    if (v > budget) over.push(`${k}: union ${v} > ${theirs[k]} + ${mine} = ${budget}`);
  }
  return over;
}

function cureRatchets() {
  const base = ratchetStage(1), ours = ratchetStage(2), theirs = ratchetStage(3);
  must(git(["checkout", "--theirs", "--", RATCHETS]), `checkout --theirs ${RATCHETS}`);
  run("node", ["tools/check/ratchets.mjs", "--update"], "snap the ratchets to the merged tree");
  if (!base || !ours || !theirs) return "ratchets re-measured (no three-way stages to bound it)";
  let got;
  try { got = ratchetMetrics(JSON.parse(fs.readFileSync(path.join(ROOT, RATCHETS), "utf8"))); }
  catch (e) { throw new Error(`deploy: ${RATCHETS} is unreadable after --update: ${e.message}`); }
  const over = ratchetOverruns(base, ours, theirs, got);
  if (over.length) {
    throw new Error(`deploy: the merged tree measures MORE than both sides' deliberate raises combined — ` +
      `the merge looks duplicated, and --update would ratchet that in:\n  ${over.join("\n  ")}\n` +
      `Resolve ${RATCHETS} by hand and look at the merge before pushing.`);
  }
  return "ratchets re-measured on the union";
}

/* Which conflicts a deploy may resolve ON ITS OWN. A file this repo GENERATES
   carries no intent to reconcile: its content is a function of a source that
   merged cleanly, so the answer is to re-derive it, not to choose a side.
   index.html/version.json come from the manifest, ratchets.json from measuring
   the tree, and package.json's script block from tests/groups.json.

   package.json earns its place the hard way: two sessions adding a test suite
   each conflict there EVERY time, and it was hand-resolved twice on
   2026-09-08 — identically, by regenerating — at the cost of a stopped deploy
   and a full re-verification cycle apiece.

   The condition that keeps it honest is that the SOURCE came through clean. If
   tests/groups.json is itself conflicted, package.json cannot be derived from
   it and both are a real disagreement. Pure and exported so the rule can be
   tested without a merge to run it against. */
export function cureableConflicts(conflicted) {
  const shellF = conflicted.filter((f) => f === "index.html" || f === "version.json");
  const ratchetF = conflicted.filter((f) => f === RATCHETS);
  const pkgF = conflicted.filter((f) => f === "package.json");
  // tools/README.md is GENERATED from the tools' own @doc headers
  // (gen-tools-readme.mjs) and six sessions touched it in 12 h — every tool
  // added anywhere in the tree rewrites a row of it. A conflict here is two
  // stale renderings of a file neither side authored, so it cures the same way
  // package.json does: take either side to give the generator something
  // parseable, then regenerate from the merged sources.
  const toolsF = conflicted.filter((f) => f === TOOLS_README);
  const sourceContested = conflicted.includes("tests/groups.json");
  const cureable = conflicted.length > 0 && !sourceContested
    && shellF.length + ratchetF.length + pkgF.length + toolsF.length === conflicted.length;
  return { cureable, shellF, ratchetF, pkgF, toolsF };
}

function mergeDeployTip() {
  const r = git(["merge", "--no-edit", `${REMOTE}/${DEPLOY_BRANCH}`]);
  if (r.code === 0) return "merged";
  const conflicted = git(["diff", "--name-only", "--diff-filter=U"]).out.split("\n").filter(Boolean);
  // The CUREABLE set: files this repo GENERATES, where a conflict is a stale
  // derived value rather than two intents to reconcile. Anything else is a
  // real disagreement and stops.
  const { cureable, shellF, ratchetF, pkgF, toolsF } = cureableConflicts(conflicted);
  if (!cureable) {
    git(["merge", "--abort"]);
    const moved = manifestMoved();
    const named = conflicted.filter((f) => f !== RATCHETS && !shellF.includes(f) && !pkgF.includes(f) && !toolsF.includes(f))
      .map((f) => (moved[f] ? `${f} (moved to ${moved[f]} — re-apply their edit there)` : f));
    throw new Error(`real conflicts (not just generated files): ${named.join(", ")} — resolve by hand`);
  }
  const did = [];
  if (shellF.length) {
    for (const f of shellF) must(git(["checkout", "--theirs", "--", f]), `checkout --theirs ${f}`);
    run("node", ["tools/gen/gen-shell.mjs"], "regenerate the union shell from the manifest");
    must(git(["add", ...shellF]), "add");
    did.push("shell hashes re-applied");
  }
  if (ratchetF.length) { did.push(cureRatchets()); must(git(["add", RATCHETS]), "add"); }
  if (pkgF.length) {
    // --ours only to give the generator a parseable file to overwrite; every
    // script line it cares about is rewritten from the merged groups.json.
    must(git(["checkout", "--ours", "--", "package.json"]), "checkout --ours package.json");
    run("node", ["tools/gen/gen-test-groups.mjs"], "regenerate the test scripts from the merged groups.json");
    must(git(["add", "package.json"]), "add");
    did.push("test scripts regenerated from groups.json");
  }
  if (toolsF.length) {
    must(git(["checkout", "--ours", "--", TOOLS_README]), "checkout --ours tools/README.md");
    run("node", ["tools/gen/gen-tools-readme.mjs"], "regenerate the tools index from the merged tree");
    must(git(["add", TOOLS_README]), "add");
    did.push("tools index regenerated");
  }
  must(git(["commit", "--no-edit", "-q"]), "merge commit");
  return `merged (${did.join("; ")})`;
}

// The cross-file guards — the ones a MERGE breaks. Everything in this group
// asserts a relationship BETWEEN files (a registry against the tree, a
// generated file against its source, a ceiling against what it measures),
// which is exactly what goes wrong when two independently verified trees are
// joined. A physics suite cannot newly fail because someone else's docs commit
// landed. Read from tests/groups.json rather than listed here: a second copy of
// a registry is the class of problem this whole change is about, and
// `npm run test:guards` is the same 14 files for a human before a commit.
const MERGE_GUARDS = Object.freeze(
  JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8")).groups["test:guards"].files);

/* HOW WIDE THE GATE RUNS ITSELF.
   The node suites are independent processes and the runner buffers each file's
   output, so running two at once costs nothing in legibility and takes the full
   gate from 330 s to 176 s (measured, 159 suites, this box, 4 cores). That is
   the window a push race is decided in, so halving it is worth more here than
   anywhere else: at the measured 165 s median gap between landings, a 330 s gate
   invites two more pushes than a 176 s one.
   TWO, not three. Three is faster still (125 s) but peaks at loadavg 3.65, over
   the >= 3 line this repo refuses to deploy above — and a gate that drives the
   box past its own "the machine is too busy to be measured" threshold is buying
   speed with the credibility of its verdicts. Two peaks at 2.57.
   The DEFAULT stays 1 for everyone else: this opts the deploy in rather than
   changing what `npm run test:tooling-fast` does under other sessions and CI. */
const GATE_JOBS = "--jobs=2";

/* WHAT A REJECTED PUSH ACTUALLY NEEDS RE-VERIFIED.
   The full gate ran before attempt 1 and it passed; the commits that beat us
   were verified by the session that pushed them, which ran this same gate. So
   the only thing the union has that neither side verified is the INTERACTION —
   and if what landed touches no shipped code, there is no interaction to have.
   Measured on this repo over 12 h: 146 merges reached the deploy branch and
   109 of them (75 %) touched no js/, css/ or index.html at all.
   So: shipped code in the incoming delta -> the whole gate, exactly as before.
   Otherwise -> the cross-file guards, which is what a merge can actually break.
   This matters because the RETRY is the race. Every 10-minute re-verify invites
   ~3.6 more pushes at the measured median gap of 165 s, so a full-gate retry
   makes losing the next attempt MORE likely, not less. One deploy this session
   ran the full 157-suite gate three times and won on the last attempt. */
function reverifyUnion(before) {
  const changed = git(["diff", "--name-only", `${before}..HEAD`]).out.split("\n").filter(Boolean);
  const ships = changed.filter((f) => /^(js|css)\//.test(f) || f === "index.html");
  if (ships.length) {
    run("node", ["tools/ci/tooling-fast.mjs", GATE_JOBS],
        `re-verify the new union in full — it brings shipped code (${ships.slice(0, 3).join(", ")}${ships.length > 3 ? ` +${ships.length - 3}` : ""})`);
    return "full gate";
  }
  run("node", ["tools/ci/tooling-fast.mjs", ...MERGE_GUARDS],
      `re-verify the new union: ${changed.length} file(s), no shipped code, so the cross-file guards`);
  return `${MERGE_GUARDS.length} merge guards`;
}

function pushWithRetry() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = git(["push", REMOTE, `HEAD:${DEPLOY_BRANCH}`]);
    if (r.code === 0) return attempt;
    log(`push rejected (attempt ${attempt}): ${r.err.split("\n").pop()}`);
    const before = git(["rev-parse", "HEAD"]).out.trim();
    must(git(["fetch", "--no-tags", REMOTE, DEPLOY_BRANCH]), "fetch");
    mergeDeployTip();
    log(`re-verified: ${reverifyUnion(before)}`);
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
  if (!p.fastForward) verdict.merge = mergeDeployTip();
  run("node", ["tools/ci/tooling-fast.mjs", GATE_JOBS], "guard suite on the union"); verdict.verified.push("tooling-fast");
  // The Pages gate runs MORE node suites than tooling-fast (quali-persist,
  // node-slow, the VM twins, …) and two deploys went red on pins tooling-fast
  // never runs (run 1889, 2026-09-02). Run exactly what the gate runs, read
  // from ci.yml so the two lists cannot drift apart.
  for (const script of gateNodeSuites()) { run("npm", ["run", script], `Pages gate: ${script}`); verdict.verified.push(script); }
  for (const id of touchedCircuits(p.tip)) { run("node", ["tools/track/verify-track.cjs", id], `verify-track ${id}`); verdict.verified.push(`verify-track:${id}`); }
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
