#!/usr/bin/env node
/**
 * @doc Is this `index.html` diff JUST the cache bump? The one exemption change-aware CI makes to its infra gate.
 * @section runner
 * cache-bump-only.mjs — "is this index.html diff JUST the cache bump?"
 *
 *   node tools/cache-bump-only.mjs <base-ref>     # exit 0 = pure bump, 1 = not
 *   node tools/cache-bump-only.mjs <base-ref> --json
 *
 * Change-aware CI treats index.html as infra (load order). Pure ?v=N bumps are
 * decidable: strip version tokens from both sides; anything left is a real change.
 * Fails toward running more — asymmetric diffs or other files → not a pure bump.
 * Line-count symmetry alone is insufficient (`af05fa98` had a real CAM markup edit
 * at +156/-156). Positional content compare catches it; see unit tests.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Strip the cache-bust query so two versions of one tag compare equal. */
const stripV = (line) => line.replace(/\?v=[A-Za-z0-9._-]+/g, "?v=");

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
