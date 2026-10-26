#!/usr/bin/env node
// deploy.mjs — the ONE deploy command (2026-09-01).
//
// A DIRECT PUSH TO THE DEPLOY BRANCH IS REFUSED (2026-09-30): branch protection
// requires a pull request with the 12 fast-tier checks green (`enforcement_level:
// non_admins`, so only an admin token bypasses it; AGENTS.md §Git branch &
// deploy), so the default mode's final `git push` fails with GH006. `--pr` is
// the form that lands work now; `--gate-only` is still the pre-push check.
// @doc The ONE deploy: fetch, merge, tooling-fast, gate node suites, sweeps if geometry moves, verify-track, then `--pr`.
// Full description: the ONE deploy: fetch → merge → tooling-fast → the Pages gate's node suites → sweeps if the union moves geometry (else only the targeted sweeps that read it) → verify-track → push the deploy branch (or --pr); pages.yml stamps it
//
//   node tools/ci/deploy.mjs --plan        # print the steps + the union diffstat, run nothing
//   node tools/ci/deploy.mjs               # fetch → merge → tooling-fast → the Pages gate's node
//                                       #   suites → test:sweeps (only if the union can move
//                                       #   geometry; else just the targeted sweeps that read
//                                       #   it — geometry-paths.mjs) → verify-track (touched
//                                       #   circuits) → push
//                                       #   HEAD to the deploy branch (retry ×3)
//   node tools/ci/deploy.mjs --pr-on-race  # direct push, but after TWO fast-forward losses open a
//                                       #   PR instead of a third ~50-min re-verify (busy branch)
//   node tools/ci/deploy.mjs --pr          # same checks, then push the session branch and open /
//                                       #   update a PR into the deploy branch (never pushes there)
//   node tools/ci/deploy.mjs --gate-only   # run the DEPLOY GATE and stop: tooling-fast + ci.yml's
//                                       #   node suites + verify-track. Pushes nothing, allows a
//                                       #   dirty tree. THE pre-push check: test:tooling-fast is a
//                                       #   subset and skips the gate's node suites (sizes:
//                                       #   node tools/gen/gen-ladder-figures.mjs --table).
//                                       #   Its union is commits + staged + unstaged + untracked
//                                       #   (changedPaths), so an uncommitted circuit edit still
//                                       #   gets the sweeps and its verify-track.
//                                       #   Order: test:guards → tooling-fast on the diff's files
//                                       #   (--bail) → the rest of tooling-fast → the node suites'
//                                       #   files tooling-fast did NOT run → sweeps-parts → ….
//   … --gate-only --resume              # skip stages whose receipt (artifacts/logs/gate-receipts.json)
//                                       #   passed on THIS work tree; refuses (exit 3) when it moved
//   … --gate-only --detach              # run the gate as a detached child (log artifacts/logs/
//                                       #   deploy-gate.log) that outlives a dropped task; --status/--wait
//   … --wait-load=<min>                 # wait up to N min (default 10) for loadavg < 2.8 before the
//                                       #   loadavg >= 3 refusal (0 = refuse at once)
//   node tools/ci/deploy.mjs --train       # print train health (last push ci, pages, and the
//                                       #   NIGHTLY rota by JOB) and stop. Two curl calls, no
//                                       #   preflight: the "is the branch already red, and did
//                                       #   last night's rotating group find anything" check.
//   node tools/ci/deploy.mjs --json        # machine verdict on stdout, log on stderr
//   node tools/ci/deploy.mjs --status      # the last run's verdict marker in artifacts/logs/deploy.log:
//                                       #   exit 0 passed / 1 failed or died / 124 still running
//   node tools/ci/deploy.mjs --wait --timeout 45   # block (minutes) until it leaves "running"; run as ONE
//                                       #   background task. Every deploy run stamps `= deploy start|done`.
//
// What it replaces: the prose protocol in the deploy-merge skill — fetch, look,
// merge, re-bump the union, tooling-fast, sweeps, push; pages.yml verify-live
// (and deploy-research) own the public Pages check — this box cannot reach github.io.
// What changed underneath it (see pages.yml "Stamp the shell generation"): the
// build number is stamped by the deploy from the commit count, so there is no
// union re-bump; a version.json/index.html conflict inside a @gen-shell span
// resolves by regeneration (tags read ?v=dev; the deploy stamps hashes) and
// keeps both sides' hand-written markup; one outside a span stops. Sweeps ran here again from
// 2026-09-18, conditionally: they are CI's too, but CI runs them AFTER the
// push, and one float-equality failure that only test:sweeps could catch broke
// Pages for hours past a green deploy (the reversal is argued at
// touchesGeometry()). The verdict also carries notCovered[] — what this gate
// did NOT measure — so a green here stops implying more than it checked.
// The live check is pages.yml's `verify-live` job — this box cannot reach
// github.io, the runner can.
//
// Refuses: a dirty tree, loadavg >= 3, a live Playwright run, any conflict
// outside index.html/version.json, a non-fast-forward it cannot cure with a
// re-merge in three tries. Never --force, never rebase, never amend.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { GEOMETRY_PATHS, targetedSuites } from "./geometry-paths.mjs";
// W1 (2026-10-26): gate receipts / --resume / --detach, and the node half's tooling-fast dedupe.
import { GATE_RECEIPTS, DETACH_RECEIPT, DETACH_LOG, readJson, writeJson, resumeVerdict, stagePassed } from "../lib/deploy-status.mjs";
import { loadGroups, commandFor } from "../gen/gen-test-groups.mjs";
import { nodeGroupPhases } from "./run-node-group.mjs";
import { workTreeId } from "../lib/work-tree-id.mjs";
import { githubToken } from "./github-token.mjs";
import { superviseDeployChild } from "./deploy-child.mjs";
import { request } from "./github-api.mjs";
import { changedPaths as diffPaths } from "../lib/changed-files.mjs";
import { NODE_TEST_TIMEOUT_MS } from "../gen/gen-test-groups.mjs";
import { resolveGenBlocks, mergePackageJson, mergeJson3 } from "../lib/conflict-cure.mjs";
import { saveOutputArtifact } from "../agent/output.mjs";
import { DEFAULT_LOG, stamp, readStatus, waitStatus } from "../lib/deploy-status.mjs";

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
// Node supports parent file descriptors as child stdio: no maxBuffer or
// in-memory capture. https://nodejs.org/api/child_process.html#optionsstdio
// A hung child (a test file that never ends) used to hang the whole gate until the 30-minute background
// ceiling killed it with no verdict line. Every child now stops at this ceiling, with SIGTERM so
// tooling-fast can reap the process groups it leads, and run() turns that into a named failure.
export const CHILD_TIMEOUT_MS = Math.max(1, Number(process.env.APEX_DEPLOY_CHILD_TIMEOUT_MIN) || 25) * 60e3;
export async function spawnDeployChild(cmd, args, { cwd = ROOT, env = process.env, json = JSON_OUT, root = ROOT, announce = log, timeoutMs = CHILD_TIMEOUT_MS } = {}) {
  const stop = { timeoutMs };
  if (!json) return superviseDeployChild(cmd, args, { cwd, env, stdio: "inherit", ...stop });
  const artifact = saveOutputArtifact("", { root, tool: "deploy-child", kind: "log" });
  const fd = fs.openSync(path.resolve(root, artifact.path), fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
  try {
    announce(`child stdout: ${artifact.path} (complete log; stderr remains live)`);
    const result = await superviseDeployChild(cmd, args, { cwd, env, stdio: ["ignore", fd, "inherit"], ...stop });
    return { ...result, stdoutArtifact: { ...artifact, bytes: fs.fstatSync(fd).size } };
  } finally { fs.closeSync(fd); }
}
function childFailure(result, message, timeoutMs) {
  const detail = result.error?.code === "ETIMEDOUT" ? `timed out after ${Math.round((timeoutMs ?? CHILD_TIMEOUT_MS) / 6e3) / 10} min, stopped with SIGTERM/SIGKILL`
    : result.error?.message || (result.signal ? `signal ${result.signal}` : `exit ${result.status}`);
  const error = new Error(`${message} (${detail})${result.stdoutArtifact ? ` — complete stdout: ${result.stdoutArtifact.path}` : ""}`);
  if (result.stdoutArtifact) error.stdoutArtifact = result.stdoutArtifact;
  return error;
}
export async function run(cmd, args, what, options) {
  log(`${what}: ${cmd} ${args.join(" ")}`);
  const r = await spawnDeployChild(cmd, args, options);
  if (r.error || r.signal || r.status !== 0) throw childFailure(r, `${what} failed`, options?.timeoutMs);
}

export function preflight(cwd = ROOT) {
  const problems = [];
  if (git(["status", "--porcelain"], { cwd }).out) problems.push("working tree is dirty — commit first");
  const load = os.loadavg()[0];
  if (load >= 3) problems.push(`loadavg ${load.toFixed(2)} >= 3 — a verification now measures the box`);
  const ps = spawnSync("pgrep", ["-f", "run-playwrigh[t]|playwright tes[t]"], { encoding: "utf8" });
  if (ps.status === 0 && ps.stdout.trim()) problems.push("a Playwright run is live — never merge or push under it");
  return problems;
}

// THREE dots, not two. `diff base HEAD` is the two-way difference, so before the
// merge it reports circuits THEY changed as though we had touched them — a
// --plan that promised verify-track over 12 circuits our commits never went
// near, against a run that (correctly) verified none. `base...HEAD` diffs from
// the merge-base, i.e. OUR side only, which is what both callers want: the plan
// reads it pre-merge and the run reads it post-merge, where the two forms agree
// because the tip is an ancestor by then. Same idiom `theirDiffstat` already
// uses in the other direction.
//
// PLUS THE WORKING TREE (2026-09-22). `base...HEAD` sees commits only, but
// --gate-only exists to gate an UNCOMMITTED edit (it waives preflight's dirty
// refusal for exactly that), and every suite it runs reads the working tree.
// Change detection read HEAD: a session that edited js/circuits/portimao.js and
// its scenery, uncommitted, got "test:sweeps (nothing in this union can move
// geometry)" and no verify-track at all, on a diff that moved three baselines.
// So the union is committed + staged + unstaged + untracked-not-ignored. A real
// deploy refuses a dirty tree, so for it the extra terms are empty.
// null (never []) when any of the three git reads fails: callers fail SAFE.
// Diffs go through tools/lib/changed-files.mjs (2026-10-26): `--name-status -M`
// lists BOTH ends of a rename, so a file moved out of js/circuits/ still routes.
export function changedPaths(base, cwd) {
  const at = cwd || ROOT;
  let diffs;
  try {
    diffs = [
      ...diffPaths([`${base}...HEAD`], { cwd: at, run: quietGit }),   // our commits
      ...diffPaths(["HEAD"], { cwd: at, run: quietGit }),             // staged + unstaged
    ];
  } catch { return null; }
  const untracked = git(["ls-files", "--others", "--exclude-standard"], { cwd: at });  // new, not ignored
  if (untracked.code !== 0) return null;
  return [...new Set([...diffs, ...untracked.out.split("\n")].filter(Boolean))];
}
const quietGit = (cmd, args, o) => execFileSync(cmd, args, { ...o, stdio: ["ignore", "pipe", "ignore"] });

export function touchedCircuits(base, cwd) {
  return [...new Set((changedPaths(base, cwd) || [])
    .map((f) => /^js\/circuits\/(?:scenery\/)?([a-z_]+)\.js$/.exec(f))
    .filter(Boolean).map((m) => m[1]))];
}

/* A SHALLOW clone whose depth stops short of the merge base cannot merge:
   git sees no shared history, so the deploy tip reads as unrelated (merge
   refuses) or as conflicting everywhere. Cloud sessions clone shallow (depth
   50) and usually DO reach the base, so shallow alone is fine; shallow with no
   merge base is named up front instead of failing mid-merge. */
export function assertMergeable(a, b, cwd) {
  const o = cwd ? { cwd } : {};
  if (git(["merge-base", a, b], o).code === 0) return;
  if (git(["rev-parse", "--is-shallow-repository"], o).out === "true") {
    throw new Error(`this clone is SHALLOW and its history stops before the merge base of ${a} and ${b}, so git would read the merge as unrelated or conflicted. Unshallow first: \`git fetch --unshallow ${REMOTE}\` (or \`git fetch --deepen=500 ${REMOTE}\`), then re-run`);
  }
  throw new Error(`${a} and ${b} share no history (no merge base) — not a branch of the deploy branch?`);
}

/* `git merge-tree --write-tree` exits 0 clean, 1 with conflicts, anything else
   on an error (unrelated histories, a missing object). Exit 1 with no CONFLICT
   line, or any other non-zero, is an ERROR — it used to read as "clean". */
export function mergeTreeConflicts(mt) {
  const conflicts = (mt.err + "\n" + mt.out).split("\n").filter((l) => l.startsWith("CONFLICT")).map((l) => l.replace(/^CONFLICT \([^)]*\): /, ""));
  if (mt.code === 0) return [];
  if (mt.code === 1 && conflicts.length) return conflicts;
  throw new Error(`git merge-tree could not compute the merge with the deploy tip (exit ${mt.code}, ${conflicts.length} CONFLICT lines): ${(mt.err || mt.out || "no output").split("\n")[0]}`);
}

export function plan() {
  must(git(["fetch", "--no-tags", REMOTE, DEPLOY_BRANCH]), "fetch");
  const tip = must(git(["rev-parse", `${REMOTE}/${DEPLOY_BRANCH}`]), "rev-parse");
  const head = must(git(["rev-parse", "HEAD"]), "rev-parse HEAD");
  assertMergeable(head, tip);
  const branch = git(["branch", "--show-current"]).out;
  const ancestor = git(["merge-base", "--is-ancestor", tip, head]).code === 0;
  const theirs = git(["log", "--oneline", `${head}..${tip}`]).out.split("\n").filter(Boolean);
  const ours = git(["log", "--oneline", `${tip}..${head}`]).out.split("\n").filter(Boolean);
  const stat = git(["diff", "--stat", `${head}...${tip}`]).out;
  const conflicts = ancestor ? [] : mergeTreeConflicts(git(["merge-tree", "--write-tree", head, tip]));
  return { branch, head, tip, fastForward: ancestor, theirCommits: theirs, ourCommits: ours, theirDiffstat: stat, conflicts,
    touchedCircuits: touchedCircuits(tip),
    steps: [
      ancestor ? "merge: nothing to merge (deploy tip is an ancestor)" : "merge origin/" + DEPLOY_BRANCH + " (conflicts in GENERATED files cure themselves: index.html/version.json via gen-shell, ratchets.json re-measured, package.json from groups.json, tools/README.md from the tools' @doc headers, docs/agent-output/catalog.json from gen-output-surface; then `npm run gen` re-derives every generated file on the union, conflict or not, and commits any drift)",
      "tools/ci/tooling-fast.mjs (the full node gate; width from tooling-fast's autoJobs: 2 on a quiet box, else 1)",
      "the Pages gate's node suites (ci.yml \"Pure-node unit suites\", read from the file) — minus the files tooling-fast just passed",
      touchesGeometry(tip) ? "test:sweeps (~10 min — this union can move geometry)"
                           : (targetedFor(tip).length
                               ? `targeted sweeps only — ${targetedFor(tip).map((s) => path.basename(s)).join(", ")} (the suites that read this union; no fleet rebuild)`
                               : "test:sweeps SKIPPED (nothing in this union can move geometry or reach a targeted sweep)"),
      "verify-track for touched circuits",
      flag("--pr") ? "push the session branch and open/update a PR into the deploy branch"
                   : "git push origin HEAD:" + DEPLOY_BRANCH + " (fast-forward, retry ×3)",
      "the push starts pages.yml, which gates the tip once (ci.yml called for the full gate), stamps the build and verify-live confirms it",
    ] };
}

// The `npm run test:*` lines of ci.yml's "Pure-node unit suites" step — the
// deploy gate's node half. Empty (and logged) if the step is ever renamed, so
// a rename shows up as a missing verdict entry rather than a silent skip.
export function gateNodeSuites() {
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
  // Deduplicated: a script that two matrix arms run as shards of one roster
  // (test:game-vm-a under vm-a1 / vm-a2) is one script here, run whole.
  const scripts = [...new Set([...body.matchAll(/^\s+npm run (test:[\w-]+)\s*$/gm)].map((m) => m[1]))];
  if (!scripts.length) throw new Error("deploy: the 'Pure-node unit suites' step parsed to ZERO scripts — refusing to push on a gate that measured nothing.");
  return scripts;
}

/* THE GEOMETRY HALF OF THE GATE — and a REVERSAL, recorded on purpose.
 *
 * This file used to say: "Sweeps are CI's (ci.yml runs them on the same diff,
 * conditionally); running them here only duplicated 10 minutes." That was true
 * and it was still the wrong call, for a reason the sentence does not contain:
 * ci.yml runs the sweeps AFTER the push, so the duplication it saves is paid
 * for by shipping a broken tip to a branch other sessions develop directly on.
 *
 * 2026-09-18 is the bill. d9ae0ab moved Suzuka, debris-hazard-hint compared a
 * computed float with assert.equal, the two paths landed one ULP apart
 * (4893.275779224587 vs 4893.2757792245875), and Pages failed for HOURS — past
 * a deploy that had run tooling-fast and all twelve "Pure-node unit suites"
 * and reported green, because the only suite that could catch it lives in
 * test:sweeps and nothing here ran test:sweeps.
 *
 * The 10 minutes are real, so they are CONDITIONAL: paid only when the union
 * can actually move geometry, which is the same condition ci.yml applies. What
 * this does NOT cover is a session pushing straight to the deploy branch
 * without deploy.mjs — that path still learns from CI after the fact. Hence
 * notCovered() below: the other half of this fix is that a gate says what it
 * did not measure instead of reporting a bare green.
 *
 * Both halves of the filter are DERIVED, never retyped: the path pattern is
 * geometry-paths.mjs, the ONE copy ci.yml's grep also reads, and the suite list
 * is read out of package.json's test:sweeps by the same match ci.yml uses.
 * Each half drifted exactly once by being hand-written — ci.yml's suite list
 * was missing scenery-grounding, and this file's path list still matched
 * debris-world's PRE-RENAME location under js/game/ (tools/manifest.cjs's
 * MOVED map records the rename to js/physics/debris-world.js), so the local
 * gate skipped the sweeps on the one edit CI runs them for. A path inside a
 * regex literal is invisible to a rename sweep; deploy-tool.test.mjs now
 * proves every path the pattern names is a path on disk.
 *
 * FAIL SAFE, NEVER FAIL OPEN: a diff we cannot resolve RUNS them, and a suite
 * list that parses to nothing THROWS rather than quietly matching nothing. */

export function sweepSuites() {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")); }
  catch (e) { throw new Error("deploy: cannot read package.json — the sweep suite list is undefined: " + e.message); }
  const suites = String((pkg.scripts && pkg.scripts["test:sweeps"]) || "").match(/tests\/unit\/[^\s]+/g) || [];
  if (!suites.length) throw new Error("deploy: package.json's test:sweeps names ZERO suites — refusing to derive a geometry filter from nothing.");
  return suites;
}

/** Can THIS set of paths move circuit geometry? Shared by the union check and
 *  by the push-rejection retry, which re-merges a new union that main() has
 *  already swept past — see reverifyUnion(). */
export function anyGeometry(files) {
  if (files.some((f) => GEOMETRY_PATHS.test(f))) return true;
  const suites = new Set(sweepSuites());
  return files.some((f) => suites.has(f));              // a moved baseline counts too
}

export function touchesGeometry(base, cwd) {
  const files = changedPaths(base, cwd);
  if (!files) return true;                              // unresolvable diff -> run them
  return anyGeometry(files);
}

/* THE TARGETED TIER (2026-09-22). Ten of the fourteen sweep suites measure the
 * fleet build; the other four (and two fleet-iterating ones with an extra
 * input) read a specific source — js/lighting, js/car, debris-world, the
 * driving-line pair — that is NOT part of the fleet build. The old trigger
 * named js/game.js, js/car/ and debris-world as geometry, so a game.js edit
 * (nearly every session) paid ten fleet rebuilds for suites that never read
 * it. Now: the fleet runs when the fleet's inputs change (geometry-paths.mjs
 * derives that from the manifest); otherwise ONLY the suites that read the
 * union run, and a game.js-only union runs none. Asked only after
 * touchesGeometry() said no: an unresolvable diff already ran everything. */
export function targetedFor(base, cwd) {
  const files = changedPaths(base, cwd);
  if (!files) return [];
  return targetedSuites(files);
}

async function runTargeted(suites, why) {
  const names = suites.map((s) => path.basename(s));
  await run("node", ["--test", `--test-timeout=${NODE_TEST_TIMEOUT_MS}`, "--test-concurrency=1", ...suites], `${why}: targeted sweeps (${names.join(", ")}) — no fleet rebuild`);
  return names.map((n) => `sweeps:${n}`);
}

/* What this deploy did NOT measure. A green verdict that lists only what ran
 * is how both of 2026-09-18's breakages got past a gate: tooling-fast reported
 * 207/207 while knowing nothing about test:sweeps or test:lifecycle-unit. The
 * browser groups are never run here (SwiftShader: 10-40 min each) and a
 * non-geometry union skips the sweeps, so both are named rather than implied. */
export function notCovered(ranSweeps, targeted = []) {
  const out = ["browser smoke groups (ci.yml runs them after the push)"];
  if (!ranSweeps) out.push("test:sweeps (nothing in this union can move geometry" +
    (targeted.length ? `; the targeted sweeps that read it ran: ${targeted.map((s) => path.basename(s)).join(", ")})` : ")"));
  return out;
}

// tools/manifest.cjs MOVED (written by tools/gen/move-tree.mjs): old path -> new.
function manifestMoved() {
  try { return createRequire(import.meta.url)(path.join(ROOT, "tools/manifest.cjs")).MOVED || {}; } catch (_) { return {}; }
}

const RATCHETS = "tests/data/ratchets.json";
const TOOLS_README = "tools/README.md";
const OUTPUT_CATALOG = "docs/agent-output/catalog.json";
// Generated by gen:docs from the tree; a conflict is two stale renderings (system audit 2026-10-26).
const DERIVED_DOCS = ["docs/agent-index.json", "tests/data/impact-map.json", "docs/AGENT-HOOKS.md", "docs/TESTING-COVERAGE.md"];
// The scenery survey cache: its `sourceDigest` hashes every TRACK_VM file, so
// any two circuit/engine PRs conflict on it (75 real conflicts in 7 days, the
// tree's top hot spot; system audit 2026-10-26 §7). Its generator takes ~2 min,
// so it is not in `npm run gen`: the cure path alone runs it.
const SCENERY_LOCATIONS = "tools/shot/scenery-locations.json";
// Per-circuit ratchet ceilings; cured by a per-circuit three-way merge (cureableConflicts).
export const BASELINES = ["tools/track/props-tris-baseline.json", "tools/track/clip-baseline.json"];
/** Three-way merge of a per-circuit baseline by key: `{ text, conflicts }` (conflicts = circuits both sides changed differently). */
export function mergeBaseline(baseText, oursText, theirsText) {
  const parse = (t) => (t && t.trim() ? JSON.parse(t) : {});
  const r = mergeJson3(parse(baseText), parse(oursText), parse(theirsText), () => false);
  return { text: JSON.stringify(r.merged, null, 2) + "\n", conflicts: r.conflicts };
}
/* Every number in ratchets.json, flattened to `scope/name` -> value, so the
   three sides of a conflict can be compared metric by metric. */
export function ratchetMetrics(json) {
  const out = {};
  for (const [file, m] of Object.entries((json && json.files) || {})) {
    for (const [k, v] of Object.entries(m)) if (typeof v === "number") out[`${file}/${k}`] = v;
  }
  for (const [name, m] of Object.entries((json && json.tree) || {})) {
    // A tree entry is `{ ceiling, slack? }` or a bare number (waitForTimeout is
    // stored that way); skipping the bare form left it unbounded on a merge.
    const c = typeof m === "number" ? m : m && m.ceiling;
    if (typeof c === "number") out[`(tree)/${name}`] = c;
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

async function cureRatchets() {
  const base = ratchetStage(1), ours = ratchetStage(2), theirs = ratchetStage(3);
  must(git(["checkout", "--theirs", "--", RATCHETS]), `checkout --theirs ${RATCHETS}`);
  await run("node", ["tools/check/ratchets.mjs", "--update", "--absolute"], "snap the ratchets to the merged tree");
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
   index.html's @gen-shell blocks/version.json come from the manifest,
   ratchets.json from measuring the tree, and package.json's script block from
   tests/groups.json — the rest of those two files is hand-written and is
   merged, not replaced (tools/lib/conflict-cure.mjs, ledger L13).

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
  // docs/agent-output/catalog.json is GENERATED (gen-output-surface.mjs) from
  // the tools tree, package.json scripts, .mcp.json and policies.json; two PRs
  // that each add a tool can touch neighbouring rows. Same cure: regenerate.
  // (policies.json is hand-written, so a conflict THERE still stops the merge.)
  const catalogF = conflicted.filter((f) => f === OUTPUT_CATALOG);
  // docs/agent-index.json, tests/data/impact-map.json and docs/AGENT-HOOKS.md
  // (gen-agent-index.mjs) and docs/TESTING-COVERAGE.md (gen-coverage-table.mjs)
  // are rewritten from the tree; 7 days of merges showed 13/16/6 real conflicts
  // in them that forced hand merges. Same cure: take a side, regenerate.
  const derivedF = conflicted.filter((f) => DERIVED_DOCS.includes(f));
  // tools/shot/scenery-locations.json (gen-scenery-locations.cjs): same cure,
  // take ours and regenerate from the merged TRACK_VM sources.
  const sceneryF = conflicted.filter((f) => f === SCENERY_LOCATIONS);
  // tools/track/props-tris-baseline.json and clip-baseline.json (W1, 2026-10-26):
  // one number per circuit, so two circuit PRs touching neighbouring rows
  // conflict. NOT regenerated: they are RATCHET CEILINGS (props-tri-ratchet /
  // prop-clipping), a raise is a decision its commit argues, and no tool writes
  // them whole (props-tris.cjs only reports; clip-audit.cjs --lower only lowers),
  // so a measured rewrite would bless whatever the union measures. The cure is
  // a three-way merge BY CIRCUIT (each side's edits against the base, the same
  // mergeJson3 package.json uses); the same circuit edited differently on both
  // sides still stops, and test:sweeps (both suites) then measures the union.
  const baselineF = conflicted.filter((f) => BASELINES.includes(f));
  // (The gate-ladder figures used to be cured here too; since 2026-09-30 no
  // doc commits them — tools/gen/gen-ladder-figures.mjs only reports — so
  // there is nothing left to conflict.)
  const sourceContested = conflicted.includes("tests/groups.json");
  const cureable = conflicted.length > 0 && !sourceContested
    && shellF.length + ratchetF.length + pkgF.length + toolsF.length + catalogF.length + derivedF.length + sceneryF.length + baselineF.length === conflicted.length;
  return { cureable, shellF, ratchetF, pkgF, toolsF, catalogF, derivedF, sceneryF, baselineF };
}

/* THE UNION MAY NEED A DEPENDENCY THE BOX HAS NOT GOT. A merged lockfile is
   a change to what the gate needs installed, and `node_modules` does not
   follow a merge: on 2026-09-22 the train merged PR #172 (which added
   monocart-coverage-reports), ran tooling-fast on the union and reported
   coverage-merge.test.mjs red with "Cannot find package" — a gate verdict
   about this box, not about the union. So after every merge that touched the
   lockfile, install (browsers skipped; seconds when nothing changed) before
   anything is measured. */
export async function installIfLockMoved(before) {
  const changed = git(["diff", "--name-only", `${before}..HEAD`, "--", "package-lock.json", "package.json"]).out.trim();
  if (!changed) return false;
  log("the union changed package-lock.json — npm install before the gate measures it");
  const r = await spawnDeployChild("npm", ["install", "--no-audit", "--no-fund"], {
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
  });
  if (r.error || r.signal || r.status !== 0) throw childFailure(r, "npm install failed — the union needs a package this box could not install");
  return true;
}

/* A CLEAN MERGE CAN STILL BE STALE (2026-09-24, four red PRs in one day).
   The cures below run only when git reports a CONFLICT, but a generated figure
   goes stale without one: two sides that each added a tool both rewrite a
   generated index identically, the hunks merge silently, and the union is a
   row short — a guard turns the PR red on a merge nobody touched.
   So after EVERY merge the derived files are re-derived from the merged
   sources with `npm run gen` (package.json's own list of every generator, read
   rather than retyped here, ~3 s), and whatever it rewrites is committed as a
   follow-up commit. On a consistent union it writes nothing and commits
   nothing. Exported for tests/unit/deploy-tool.test.mjs, which runs it against
   a real clean-but-stale merge. */
export const REGEN_MESSAGE = "merge: regenerate derived files on the union (npm run gen)";
export async function regenerateDerived(cwd = ROOT) {
  const r = await spawnDeployChild("npm", ["run", "gen"], { cwd });
  if (r.error || r.signal || r.status !== 0) throw childFailure(r, "npm run gen failed on the merged tree — a generator's source did not merge into something it can read");
  const dirty = git(["status", "--porcelain"], { cwd }).out;
  if (!dirty) return null;
  must(git(["add", "-A"], { cwd }), "add regenerated files");
  must(git(["commit", "-q", "-m", REGEN_MESSAGE], { cwd }), "commit regenerated files");
  return dirty.split("\n").filter(Boolean).map((l) => l.slice(3));
}

export async function mergeDeployTip() {
  assertMergeable("HEAD", `${REMOTE}/${DEPLOY_BRANCH}`);
  const before = git(["rev-parse", "HEAD"]).out.trim();
  const r = git(["merge", "--no-edit", `${REMOTE}/${DEPLOY_BRANCH}`]);
  if (r.code === 0) {
    await installIfLockMoved(before);
    const regen = await regenerateDerived();
    return regen ? `merged (clean; regenerated ${regen.join(", ")})` : "merged";
  }
  // A REFUSAL (unrelated histories, a dirty file the merge would overwrite)
  // starts no merge: there is nothing to abort, and an empty conflict list
  // must not read as "every conflict is cureable".
  if (git(["rev-parse", "-q", "--verify", "MERGE_HEAD"]).code !== 0) {
    throw new Error(`git merge refused to start (exit ${r.code}), nothing to abort: ${(r.err || r.out || "no output").split("\n")[0]}`);
  }
  const conflicted = git(["diff", "--name-only", "--diff-filter=U"]).out.split("\n").filter(Boolean);
  if (!conflicted.length) {
    git(["merge", "--abort"]);
    throw new Error(`git merge stopped (exit ${r.code}) with no conflicted file — aborted: ${(r.err || r.out || "no output").split("\n")[0]}`);
  }
  // The CUREABLE set: files this repo GENERATES, where a conflict is a stale
  // derived value rather than two intents to reconcile. Anything else is a
  // real disagreement and stops.
  const { cureable, shellF, ratchetF, pkgF, toolsF, catalogF, derivedF, sceneryF, baselineF } = cureableConflicts(conflicted);
  if (!cureable) {
    git(["merge", "--abort"]);
    const moved = manifestMoved();
    const named = conflicted.filter((f) => f !== RATCHETS && !shellF.includes(f) && !pkgF.includes(f) && !toolsF.includes(f) && !catalogF.includes(f) && !derivedF.includes(f) && !sceneryF.includes(f) && !baselineF.includes(f))
      .map((f) => (moved[f] ? `${f} (moved to ${moved[f]} — re-apply their edit there)` : f));
    throw new Error(`real conflicts (not just generated files): ${named.join(", ")} — resolve by hand`);
  }
  const did = [];
  // L13 (2026-10-09): index.html and package.json are only PARTLY generated.
  // The cure used to take a whole side (`--theirs` / `--ours`) and so dropped
  // the other side's hand edits where git had merged them cleanly (a DOM
  // element, a dependency). It now resolves only what a generator rewrites
  // (tools/lib/conflict-cure.mjs) and stops on anything else.
  const stop = (why) => {
    git(["merge", "--abort"]);
    throw new Error(`real conflicts (not just generated files): ${why} — resolve by hand`);
  };
  if (shellF.length) {
    for (const f of shellF) {
      if (f === "version.json") { must(git(["checkout", "--theirs", "--", f]), `checkout --theirs ${f}`); continue; }   // wholly generated
      must(git(["checkout", "--merge", "--", f]), `checkout --merge ${f}`);                                              // markers back in place
      const r = resolveGenBlocks(fs.readFileSync(path.join(ROOT, f), "utf8"));
      if (r.unresolved.length) stop(`${f} (hand-written markup conflicts outside the @gen-shell blocks, line ${r.unresolved.join(", ")})`);
      fs.writeFileSync(path.join(ROOT, f), r.text);
    }
    await run("node", ["tools/gen/gen-shell.mjs"], "regenerate the union shell from the manifest");
    // Every generated block has to be rewritten, not just gen-shell's.
    // title-art.mjs owns @gen-shell:title-art (the #title-car car art); without
    // this line a shell conflict silently reverts the art to whatever the
    // other side carried, which looks exactly like nobody having changed it.
    await run("node", ["tools/gen/title-art.mjs"], "regenerate the title art into the union shell");
    must(git(["add", ...shellF]), "add");
    did.push("shell blocks re-applied (hand-written markup from both sides kept)");
  }
  if (ratchetF.length) { did.push(await cureRatchets()); must(git(["add", RATCHETS]), "add"); }
  if (pkgF.length) {
    // A three-way merge by key, so a dependency or a non-test script from
    // either side survives; the generator then rewrites every test script
    // from the merged groups.json.
    const stage = (n) => git(["show", `:${n}:package.json`]).out;
    const m = mergePackageJson(stage(1), stage(2), stage(3));
    if (m.conflicts.length) stop(`package.json (fields edited differently on both sides: ${m.conflicts.join(", ")})`);
    fs.writeFileSync(path.join(ROOT, "package.json"), m.text);
    await run("node", ["tools/gen/gen-test-groups.mjs"], "regenerate the test scripts from the merged groups.json");
    must(git(["add", "package.json"]), "add");
    did.push("package.json merged by key; test scripts regenerated from groups.json");
  }
  if (toolsF.length) {
    must(git(["checkout", "--ours", "--", TOOLS_README]), "checkout --ours tools/README.md");
    await run("node", ["tools/gen/gen-tools-readme.mjs"], "regenerate the tools index from the merged tree");
    must(git(["add", TOOLS_README]), "add");
    did.push("tools index regenerated");
  }
  if (catalogF.length) {
    // After the package.json cure: the catalog lists npm scripts too.
    must(git(["checkout", "--ours", "--", OUTPUT_CATALOG]), `checkout --ours ${OUTPUT_CATALOG}`);
    await run("node", ["tools/gen/gen-output-surface.mjs"], "regenerate the agent output catalog from the merged tree");
    must(git(["add", OUTPUT_CATALOG]), "add");
    did.push("agent output catalog regenerated");
  }
  if (derivedF.length) {
    for (const f of derivedF) must(git(["checkout", "--ours", "--", f]), `checkout --ours ${f}`);
    if (derivedF.some((f) => f !== "docs/TESTING-COVERAGE.md")) run("node", ["tools/docs/gen-agent-index.mjs"], "regenerate the agent index, hook page and impact map from the merged tree");
    if (derivedF.includes("docs/TESTING-COVERAGE.md")) run("node", ["tools/docs/gen-coverage-table.mjs"], "regenerate the coverage table from the merged tests");
    must(git(["add", ...derivedF]), "add");
    did.push("derived docs regenerated");
  }
  if (sceneryF.length) {
    must(git(["checkout", "--ours", "--", SCENERY_LOCATIONS]), `checkout --ours ${SCENERY_LOCATIONS}`);
    run("node", ["tools/shot/gen-scenery-locations.cjs"], "regenerate the scenery survey locations from the merged circuits (~2 min)");
    must(git(["add", SCENERY_LOCATIONS]), "add");
    did.push("scenery locations regenerated");
  }
  for (const f of baselineF) {
    const stage = (n) => git(["show", `:${n}:${f}`]).out;
    const m = mergeBaseline(stage(1), stage(2), stage(3));
    if (m.conflicts.length) stop(`${f} (the same circuit's ceiling changed differently on both sides: ${m.conflicts.join(", ")})`);
    fs.writeFileSync(path.join(ROOT, f), m.text);
    must(git(["add", f]), "add");
    did.push(`${path.basename(f)} merged by circuit`);
  }
  must(git(["commit", "--no-edit", "-q"]), "merge commit");
  await installIfLockMoved(before);
  // The cures above re-derive only the files that CONFLICTED; a derived file
  // that merged clean can be stale all the same (see regenerateDerived).
  const regen = await regenerateDerived();
  if (regen) did.push(`regenerated ${regen.join(", ")}`);
  return `merged (${did.join("; ")})`;
}

// The cross-file guards — the ones a MERGE breaks. Everything in this group
// asserts a relationship BETWEEN files (a registry against the tree, a
// generated file against its source, a ceiling against what it measures),
// which is exactly what goes wrong when two independently verified trees are
// joined. A physics suite cannot newly fail because someone else's docs commit
// landed. Read from tests/groups.json rather than listed here: a second copy of
// a registry is the class of problem this whole change is about, and
// `npm run test:guards` is that same group for a human before a commit.
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
   UNPINNED 2026-10-26 (W1): the gate used to stay at 2 whatever the box looked
   like. It now asks tooling-fast's own autoJobs() — 2 on a quiet box (no live
   browser run, loadavg < 2), else 1 — the same rule a bare
   `npm run test:tooling-fast` follows since BUILD-HUNT B4, so a gate started
   beside a browser run stops adding the load that times that run out.
   APEX_GATE_JOBS=<n> is the explicit override; CI passes its own --jobs=4. */
export async function gateJobs({ env = process.env, ps = () => execFileSync("ps", ["-eo", "pid,args"], { encoding: "utf8" }), load1 = os.loadavg()[0] } = {}) {
  const pinned = Number(env.APEX_GATE_JOBS);
  if (Number.isInteger(pinned) && pinned >= 1) return { jobs: pinned, why: `APEX_GATE_JOBS=${pinned}` };
  const { autoJobs } = await import("./tooling-fast.mjs");
  let busy = null;   // unknown → autoJobs treats it as busy (1)
  try {
    const { scanPlaywrightLines } = await import("./playwright-occupancy.mjs");
    busy = scanPlaywrightLines(ps()).busy;
  } catch { /* no ps: stay serial */ }
  return autoJobs({ busy, load1 });
}

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
/* A REJECTED PUSH MEANS A DIFFERENT TREE. main() sweeps the union it measured,
 * then a landing session makes that union stale — so whatever the re-merge
 * brings has to face the same questions, geometry included.
 *
 * It did not, for the first hours of this gate's life: deploy12 (2026-09-18)
 * swept its union, lost the push, re-merged six circuit scenery files
 * (estoril, fuji, jerez +3) and pushed them WITHOUT a sweep, while its verdict
 * still listed test:sweeps as verified and named only the browser groups as
 * uncovered. A gate reporting coverage it does not have is the exact defect
 * this gate exists to stop, so it does not get an exception for being mine. */
/* IS OUR OWN SIDE PURE PROSE? The re-verify below exists for the INTERACTION
   between our change and the one that beat us — and prose has none to have. A
   commit that adds only docs cannot be broken by their new renderer, and cannot
   break it; AGENTS.md rule 3 already carves the same class out of the commit
   hook. Deliberately NARROW: tests/ and tools/ are excluded from "prose",
   because a guard this session added really can be broken by code they landed
   (prepush-gate-coverage fails on a unit file added anywhere), and that is an
   interaction worth the full gate.
   MEASURED, 2026-09-18: six landings in 30 minutes, one every ~5 min, against a
   full re-verify of 4 min plus a 10 min sweeps leg. A prose-only deploy lost
   three races in a row and stopped — not because anything was wrong with it,
   but because it kept re-proving their code for them. */
export function proseOnly(files) {
  return files.length > 0 && files.every((f) => /^docs\//.test(f) || /\.md$/.test(f));
}

async function reverifyUnion(before, oursProse) {
  const changed = git(["diff", "--name-only", `${before}..HEAD`]).out.split("\n").filter(Boolean);
  const ships = oursProse ? [] : changed.filter((f) => /^(js|css)\//.test(f) || f === "index.html");
  // Their geometry was swept by the session that pushed it; ours cannot move any.
  const geom = !oursProse && anyGeometry(changed);
  let label;
  if (ships.length) {
    // "In full" must mean what main()'s gate means. It did not: this leg ran
    // tooling-fast ALONE and called itself the full gate, dropping the very
    // suites gateNodeSuites() exists for — the pins that took two deploys red
    // (run 1889) and that tooling-fast never runs. The retry path is the WORSE
    // place to skip them: it is the leg carrying another session's code, merged
    // seconds ago, that nothing in this process has yet measured.
    const why = `${ships.slice(0, 3).join(", ")}${ships.length > 3 ? ` +${ships.length - 3}` : ""}`;
    await run("node", ["tools/ci/tooling-fast.mjs", `--jobs=${(await gateJobs()).jobs}`],
        `re-verify the new union in full — it brings shipped code (${why})`);
    await runNodeHalf(gateNodeSuites(), await toolingFastRan(), { label: "re-verify: Pages gate" });
    for (const id of touchedCircuits(before)) await run("node", ["tools/track/verify-track.cjs", id], `re-verify: verify-track ${id}`);
    label = "full gate (tooling-fast + the Pages gate's node suites + verify-track)";
  } else {
    await run("node", ["tools/ci/tooling-fast.mjs", ...MERGE_GUARDS],
        `re-verify the new union: ${changed.length} file(s), ` +
        (oursProse ? "and OUR side is prose — no interaction to have, so the cross-file guards"
                   : "no shipped code, so the cross-file guards"));
    label = `${MERGE_GUARDS.length} merge guards` + (oursProse ? " (ours is prose)" : "");
  }
  // Geometry can arrive WITHOUT shipped code — a sweep suite's own baseline is
  // neither js/ nor css/ — so this is asked of the re-merge either way.
  if (geom) {
    await run("npm", ["run", "test:sweeps"], "re-verify: test:sweeps (the re-merged union can move geometry)");
    label += " + sweeps";
  } else if (!oursProse) {
    const tg = targetedSuites(changed);
    if (tg.length) { await runTargeted(tg, "re-verify"); label += ` + targeted sweeps (${tg.length})`; }
  }
  return { label, sweeps: geom };
}

async function pushWithRetry(oursProse = false) {
  let swept = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = git(["push", REMOTE, `HEAD:${DEPLOY_BRANCH}`]);
    if (r.code === 0) return { attempts: attempt, swept };
    log(`push rejected (attempt ${attempt}): ${r.err.split("\n").pop()}`);
    // A BUSY BRANCH CANNOT BE WON BY RE-VERIFYING. One full pass here is ~50
    // min and on 2026-09-22 the deploy tip took a PR merge every ~30 min, so
    // a direct push lost the fast-forward race three times in 2.5 h and the
    // fourth pass had to be killed by hand. A PR runs the identical gate on
    // GitHub with no race at all. With --pr-on-race the SECOND rejection
    // (one re-verify already lost) switches to that path instead of a third.
    if (attempt >= 2 && flag("--pr-on-race")) {
      log("push rejected twice — the branch is busy; opening a PR instead of a third re-verify (--pr-on-race)");
      return { attempts: attempt, swept, race: true };
    }
    const before = git(["rev-parse", "HEAD"]).out.trim();
    must(git(["fetch", "--no-tags", REMOTE, DEPLOY_BRANCH]), "fetch");
    await mergeDeployTip();
    const rv = await reverifyUnion(before, oursProse);
    swept = swept || rv.sweeps;
    log(`re-verified: ${rv.label}`);
  }
  throw new Error("push rejected three times — another session keeps landing; stop and look");
}

/* --pr without the gh CLI. The remote containers have GH_TOKEN/GITHUB_TOKEN and
   curl (through the agent proxy) but no gh, which left --pr printing a compare
   URL and the session merging by hand (PR #178, 2026-09-22). Same steps as the
   gh path — find an open PR for the head, or create one from the branch's last
   real commit — over REST only. Never arm auto-merge: only Merge Desk arms
   MERGE-commit auto-merge on ready PRs (squash retired 2026-10-13). The token
   travels as a curl config on stdin, never on the argv.

   NOT GraphQL (2026-09-22, measured): `api.github.com/graphql` is refused from
   Claude Code sessions. Historical auto-merge arming via CCR REST was removed
   so agents/tools cannot MERGE-arm (#1134/#1135). */
const REPO = "brycejmurrin/f1-game";
function ghApi(token, method, url, body) {
  // github-api.mjs's client (one door, 2026-10-26): token and JSON body on
  // curl's stdin config, 5xx/429 backoff. A curl failure still throws here.
  const r = request(url, { token, method, ...(body !== undefined ? { body } : {}) });
  if (r.error) throw new Error(`curl ${method} ${url}: ${r.error}`);
  if (r.badJson) throw new Error(`${method} ${url}: not JSON (${r.status}): ${r.text.trim().slice(0, 200)}`);
  return { status: r.status, json: r.json, ok: r.status >= 200 && r.status < 300 };
}
export function openPrRest(branch, token) {
  const [owner] = REPO.split("/");
  const api = `https://api.github.com/repos/${REPO}`;
  // A non-2xx lookup is NOT "no PR is open": read as that, it goes on to
  // create one and dies on GitHub's 422 instead of saying it could not look.
  const list = ghApi(token, "GET", `${api}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}&base=${encodeURIComponent(DEPLOY_BRANCH)}&per_page=1`);
  if (!list.ok) throw new Error(`PR lookup failed (HTTP ${list.status}): ${JSON.stringify(list.json).slice(0, 200)}`);
  const open = list.json;
  if (Array.isArray(open) && open[0]?.html_url) {
    return { pr: open[0].html_url, note: "PR already open; the push updated it. Do not arm auto-merge — Merge Desk arms MERGE on ready tip-green" };
  }
  // The title comes from the branch's last REAL commit, not from HEAD: a
  // deploy merges the base tip before it opens the PR, so HEAD is almost
  // always "Merge remote-tracking branch …", which is what PR #182 was called
  // until this line existed. `--no-merges` walks back to the work itself.
  // ORIGIN/, not the local branch name: the session's local copy of the
  // deploy branch is whatever it was when the session started, so a range
  // from it spans every session's commits since — and PR #211 opened titled
  // with another session's commit. The fetch above just refreshed origin/.
  const head = git(["log", "-1", "--no-merges", "--format=%s%x00%b", `origin/${DEPLOY_BRANCH}..HEAD`]).out
            || git(["log", "-1", "--no-merges", "--format=%s%x00%b", `${DEPLOY_BRANCH}..HEAD`]).out
            || git(["log", "-1", "--no-merges", "--format=%s%x00%b"]).out;
  const [title, body] = head.split("\0");
  const pr = ghApi(token, "POST", `${api}/pulls`, { title, body, head: branch, base: DEPLOY_BRANCH }).json;
  if (!pr?.html_url) throw new Error("REST pr create failed: " + JSON.stringify(pr).slice(0, 300));
  return { pr: pr.html_url, note: "PR opened; do not arm auto-merge — Merge Desk arms MERGE on ready tip-green" };
}

function openPr(branch) {
  must(git(["push", "-u", REMOTE, branch]), "push session branch");
  const gh = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (gh.status !== 0) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (token) return openPrRest(branch, token);
    return { pr: null, note: `gh not installed and no GH_TOKEN/GITHUB_TOKEN — open https://github.com/${REPO}/compare/${DEPLOY_BRANCH}...${branch}?expand=1` };
  }
  const existing = spawnSync("gh", ["pr", "list", "--head", branch, "--base", DEPLOY_BRANCH, "--json", "url", "-q", ".[0].url"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  if (existing) return { pr: existing, note: "PR already open; the push updated it. Do not arm auto-merge — Merge Desk arms MERGE on ready tip-green" };
  const created = spawnSync("gh", ["pr", "create", "--base", DEPLOY_BRANCH, "--head", branch, "--fill"], { cwd: ROOT, encoding: "utf8" });
  if (created.status !== 0) throw new Error("gh pr create failed: " + created.stderr);
  const url = created.stdout.trim().split("\n").pop();
  // Never arm auto-merge here (2026-10-06): only Merge Desk arms MERGE on ready PRs (squash retired 2026-10-13).
  return { pr: url, note: "PR opened; do not arm auto-merge — Merge Desk arms MERGE on ready tip-green" };
}

/* THE NODE HALF RUNS ONLY WHAT TOOLING-FAST DID NOT (W1, 2026-10-26).
   gateNodeSuites() exists for the pins tooling-fast never runs (run 1889) — but
   211 of its scripts' 343 files WERE in tooling-fast, so every gate ran them
   twice, ~18 serial min of repeats. A node-kind group now runs only its files
   that this gate's tooling-fast pass did not, through the same runner the npm
   script uses (run-node-group's phases: the group's flags, isolated files
   first), with the same environment (NODE_TEST_CONTEXT dropped, the compile
   cache on) — exactly what CI's `run-group.mjs --skip-tf` does on a PR.

   WHY THAT IS THE SAME EVIDENCE, read 2026-10-26: a node-kind script is
   `node --test --test-timeout=900000 [--test-concurrency=1] <files>` with no
   env of its own (tests/groups.json → gen-test-groups commandFor). tooling-fast
   runs each file as `node --test --test-concurrency=1 --test-timeout=540000
   <file>` (a STRICTER timeout, plus a 600 s file bound) in a fresh process,
   which is node's own per-file isolation too. --test-concurrency limits how
   many FILES run at once, so it cannot change what a single file asserts.
   Anything else keeps every file and says why: a `command` group (vm-page-a/b
   set APEX_VM_PAGE_GROUP), a flag outside TF_EQUIVALENT_FLAG, or a package.json
   script that is not the generated command. */
export const TF_EQUIVALENT_FLAG = /^--test-(concurrency|timeout)=\d+$/;

/** Pure: per gate script, what to run. `ran` = files this gate's tooling-fast already passed.
 *  mode "npm" (run the script whole), "remainder" (run `files` only) or "skip" (nothing left). */
export function nodeHalfPlan(scripts, { ran, doc = loadGroups(), pkgScripts = readPkgScripts() } = {}) {
  return scripts.map((script) => {
    const def = doc.groups[script];
    const all = def?.files || [];
    const whole = (why) => ({ script, mode: "npm", files: all, skipped: [], why });
    if (!def) return whole("no tests/groups.json group — run the npm script as written");
    if (def.kind !== "node") return whole(`a ${def.kind} group: its command may set env (e.g. APEX_VM_PAGE_GROUP), so it runs as written`);
    const odd = (def.flags || []).filter((f) => !TF_EQUIVALENT_FLAG.test(f));
    if (odd.length) return whole(`flags tooling-fast does not set: ${odd.join(" ")}`);
    if (pkgScripts[script] !== commandFor(def, doc.isolatedFiles, script)) return whole("package.json's script is not the generated command (run npm run gen), so it runs as written");
    const skipped = all.filter((f) => ran.has(f));
    const files = all.filter((f) => !ran.has(f));
    return { script, mode: files.length ? "remainder" : "skip", files, skipped,
      why: `${skipped.length} of ${all.length} file(s) already passed in this gate's tooling-fast` };
  });
}
function readPkgScripts() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts || {}; } catch { return {}; }
}

/** The files a full tooling-fast pass runs (the floor). */
export async function toolingFastRan() {
  const { TOOLING_FAST_FILES } = await import("./tooling-fast.mjs");
  return new Set(TOOLING_FAST_FILES);
}

/** Run the node half under `ran`; verdict names stay one per script. */
export async function runNodeHalf(scripts, ran, { stage = (name, fn) => fn(), label = "Pages gate", doc = loadGroups(), pkgScripts = readPkgScripts() } = {}) {
  const plan = nodeHalfPlan(scripts, { ran, doc, pkgScripts });
  const require = createRequire(import.meta.url);
  const { augmentNodeCompileCache } = require("../lib/node-compile-cache.cjs");
  const env = { ...process.env, ...augmentNodeCompileCache(process.env, ROOT) };
  delete env.NODE_TEST_CONTEXT;
  const verified = [];
  const dedupe = { skippedFiles: 0, scripts: {} };
  for (const p of plan) {
    await stage(p.script, async () => {
      if (p.mode === "npm") return run("npm", ["run", p.script], `${label}: ${p.script}`);
      if (p.mode === "skip") { log(`${label}: ${p.script}: every file (${p.skipped.length}) already passed in this gate's tooling-fast — nothing left to run`); return; }
      const def = { ...doc.groups[p.script], files: p.files };
      for (const args of nodeGroupPhases(def, doc.isolatedFiles)) {
        await run("node", args, `${label}: ${p.script} (${p.files.length} file(s) tooling-fast does not run; ${p.skipped.length} already passed there)`, { env });
      }
    });
    verified.push(p.script);
    if (p.skipped.length) { dedupe.skippedFiles += p.skipped.length; dedupe.scripts[p.script] = { ran: p.files.length, skipped: p.skipped.length }; }
    else if (p.mode === "npm" && p.files.some((f) => ran.has(f))) dedupe.scripts[p.script] = { ran: p.files.length, skipped: 0, why: p.why };
  }
  return { verified, dedupe, plan };
}

/* THE FAST PREFIX (W1). The full gate is ~33 min median; a red in the file the
   session edited used to surface somewhere inside it. Now: test:guards (the
   commit hook's cross-file group), then tooling-fast on the diff's own files
   (tooling-fast's --changed selection, --bail), and only then the rest of the
   floor — minus everything the prefix already passed on this tree.
   test:guards counts as passed evidence for its files because its runner
   (guards-verdict.mjs run) is `node --test <files>` with no env of its own and
   node's default (no) per-test timeout. Checked at RUN time, fail safe: a
   different npm script, or a guards-verdict whose spawn line is no longer that
   plain `node --test`, keeps every guard file in the full pass. */
export const GUARDS_COMMAND = "node tools/ci/guards-verdict.mjs run";
export const GUARDS_SPAWN = 'spawnSync(process.execPath, ["--test", ...args]';
export function guardsEquivalentFiles({ doc = loadGroups(), pkgScripts = readPkgScripts(),
  guardsSource = (() => { try { return fs.readFileSync(path.join(ROOT, "tools/ci/guards-verdict.mjs"), "utf8"); } catch { return ""; } })() } = {}) {
  const def = doc.groups["test:guards"];
  const plain = pkgScripts["test:guards"] === GUARDS_COMMAND && def?.cmd === GUARDS_COMMAND && guardsSource.includes(GUARDS_SPAWN);
  return plain ? [...(def.files || [])] : [];
}

/** tooling-fast's --changed selection (its own exported selector; the diff read the way its CLI reads it). */
export async function prefixSelection(changed = changedVsDeploy()) {
  const { selectToolingFastChanged } = await import("./tooling-fast.mjs");
  const meta = selectToolingFastChanged(changed);
  return { files: meta.reason === "empty" ? [] : meta.files, reason: meta.reason, changed: changed.length };
}
function changedVsDeploy() {
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", `${REMOTE}/${DEPLOY_BRANCH}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return diffPaths([base], { cwd: ROOT });
  } catch {
    try { return diffPaths(["HEAD~1"], { cwd: ROOT }); } catch { return []; }
  }
}

/** The full pass after the prefix: the floor minus what the prefix passed. */
export function remainderFiles(floor, prefixPassed) {
  return floor.filter((f) => !prefixPassed.has(f));
}

/* PER-STAGE RECEIPTS + --resume (W1). Every stage writes { tree, head, verdict,
   seconds, at } to artifacts/logs/gate-receipts.json (tools/lib/deploy-status.mjs).
   The tree is re-read after each stage: an edit while a stage ran makes its verdict
   about neither tree (AGENTS.md rule 2), so that stage records `tree-moved` and the
   gate stops. `--resume` skips a stage that passed on the SAME work tree and refuses
   (exit 3) when the tree moved since the receipts. */
export class GateRefusal extends Error {}
/** The receipts file; APEX_GATE_RECEIPTS relocates it (tests, a second gate on another tree). */
export const receiptsFile = (env = process.env) => path.resolve(ROOT, env.APEX_GATE_RECEIPTS || GATE_RECEIPTS);
export function gateStager({ resume = false, file = receiptsFile(), treeId = () => workTreeId(ROOT),
  head = () => git(["rev-parse", "HEAD"]).out, announce = log, now = () => new Date() } = {}) {
  const tree = treeId();
  let doc = null;
  if (resume) {
    doc = readJson(file);
    const v = resumeVerdict(doc, tree);
    if (!v.ok) throw new GateRefusal(`--resume: ${v.why}`);
    announce(`--resume: ${v.why}`);
  }
  const h = head();
  if (!doc) doc = { tree, head: h, startedAt: now().toISOString(), stages: {} };
  else doc.resumedAt = now().toISOString();
  writeJson(file, doc);
  const skipped = [];
  const stage = async (name, fn) => {
    if (resume && stagePassed(doc, name, tree)) {
      announce(`--resume: ${name} already passed on this tree (${doc.stages[name].seconds}s at ${doc.stages[name].at}) — skipped`);
      skipped.push(name);
      return doc.stages[name];
    }
    const t0 = Date.now();
    let verdict = "failed", extra = null;
    try { extra = await fn(); verdict = "passed"; }
    finally {
      const after = tree ? treeId() : null;
      if (verdict === "passed" && tree && after !== tree) verdict = "tree-moved";
      doc.stages[name] = { tree, head: h, verdict, seconds: Math.round((Date.now() - t0) / 1000), at: now().toISOString(),
        ...(extra && Array.isArray(extra.files) ? { files: extra.files } : {}) };
      writeJson(file, doc);
      if (verdict === "tree-moved") {
        // eslint-disable-next-line no-unsafe-finally -- a passed stage on a moved tree must not read as passed
        throw new Error(`the work tree changed while ${name} ran (${tree.slice(0, 12)} -> ${String(after).slice(0, 12)}): its verdict is about neither tree — make all edits first, then gate once (AGENTS.md rule 2)`);
      }
    }
    return doc.stages[name];
  };
  return { stage, tree, head: h, doc, skipped, file };
}

/* THE GATE, WITHOUT THE DEPLOY. `npm run test:tooling-fast` is the documented
   edit-loop check and it is a SUBSET — the gate's node suites are not on its
   list — so "tooling-fast is green" has never meant "the deploy gate is
   green". Two deploys went red on that gap in 2026-09-02 (which is why
   gateNodeSuites() exists) and another in 2026-09-18, and in every case the
   only way to learn it was to start a deploy.
   This runs exactly what main() runs before it pushes, and pushes nothing, so
   the pre-push answer comes from the same code path as the deploy's — not from
   a second list that can drift from it. Since W1 (2026-10-26) it runs the same
   SET in a cheaper order: the fast prefix first, every file once. */
function fetchTip() {
  must(git(["fetch", "--no-tags", REMOTE, DEPLOY_BRANCH]), "fetch");
  return must(git(["rev-parse", `${REMOTE}/${DEPLOY_BRANCH}`]), "rev-parse");
}
export async function gateOnly({ resume = false, stager = gateStager, tip = fetchTip } = {}) {
  const t0 = Date.now();
  const verified = [];
  const g = stager({ resume });
  const jobs = await gateJobs();
  const J = `--jobs=${jobs.jobs}`;
  const { TOOLING_FAST_FILES } = await import("./tooling-fast.mjs");
  // 1. The commit hook's cross-file guards: seconds, and the likeliest red after a merge.
  await g.stage("test:guards", () => run("npm", ["run", "test:guards"], "guard suite: test:guards (fast prefix)")); verified.push("test:guards");
  // 2. tooling-fast on the diff's own files, stopping at the first red.
  const pre = await g.stage("tooling-fast:changed", async () => {
    const sel = await prefixSelection();
    if (!sel.files.length) { log(`fast prefix: tooling-fast --changed selected nothing (${sel.reason}, ${sel.changed} changed path(s)) — the full pass covers it`); return { files: [] }; }
    // A fail-safe widening selects the whole floor: that IS the full pass, so run it once, there, without --bail.
    const picked = new Set(sel.files);
    if (TOOLING_FAST_FILES.every((f) => picked.has(f))) { log(`fast prefix: --changed widened to the whole floor (${sel.reason}) — the full pass runs it`); return { files: [] }; }
    await run("node", ["tools/ci/tooling-fast.mjs", "--bail", J, ...sel.files], `fast prefix: tooling-fast --changed (${sel.reason}, ${sel.files.length} file(s), --bail, jobs=${jobs.jobs}: ${jobs.why})`);
    return { files: sel.files };
  });
  verified.push("tooling-fast:changed");
  const prefixPassed = new Set([...(pre.files || []), ...guardsEquivalentFiles()]);
  // 3. The rest of the floor, every file once.
  const rest = remainderFiles(TOOLING_FAST_FILES, prefixPassed);
  const full = await g.stage("tooling-fast", async () => {
    if (!rest.length) { log(`tooling-fast: all ${TOOLING_FAST_FILES.length} file(s) passed in the prefix — nothing left`); return; }
    await run("node", ["tools/ci/tooling-fast.mjs", J, ...rest], `guard suite remainder: tooling-fast (${rest.length} of ${TOOLING_FAST_FILES.length}; ${TOOLING_FAST_FILES.length - rest.length} passed in the prefix)`);
  });
  verified.push("tooling-fast");
  // tooling-fast stamps ready-gate only for a whole floor in ONE run, which the split never is: the gate stamps it
  // here, for the tree both halves measured (the stager already refused a moved tree), and only when both ran now.
  if (g.tree && !g.skipped.includes("tooling-fast") && !g.skipped.includes("tooling-fast:changed") && full.verdict === "passed") {
    try { const { stampReadySha } = await import("./ready-gate.mjs"); stampReadySha(g.head, { tree: g.tree }); } catch { /* advisory */ }
  }
  // 4. The Pages gate's node half: only the files tooling-fast (and the prefix) did not run.
  const ran = new Set([...TOOLING_FAST_FILES, ...prefixPassed]);
  const half = await runNodeHalf(gateNodeSuites(), ran, { stage: g.stage });
  verified.push(...half.verified);
  // ci.yml's "Parts option-resolution census" job runs test:sweeps-parts, so a
  // red in either of its two files takes the deploy red — and until 2026-09-22
  // nothing before a push ran them (tests/unit/prepush-gate-coverage.test.mjs
  // listed both as SWEEPS_ONLY).
  //
  // UNCONDITIONAL HERE, CONDITIONAL THERE, on purpose. That job took a path
  // filter on 2026-09-22 (geometry-paths.mjs PARTS_ERE), so CI now skips the
  // census on a diff that cannot move the car. This gate does not: it costs
  // ~40 s, it is the last check before a push to a branch several sessions
  // build on, and running a cheap suite CI would skip is the safe direction —
  // the reverse (skipping one CI runs) is what a pre-push gate may never do.
  // The geometry sweeps stay conditional because they are 8-15 minutes, not 40 s.
  await g.stage("test:sweeps-parts", () => run("npm", ["run", "test:sweeps-parts"], "Pages gate: test:sweeps-parts")); verified.push("test:sweeps-parts");
  // Against the deploy tip, same as a real deploy: the circuits OUR side
  // touched (three-dot), not every circuit that moved on the branch.
  let circuits = [];
  let base = "";
  const gaps = [];
  try {
    base = tip();
    circuits = touchedCircuits(base);
  } catch (e) {
    log(`verify-track skipped: cannot reach ${REMOTE}/${DEPLOY_BRANCH} (${e.message})`);
    // A LOG LINE IS NOT A VERDICT. Without this, --json showed no
    // verify-track entries and no marker, so "no circuit was touched" and
    // "could not look" read identically to the reader of the JSON.
    gaps.push(`verify-track and the geometry sweeps: could not reach ${REMOTE}/${DEPLOY_BRANCH} (${e.message}) — NOT a statement that nothing was touched`);
  }
  for (const id of circuits) { await g.stage(`verify-track:${id}`, () => run("node", ["tools/track/verify-track.cjs", id], `verify-track ${id}`)); verified.push(`verify-track:${id}`); }
  // PARITY WITH main() (2026-09-22). This function's own docstring calls it
  // "exactly what main() runs before it pushes", and AGENTS.md rule 3 calls it
  // the only pre-push check that runs what the deploy runs — but it never
  // called touchesGeometry, so a geometry-moving change got exit 0 having
  // skipped test:sweeps, the very leg whose absence broke Pages for hours on
  // 2026-09-18, and returned no notCovered key for the reader to notice.
  if (base) {
    // Mirrors main()'s branch exactly: the full sweeps when the union can move
    // geometry, otherwise the targeted suites that read it.
    const ranSweeps = touchesGeometry(base);
    if (ranSweeps) { await g.stage("test:sweeps", () => run("npm", ["run", "test:sweeps"], "Pages gate: test:sweeps (this union can move geometry)")); verified.push("test:sweeps"); }
    let targeted = [];
    if (!ranSweeps) {
      targeted = targetedFor(base);
      if (targeted.length) {
        await g.stage("sweeps:targeted", () => runTargeted(targeted, "Pages gate"));
        verified.push(...targeted.map((s) => `sweeps:${path.basename(s)}`));
      }
    }
    gaps.push(...notCovered(ranSweeps, targeted));
  }
  return { gate: "only", verified, pushed: false, notCovered: gaps, seconds: Math.round((Date.now() - t0) / 1000),
    jobs: jobs.jobs, dedupe: half.dedupe, resumed: g.skipped, receipts: path.relative(ROOT, g.file) };
}

/* --detach (W1): the gate outlives the task that started it. A background Bash
   task, an exec transport or a session restart that drops its child used to
   take a 30-minute gate with it, verdict and all. Modelled on test-bg.mjs's
   start(): a detached child with ignored stdin and its output in a log, a
   receipt naming it, and the `= deploy start|done` markers --status/--wait read
   (the parent stamps the child's start so a --status right after reads it). */
export function detachGate(args, { statusLog, root = ROOT, spawnFn = spawn, tree = () => workTreeId(root), now = () => new Date() } = {}) {
  const out = path.join(root, DETACH_LOG);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const fd = fs.openSync(out, "w");
  const rel = (p) => path.relative(root, p);
  const hasLog = args.some((a) => a === "--log" || a.startsWith("--log="));
  const childArgs = [fileURLToPath(import.meta.url), ...args.filter((a) => a !== "--detach"), ...(hasLog ? [] : ["--log", rel(statusLog)])];
  let child;
  try {
    child = spawnFn(process.execPath, childArgs, { cwd: root, detached: true, stdio: ["ignore", fd, fd], env: { ...process.env } });
    child.unref?.();
  } finally { fs.closeSync(fd); }
  const mode = childArgs.slice(1).filter((a) => a.startsWith("--") && a !== "--log").join(",");
  stamp(statusLog, `start pid=${child.pid} mode=${mode} detached=1`);
  const receipt = { pid: child.pid, started: now().toISOString(), log: rel(out), statusLog: rel(statusLog), args: childArgs.slice(1), tree: tree() };
  writeJson(path.join(root, DETACH_RECEIPT), receipt);
  return { ...receipt, text: `[deploy] detached the gate: pid ${child.pid}, output ${receipt.log}, receipt ${DETACH_RECEIPT}\n` +
    `[deploy] verdict: node tools/ci/deploy.mjs --status   (or --wait --timeout 60 as ONE background task; exit 0 passed / 1 failed / 124 running)` };
}

/** --wait-load=<min> (ported from sync-pr.mjs): a busy box is a reason to wait, not to refuse. Default 10 min; 0 = refuse at once. */
export const WAIT_LOAD_BELOW = 2.8;
export function waitLoadMinutes(args) {
  const a = args.find((x) => x.startsWith("--wait-load="));
  return a === undefined ? 10 : Math.max(0, Number(a.slice("--wait-load=".length)) || 0);
}
export function waitForLoad(minutes, { load1 = () => os.loadavg()[0], wait = (m) => spawnSync("node", ["tools/ci/wait-for.mjs", "--load-below", String(WAIT_LOAD_BELOW), "--timeout", String(m)], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] }) } = {}) {
  if (!(minutes > 0) || load1() < WAIT_LOAD_BELOW) return false;
  log(`loadavg ${load1().toFixed(2)} >= ${WAIT_LOAD_BELOW} — waiting up to ${minutes} min for it to drop (--wait-load=0 refuses at once)`);
  wait(minutes);
  return true;
}

/** Flags this change adds; tools/lib/cli-args strictFlags (KNOWN_FLAGS, mega train 3) must list them. */
export const GATE_FLAGS = Object.freeze(["--resume", "--detach", "--wait-load"]);

/* IS THE TRAIN ALREADY RED? A deploy inherits the branch it lands on, and a red
   tip means your green push still ships nothing: on 2026-09-18 pages.yml runs
   2416 and 2417 both failed and the branch went ~2 h without publishing, which
   no session noticed until one read the run list by hand. Two API calls answer
   it up front, so "my deploy did not go live" is distinguishable from "the
   train was down before I got here".
   ADVISORY, never a refusal: the fix for a red train is usually the next push,
   and this must not stand between a session and it. Any failure to reach the
   API is silent for the same reason — an offline box still deploys. */
/* One ADVISORY GET for trainHealth / nightlyHealth: parsed JSON, or null on ANY
   failure (no network, non-2xx, bad JSON) — the callers print "unknown" and the
   deploy goes on. Authenticated when a token resolves (env, else `gh auth
   token`), riding curl's stdin config like ghApi so it never reaches argv: bare
   curls drew on the 60/h unauthenticated limit, shared by every session behind
   the proxy's egress IP (docs/notes/ACTIONS-AUDIT-2026-10-14.md finding 8;
   https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
   No token: the same unauthenticated GET as before. */
let advisoryToken;
export function advisoryGet(url, { run = spawnSync, token } = {}) {
  if (token === undefined) {
    if (advisoryToken === undefined) { try { advisoryToken = githubToken() || null; } catch { advisoryToken = null; } }
    token = advisoryToken;
  }
  try {
    const r = request(url, { run, token, anonymous: true, timeoutS: 10, retries: [] });
    return !r.error && r.status === 200 && !r.badJson ? r.json : null;
  } catch { return null; }
}

function trainHealth() {
  const api = (wf) => {
    const url = `https://api.github.com/repos/brycejmurrin/f1-game/actions/workflows/${wf}/runs`
      + `?branch=${encodeURIComponent(DEPLOY_BRANCH)}&per_page=1&exclude_pull_requests=true`;
    const run = advisoryGet(url)?.workflow_runs?.[0];
    return run ? { status: run.status, conclusion: run.conclusion, sha: (run.head_sha || "").slice(0, 7), url: run.html_url } : null;
  };
  for (const [wf, label] of [["pages.yml", "pages"]]) {   // the train is the deploy branch's only push run since 2026-10-16
    const r = api(wf);
    if (!r) { log(`train ${label}: unknown (no API answer)`); continue; }
    const state = r.status === "completed" ? r.conclusion : r.status;
    log(`train ${label}: ${state} @ ${r.sha}${state === "failure" ? "  <- the deploy branch was ALREADY red before this push: " + r.url : ""}`);
  }
  nightlyHealth();
}

/* THE NIGHTLY IS THE ONLY SCHEDULED COVERAGE THE PUSH GATE CANNOT GIVE, and
   until this function existed nothing printed it. select-specs skips any spec
   whose declared budget exceeds the gate's 180 s per-test cap, and
   spec-staleness measures the result: 61 of 119 specs were never selected in the
   last 30 days. tools/ci/nightly-group.mjs rotates ONE browser group a night to
   reach them, so the nightly is where those specs report — and trainHealth's
   per_page=1 above cannot show it, because the latest ci.yml run on this branch
   is always a push.

   READ THE JOBS, NOT THE ROLLUP. On 2026-09-22 the nightly ran group `input`,
   and Smoke shard 1 genuinely FAILED: steering.spec.js "steering has authority
   to fight the curvature drift", both attempts. The RUN came back `cancelled`,
   because two other jobs were cancelled eight minutes later and `cancelled`
   outranks `failure` in GitHub's rollup precedence — and AGENTS.md rule 8 tells
   every session to read a `cancelled` as a timeout until proven otherwise. So
   the one finding the rota existed to produce was filed, by the tooling, under
   "the box was busy". It sat unread for the day. The job list is the only
   honest source, so that is what this reads.

   ADVISORY and silent on any API failure (advisoryGet), like trainHealth above: an
   offline box still deploys, and a red nightly is never a reason to refuse a
   push. */
function nightlyHealth() {
  const url = `https://api.github.com/repos/brycejmurrin/f1-game/actions/workflows/ci.yml/runs`
    + `?branch=${encodeURIComponent(DEPLOY_BRANCH)}&event=schedule&per_page=1&exclude_pull_requests=true`;
  const get = (u) => advisoryGet(u);
  const run = get(url)?.workflow_runs?.[0];
  if (!run) { log("train nightly: unknown (no API answer)"); return; }
  const when = (run.run_started_at || "").slice(0, 10);
  const roll = run.status === "completed" ? run.conclusion : run.status;
  if (roll === "success") { log(`train nightly: success @ ${when} (rotating group covered)`); return; }
  // The rollup is not the verdict — name the jobs. A `cancelled` run with a
  // FAILED job inside it is the shape that hid 2026-09-22's steering red.
  const jobs = get(`https://api.github.com/repos/brycejmurrin/f1-game/actions/runs/${run.id}/jobs?per_page=30`)?.jobs;
  if (!Array.isArray(jobs)) { log(`train nightly: ${roll} @ ${when} — ${run.html_url}`); return; }
  const failed = jobs.filter((j) => j.conclusion === "failure").map((j) => j.name);
  const stopped = jobs.filter((j) => j.conclusion === "cancelled").map((j) => j.name);
  log(`train nightly: ${roll} @ ${when} — ${run.html_url}`);
  if (failed.length) log(`  FAILED (a real test verdict, whatever the rollup says): ${failed.join(", ")}`);
  if (stopped.length) log(`  cancelled (no verdict — these jobs report nothing): ${stopped.join(", ")}`);
  if (!failed.length && !stopped.length) log("  no job failed or was cancelled — the rollup is the whole story");
}

export async function main() {
  const t0 = Date.now();
  if (flag("--help") || flag("-h")) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 26).join("\n")); return 0; }
  if (flag("--gate-only")) {
    // NOT preflight(): that refuses a dirty tree because merging and pushing one
    // is wrong. Gating one is the entire point — this is the check you run with
    // the edit still in your working tree. The load and Playwright refusals do
    // carry over, because they are about whether a verdict means anything.
    // A moved tree refuses --resume BEFORE any load wait: there is nothing to wait for.
    if (flag("--resume")) {
      const rv = resumeVerdict(readJson(receiptsFile()), workTreeId(ROOT));
      if (!rv.ok) { log("REFUSED: --resume: " + rv.why); return 3; }
    }
    waitForLoad(waitLoadMinutes(argv));
    const problems = preflight().filter((x) => !x.startsWith("working tree is dirty"));
    if (problems.length) { for (const x of problems) log("REFUSED: " + x); return 3; }
    let v;
    try { v = await gateOnly({ resume: flag("--resume") }); }
    catch (e) { if (e instanceof GateRefusal) { log("REFUSED: " + e.message); return 3; } throw e; }
    if (JSON_OUT) console.log(JSON.stringify(v, null, 2)); else log(JSON.stringify(v));
    return 0;
  }
  // Advisory health must answer even when Git planning cannot fetch or merge.
  // Keep --gate-only precedence, but avoid plan() as well as preflight().
  if (flag("--train") && !flag("--plan")) { trainHealth(); return 0; }
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
  waitForLoad(waitLoadMinutes(argv));
  const problems = preflight();
  if (problems.length) { for (const x of problems) log("REFUSED: " + x); return 3; }
  trainHealth();
  const verdict = { branch: p.branch, merge: "none", verified: [], pushed: false, pr: null };
  if (!p.fastForward) verdict.merge = await mergeDeployTip();
  const jobs = await gateJobs();
  await run("node", ["tools/ci/tooling-fast.mjs", `--jobs=${jobs.jobs}`], `guard suite on the union (jobs=${jobs.jobs}: ${jobs.why})`); verdict.verified.push("tooling-fast");
  // The Pages gate runs MORE node suites than tooling-fast (quali-persist,
  // node-slow, the VM twins, …) and two deploys went red on pins tooling-fast
  // never runs (run 1889, 2026-09-02). Run exactly what the gate runs, read
  // from ci.yml so the two lists cannot drift apart — minus the files the
  // tooling-fast pass above just ran (runNodeHalf).
  const half = await runNodeHalf(gateNodeSuites(), await toolingFastRan());
  verdict.verified.push(...half.verified);
  verdict.dedupe = half.dedupe;
  await run("npm", ["run", "test:sweeps-parts"], "Pages gate: test:sweeps-parts"); verdict.verified.push("test:sweeps-parts");
  // Conditional, for the reason recorded above touchesGeometry(): ci.yml runs
  // the sweeps AFTER the push, so skipping them here buys 10 minutes with a
  // broken tip on a branch other sessions build on.
  let ranSweeps = touchesGeometry(p.tip);
  if (ranSweeps) { await run("npm", ["run", "test:sweeps"], "Pages gate: test:sweeps (this union can move geometry)"); verdict.verified.push("test:sweeps"); }
  let targeted = [];
  if (!ranSweeps) { targeted = targetedFor(p.tip); if (targeted.length) verdict.verified.push(...(await runTargeted(targeted, "Pages gate"))); }
  for (const id of touchedCircuits(p.tip)) { await run("node", ["tools/track/verify-track.cjs", id], `verify-track ${id}`); verdict.verified.push(`verify-track:${id}`); }
  if (flag("--pr")) {
    Object.assign(verdict, openPr(p.branch));
  } else {
    // OUR side only (three-dot), computed from the tip BEFORE any merge, so a
    // lost race cannot make a prose deploy look like it ships code.
    const oursProse = proseOnly(git(["diff", "--name-only", `${p.tip}...HEAD`]).out.split("\n").filter(Boolean));
    if (oursProse) log("our side is prose only — a lost race re-verifies the cross-file guards, not the whole gate");
    const push = await pushWithRetry(oursProse);
    verdict.pushAttempts = push.attempts;
    if (push.race) {
      // The gate already passed on this union; the PR carries it to GitHub's
      // copy of the same gate, where nothing can out-race it.
      Object.assign(verdict, openPr(p.branch), { pushed: false, race: "opened a PR after two fast-forward losses (--pr-on-race)" });
    } else verdict.pushed = true;
    // A retry can sweep a union main() never saw, so the verdict learns it here
    // rather than reporting the answer it computed before the re-merge.
    if (push.swept && !verdict.verified.includes("test:sweeps")) verdict.verified.push("test:sweeps");
    ranSweeps = ranSweeps || push.swept;
  }
  verdict.notCovered = notCovered(ranSweeps, targeted);
  verdict.next = "the push starts pages.yml (one running + one pending train; a newer push replaces the pending one): its `ci / …` rows are your verdict, then it stamps the build (2000 + commit count) and verify-live confirms the CDN serves it — a commit is live once it is an ancestor of the live shell's apex-sha (deploy-research); `ci-watch.mjs --sha <merge sha>` follows it or says superseded";
  verdict.seconds = Math.round((Date.now() - t0) / 1000);
  if (JSON_OUT) console.log(JSON.stringify(verdict, null, 2));
  else log(JSON.stringify(verdict));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rd = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : (argv.find((a) => a.startsWith(n + "=")) || "").slice(n.length + 1) || undefined; };
  const logFile = path.resolve(ROOT, rd("--log") || DEFAULT_LOG);
  if (flag("--status") || flag("--wait")) {
    const t = rd("--timeout");
    const s = flag("--wait") ? await waitStatus(logFile, { timeoutMin: t === undefined ? 0 : Number(t) }) : readStatus(logFile);
    console.log(s.text);
    process.exit(s.code);
  }

  // --detach (W1): hand the gate to a detached child and return at once; the child stamps the verdict.
  if (flag("--detach")) {
    if (!flag("--gate-only")) { console.error("[deploy] --detach applies to --gate-only only (a deploy that pushes stays attached)"); process.exit(2); }
    console.log(detachGate(argv, { statusLog: logFile }).text);
    process.exit(0);
  }
  const marks =!["--help", "-h", "--plan", "--train"].some(flag);
  if (marks) stamp(logFile, `start pid=${process.pid} mode=${argv.filter((a) => a.startsWith("--")).join(",") || "default"}`);
  let code = 1;
  try { code = await main(); }
  catch (e) {
    log("ERROR " + (e && e.message ? e.message : e));
    if (JSON_OUT) console.log(JSON.stringify({ status: "failed", error: e.message || String(e), stdoutArtifact: e.stdoutArtifact || null }));
  }
  if (marks) stamp(logFile, `done exit=${code}`);
  process.exit(code);
}
