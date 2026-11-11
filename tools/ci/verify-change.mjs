#!/usr/bin/env node
// verify-change.mjs — ONE command that runs what a change needs, serialized
// @doc ONE diff-aware `--fast` gate; `tooling-fast --changed` is the local floor, CI runs the tiers; plan JSON has the budget.
// @section runner
// correctly, and hands back one verdict.
//
// Before this tool the verification ritual was five manual steps spread over
// pick-tests.mjs (what to run), test-bg.mjs (how to run it), verify-track.cjs
// (circuit edits), test-solo.mjs (timeout triage) and bump-cache (the ship
// gate) — with the serialization rules living in AGENTS.md prose. This is the
// composition, not new test infrastructure:
//
//   node tools/ci/verify-change.mjs                  # fast phase + start batch 1
//   node tools/ci/verify-change.mjs --plan           # print the plan, run nothing
//   node tools/ci/verify-change.mjs --fast           # the fast phase (the default does the same since 2026-11-03)
//   node tools/ci/verify-change.mjs --since <ref>    # diff base for file selection
//   node tools/ci/verify-change.mjs --staged         # staged files only
//   ... --wait | --keep-going                     # accepted, no-ops: no local browser run (below)
//   ... --json                                    # machine-readable verdict
//
// Phases:
//   1 fast (inline, ~2 min at three files at a time): tooling-fast when the change warrants it;
//     verify-track.cjs per changed circuit; graph-parity when js/track/scenery/graph.js
//     moved (BASE = --since's ref, else the merge-base); bump-cache --check.
//   2 groups: pick-tests' selection, ONE group per batch, REPORTED AS NOT RUN
//     with where they do run. Agents never run a browser test locally (AGENTS.md
//     rule 5, 2026-11-03): every PR push gets ci.yml's change-aware `selected`
//     legs (one 5-min shard on a draft, the 10-min budget once ready) and
//     `node tools/ci/remote-group.mjs <group>` runs a whole group on the pushed
//     branch. Until then this phase drove test-bg.mjs's group chain here.
//
// With groups selected the verdict is "partial" (exit 2): the fast phase is
// green and the browser verdict is CI's. "pass" is a diff with no group to run.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pick, DEPLOY_BRANCH, validateSelectionArgs, selectionReceipt } from "./pick-tests.mjs";
import { estimateToolingFast, loadTimings, selectToolingFastChanged, TOOLING_FAST_FILES } from "./tooling-fast.mjs";
import { liveCiRuns } from "./live-run-check.mjs";
import { gitOut } from "../lib/git-run.mjs";
import { changedPaths, noDeployBaseMessage, resolveDeployBase, untrackedPaths } from "../lib/changed-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const USAGE = "Usage: verify-change.mjs [paths…] [--since ref | --staged] [--plan] [--fast] [--wait] [--keep-going] [--json]\n"
  + "  exit 0 pass / 1 fail / 2 unmatched, refused or a usage error (an unknown flag prints this usage)";
if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); process.exit(0); }
try { validateSelectionArgs(argv, ["--staged", "--json", "--plan", "--fast", "--wait", "--keep-going", "--help", "-h"]); }
catch (e) { console.error(`${e.message}\n${USAGE}`); process.exit(2); }
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const JSON_OUT = flag("--json");
const say = (...a) => { if (!JSON_OUT) console.log(`[verify-change]`, ...a); };
const loadavgLine = () => {
  try {
    const [a, b, c] = os.loadavg().map((n) => n.toFixed(2));
    return `loadavg=${a} ${b} ${c}`;
  } catch (_) {
    return "loadavg=?";
  }
};

const git = (args) => gitOut(args, { cwd: ROOT });   // throws on failure (tools/lib/git-run.mjs)

// The ref the default selection diffs against: merge-base with origin/<deploy>,
// else the local deploy branch — never HEAD~1, which answered for the last
// commit and read as green for the branch (audit W6, 2026-11-10). Also
// graph-parity's BASE: without one it diffs only the uncommitted part, and
// exits 2 "nothing to compare" on a clean tree.
const deployBase = resolveDeployBase(DEPLOY_BRANCH, { cwd: ROOT });
function mergeBase() { return deployBase ? deployBase.sha : ""; }

// ── changed-file selection (same semantics as pick-tests.mjs's CLI) ─────────
function changedFiles() {
  const sinceIdx = argv.indexOf("--since");
  const explicit = argv.filter((a, n) =>
    !a.startsWith("--") && !(sinceIdx >= 0 && n === sinceIdx + 1));
  if (explicit.length) return explicit;
  // Rename SOURCES too (ledger M36; tools/lib/changed-files.mjs): `--name-only`
  // lists only a moved file's destination, so its old directory's rules never fired.
  if (flag("--staged")) return changedPaths(["--cached"], { cwd: ROOT });
  if (opt("--since")) return changedPaths([opt("--since")], { cwd: ROOT });
  if (!deployBase) {
    // A refusal, not a guess: exit 2 is the "not a verdict" code (usage / unmatched).
    if (JSON_OUT) console.log(JSON.stringify({ verdict: "no-deploy-base", error: noDeployBaseMessage(DEPLOY_BRANCH, "verify-change") }));
    else console.error(noDeployBaseMessage(DEPLOY_BRANCH, "verify-change"));
    process.exit(2);
  }
  changedFiles.base = `${deployBase.ref}@${deployBase.sha}`;
  const out = new Set(changedPaths(["HEAD"], { cwd: ROOT }));
  for (const f of changedPaths([deployBase.sha], { cwd: ROOT })) out.add(f);
  for (const f of untrackedPaths({ cwd: ROOT })) out.add(f);
  return [...out];
}

// ── plan ─────────────────────────────────────────────────────────────────────
const files = changedFiles();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const groupSel = pick(files);
const groups = [...groupSel.keys()].filter((g) => pkg.scripts[`test:${g}`]).sort();
// THE THREE-WAY CONTRACT THIS FILE USED TO THROW AWAY. pick-tests.mjs --json
// computes exactly this — its `named` is derived identically to `groups` above —
// and its comment is the whole point: "unmatched" means files changed but no
// rule claimed them, so the selection is NOT trustworthy and the caller must
// fall back to a full run. Calling the raw pick() Map API drops it, and then
// `!batches.length` cannot tell "nothing needs testing" from "I do not know
// what to test". docs/PERF-FINDINGS.md 2j.
const receipt = selectionReceipt(files, pkg.scripts);
const selReason = receipt.reason;
const isBrowser = (g) => /run-playwright/.test(pkg.scripts[`test:${g}`]);
const browserGroups = groups.filter(isBrowser);
// tooling-fast is phase 1's inline gate — leaving it in the batch list would
// run the same 78 suites twice.
const nodeGroups = groups.filter((g) => !isBrowser(g) && g !== "tooling-fast");

// ONE group per batch (browser OR node). Pairing node groups with a browser
// batch used to look cheap and still contended for CPU on SwiftShader boxes;
// sequential is the AGENTS.md default test-bg mode too.
const batches = [];
for (const b of browserGroups) batches.push([b]);
for (const n of nodeGroups) batches.push([n]);

const circuits = files
  .map((f) => (f.match(/^js\/circuits\/([a-z0-9_]+)\.js$/) || [])[1])
  .filter(Boolean);
const wantsToolingFast = groups.includes("tooling-fast") ||
  files.some((f) => /^(js|css|tools|tests|docs)\//.test(f) || /^index\.html|^AGENTS\.md/.test(f));
// The commit/deploy gates keep the full tooling-fast floor. The local edit
// loop can safely use the runner's path-pin index, however: it is fail-safe
// for tracked, harness, and unmatched paths, while a source edit runs only
// the unit files that pin that source. This is the cheap pre-PR path; CI
// still re-gates the complete floor before merge.
const toolingFastSelection = wantsToolingFast
  ? selectToolingFastChanged(files)
  : { files: [], reason: "not-needed", shards: [] };
const toolingFastTimings = loadTimings();
const toolingFastEstimatedMs = toolingFastSelection.files.reduce(
  (sum, file) => sum + (typeof toolingFastTimings[file] === "number" ? toolingFastTimings[file] : 0), 0,
);
const localJobs = os.loadavg()[0] < 1.5 ? 3 : 2;
const toolingFastEstimate = estimateToolingFast(toolingFastSelection.files, toolingFastTimings, localJobs);
const wantsGraphParity = files.some((f) => f === "js/track/scenery/graph.js");
// --since names the baseline outright; otherwise the merge-base (committed +
// uncommitted work). Null = no git ref found: graph-parity then defaults to HEAD.
const graphParityBase = wantsGraphParity ? (opt("--since") || mergeBase() || null) : null;
const wantsSweepsHint = files.some((f) => /^js\/(track|circuits)\//.test(f) || /^tools\//.test(f));

const plan = {
  // The default selection's diff base (working tree and untracked files on top); null for explicit paths / --since / --staged.
  base: changedFiles.base || null,
  files,
  // Carried into the plan too, not just the verdict: `--plan` printing
  // `"batches": []` with no reason is the same vacuous answer the run path
  // used to give — "nothing to test" and "no rule claimed these files" look
  // identical without it. docs/PERF-FINDINGS.md 2j.
  selection: selReason,
  receipts: receipt.receipts,
  unclaimed: receipt.unclaimed,
  fast: {
    toolingFast: wantsToolingFast,
    toolingFastReason: toolingFastSelection.reason,
    toolingFastFiles: toolingFastSelection.files.length,
    toolingFastShards: toolingFastSelection.shards,
    toolingFastEstimatedMs,
    toolingFastCriticalPathMs: toolingFastEstimate.criticalPathMs,
    toolingFastWorkerMs: toolingFastEstimate.workerMs,
    toolingFastUnmeasured: toolingFastEstimate.unmeasured,
    verifyTrack: circuits,
    graphParity: wantsGraphParity,
    graphParityBase,
    // A generated file in the diff is proven by its generator, not by the floor
    // (tooling-fast's own --changed path runs this too; audit W6, 2026-11-10).
    genCheck: !!toolingFastSelection.genCheck,
    cacheCheck: true,
  },
  batches,
  sweepsBeforeDeployPush: wantsSweepsHint,
};

if (flag("--plan")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

say(`plan: base=${plan.base || "explicit"} files=${files.length} batches=${batches.length} ` +
  `browser=${browserGroups.length} node=${nodeGroups.length} ` +
  `toolingFast=${wantsToolingFast} verifyTrack=[${circuits.join(",")}] ` +
  `graphParity=${wantsGraphParity} ${loadavgLine()}`);
if (batches.length) {
  say(`batch plan (${batches.length}):`);
  batches.forEach((b, i) => say(`  ${i + 1}/${batches.length}: ${b.join(" ")}`));
}

// ── phase 1: fast, inline ────────────────────────────────────────────────────
const phases = [];
const run = (name, cmd, args, env = null) => {
  const t0 = Date.now();
  say(`phase1 START ${name}: ${cmd} ${args.join(" ")} at=${new Date(t0).toISOString()} ${loadavgLine()}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...(env ? { env: { ...process.env, ...env } } : {}) });
  const ok = r.status === 0;
  const dur = Date.now() - t0;
  phases.push({ name, ok, exit: r.status, durationMs: dur });
  say(`phase1 ${ok ? "PASS" : "FAIL"} ${name} duration=${(dur / 1000).toFixed(1)}s exit=${r.status} ${loadavgLine()}`);
  if (!ok) say((r.stdout || "").slice(-2000) + (r.stderr || "").slice(-2000));
  return ok;
};

say(`── phase 1: fast gate ${loadavgLine()}`);
let fastOk = true;
for (const id of plan.fast.verifyTrack) {
  fastOk = run(`verify-track ${id}`, "node", ["tools/track/verify-track.cjs", id]) && fastOk;
}
if (plan.fast.graphParity) {
  const base = plan.fast.graphParityBase;
  fastOk = run(`graph-parity BASE=${base || "HEAD"}`, "node", ["tools/track/graph-parity.cjs", "--all"],
    base ? { BASE: base } : null) && fastOk;
}
if (plan.fast.genCheck) {
  fastOk = run("gen:check", "npm", ["run", "gen:check", "--silent"]) && fastOk;
}
if (plan.fast.toolingFast) {
  // Files at a time, by load. MEASURED 2026-09-16 on the 4-core box: 194 files
  // take 317 s one at a time (loadavg 1.7 — three cores idle), 176 s at two
  // (deploy.mjs's GATE_JOBS) and 117 s at three (peak loadavg 3.4). Three when
  // the box is quiet; two when something else is already running — a live
  // browser group has its own claim on the cores (AGENTS.md §Verification 5).
    const jobs = localJobs;
  const args = ["tools/ci/tooling-fast.mjs", `--jobs=${jobs}`, ...toolingFastSelection.files];
  say(`tooling-fast selection: ${toolingFastSelection.reason} files=${toolingFastSelection.files.length}/${TOOLING_FAST_FILES.filter((f) => !f.startsWith("//")).length} total=${(toolingFastEstimatedMs / 1000).toFixed(1)}s critical=${(toolingFastEstimate.criticalPathMs / 1000).toFixed(1)}s jobs=${jobs} shards=${toolingFastSelection.shards.join(",") || "none"}`);
  fastOk = run("tooling-fast", "node", args) && fastOk;
}
{
  // Advisory: confirms every shell tag reads ?v=dev and meta == version.json
  // (hashes are stamped at deploy; there is no bump to be ahead of).
  say(`phase1 START cache-check (advisory)`);
  const r = spawnSync("node", ["tools/ci/bump-cache.mjs", "--check", "--json"], { cwd: ROOT, encoding: "utf8" });
  const cache = (() => { try { return JSON.parse(r.stdout); } catch (_) { return { consistent: false }; } })();
  phases.push({ name: "cache-check", ok: cache.consistent, advisory: true, detail: cache });
  say(`phase1 ${cache.consistent ? "PASS" : "STALE"} cache-check (advisory)`);
}

// A PUSH OVER A LIVE ci.yml RUN CANCELS IT, and a cancelled job runs no
// `if: always()` step, so its failures are never carried forward. Two of the
// three cancelled runs inspected on 2026-09-16 had hidden a real red that way.
// Best effort, unauthenticated (a public repo's runs list needs no token), 3 s
// cap, and silent on any failure — an advisory, never a gate. Through
// proxyFetch (#2188): a bare Node fetch ignores HTTPS_PROXY, was rate-limited
// in cloud containers and returned null, so this warning never fired there.
// The one copy lives in live-run-check.mjs (audit3 T3: two copies had drifted).

// Looked up ONCE, before the verdict, so finish() stays synchronous: its call
// sites exit the process, and an awaited fetch inside it would let the batch
// code below run on past an "unmatched" or a red fast gate.
const live = await liveCiRuns({ userAgent: "apex26-verify-change" });

const finish = (verdict, extra = {}) => {
  const out = { verdict, phases, batches, notRun: extra.notRun || [], ...extra };
  if (live?.runs.length) out.liveCi = live;
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else {
    say(`verdict: ${verdict} ${loadavgLine()}`);
    if (out.notRun.length) say(`not run: ${out.notRun.join(", ")}`);
    if (plan.sweepsBeforeDeployPush) say("deploy-push reminder: js/track|circuits|tools changed — run test:sweeps on the union first (.claude/skills/check-changes/references/deploy.md)");
    if (live?.runs.length) say(`ci: ${live.runs.length} ci.yml run(s) LIVE on ${live.branch} (${live.runs.map((r) => r.sha).join(", ")}) — a push now cancels them, and a cancelled job hides its failures; wait for the verdict or batch the next push`);
  }
  process.exit(verdict === "pass" ? 0 : verdict === "fail" ? 1 : 2);
};

if (!fastOk) finish("fail", { notRun: batches.flat() });
// "unmatched" IS NOT "pass", and the difference is the whole reason pick-tests
// publishes a reason. A .github/, playwright.config.js, package.json, icons/ or
// vendor/ edit names no group, so batches is empty for the same reason an empty
// diff is — and this used to answer both with `pass`, exit 0. That is the
// answer an agent gets from `apex_verify_change_fast` and from verify-agent
// when it asks "did I break anything?", after running one advisory cache-check.
// finish() already exits 2 for anything that is neither pass nor fail, and
// apex-tools-mcp allows exit 2, so this needs no new vocabulary.
if (receipt.unclaimed.length) {
  finish(selReason, {
    notRun: batches.flat(),
    unclaimed: receipt.unclaimed,
    receipts: receipt.receipts,
    toolingFast: !!plan.fast.toolingFast,
    why: "some paths have no rule in pick-tests.mjs, so the group selection " +
         "is not trustworthy — fall back to a full run before trusting a green.",
  });
}
if (flag("--fast") || !batches.length) {
  finish(fastOk ? (batches.length ? "partial" : "pass") : "fail",
    { notRun: batches.flat() });
}

// ── phase 2: the groups run on the PR, not here (2026-11-03) ────────────────
// `--wait` and `--keep-going` drove the local test-bg chain; an old caller
// still gets the fast verdict and one line saying why nothing else started.
if (flag("--wait") || flag("--keep-going")) {
  say("--wait/--keep-going: no local browser run since 2026-11-03 (AGENTS.md rule 5) — the groups below run on the PR");
}
finish("partial", {
  notRun: batches.flat(),
  ci: "these groups run on the PR, not locally: ci.yml's selected legs on every push (a draft gets one 5-min shard, ready the 10-min budget); "
    + "a whole group: node tools/ci/remote-group.mjs <group> on the pushed branch",
});
