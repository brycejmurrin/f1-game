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
 * THE LINES ARE STABLE (#5427 item 4, 2026-11-11). A `test:*` script used to
 * carry its group's whole file list, so two PRs that each added a test
 * conflicted in package.json every night. A node or browser group's line is
 * now one wrapper (`node tools/ci/run-group.mjs test:x`,
 * `node tools/ci/run-playwright.mjs --group test:x`) that reads groups.json
 * at run time; adding or removing a test file no longer touches package.json.
 * A reader that wants a group's files calls groupFiles(); one that parses a
 * script string calls expandScript() first.
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

/** The FULL command line a group stands for: its flags and every file, the shape package.json carried
 * until #5427. Nothing writes it into package.json any more; a reader that parses a group's flags or
 * files out of a script string sees it through expandScript(). (An isolated node group really runs
 * through run-group.mjs phases; this string is for readers, not for a shell.) */
export function expandedCommand(def) {
  if (def.kind === "command") return def.cmd;
  const head = def.kind === "browser" ? "node tools/ci/run-playwright.mjs" : "node --test";
  return [head, ...(def.kind === "node" ? nodeFlags(def) : def.flags || []), ...(def.files || [])].join(" ");
}

/** The STABLE package.json line of one group (#5427 item 4). A node or browser group with a file list
 * gets ONE wrapper that reads tests/groups.json at run time, so adding or removing a test file edits
 * groups.json alone and two PRs that each add a test no longer conflict in package.json. A group with
 * no file list (a `command`, test:render's whole project, the bare `test`) has nothing that moves and
 * keeps its literal line. Readers that detect a browser group by `includes("run-playwright")` still
 * match. npm-forwarded arguments (`npm run test:x -- …`) follow the wrapper and reach every phase. */
export function commandFor(def, _isolatedFiles = [], name) {
  if (def.kind === "command" || !(def.files || []).length) return expandedCommand(def);
  if (!name) throw new Error("a wrapper line needs its group name");
  return def.kind === "browser" ? `node tools/ci/run-playwright.mjs --group ${name}` : `node tools/ci/run-group.mjs ${name}`;
}

const WRAPPER_RE = /^node tools\/ci\/(?:run-group\.mjs|run-playwright\.mjs --group) (test(?::[\w-]+)?)$/;
let cachedDoc = null;
const defaultDoc = () => (cachedDoc ||= loadGroups());

/** The group a wrapper line runs (`test:x`), or null for any other script line. */
export function wrapperGroup(cmd) {
  const m = WRAPPER_RE.exec(String(cmd || "").trim());
  return m ? m[1] : null;
}

/** One group's definition. Unknown → a thrown error naming it: a script that runs nothing must fail
 * loudly, never pass on zero tests. With `want` (the one kind the caller can run) a different kind or
 * an empty file list throws too. */
export function groupDef(name, doc = defaultDoc(), want = null) {
  const def = doc.groups?.[name];
  if (!def) throw new Error(`test group ${name} is not in tests/groups.json`);
  if (want && def.kind !== want) throw new Error(`test group ${name} is a ${def.kind} group, not ${want}`);
  if (want && want !== "command" && !(def.files || []).length) throw new Error(`test group ${name} has an empty file list in tests/groups.json`);
  return def;
}

/** THE shared reader (#5427): a script line with its wrapper resolved against tests/groups.json into the
 * full flags-and-files command that every string-parsing reader (select-specs specsOf, ci-coverage, the
 * coverage audit, remote-group) used to find in package.json. Any other line comes back unchanged, so a
 * literal line (a command group, a test fixture) parses as before. */
export function expandScript(cmd, doc = defaultDoc()) {
  const name = wrapperGroup(cmd);
  return name ? expandedCommand(groupDef(name, doc)) : cmd;
}

/** A scripts map with every wrapper line expanded (expandScript). */
export function expandScripts(scripts, doc = defaultDoc()) {
  return Object.fromEntries(Object.entries(scripts || {}).map(([k, v]) => [k, expandScript(v, doc)]));
}

/** A browser group's file tokens with each single-star glob expanded the way npm's shell used to
 * expand it (sorted matches in the token's directory). A glob that matches nothing throws: the old
 * shell passed it on literally and Playwright then matched nothing. */
export function expandSpecTokens(tokens, root = ROOT) {
  return tokens.flatMap((tok) => {
    if (!tok.includes("*")) return [tok];
    const dir = path.posix.dirname(tok), base = path.posix.basename(tok);
    const re = new RegExp("^" + base.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*") + "$");
    let names = [];
    try { names = fs.readdirSync(path.join(root, dir)); } catch (_) { /* no dir: no match */ }
    const hit = names.filter((n) => re.test(n)).sort().map((n) => `${dir}/${n}`);
    if (!hit.length) throw new Error(`glob ${tok} matches no file`);
    return hit;
  });
}

/** run-playwright.mjs's argv with a leading `--group test:x` replaced by that browser group's flags and
 * files from tests/groups.json, then the forwarded arguments, the order the old literal line gave
 * (`run-playwright <flags> <files> <npm-forwarded…>`). An argv without `--group` comes back unchanged;
 * `--group` anywhere but first, an unknown name, a non-browser group or an empty list throws. */
export function resolveGroupArgv(argv, doc = defaultDoc(), root = ROOT) {
  const at = argv.indexOf("--group");
  if (at < 0) return argv;
  if (at !== 0 || !argv[1]) throw new Error("usage: run-playwright.mjs --group test:<name> [playwright args …] (--group comes first)");
  const def = groupDef(argv[1], doc, "browser");
  return [...(def.flags || []), ...expandSpecTokens(def.files, root), ...argv.slice(2)];
}

/** A node/browser group's file tokens (paths; a browser group may use single-star globs) from
 * tests/groups.json. Throws on an unknown group or an empty list. */
export function groupFiles(name, doc = defaultDoc()) {
  const def = groupDef(name, doc);
  if (!(def.files || []).length) throw new Error(`test group ${name} has an empty file list in tests/groups.json`);
  return [...def.files];
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
  const argv = process.argv.slice(2);
  // `--files test:x` prints the group's file tokens, one per line: ci.yml's path filters read this, not
  // a regex over package.json. An unknown group or an empty list exits 1.
  if (argv[0] === "--files") {
    if (argv.length !== 2) { console.error("usage: node tools/gen/gen-test-groups.mjs --files test:<group>"); process.exit(2); }
    try { process.stdout.write(groupFiles(argv[1]).join("\n") + "\n"); }
    catch (e) { console.error(`gen-test-groups: ${e.message}`); process.exit(1); }
    return;
  }
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length) {
    console.error(`gen-test-groups: unknown argument ${unknown.join(" ")}\nusage: node tools/gen/gen-test-groups.mjs [--check] | --files test:<group>`);
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
