#!/usr/bin/env node
// run-group.mjs — run one tests/groups.json script's files (optionally minus what Structural guards ran).
// @doc Runs every node `npm run test:<group>` from tests/groups.json; `--skip-tf` drops what the guards shards ran.
//
//   node tools/ci/run-group.mjs test:steering-unit           # every file in the group
//   node tools/ci/run-group.mjs test:steering-unit --skip-tf # omit tooling-fast overlap
//   npm run test:steering-unit -- --test-name-pattern=brake  # forwarded --opt / --opt=value reach every phase
//
// package.json's node `test:*` lines are `node tools/ci/run-group.mjs test:<x>` (#5427 item 4), so
// adding a test file edits tests/groups.json alone. An unknown group, a non-node group or an empty
// file list exits non-zero with a message: it never runs zero tests and passes.
// ci.yml's vm-a1 / vm-a2 / slow arms add --skip-tf when the node-plan sets NODE_PLAN_SKIP_TF=1
// (pull_request matched plans only). Empty AFTER that filter → exit 0 with SKIPPED.
//
// WHAT --skip-tf SUBTRACTS (audit W6, 2026-11-10). It used to drop EVERY
// tooling-fast member. On a pull request whose diff is only js/ or css/ the
// guards shards run `tooling-fast --changed` — a SELECTION — so a member they
// did not select ran in no PR job at all: game-vm, physics-characterization-vm,
// real-replay-vm, red-flag-fuel-vm, session-entry-vm, lockup-bench-vm and the
// real-replay-* files on a js/game.js diff. It now drops exactly the files
// guardsRanFiles() (tooling-fast.mjs) says the shards ran for this event and
// diff; when that cannot be computed (no deploy base) it drops nothing.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLING_FAST_FILES, changedVsDeploy, guardsRanFiles, syncMergePaths } from "./tooling-fast.mjs";
import { groupDef, loadGroups } from "../gen/gen-test-groups.mjs";
import { checkPhase, nodeGroupPhases, phaseFiles, verdictPath, withFileVerdict } from "./run-node-group.mjs";

const require = createRequire(import.meta.url);
const { augmentNodeCompileCache } = require("../lib/node-compile-cache.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** `ran`: the files Structural guards ran (guardsRanFiles().files). Omitted, it
 *  is the whole floor — the full-mode answer, kept for pure callers. */
export function filesFor(script, { skipTf = false, doc = loadGroups(), ran = null } = {}) {
  let entry;
  try { entry = groupDef(script, doc, "node"); } catch (e) { throw new Error(`run-group: ${e.message}`); }
  if (!skipTf) return [...entry.files];
  const drop = new Set(ran || TOOLING_FAST_FILES);
  return entry.files.filter((f) => !drop.has(f));
}

/** What the guards shards ran on THIS checkout and event (ci.yml sets
 *  GITHUB_EVENT_NAME; node-suites checks out with fetch-depth 0 like guards).
 *  No deploy base → nothing is known to have run → drop nothing. */
export function liveGuardsRan(env = process.env) {
  try {
    const { paths, base } = changedVsDeploy();
    const r = guardsRanFiles(paths, env.GITHUB_EVENT_NAME, { synced: syncMergePaths(), diffBase: base.ref });
    return { ...r, base };
  } catch (e) {
    return { mode: "unknown", reason: String(e && e.message || e).split("\n")[0], files: [] };
  }
}

/** Filtering changes membership only: generated flags and exclusive phases
 * still apply to every remaining file. Empty selections never discover tests. */
export function runGroup(script, { skipTf = false, doc = loadGroups(), execute = spawnSync,
  env = process.env, cwd = ROOT, announce = console.log, ran = null, ranWhy = "", fileVerdict = true, extraArgs = [] } = {}) {
  const files = filesFor(script, { skipTf, doc, ran });
  if (!files.length) { announce(`SKIPPED ${script} (Structural guards already ran every file${ranWhy ? `; ${ranWhy}` : ""})`); return 0; }
  if (skipTf) announce(`run-group ${script}: ${files.length} to run (skipped ${doc.groups[script].files.length - files.length} Structural guards ran${ranWhy ? `; ${ranWhy}` : ""})`);
  const phases = nodeGroupPhases({ ...doc.groups[script], files }, doc.isolatedFiles, extraArgs);
  const childEnv = { ...env, ...augmentNodeCompileCache(env, cwd) };
  delete childEnv.NODE_TEST_CONTEXT;
  // Exit 0 is checked per file (run-node-group.mjs fileVerdicts): a file that
  // process.exit(0)s before its tests used to pass the whole group.
  for (const phase of phases) {
    const dest = fileVerdict ? verdictPath(cwd) : null;
    const args = (dest && withFileVerdict(phase, dest)) || phase;
    const r = execute(process.execPath, args, { cwd, stdio: "inherit", env: childEnv });
    if (r.error || r.signal || r.status !== 0) { if (dest) checkPhase([], dest, { root: cwd }); return r.status || 1; }
    if (args !== phase && !checkPhase(phaseFiles(phase), dest, { root: cwd })) return 1;
  }
  return 0;
}

/** argv → { script, skipTf, extraArgs }. The group comes first; `--skip-tf` is ours; a bare `--` is
 * dropped (npm already strips the first); everything else is forwarded to every phase, where
 * nodeGroupPhases refuses a path or a separate option value. */
export function parseRunGroupArgs(argv) {
  const [script, ...rest] = argv;
  if (!script || !/^test(:[\w-]+)?$/.test(script)) throw new Error("usage: node tools/ci/run-group.mjs test:<group> [--skip-tf] [--opt[=value] …]");
  return { script, skipTf: rest.includes("--skip-tf"), extraArgs: rest.filter((a) => a !== "--skip-tf" && a !== "--") };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try {
    const { script, skipTf, extraArgs } = parseRunGroupArgs(process.argv.slice(2));
    filesFor(script);   // an unknown / empty / non-node group fails here, before the guards lookup
    const g = skipTf ? liveGuardsRan() : null;
    code = runGroup(script, { skipTf, extraArgs, ran: g ? g.files : null,
      ranWhy: g ? `guards mode=${g.mode}${g.selection ? ` selection=${g.selection}` : ""}: ${g.reason}` : "" });
  } catch (e) {
    console.error(String(e && e.message || e));
    code = 2;
  }
  process.exit(code);
}
