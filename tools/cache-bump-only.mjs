#!/usr/bin/env node
/**
 * cache-bump-only.mjs — "is this index.html diff JUST the cache bump?"
 *
 *   node tools/cache-bump-only.mjs <base-ref>     # exit 0 = pure bump, 1 = not
 *   node tools/cache-bump-only.mjs <base-ref> --json
 *
 * WHY THIS EXISTS. Change-aware CI (docs/research/TEST-AUDIT-2026-08.md §3)
 * treats `index.html` as an INFRA path — a file whose contents change what test
 * selection MEANS, because the script block IS the load order. Reading it to
 * route your own validity is circular, so any diff touching it falls back to a
 * full run.
 *
 * That rule is right and, at file granularity, self-defeating. This repo's hard
 * convention (CLAUDE.md) is that the LAST edit of every shippable change bumps
 * `?v=N` on every asset URL in index.html and sets version.json to match. So the
 * final commit of essentially every change touches index.html — and the commit
 * that actually gets reviewed and merged is precisely the one where selection
 * gives up. The capability would exist everywhere except where it counts.
 *
 * A `?v` bump is not a load-order change. It rewrites the QUERY STRING of lines
 * that are otherwise byte-identical, and adds and removes nothing. That is
 * decidable: strip `?v=<digits>` from both sides and see whether anything is
 * left. Anything else — a new script tag, a reordered one, a deleted one, an
 * edit to any other line — is a real change and reports false.
 *
 * Deliberately conservative in one direction: it answers "pure bump" ONLY when
 * every added line pairs with a removed line modulo the version token. Any
 * asymmetry, any unparseable diff, any other file in the diff → false, i.e.
 * fall back to the full run. Being wrong here means skipping tests, so it fails
 * toward running more.
 *
 * WHY LINE COUNTS ARE NOT ENOUGH, from this repo's own history: `af05fa98` is
 * +156/-156 on index.html — perfectly symmetric, and a count-based check would
 * wave it through — but one of those pairs is a real markup edit to the CAM
 * help text riding along with the bump. Comparing CONTENT positionally catches
 * it; `395f8bd6` (+155/-155) and `938aed50` (+154/-154) are genuine pure bumps
 * and classify as such. All three are checked by hand above; the unit tests
 * pin the shapes.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Strip the cache-bust query so two versions of one tag compare equal. */
const stripV = (line) => line.replace(/\?v=\d+/g, "?v=");

/**
 * @param {string} diff  unified diff of index.html (any context width)
 * @returns {{pure: boolean, reason: string, added: number, removed: number}}
 */
export function analyse(diff) {
  const lines = diff.split("\n");
  const added = [], removed = [];
  for (const l of lines) {
    // +++/--- are the file headers, not content.
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("+")) added.push(l.slice(1));
    else if (l.startsWith("-")) removed.push(l.slice(1));
  }
  if (!added.length && !removed.length)
    return { pure: false, reason: "empty diff — nothing to classify", added: 0, removed: 0 };
  if (added.length !== removed.length)
    return { pure: false, reason: `asymmetric: +${added.length} / -${removed.length} lines`,
             added: added.length, removed: removed.length };

  // Pair positionally. A pure bump rewrites lines in place, so the nth added
  // line is the nth removed line with a new version. Sorting first would let a
  // REORDER of the script block masquerade as a bump, and reordering the script
  // block is exactly the load-order change this guard exists to catch.
  for (let i = 0; i < added.length; i++) {
    if (stripV(added[i]) !== stripV(removed[i]))
      return { pure: false, reason: `line ${i + 1} differs by more than ?v: ${added[i].trim().slice(0, 60)}`,
               added: added.length, removed: removed.length };
    if (added[i] === removed[i])
      return { pure: false, reason: `line ${i + 1} changed without changing ?v`,
               added: added.length, removed: removed.length };
  }
  return { pure: true, reason: `${added.length} line(s), ?v only`,
           added: added.length, removed: removed.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const base = argv.find((a) => !a.startsWith("--"));
  if (!base) {
    console.error("usage: node tools/cache-bump-only.mjs <base-ref> [--json]");
    process.exit(2);
  }
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "-U0", base, "--", "index.html"],
                        { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    // An unresolvable ref must not read as "pure bump" — that would SKIP tests.
    const out = { pure: false, reason: `git diff failed: ${e.message}`, added: 0, removed: 0 };
    console.log(argv.includes("--json") ? JSON.stringify(out) : out.reason);
    process.exit(1);
  }
  const r = analyse(diff);
  console.log(argv.includes("--json") ? JSON.stringify(r) : `${r.pure ? "PURE BUMP" : "REAL CHANGE"} — ${r.reason}`);
  process.exit(r.pure ? 0 : 1);
}
