#!/usr/bin/env node
// archive-branches.mjs — bundle the pre-restart branches into one release asset, then let the workflow delete them.
// @doc Plans and verifies the git-bundle archive of branches with no history in common with deploy (archive-branches.yml).
// Full description: Selects every remote branch that shares no history with the deploy branch (it was restarted on 2026-09-29), writes the list and an index, and verifies a git bundle holds every one of them at the right sha; .github/workflows/archive-branches.yml bundles, verifies, uploads it to a GitHub Release, and only then deletes the branches.
// @skill check-changes
//
// WHY. A full clone was 1.1 GB on 2026-10-01 and the deploy branch alone 193 MB.
// The rest is the history from before the deploy branch was restarted, held by
// `main` and ~130 branches forked before 2026-09-29 — and all of them share it,
// so deleting SOME frees nothing (measured: `main` alone, 0 B). Deleting them
// all loses work nobody merged (80 had no PR), so they are ARCHIVED first: one
// `git bundle` with every branch at its exact sha, attached to a GitHub Release
// (per-file limit just under 2 GiB, https://docs.github.com/en/repositories/
// releasing-projects-on-github/about-releases; MAX_BUNDLE keeps a margin). A
// branch comes back with
//   git fetch <bundle> 'refs/archive/<name>:refs/heads/<name>'
//
// SELECTION — archived and deleted when ALL hold, else kept with a reason:
//   * no merge base with the deploy branch (pre-restart history);
//   * no open PR has it as its head;
//   * quiet for --min-age-days;
//   * not the deploy branch, gh-pages, a claude/claims/* marker (prune-branches
//     owns those, and they weigh nothing), or a --keep match.
// `main` is archived like the rest; --main reset (the default) then points it
// at the deploy tip instead of deleting it, so the name survives without the
// old history. --main delete removes it; --main keep leaves it (and its ~750 MB).
//
// Subcommands:
//   plan   [--base B] [--open-heads F] [--min-age-days N] [--keep RE] [--main M] --out DIR
//          writes DIR/archive.txt (name\tsha, every branch to bundle),
//          DIR/delete.txt (names to delete), DIR/index.md and DIR/index.json.
//   verify --bundle F --list DIR/archive.txt
//          `git bundle verify` plus: every listed branch is in the bundle as
//          refs/archive/<name> at exactly its sha, and nothing else is.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseRefs } from "./branch-audit.mjs";

export const DEPLOY = "claude/f1-game-project-26h3ng";
export const ARCHIVE_PREFIX = "refs/archive/";
export const MAX_BUNDLE = 1_900_000_000;   // bytes; GitHub's per-asset ceiling is just under 2 GiB
const NEVER = [/^gh-pages$/, /^claude\/claims\//];

/** Pure. branches [{name, sha, time}]; hasBase(name) -> shares history with deploy. */
export function selectArchive(branches, { base = DEPLOY, hasBase, openHeads = new Set(), keep = null, minAgeDays = 1,
  now = Math.floor(Date.now() / 1000), mainMode = "reset" }) {
  const archive = [], del = [], kept = [];
  for (const b of branches) {
    let why = null;
    if (b.name === base) why = "deploy branch";
    else if (NEVER.some((re) => re.test(b.name))) why = "protected name";
    else if (keep && keep.test(b.name)) why = "--keep";
    else if (openHeads.has(b.name)) why = "open PR";
    else if (hasBase(b.name)) why = "shares history with deploy";
    else if (!(Number.isFinite(b.time) && now - b.time >= minAgeDays * 86400)) why = "recent";
    else if (b.name === "main" && mainMode === "keep") why = "--main keep";
    if (why) { kept.push({ name: b.name, why }); continue; }
    archive.push(b);
    if (!(b.name === "main" && mainMode === "reset")) del.push(b.name);
  }
  archive.sort((a, b) => a.name.localeCompare(b.name));
  del.sort();
  return { archive, del, kept };
}

/** `git bundle list-heads` text -> Map(name -> sha) for refs/archive/* heads. */
export function parseHeads(text) {
  const m = new Map();
  for (const line of String(text).split("\n")) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (sha && ref && ref.startsWith(ARCHIVE_PREFIX)) m.set(ref.slice(ARCHIVE_PREFIX.length), sha);
  }
  return m;
}

/** Pure. Every listed branch at its sha, nothing extra. Returns the problems (empty = good). */
export function checkBundle(list, heads) {
  const problems = [];
  for (const { name, sha } of list) {
    if (!heads.has(name)) problems.push(`missing ${name}`);
    else if (heads.get(name) !== sha) problems.push(`wrong sha for ${name}: ${heads.get(name)} != ${sha}`);
  }
  for (const name of heads.keys()) if (!list.some((b) => b.name === name)) problems.push(`unexpected ${name}`);
  return problems;
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] });
const arg = (argv, f, d) => { const i = argv.indexOf(f); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };

function plan(argv) {
  const base = arg(argv, "--base", DEPLOY), out = arg(argv, "--out", null);
  const mainMode = arg(argv, "--main", "reset");
  if (!out) { console.error("archive-branches plan: --out <dir> is required"); return 2; }
  if (!["reset", "delete", "keep"].includes(mainMode)) { console.error("archive-branches: --main is reset, delete or keep"); return 2; }
  const headsFile = arg(argv, "--open-heads", null);
  if (!headsFile) { console.error("archive-branches plan: --open-heads is required (an unknown PR set is not an empty one)"); return 2; }
  const openHeads = new Set(fs.readFileSync(headsFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
  const baseRef = "refs/remotes/origin/" + base;
  const branches = parseRefs(git("for-each-ref", "--format=%(refname)\t%(objectname)\t%(committerdate:unix)", "refs/remotes/origin"));
  const hasBase = (name) => { try { git("merge-base", baseRef, "refs/remotes/origin/" + name); return true; } catch (_) { return false; } };
  const keepSrc = arg(argv, "--keep", "");
  const { archive, del, kept } = selectArchive(branches, { base, hasBase, openHeads, keep: keepSrc ? new RegExp(keepSrc) : null,
    minAgeDays: Number(arg(argv, "--min-age-days", "1")), mainMode });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "archive.txt"), archive.map((b) => `${b.name}\t${b.sha}`).join("\n") + (archive.length ? "\n" : ""));
  fs.writeFileSync(path.join(out, "delete.txt"), del.join("\n") + (del.length ? "\n" : ""));
  const index = archive.map((b) => {
    const [date, author, subject] = git("log", "-1", "--format=%cs%x09%an%x09%s", b.sha).trim().split("\t");
    return { name: b.name, sha: b.sha, date, author, subject };
  });
  fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index, null, 1));
  fs.writeFileSync(path.join(out, "index.md"), [
    `# Archived branches (${index.length})`, "",
    "Every branch below shared no history with the deploy branch and was bundled before it was deleted.",
    "Restore one: `git fetch archive.bundle 'refs/archive/<name>:refs/heads/<name>'`", "",
    "| branch | sha | last commit | author | subject |", "|---|---|---|---|---|",
    ...index.map((r) => `| \`${r.name}\` | \`${r.sha.slice(0, 10)}\` | ${r.date} | ${r.author} | ${String(r.subject).replace(/\|/g, "\\|").slice(0, 80)} |`),
  ].join("\n") + "\n");
  const tally = {};
  for (const k of kept) tally[k.why] = (tally[k.why] || 0) + 1;
  console.log(`archive-branches: ${branches.length} remote branches; ${archive.length} to archive, ${del.length} to delete, main: ${mainMode}`);
  console.log("kept: " + (Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ") || "none"));
  return 0;
}

function verify(argv) {
  const bundle = arg(argv, "--bundle", null), listFile = arg(argv, "--list", null);
  if (!bundle || !listFile) { console.error("archive-branches verify: --bundle and --list are required"); return 2; }
  const size = fs.statSync(bundle).size;
  if (size > MAX_BUNDLE) { console.error(`archive-branches: bundle is ${size} bytes, over the ${MAX_BUNDLE} release-asset ceiling`); return 1; }
  git("bundle", "verify", "--quiet", bundle);
  const list = fs.readFileSync(listFile, "utf8").split("\n").filter(Boolean).map((l) => { const [name, sha] = l.split("\t"); return { name, sha }; });
  const problems = checkBundle(list, parseHeads(git("bundle", "list-heads", bundle)));
  if (problems.length) { console.error("archive-branches: bundle check FAILED\n  " + problems.join("\n  ")); return 1; }
  console.log(`= archive verified ${list.length} branches, ${size} bytes`);
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  if (cmd === "plan") return plan(rest);
  if (cmd === "verify") return verify(rest);
  console.error("usage: archive-branches.mjs plan|verify …");
  return 2;
}

if (process.argv[1] && process.argv[1].endsWith("archive-branches.mjs")) process.exitCode = main();
