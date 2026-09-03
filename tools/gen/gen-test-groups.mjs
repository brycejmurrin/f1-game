#!/usr/bin/env node
// @doc Regenerates package.json's `test:*` scripts and tooling-fast's file list from tests/groups.json; `--check`.
// @skill check-changes
/**
 * gen-test-groups.mjs — tests/groups.json is the ONE definition of a test
 * group; this writes the two places that used to hold their own copy.
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
 * The generated region of tooling-fast.mjs is delimited by @gen-shell-style
 * markers; never hand-edit between them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GROUPS = path.join(ROOT, "tests/groups.json");
const PKG = path.join(ROOT, "package.json");
const TF = path.join(ROOT, "tools/ci/tooling-fast.mjs");

const BEGIN = "  // @gen-test-groups:begin — generated from tests/groups.json; do not hand-edit";
const END = "  // @gen-test-groups:end";

export function loadGroups(file = GROUPS) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** The files in `toolingFast`, without the interleaved note lines. */
export const filesOnly = (entries) => entries.filter((e) => !e.startsWith("//"));

/** The command line one group runs, rebuilt from its definition. */
export function commandFor(def) {
  if (def.kind === "command") return def.cmd;
  const head = def.kind === "browser" ? "node tools/ci/run-playwright.mjs" : "node --test";
  return [head, ...(def.flags || []), ...(def.files || [])].join(" ");
}

/** package.json with every `test:*` script rebuilt, key order preserved. */
export function renderPkg(doc, pkgText) {
  const pkg = JSON.parse(pkgText);
  for (const [name, def] of Object.entries(doc.groups)) {
    if (!(name in pkg.scripts)) throw new Error(`groups.json names ${name}, package.json has no such script — add it or drop the group`);
    pkg.scripts[name] = commandFor(def);
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

/** tools/ci/tooling-fast.mjs with its file array regenerated in place. */
export function renderToolingFast(doc, text) {
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`tools/ci/tooling-fast.mjs is missing its @gen-test-groups markers`);
  // An entry that starts with `//` is a note, emitted verbatim: the reasons a
  // file earns its place in the edit loop (and the war stories behind them)
  // live beside the file they explain, and regenerating must not eat them.
  const body = doc.toolingFast
    .map((f) => (f.startsWith("//") ? `  ${f}` : `  ${JSON.stringify(f)},`))
    .join("\n");
  return text.slice(0, a) + BEGIN + "\n" + body + "\n" + text.slice(b);
}

function main() {
  const check = process.argv.includes("--check");
  const doc = loadGroups();
  const targets = [
    [PKG, renderPkg(doc, fs.readFileSync(PKG, "utf8")), "package.json"],
    [TF, renderToolingFast(doc, fs.readFileSync(TF, "utf8")), "tools/ci/tooling-fast.mjs"],
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
    console.log("gen-test-groups: package.json and the tooling-fast list match tests/groups.json");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
