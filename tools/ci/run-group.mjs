#!/usr/bin/env node
// run-group.mjs — run one tests/groups.json script's files (optionally minus tooling-fast).
// @doc PR-only topical runner: drop TOOLING_FAST_FILES so the always-on riders (vm-a1 / vm-a2 / slow arms) do not double-bill.
//
//   node tools/ci/run-group.mjs test:steering-unit           # every file in the group
//   node tools/ci/run-group.mjs test:steering-unit --skip-tf # omit tooling-fast overlap
//
// ci.yml's vm-a1 / vm-a2 / slow arms call this when the node-plan sets NODE_PLAN_SKIP_TF=1
// (pull_request matched plans only). Deploy / Pages / nightly keep
// `npm run test:<x>` unchanged. Empty after filter → exit 0 with SKIPPED.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLING_FAST_FILES } from "./tooling-fast.mjs";
import { loadGroups } from "../gen/gen-test-groups.mjs";
import { nodeGroupPhases } from "./run-node-group.mjs";

const require = createRequire(import.meta.url);
const { augmentNodeCompileCache } = require("../lib/node-compile-cache.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function filesFor(script, { skipTf = false, doc = loadGroups() } = {}) {
  const groups = doc.groups;
  const entry = groups[script];
  if (!entry?.files?.length) throw new Error(`run-group: unknown or empty group ${script}`);
  if (!skipTf) return [...entry.files];
  const tf = new Set(TOOLING_FAST_FILES);
  return entry.files.filter((f) => !tf.has(f));
}

/** Filtering changes membership only: generated flags and exclusive phases
 * still apply to every remaining file. Empty selections never discover tests. */
export function runGroup(script, { skipTf = false, doc = loadGroups(), execute = spawnSync,
  env = process.env, cwd = ROOT, announce = console.log } = {}) {
  const files = filesFor(script, { skipTf, doc });
  if (!files.length) { announce(`SKIPPED ${script} (every file already in tooling-fast)`); return 0; }
  if (skipTf) announce(`run-group ${script}: ${files.length} onlyHere (skipped ${doc.groups[script].files.length - files.length} tooling-fast)`);
  const phases = nodeGroupPhases({ ...doc.groups[script], files }, doc.isolatedFiles);
  const childEnv = { ...env, ...augmentNodeCompileCache(env, cwd) };
  delete childEnv.NODE_TEST_CONTEXT;
  for (const args of phases) {
    const r = execute(process.execPath, args, { cwd, stdio: "inherit", env: childEnv });
    if (r.error || r.signal || r.status !== 0) return r.status || 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const script = argv.find((a) => a.startsWith("test:"));
  if (!script) {
    console.error("usage: node tools/ci/run-group.mjs test:<group> [--skip-tf]");
    process.exit(2);
  }
  process.exit(runGroup(script, { skipTf: argv.includes("--skip-tf") }));
}
