#!/usr/bin/env node
// @doc Regenerates package.json's `test:*` scripts from tests/groups.json; `--check`.
// @skill check-changes
/**
 * gen-test-groups.mjs — tests/groups.json is the ONE definition of a test
 * group; this writes package.json's `test:*` scripts from it.
 *
 *   node tools/gen/gen-test-groups.mjs            # write
 *   node tools/gen/gen-test-groups.mjs --check    # fail on drift (fast gate)
 *
 * Adding a group was three coordinated edits — a package.json script, the
 * TOOLING_FAST_FILES array, and a docs/TESTING.md row — and nothing failed
 * when one was forgotten except the coverage audit, later. It is one edit in
 * tests/groups.json now, and `--check` on the fast gate makes a stale copy a
 * red run instead of a silent gap.
 *
 * tooling-fast.mjs used to carry a generated copy of the `toolingFast` list
 * (1,512 lines between @gen-test-groups markers, a weekly merge-conflict hot
 * spot). Since 2026-10-26 it reads tests/groups.json at import time, so there
 * is nothing to regenerate there.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GROUPS = path.join(ROOT, "tests/groups.json");
const PKG = path.join(ROOT, "package.json");

export function loadGroups(file = GROUPS) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** The files in `toolingFast`, without the interleaved note lines. */
export const filesOnly = (entries) => entries.filter((e) => !e.startsWith("//"));

/** Node's own per-test bound for a `node --test` group (ms). A hung test then fails by name instead of
 * the job reporting `cancelled`; a group may carry its own `--test-timeout=` flag, which wins.
 * https://nodejs.org/api/cli.html#--test-timeout */
export const NODE_TEST_TIMEOUT_MS = 900000;
export function nodeFlags(def) {
  const flags = def.flags || [];
  return flags.some((f) => f.startsWith("--test-timeout")) ? flags : [`--test-timeout=${NODE_TEST_TIMEOUT_MS}`, ...flags];
}

/** The command line one group runs, rebuilt from its definition. */
export function commandFor(def, isolatedFiles = [], name) {
  if (def.kind === "command") return def.cmd;
  if (def.kind === "node" && (def.files || []).some((file) => isolatedFiles.includes(file))) {
    if (!name) throw new Error("an isolated node group needs its manifest name");
    // Keep the generated roster visible to coverage audits. npm's forwarded
    // arguments follow -- and the wrapper passes them to every phase.
    return ["node tools/ci/run-node-group.mjs", name, ...def.files, "--"].join(" ");
  }
  const head = def.kind === "browser" ? "node tools/ci/run-playwright.mjs" : "node --test";
  return [head, ...(def.kind === "node" ? nodeFlags(def) : def.flags || []), ...(def.files || [])].join(" ");
}

/** package.json with every `test:*` script rebuilt, key order preserved. */
export function renderPkg(doc, pkgText) {
  const pkg = JSON.parse(pkgText);
  for (const [name, def] of Object.entries(doc.groups)) {
    if (!(name in pkg.scripts)) throw new Error(`groups.json names ${name}, package.json has no such script — add it or drop the group`);
    pkg.scripts[name] = commandFor(def, doc.isolatedFiles, name);
  }
  // A `test:*` script whose group left groups.json is DELETED here, not
  // refused: groups.json is the single source, so removing a group has to be
  // one edit for the same reason adding one is. Nothing goes silently — the
  // drift guard compares both lists in both directions, and a group deleted by
  // accident shows up as a removed script in the diff.
  for (const name of Object.keys(pkg.scripts)) {
    if (name.startsWith("test") && !(name in doc.groups)) delete pkg.scripts[name];
  }
  const trailing = pkgText.endsWith("\n") ? "\n" : "";
  return JSON.stringify(pkg, null, 2) + trailing;
}

function main() {
  // An unknown flag used to fall through to WRITE mode and rewrite package.json (G1).
  const unknown = process.argv.slice(2).filter((a) => a !== "--check");
  if (unknown.length) {
    console.error(`gen-test-groups: unknown argument ${unknown.join(" ")}\nusage: node tools/gen/gen-test-groups.mjs [--check]`);
    process.exit(2);
  }
  const check = process.argv.includes("--check");
  const doc = loadGroups();
  const targets = [
    [PKG, renderPkg(doc, fs.readFileSync(PKG, "utf8")), "package.json"],
  ];
  let drift = 0;
  for (const [file, next, label] of targets) {
    const now = fs.readFileSync(file, "utf8");
    if (now === next) { if (!check) console.log(`${label}: up to date`); continue; }
    drift++;
    if (check) console.error(`${label}: STALE — run \`node tools/gen/gen-test-groups.mjs\``);
    else { fs.writeFileSync(file, next); console.log(`${label}: written`); }
  }
  if (check) {
    if (drift) process.exit(1);
    console.log("gen-test-groups: package.json matches tests/groups.json (tooling-fast reads it at runtime)");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
