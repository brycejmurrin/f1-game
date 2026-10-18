#!/usr/bin/env node
// @doc actionlint + zizmor over .github/workflows, offline; skips LOUDLY (fails under --require) without the binary.
// @skill check-changes
//
// WHY. A typo in a workflow expression or a template-injectable `run:` is found on the Pages train
// (23 min median) or by an attacker, not locally. Both linters are static and offline.
//
//   node tools/check/workflow-lint.mjs                 # the tree: .github/workflows with the repo configs
//   node tools/check/workflow-lint.mjs --require       # absent binary = failure (CI sets APEX_REQUIRE_LINT_BINS=1)
//   node tools/check/workflow-lint.mjs --json          # machine-readable result on stdout
//   node tools/check/workflow-lint.mjs --dir <path>    # another workflows directory (fixtures); no repo config
//
// Config: .github/actionlint.yaml and .github/zizmor.yml, each with the reason for every suppression.
// zizmor runs --offline: the audits that need a GitHub token (impostor commits, known-vulnerable
// actions, ref confusion) are NOT run; the check must work with no network at test time.
// Binaries: tools/env/install-lint-bins.sh (pinned, checksummed). Exit 0 clean or SKIPPED, 1 findings
// (or SKIPPED under --require), 2 tool error.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, requireBins, resolveBin, skipLine, versionOf } from "../lib/lint-bins.mjs";

const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 << 20 });

/**
 * @param {{dir?: string, useRepoConfig?: boolean}} [opts] dir is relative to ROOT or absolute.
 * @returns {{tool: string, status: "clean"|"findings"|"skipped"|"error", version?: string, output: string}[]}
 */
export function lintWorkflows({ dir = ".github/workflows", useRepoConfig = true } = {}) {
  const abs = path.resolve(ROOT, dir);
  const results = [];

  const al = resolveBin("actionlint");
  if (!al) results.push({ tool: "actionlint", status: "skipped", output: skipLine("workflow-lint", "actionlint") });
  else {
    // actionlint runs shellcheck over every `run:` block when it is on PATH and silently skips it
    // when not, so a box without it would pass what CI fails. Report that as its own SKIP row.
    const sc = resolveBin("shellcheck");
    results.push(sc ? { tool: "shellcheck", status: "clean", version: versionOf(sc), output: "" }
      : { tool: "shellcheck", status: "skipped", output: skipLine("workflow-lint", "shellcheck") });
    const args = ["-no-color", ...(useRepoConfig ? ["-config-file", path.join(ROOT, ".github/actionlint.yaml")] : []), ...fs.readdirSync(abs).filter((f) => /\.ya?ml$/.test(f)).map((f) => path.join(abs, f))];
    const r = run(al, args, ROOT);
    const out = `${r.stdout}${r.stderr}`.trim();
    results.push({ tool: "actionlint", version: versionOf(al), output: out,
      status: r.status === 0 ? "clean" : r.status === 1 ? "findings" : "error" });
  }

  const zz = resolveBin("zizmor");
  if (!zz) results.push({ tool: "zizmor", status: "skipped", output: skipLine("workflow-lint", "zizmor") });
  else {
    const args = ["--offline", "--no-progress", "--format", "plain", ...(useRepoConfig ? ["--config", path.join(ROOT, ".github/zizmor.yml")] : ["--no-config"]), abs];
    const r = run(zz, args, ROOT);
    const out = `${r.stdout}${r.stderr}`.trim();
    // zizmor exits 10-14 when it has findings (by severity), 1 on a tool error, 0 clean.
    results.push({ tool: "zizmor", version: versionOf(zz), output: out,
      status: r.status === 0 ? "clean" : r.status >= 10 ? "findings" : "error" });
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const argv = process.argv.slice(2);
  const di = argv.indexOf("--dir");
  const dirArg = di >= 0 ? argv[di + 1] : null;
  const results = lintWorkflows({ dir: dirArg || ".github/workflows", useRepoConfig: !dirArg });
  if (argv.includes("--json")) console.log(JSON.stringify(results, null, 2));
  let bad = 0;
  for (const r of results) {
    const tag = r.status === "clean" ? "ok  " : r.status === "skipped" ? "SKIP" : "FAIL";
    if (r.status === "skipped") console.error(r.output);
    else if (r.status !== "clean") console.error(r.output);
    if (!argv.includes("--json")) console.log(`${tag} workflow-lint ${r.tool}${r.version ? ` (${r.version})` : ""}: ${r.status}`);
    if (r.status === "findings") bad = Math.max(bad, 1);
    if (r.status === "error") bad = 2;
    if (r.status === "skipped" && requireBins()) bad = Math.max(bad, 1);
  }
  process.exit(bad);
}
