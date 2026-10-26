// dup-keys as a GUARD (audit4 E1, 2026-10-26). tools/check/dup-keys.mjs is the
// duplicate-object-key lint (two sessions add the same field to one literal,
// git merges both, the earlier one goes dead). Until this file it ran nowhere:
// no group, no workflow step, and the tip carried a dead key for a week
// (event-journal.test.mjs, found by the pass-3 audit by hand).
//
// COST. The whole tracked tree (js/ tools/ tests/, ~2,300 files) is ~30 s of
// CPU — too much for the commit hook. A duplicate can only be NEW in a file
// the change touches (the tip is scanned whole on its own push), so on a
// branch this scans the TRACKED files that differ from the merge-base with the
// deploy branch. It scans everything when there is no diff (a push to the
// deploy branch, a nightly), when the base cannot be resolved (fail safe), or
// when APEX_DUPKEYS_FULL=1. `node tools/check/dup-keys.mjs` is the full CLI.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanFile, ROOTS } from "../../tools/check/dup-keys.mjs";
import { changedPaths } from "../../tools/lib/changed-files.mjs";
import { DEPLOY_BRANCH } from "../../tools/ci/pick-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = (f) => /\.(m|c)?js$/.test(f) && ROOTS.some((r) => f.startsWith(r + "/")) &&
  !f.split("/").includes("node_modules") && fs.existsSync(path.join(ROOT, f));

function tracked() {
  const out = execFileSync("git", ["ls-files", "-z", "--", ...ROOTS], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  return out.split("\0").filter(SOURCE);
}

/** { files, scope }: the diff's sources, or the whole tracked tree. */
function dupKeyScope(env = process.env) {
  if (env.APEX_DUPKEYS_FULL === "1") return { files: tracked(), scope: "full (APEX_DUPKEYS_FULL)" };
  let changed;
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", `origin/${DEPLOY_BRANCH}`],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    changed = changedPaths([base], { cwd: ROOT });
  } catch (_) {
    return { files: tracked(), scope: "full (no merge-base)" };
  }
  if (!changed.length) return { files: tracked(), scope: "full (no diff)" };
  const tset = new Set(tracked());
  return { files: changed.filter((f) => tset.has(f)), scope: `diff (${changed.length} changed)` };
}

test("the scanner still sees a duplicate (anti-vacuity)", () => {
  const hits = scanFile("var o = { a: 1, b: 2, a: 3 };\n", "x.js");
  assert.deepEqual(hits.map((h) => [h.key, h.line, h.first]), [["a", 1, 1]]);
  assert.ok(tracked().length > 500, "premise: git ls-files must list the tree's sources");
});

test("no tracked js/tools/tests source this change touches declares the same object key twice", () => {
  const { files, scope } = dupKeyScope();
  const hits = [];
  for (const f of files) hits.push(...scanFile(fs.readFileSync(path.join(ROOT, f), "utf8"), f));
  const lines = hits.map((h) => h.parseError
    ? `${h.file}: could not be parsed as a module or a script`
    : `${h.file}:${h.line} duplicate key \`${h.key}\` — the one at line ${h.first} is dead`);
  assert.deepEqual(lines, [], `scope ${scope}: merge duplicate keys into ONE, keeping both sides' fields`);
});
