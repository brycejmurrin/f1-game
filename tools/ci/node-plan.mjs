#!/usr/bin/env node
// node-plan.mjs — which of ci.yml's "Pure-node unit suites" scripts does THIS diff need?
// @doc Per-PR plan for ci.yml's node-suites job: slow VM scripts run only when pick-tests routes the diff to their group.
// Full description: the slow VM scripts run only when pick-tests routes the diff to a group they replay, `APEX_CIRCUITS`
// narrows a circuit-only diff; anything unroutable runs everything.
// @section runner
//
// THE FAST TIER'S FLOOR WAS A TREE-ONLY JOB (2026-09-30). A PR run finished in
// ~6 min unqueued and its critical path was one file, elevation-tracks-vm
// (40 circuit builds, the `vm-a` slice), run identically on a HUD label change
// and on a track-engine change (docs/notes/CI-CAPACITY-2026-09-29.md). The
// browser half of the gate has been change-aware since select-specs; the node
// half never was, because the node-suites job has no `needs:` and no base.
//
// This gives it one, on PULL REQUESTS ONLY: the PR's base is the whole change,
// so a script that replays a browser group's assertions runs when pick-tests
// routes the diff to that group, and is skipped — BY NAME, in the log — when
// it does not. The deploy-branch push (the fast tier that pokes the train) and
// the Pages call still run every script: a merge is gated whole before it
// ships, and the `fast_tier_run` reuse contract ("tree-only") is untouched.
//
// FAIL SAFE, NEVER FAIL OPEN. Everything runs when: there is no base, a
// TRACKED path changed (select-specs' infra list: package.json, the manifest,
// the selectors, tests/data), a unit file or a VM harness changed (a slice
// cannot know which script hosts it), or the diff matched no rule at all.
//
//   node tools/ci/node-plan.mjs --since <ref>          # the plan, one line per script
//   node tools/ci/node-plan.mjs --since <ref> --sh     # shell: NODE_PLAN_*, planned(), APEX_CIRCUITS
//   node tools/ci/node-plan.mjs --all --sh             # run everything (push, Pages call, dispatch)
//   node tools/ci/node-plan.mjs --since <ref> --json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pick, stripSpecOwner } from "./pick-tests.mjs";
import { TRACKED, circuitsOf, circuitsTouched, dropBootFallback, specsOf } from "./select-specs.mjs";
import { ADAPTED } from "./twinned-specs.mjs";
import { changedPaths } from "../lib/changed-files.mjs";
import { TOOLING_FAST_FILES } from "./tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The scripts worth skipping (minutes each), and the pick-tests groups whose
 *  routing means the script's assertions are in play. Every other script in
 *  the step costs seconds and always runs.
 *
 *  game-vm-a is elevation-tracks-vm, the VM twin of elevation-tracks.spec.js
 *  (group `circuits`); game-vm-b holds physics-characterization-vm and the
 *  twins of the physics, collision, aero and hook specs; node-slow rasterises
 *  the car (livery, crest, cockpit) and builds the foundation circuits;
 *  vm-page runs the ADAPTED browser specs as themselves, so its groups are
 *  derived from where those specs live (twinned-specs.mjs). */
const VM_B_GROUPS = ["game-vm", "physics-core", "collisions", "aero", "hooks", "circuits", "modes"];
export const SCOPED = {
  "test:game-vm-a": ["circuits", "game-vm"],
  // Two time-balanced partitions of test:game-vm-b (tests/groups.json), one
  // runner each (ci.yml vm-b1 / vm-b2); the same trigger, since a routed
  // change cannot know which half its twin sits in.
  "test:game-vm-b1": VM_B_GROUPS,
  "test:game-vm-b2": VM_B_GROUPS,
  "test:node-slow": ["node-slow", "car", "circuits", "gfx", "input"],
  "test:vm-page": null,   // derived: adaptedGroups()
};

/** Always-on riders on the vm-b1 arm (ci.yml). Not guarded by `planned()` —
 *  seconds each — but ~55 of their files also sit in tooling-fast (guards),
 *  so a PR billed them twice (docs/notes/CI-CAPACITY-2026-09-29.md). On a
 *  matched PR plan those tooling-fast files are dropped via run-group.mjs
 *  `--skip-tf`; onlyHere files and every deploy/Pages/nightly run stay. */
export const ALWAYS_ON_TOPICAL = Object.freeze([
  "test:net-unit",
  "test:service-worker",
  "test:lifecycle-unit",
  "test:state-unit",
  "test:agent-contract",
  "test:audio-unit",
  "test:garage-unit",
  "test:steering-unit",
  "test:desktop-unit",
  "test:mcp",
]);

/** The planned VM slices that thin the same way (ci.yml vm-b1 / vm-b2, inside
 *  `planned`). Five game-vm-b files sit in tooling-fast too — real-replay-vm
 *  alone is ~121 s on a runner — and Structural guards shares node-suites'
 *  `if:`, so whenever a slice runs, guards already ran them (test audit T5,
 *  2026-10-05). Same contract: only a matched plan sets NODE_PLAN_SKIP_TF. */
export const THINNED_VM = Object.freeze(["test:game-vm-b1", "test:game-vm-b2"]);

/** Files ALWAYS_ON_TOPICAL would re-run that tooling-fast already covers. */
export function topicalTfOverlap(groups = groupsJson()) {
  const tf = new Set(TOOLING_FAST_FILES);
  const out = [];
  for (const script of ALWAYS_ON_TOPICAL) {
    for (const f of groups[script]?.files || []) if (tf.has(f)) out.push(f);
  }
  return [...new Set(out)].sort();
}

/** Paths a slice cannot be scoped around: the file may be the very suite a
 *  slice runs, or the harness every VM script boots through. */
export const RUN_ALL_PATHS = [
  /^tests\/unit\//, /^tests\/helpers\//, /^tools\/lib\//, /^\.github\/workflows\/ci\.yml$/,
  /^tools\/ci\/node-plan\.mjs$/,
  /^tools\/ci\/run-group\.mjs$/,
  /^tools\/ci\/tooling-fast\.mjs$/,
];

/** The browser groups the ADAPTED specs belong to, read from package.json's
 *  generated scripts so a regroup moves the trigger with the spec. */
export function adaptedGroups(scripts = pkgScripts()) {
  const out = new Set();
  const browser = Object.keys(scripts).filter((s) => s.startsWith("test:") && scripts[s].includes("run-playwright"));
  for (const spec of Object.keys(ADAPTED))
    for (const s of browser) if (specsOf([s], scripts).includes(spec)) out.add(s.slice("test:".length));
  return [...out].sort();
}

const pkgScripts = () => JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;

/* WHICH CIRCUITS DOES A SCRIPT BUILD? circuitsOf() lives in select-specs.mjs
 * since 2026-10-05 (it also routes a circuit edit to the specs that race it)
 * and is re-exported here for the plan and its test. */
export { circuitsOf };

/** Does any file of `script` build one of `circuits`? Unknown script or an
 *  unreadable file reads as yes. */
export function scriptBuilds(script, circuits, groups = groupsJson()) {
  const files = groups[script]?.files;
  if (!files) return true;
  for (const f of files) {
    const ids = circuitsOf(f);
    if (ids === null || circuits.some((c) => ids.has(c))) return true;
  }
  return false;
}
const groupsJson = () => JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8")).groups;

/** The plan for a changed-file list. `ref` is the diff base (for the
 *  per-circuit data files); empty keeps those files TRACKED. */
export function plan(changed, ref = "", scripts = pkgScripts()) {
  const scoped = { ...SCOPED, "test:vm-page": adaptedGroups(scripts) };
  // skipTf / skipTfFiles: PR matched plans drop tooling-fast overlap from the
  // always-on topical riders (see ALWAYS_ON_TOPICAL). Fail-safe `all` plans
  // and --all keep every file — deploy / Pages / nightly must not thin out.
  const all = (reason) => ({ reason, all: true, groups: [], circuits: [],
    run: Object.keys(scoped), skip: [], skipTf: false, skipTfFiles: [] });
  if (!changed.length) return all("no diff — no base to plan against");
  const circ = circuitsTouched(changed, ref);
  const tracked = changed.filter((f) => TRACKED.some((re) => re.test(f)) && !circ.dataResolved.includes(f));
  if (tracked.length) return all(`infra path changed (${tracked.slice(0, 3).join(", ")})`);
  const hosts = changed.filter((f) => RUN_ALL_PATHS.some((re) => re.test(f)));
  if (hosts.length) return all(`a suite or harness changed (${hosts.slice(0, 3).join(", ")})`);
  const g = pick(changed);
  // The boot group reaches here only through pick-tests' two blanket rules
  // ("any source edit", "script tags + DOM shell"), the same way it reaches
  // the selected gate — and logging.spec.js, an ADAPTED spec, lives in it, so
  // without this every js/ edit ran vm-page. select-specs answers that with
  // the fixed smoke gate; the same rule applies here.
  // An edited browser spec changes no VM file, so its owner group (pick-tests
  // SPEC_OWNER_REASON) is human advice here — EXCEPT an ADAPTED spec, which
  // vm-page runs as itself and select-specs therefore never runs in a browser:
  // before 2026-10-05 an edit to one ran nowhere on a pull request.
  stripSpecOwner(g);
  const editedAdapted = changed.filter((f) => Object.hasOwn(ADAPTED, f));
  dropBootFallback(g);
  const groups = [...g.keys()].sort();
  if (!groups.length) return all("no pick-tests rule matched this diff");
  const run = [], skip = [], why = {};
  const circuits = circ.scoped ? circ.ids : [];
  for (const [script, needs] of Object.entries(scoped)) {
    if (script === "test:vm-page" && editedAdapted.length) { run.push(script); continue; }
    if (!needs.some((n) => g.has(n))) { skip.push(script); why[script] = "no routed group"; continue; }
    // A circuit-only diff: a script whose files never build the touched
    // circuit cannot see the change (circuitsOf reads the files).
    if (circuits.length && !scriptBuilds(script, circuits)) { skip.push(script); why[script] = `no file builds ${circuits.join(",")}`; continue; }
    run.push(script);
  }
  const skipTfFiles = topicalTfOverlap();
  return { reason: "matched", all: false, groups, circuits, run, skip, why,
    skipTf: true, skipTfFiles };
}

export function changedSince(ref) {
  return changedPaths([ref]);   // rename SOURCES too (ledger M36)
}

/** The shell form the node-suites step sources: a `planned <script>` predicate,
 *  the reason, and APEX_CIRCUITS when the diff is circuit-scoped. */
export function toShell(p) {
  const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
  return [
    `NODE_PLAN_REASON=${q(p.reason)}`,
    `NODE_PLAN_RUN=${q(" " + p.run.join(" ") + " ")}`,
    `NODE_PLAN_SKIP=${q(p.skip.join(" "))}`,
    // Matched PR plans set this so ci.yml's always-on riders call run-group
    // --skip-tf; --all / fail-safe leave it unset so npm run stays whole.
    p.skipTf ? "export NODE_PLAN_SKIP_TF=1" : "unset NODE_PLAN_SKIP_TF",
    `planned() { case "$NODE_PLAN_RUN" in *" $1 "*) return 0 ;; esac; echo "SKIPPED $1 ($NODE_PLAN_REASON; groups: ${p.groups.join(", ") || "none"})"; return 1; }`,
    p.circuits.length ? `export APEX_CIRCUITS=${q(p.circuits.join(","))}` : "unset APEX_CIRCUITS",
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const si = argv.indexOf("--since");
  let p;
  if (argv.includes("--all")) p = plan([]);
  else if (si >= 0 && argv[si + 1]) p = plan(changedSince(argv[si + 1]), argv[si + 1]);
  else { console.error("usage: node tools/ci/node-plan.mjs (--since <ref> | --all) [--sh|--json]"); process.exit(2); }
  if (argv.includes("--json")) console.log(JSON.stringify(p, null, 2));
  else if (argv.includes("--sh")) process.stdout.write(toShell(p));
  else {
    console.log(`plan: ${p.reason}${p.all ? " -> every script runs" : ""}; groups: ${p.groups.join(", ") || "none"}`);
    for (const s of p.run) console.log(`RUN  ${s}${p.circuits.length && s === "test:game-vm-a" ? ` (APEX_CIRCUITS=${p.circuits.join(",")})` : ""}`);
    for (const s of p.skip) console.log(`SKIP ${s}${p.why?.[s] ? ` (${p.why[s]})` : ""}`);
  }
}
