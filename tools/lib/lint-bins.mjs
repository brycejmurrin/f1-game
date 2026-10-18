// @doc Locates the pinned lint binaries (actionlint, zizmor, glslang, naga, shellcheck) and defines what an absent one means.
// Locates the offline lint binaries that tools/env/install-lint-bins.sh installs, and decides what
// "absent" means. Shared by tools/check/workflow-lint.mjs and tools/check/shader-validate.mjs.
//
// ABSENT IS LOUD. A check whose binary is missing prints a SKIP line naming the install command;
// with APEX_REQUIRE_LINT_BINS=1 (CI sets it) or --require it is a failure instead. It is never a
// silent pass.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const INSTALL_CMD = "bash tools/env/install-lint-bins.sh";

/** name -> [env override, candidate paths under the repo, PATH command]. */
const BINS = {
  actionlint: ["APEX_ACTIONLINT", ["artifacts/bin/actionlint"], "actionlint"],
  zizmor: ["APEX_ZIZMOR", ["artifacts/bin/venv/bin/zizmor"], "zizmor"],
  glslangValidator: ["APEX_GLSLANG", [], "glslangValidator"],
  naga: ["APEX_NAGA", ["artifacts/bin/cargo/bin/naga"], "naga"],
  shellcheck: ["APEX_SHELLCHECK", [], "shellcheck"],   // actionlint shells out to it for every run: block
};

const works = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return !r.error && r.status !== null;
};

/** Absolute path (or PATH name) of a runnable binary, or null. */
export function resolveBin(name) {
  const [envKey, local, onPath] = BINS[name];
  // An explicit override is authoritative: a wrong path reads as ABSENT, never as "use another".
  const candidates = process.env[envKey] ? [process.env[envKey]] : [...local.map((p) => path.join(ROOT, p)), onPath];
  for (const c of candidates) {
    if ((path.isAbsolute(c) ? fs.existsSync(c) : true) && works(c, ["--version"])) return c;
  }
  return null;
}

/** First line of `<bin> --version` / `-version`, for the receipt line. */
export function versionOf(bin) {
  for (const flag of ["--version", "-version", "-v"]) {
    const r = spawnSync(bin, [flag], { encoding: "utf8" });
    const lines = `${r.stdout || ""}${r.stderr || ""}`.split("\n").filter((l) => l.trim());
    const line = lines.find((l) => /\d+\.\d+/.test(l)) || lines[0];
    if (!r.error && line) return line.trim();
  }
  return "unknown version";
}

export const requireBins = (argv = process.argv) =>
  argv.includes("--require") || process.env.APEX_REQUIRE_LINT_BINS === "1";

/** The one SKIP line. Printed to stderr so it survives `--json` on stdout. */
export function skipLine(check, tool) {
  return `SKIP ${check}: ${tool} not found - NOT CHECKED. Install: ${INSTALL_CMD} ${tool === "glslangValidator" ? "glslang" : tool}`;
}
