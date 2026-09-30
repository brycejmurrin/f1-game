#!/usr/bin/env node
// run-group.mjs — run one tests/groups.json script's files (optionally minus tooling-fast).
// @doc PR-only topical runner: drop TOOLING_FAST_FILES so always-on vm-b1 riders do not double-bill.
//
//   node tools/ci/run-group.mjs test:steering-unit           # every file in the group
//   node tools/ci/run-group.mjs test:steering-unit --skip-tf # omit tooling-fast overlap
//
// ci.yml's vm-b1 arm calls this when the node-plan sets NODE_PLAN_SKIP_TF=1
// (pull_request matched plans only). Deploy / Pages / nightly keep
// `npm run test:<x>` unchanged. Empty after filter → exit 0 with SKIPPED.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLING_FAST_FILES } from "./tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function filesFor(script, { skipTf = false } = {}) {
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8")).groups;
  const entry = groups[script];
  if (!entry?.files?.length) throw new Error(`run-group: unknown or empty group ${script}`);
  if (!skipTf) return [...entry.files];
  const tf = new Set(TOOLING_FAST_FILES);
  return entry.files.filter((f) => !tf.has(f));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const script = argv.find((a) => a.startsWith("test:"));
  if (!script) {
    console.error("usage: node tools/ci/run-group.mjs test:<group> [--skip-tf]");
    process.exit(2);
  }
  const skipTf = argv.includes("--skip-tf");
  const files = filesFor(script, { skipTf });
  if (!files.length) {
    console.log(`SKIPPED ${script} (every file already in tooling-fast)`);
    process.exit(0);
  }
  if (skipTf) {
    const dropped = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"))
      .groups[script].files.length - files.length;
    console.log(`run-group ${script}: ${files.length} onlyHere (skipped ${dropped} tooling-fast)`);
  }
  const r = spawnSync(process.execPath, ["--test", ...files], { cwd: ROOT, stdio: "inherit" });
  process.exit(r.status === null ? 1 : r.status);
}
