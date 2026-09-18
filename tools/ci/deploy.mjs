#!/usr/bin/env node
// deploy.mjs — the ONE deploy command (2026-09-01).
// @doc the ONE deploy: fetch → merge → tooling-fast → the Pages gate's node suites → sweeps if the union moves geometry → verify-track → push the deploy branch (or --pr); pages.yml stamps it
//
//   node tools/ci/deploy.mjs --plan        # print the steps + the union diffstat, run nothing
//   node tools/ci/deploy.mjs               # fetch → merge → tooling-fast → the Pages gate's node
//                                       #   suites → test:sweeps (only if the union can move
//                                       #   geometry) → verify-track (touched circuits) → push
//                                       #   HEAD to the deploy branch (retry ×3)
//   node tools/ci/deploy.mjs --pr          # same checks, then push the session branch and open /
//                                       #   update a PR into the deploy branch (never pushes there)
//   node tools/ci/deploy.mjs --gate-only   # run the DEPLOY GATE and stop: tooling-fast + ci.yml's
//                                       #   node suites + verify-track. Pushes nothing, allows a
//                                       #   dirty tree. THE pre-push check: test:tooling-fast is a
//                                       #   subset and does not run 69 of the 277 unit files.
//   node tools/ci/deploy.mjs --json        # machine verdict on stdout, log on stderr
//
// What it replaces: the prose protocol in the deploy-merge skill — fetch, look,
// merge, re-bump the union, tooling-fast, sweeps, push; pages.yml verify-live
// (and deploy-research) own the public Pages check — this box cannot reach github.io.
// What changed underneath it (see pages.yml "Stamp the shell generation"): the
// build number is stamped by the deploy from the commit count, so there is no
// union re-bump; version.json/index.html conflicts resolve to EITHER side plus a
// a `gen-shell` regeneration (tags read ?v=dev; the deploy stamps hashes). Sweeps ran here again from
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

// THREE dots, not two. `diff base HEAD` is the two-way difference, so before the
// merge it reports circuits THEY changed as though we had touched them — a
// --plan that promised verify-track over 12 circuits our commits never went
// near, against a run that (correctly) verified none. `base...HEAD` diffs from
// the merge-base, i.e. OUR side only, which is what both callers want: the plan
// reads it pre-merge and the run reads it post-merge, where the two forms agree
// because the tip is an ancestor by then. Same idiom `theirDiffstat` already
// uses in the other direction.
export function touchedCircuits(base, cwd) {
  const out = git(["diff", "--name-only", `${base}...HEAD`], cwd ? { cwd } : {}).out;
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
      touchesGeometry(tip) ? "test:sweeps (~10 min — this union can move geometry)"
                           : "test:sweeps SKIPPED (nothing in this union can move geometry)",
      "verify-track for touched circuits",
      flag("--pr") ? "push the session branch and open/update a PR into the deploy branch"
                   : "git push origin HEAD:" + DEPLOY_BRANCH + " (fast-forward, retry ×3)",
      "the push's green FAST ci.yml run pokes pages.yml, which gates the tip once, stamps the build and verify-live confirms it",
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
  const scripts = [...body.matchAll(/^\s+npm run (test:[\w-]+)\s*$/gm)].map((m) => m[1]);
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
 * Both halves of the filter are DERIVED, never retyped: the prefixes are
 * pick-tests.mjs's sweeps RULES, and the suite list is read out of
 * package.json's test:sweeps by the same match ci.yml uses. ci.yml's own copy
 * drifted exactly once by being hand-written — scenery-grounding was missing
 * from it, so a diff touching only that suite skipped the sweep it belongs to.
 *
 * FAIL SAFE, NEVER FAIL OPEN: a diff we cannot resolve RUNS them, and a suite
 * list that parses to nothing THROWS rather than quietly matching nothing. */
const GEOMETRY_PATHS =
  /^(?:js\/track\/|js\/circuits\/|tools\/(?:track|lib)\/|js\/car\/|js\/game\.js$|js\/game\/debrisworld\.js$)/;

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
  const r = git(["diff", "--name-only", `${base}...HEAD`], cwd ? { cwd } : {});
  if (r.code !== 0) return true;                        // unresolvable diff -> run them
  return anyGeometry(r.out.split("\n").filter(Boolean));
}

/* What this deploy did NOT measure. A green verdict that lists only what ran
 * is how both of 2026-09-18's breakages got past a gate: tooling-fast reported
 * 207/207 while knowing nothing about test:sweeps or test:lifecycle-unit. The
 * browser groups are never run here (SwiftShader: 10-40 min each) and a
 * non-geometry union skips the sweeps, so both are named rather than implied. */
export function notCovered(ranSweeps) {
  const out = ["browser smoke groups (ci.yml runs them after the push)"];
  if (!ranSweeps) out.push("test:sweeps (nothing in this union can move geometry)");
  return out;
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

export function mergeDeployTip() {
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
// `npm run test:guards` is the same file list for a human before a commit.
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

function reverifyUnion(before, oursProse) {
  const changed = git(["diff", "--name-only", `${before}..HEAD`]).out.split("\n").filter(Boolean);
  const ships = oursProse ? [] : changed.filter((f) => /^(js|css)\//.test(f) || f === "index.html");
  // Their geometry was swept by the session that pushed it; ours cannot move any.
  const geom = !oursProse && anyGeometry(changed);
  let label;
  if (ships.length) {
    run("node", ["tools/ci/tooling-fast.mjs", GATE_JOBS],
        `re-verify the new union in full — it brings shipped code (${ships.slice(0, 3).join(", ")}${ships.length > 3 ? ` +${ships.length - 3}` : ""})`);
    label = "full gate";
  } else {
    run("node", ["tools/ci/tooling-fast.mjs", ...MERGE_GUARDS],
        `re-verify the new union: ${changed.length} file(s), ` +
        (oursProse ? "and OUR side is prose — no interaction to have, so the cross-file guards"
                   : "no shipped code, so the cross-file guards"));
    label = `${MERGE_GUARDS.length} merge guards` + (oursProse ? " (ours is prose)" : "");
  }
  // Geometry can arrive WITHOUT shipped code — a sweep suite's own baseline is
  // neither js/ nor css/ — so this is asked of the re-merge either way.
  if (geom) {
    run("npm", ["run", "test:sweeps"], "re-verify: test:sweeps (the re-merged union can move geometry)");
    label += " + sweeps";
  }
  return { label, sweeps: geom };
}

function pushWithRetry(oursProse = false) {
  let swept = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = git(["push", REMOTE, `HEAD:${DEPLOY_BRANCH}`]);
    if (r.code === 0) return { attempts: attempt, swept };
    log(`push rejected (attempt ${attempt}): ${r.err.split("\n").pop()}`);
    const before = git(["rev-parse", "HEAD"]).out.trim();
    must(git(["fetch", "--no-tags", REMOTE, DEPLOY_BRANCH]), "fetch");
    mergeDeployTip();
    const rv = reverifyUnion(before, oursProse);
    swept = swept || rv.sweeps;
    log(`re-verified: ${rv.label}`);
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

/* THE GATE, WITHOUT THE DEPLOY. `npm run test:tooling-fast` is the documented
   edit-loop check and it is a SUBSET — 69 of 277 unit files are not on its
   list — so "tooling-fast is green" has never meant "the deploy gate is
   green". Two deploys went red on that gap in 2026-09-02 (which is why
   gateNodeSuites() exists) and another in 2026-09-18, and in every case the
   only way to learn it was to start a deploy.
   This runs exactly what main() runs before it pushes, and pushes nothing, so
   the pre-push answer comes from the same code path as the deploy's — not from
   a second list that can drift from it. */
export function gateOnly() {
  const t0 = Date.now();
  const verified = [];
  run("node", ["tools/ci/tooling-fast.mjs", GATE_JOBS], "guard suite"); verified.push("tooling-fast");
  for (const script of gateNodeSuites()) { run("npm", ["run", script], `Pages gate: ${script}`); verified.push(script); }
  // Against the deploy tip, same as a real deploy: the circuits OUR side
  // touched (three-dot), not every circuit that moved on the branch.
  let circuits = [];
  try {
    must(git(["fetch", "--no-tags", REMOTE, DEPLOY_BRANCH]), "fetch");
    circuits = touchedCircuits(must(git(["rev-parse", `${REMOTE}/${DEPLOY_BRANCH}`]), "rev-parse"));
  } catch (e) { log(`verify-track skipped: cannot reach ${REMOTE}/${DEPLOY_BRANCH} (${e.message})`); }
  for (const id of circuits) { run("node", ["tools/track/verify-track.cjs", id], `verify-track ${id}`); verified.push(`verify-track:${id}`); }
  return { gate: "only", verified, pushed: false, seconds: Math.round((Date.now() - t0) / 1000) };
}

/* IS THE TRAIN ALREADY RED? A deploy inherits the branch it lands on, and a red
   tip means your green push still ships nothing: on 2026-09-18 pages.yml runs
   2416 and 2417 both failed and the branch went ~2 h without publishing, which
   no session noticed until one read the run list by hand. Two unauthenticated
   API calls answer it up front, so "my deploy did not go live" is distinguishable
   from "the train was down before I got here".
   ADVISORY, never a refusal: the fix for a red train is usually the next push,
   and this must not stand between a session and it. Any failure to reach the
   API is silent for the same reason — an offline box still deploys. */
function trainHealth() {
  const api = (wf) => {
    const url = `https://api.github.com/repos/brycejmurrin/f1-game/actions/workflows/${wf}/runs`
      + `?branch=${encodeURIComponent(DEPLOY_BRANCH)}&per_page=1&exclude_pull_requests=true`;
    const r = spawnSync("curl", ["-sS", "--max-time", "10", "-H", "Accept: application/vnd.github+json", url], { encoding: "utf8" });
    if (r.status !== 0) return null;
    try {
      const run = JSON.parse(r.stdout).workflow_runs?.[0];
      return run ? { status: run.status, conclusion: run.conclusion, sha: (run.head_sha || "").slice(0, 7), url: run.html_url } : null;
    } catch { return null; }
  };
  for (const [wf, label] of [["ci.yml", "ci"], ["pages.yml", "pages"]]) {
    const r = api(wf);
    if (!r) { log(`train ${label}: unknown (no API answer)`); continue; }
    const state = r.status === "completed" ? r.conclusion : r.status;
    log(`train ${label}: ${state} @ ${r.sha}${state === "failure" ? "  <- the deploy branch was ALREADY red before this push: " + r.url : ""}`);
  }
}

export function main() {
  const t0 = Date.now();
  if (flag("--help") || flag("-h")) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 26).join("\n")); return 0; }
  if (flag("--gate-only")) {
    // NOT preflight(): that refuses a dirty tree because merging and pushing one
    // is wrong. Gating one is the entire point — this is the check you run with
    // the edit still in your working tree. The load and Playwright refusals do
    // carry over, because they are about whether a verdict means anything.
    const problems = preflight().filter((x) => !x.startsWith("working tree is dirty"));
    if (problems.length) { for (const x of problems) log("REFUSED: " + x); return 3; }
    const v = gateOnly();
    if (JSON_OUT) console.log(JSON.stringify(v, null, 2)); else log(JSON.stringify(v));
    return 0;
  }
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
  trainHealth();
  const verdict = { branch: p.branch, merge: "none", verified: [], pushed: false, pr: null };
  if (!p.fastForward) verdict.merge = mergeDeployTip();
  run("node", ["tools/ci/tooling-fast.mjs", GATE_JOBS], "guard suite on the union"); verdict.verified.push("tooling-fast");
  // The Pages gate runs MORE node suites than tooling-fast (quali-persist,
  // node-slow, the VM twins, …) and two deploys went red on pins tooling-fast
  // never runs (run 1889, 2026-09-02). Run exactly what the gate runs, read
  // from ci.yml so the two lists cannot drift apart.
  for (const script of gateNodeSuites()) { run("npm", ["run", script], `Pages gate: ${script}`); verdict.verified.push(script); }
  // Conditional, for the reason recorded above touchesGeometry(): ci.yml runs
  // the sweeps AFTER the push, so skipping them here buys 10 minutes with a
  // broken tip on a branch other sessions build on.
  let ranSweeps = touchesGeometry(p.tip);
  if (ranSweeps) { run("npm", ["run", "test:sweeps"], "Pages gate: test:sweeps (this union can move geometry)"); verdict.verified.push("test:sweeps"); }
  for (const id of touchedCircuits(p.tip)) { run("node", ["tools/track/verify-track.cjs", id], `verify-track ${id}`); verdict.verified.push(`verify-track:${id}`); }
  if (flag("--pr")) {
    Object.assign(verdict, openPr(p.branch));
  } else {
    // OUR side only (three-dot), computed from the tip BEFORE any merge, so a
    // lost race cannot make a prose deploy look like it ships code.
    const oursProse = proseOnly(git(["diff", "--name-only", `${p.tip}...HEAD`]).out.split("\n").filter(Boolean));
    if (oursProse) log("our side is prose only — a lost race re-verifies the cross-file guards, not the whole gate");
    const push = pushWithRetry(oursProse);
    verdict.pushAttempts = push.attempts;
    verdict.pushed = true;
    // A retry can sweep a union main() never saw, so the verdict learns it here
    // rather than reporting the answer it computed before the re-merge.
    if (push.swept && !verdict.verified.includes("test:sweeps")) verdict.verified.push("test:sweeps");
    ranSweeps = ranSweeps || push.swept;
  }
  verdict.notCovered = notCovered(ranSweeps);
  verdict.next = "the push's FAST ci.yml run is your verdict (minutes) and, when green, pokes pages.yml, which gates the tip, stamps the build (2000 + commit count) and verify-live confirms the CDN serves it — a commit is live once it is an ancestor of the live shell's apex-sha (deploy-research)";
  verdict.seconds = Math.round((Date.now() - t0) / 1000);
  if (JSON_OUT) console.log(JSON.stringify(verdict, null, 2));
  else log(JSON.stringify(verdict));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main()); }
  catch (e) { log("ERROR " + (e && e.message ? e.message : e)); process.exit(1); }
}
